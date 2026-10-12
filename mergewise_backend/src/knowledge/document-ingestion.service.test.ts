import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashContent } from "./content-hash.js";

const prismaMock = {
  repository: { findUnique: vi.fn() },
  knowledgeSource: { upsert: vi.fn() },
  document: { findUnique: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
};
const listMarkdownFilePathsMock = vi.fn();
const fetchFileContentMock = vi.fn();

vi.mock("../prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../github/github-app-auth.service.js", () => ({
  fetchInstallationAccessToken: vi.fn().mockResolvedValue("token"),
}));
vi.mock("../github/docs.service.js", () => ({
  fetchDefaultBranch: vi.fn().mockResolvedValue("main"),
  listMarkdownFilePaths: listMarkdownFilePathsMock,
  fetchFileContent: fetchFileContentMock,
}));

const { ingestRepositoryDocs } = await import("./document-ingestion.service.js");

const CONTENT = "# Readme";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.repository.findUnique.mockResolvedValue({
    id: "repo-1",
    organizationId: "org-1",
    githubInstallationId: "1",
    owner: "o",
    name: "r",
  });
  prismaMock.knowledgeSource.upsert.mockResolvedValue({ id: "src-1" });
  fetchFileContentMock.mockResolvedValue(CONTENT);
  // Unchanged content, so the test stays on the pruning step.
  prismaMock.document.findUnique.mockResolvedValue({ contentHash: hashContent(CONTENT) });
  prismaMock.document.findMany.mockResolvedValue([{ id: "doc-old", path: "docs/old.md" }]);
});

describe("ingestRepositoryDocs", () => {
  it("removes documents whose file is gone from the repo", async () => {
    listMarkdownFilePathsMock.mockResolvedValueOnce({ paths: ["README.md"], truncated: false });

    const results = await ingestRepositoryDocs("repo-1");

    expect(prismaMock.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { knowledgeSourceId: "src-1", path: { notIn: ["README.md"] } } }),
    );
    expect(prismaMock.document.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["doc-old"] } } });
    expect(results).toEqual([
      { path: "README.md", status: "skipped_unchanged" },
      { path: "docs/old.md", status: "removed" },
    ]);
  });

  it("never prunes against a truncated file list", async () => {
    listMarkdownFilePathsMock.mockResolvedValueOnce({ paths: ["README.md"], truncated: true });

    await ingestRepositoryDocs("repo-1");

    expect(prismaMock.document.findMany).not.toHaveBeenCalled();
    expect(prismaMock.document.deleteMany).not.toHaveBeenCalled();
  });
});
