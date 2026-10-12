import { beforeEach, describe, expect, it, vi } from "vitest";

const embedTextsMock = vi.fn();
const findChunksNeedingEmbeddingMock = vi.fn();
const saveEmbeddingMock = vi.fn();

vi.mock("./embedding-provider.js", () => ({ embedTexts: embedTextsMock }));
vi.mock("./embedding.repository.js", () => ({
  findChunksNeedingEmbedding: findChunksNeedingEmbeddingMock,
  saveEmbedding: saveEmbeddingMock,
}));

const { embedAllPendingChunks } = await import("./embedding-pipeline.service.js");

function chunks(prefix: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, content: "c" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  embedTextsMock.mockImplementation(async (texts: string[]) => ({
    model: "m",
    dimensions: 1,
    vectors: texts.map(() => [0]),
  }));
  saveEmbeddingMock.mockResolvedValue(undefined);
});

describe("embedAllPendingChunks", () => {
  it("keeps going past the first batch until nothing is pending", async () => {
    findChunksNeedingEmbeddingMock
      .mockResolvedValueOnce(chunks("a", 2))
      .mockResolvedValueOnce(chunks("b", 2))
      .mockResolvedValueOnce(chunks("c", 1));

    expect(await embedAllPendingChunks(2)).toEqual({ embedded: 5, failed: 0 });
    expect(findChunksNeedingEmbeddingMock).toHaveBeenCalledTimes(3);
  });

  it("stops when a batch makes no progress", async () => {
    findChunksNeedingEmbeddingMock.mockResolvedValue(chunks("a", 2));
    embedTextsMock.mockRejectedValue(new Error("upstream down"));

    expect(await embedAllPendingChunks(2)).toEqual({ embedded: 0, failed: 2 });
    expect(findChunksNeedingEmbeddingMock).toHaveBeenCalledTimes(1);
  });

  it("retries chunks whose save failed, then reports what still fails", async () => {
    findChunksNeedingEmbeddingMock
      .mockResolvedValueOnce([{ id: "bad", content: "c" }, ...chunks("a", 1)])
      .mockResolvedValueOnce([{ id: "bad", content: "c" }]);
    saveEmbeddingMock.mockImplementation(async (id: string) => {
      if (id === "bad") throw new Error("save failed");
    });

    expect(await embedAllPendingChunks(2)).toEqual({ embedded: 1, failed: 1 });
    expect(findChunksNeedingEmbeddingMock).toHaveBeenCalledTimes(2);
  });
});
