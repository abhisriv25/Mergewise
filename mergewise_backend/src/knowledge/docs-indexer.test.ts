import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = { repository: { update: vi.fn() } };
vi.mock("../prisma.js", () => ({ prisma: prismaMock }));

const ingestRepositoryDocsMock = vi.fn();
vi.mock("./document-ingestion.service.js", () => ({ ingestRepositoryDocs: ingestRepositoryDocsMock }));

const embedAllPendingChunksMock = vi.fn();
vi.mock("../embeddings/embedding-pipeline.service.js", () => ({ embedAllPendingChunks: embedAllPendingChunksMock }));

const envMock = { EMBEDDING_API_KEY: undefined as string | undefined };
vi.mock("../env.js", () => ({ env: envMock }));

const { indexRepositoryDocs, indexRepositoryDocsInBackground } = await import("./docs-indexer.js");

beforeEach(() => {
  vi.clearAllMocks();
  envMock.EMBEDDING_API_KEY = undefined;
  ingestRepositoryDocsMock.mockResolvedValue([{ path: "README.md", status: "ingested", chunks: 3 }]);
  embedAllPendingChunksMock.mockResolvedValue({ embedded: 3, failed: 0 });
  prismaMock.repository.update.mockResolvedValue({});
});

describe("indexRepositoryDocs", () => {
  it("ingests the repo's docs, records when, and embeds the new chunks", async () => {
    envMock.EMBEDDING_API_KEY = "key";

    await indexRepositoryDocs("repo-1");

    expect(ingestRepositoryDocsMock).toHaveBeenCalledWith("repo-1");
    expect(prismaMock.repository.update).toHaveBeenCalledWith({
      where: { id: "repo-1" },
      data: { docsIndexedAt: expect.any(Date) },
    });
    expect(embedAllPendingChunksMock).toHaveBeenCalled();
  });

  it("skips embedding when no embedding key is configured", async () => {
    await indexRepositoryDocs("repo-1");

    expect(ingestRepositoryDocsMock).toHaveBeenCalled();
    expect(embedAllPendingChunksMock).not.toHaveBeenCalled();
  });

  it("doesn't record an index time when ingestion fails", async () => {
    ingestRepositoryDocsMock.mockRejectedValueOnce(new Error("GitHub 502"));

    await expect(indexRepositoryDocs("repo-1")).rejects.toThrow("GitHub 502");
    expect(prismaMock.repository.update).not.toHaveBeenCalled();
  });
});

describe("indexRepositoryDocsInBackground", () => {
  it("indexes each repo in turn and carries on past a failure", async () => {
    ingestRepositoryDocsMock.mockRejectedValueOnce(new Error("GitHub 502"));

    indexRepositoryDocsInBackground(["repo-1", "repo-2"]);
    await vi.waitFor(() => expect(ingestRepositoryDocsMock).toHaveBeenCalledTimes(2));

    expect(ingestRepositoryDocsMock).toHaveBeenNthCalledWith(2, "repo-2");
  });
});
