import { fetchInstallationAccessToken } from "../github/github-app-auth.service.js";
import { fetchDefaultBranch, fetchFileContent, listMarkdownFilePaths } from "../github/docs.service.js";
import { prisma } from "../prisma.js";
import { hashContent } from "./content-hash.js";
import { chunkMarkdown, extractTitle } from "./markdown-chunker.js";

export const REPOSITORY_DOCS_SOURCE = "repository_docs";

export class RepositoryNotFoundError extends Error {}

export interface IngestionResult {
  path: string;
  status: "ingested" | "skipped_unchanged" | "removed" | "failed";
  chunks?: number;
  error?: string;
}

/** Fetches a repo's README.md + docs/**\/*.md, and stores each changed file
 * as a Document with heading-based chunks. One bad file doesn't sink the batch.
 * Documents whose file is gone from the repo are removed (their chunks
 * cascade), so retrieval can't cite a deleted doc. */
export async function ingestRepositoryDocs(repositoryId: string): Promise<IngestionResult[]> {
  const repository = await prisma.repository.findUnique({ where: { id: repositoryId } });
  if (!repository) throw new RepositoryNotFoundError(`Repository ${repositoryId} not found`);

  const token = await fetchInstallationAccessToken(repository.githubInstallationId);
  const branch = await fetchDefaultBranch(token, repository.owner, repository.name);
  const { paths, truncated } = await listMarkdownFilePaths(token, repository.owner, repository.name, branch);

  const source = await prisma.knowledgeSource.upsert({
    where: {
      organizationId_repositoryId_sourceType: {
        organizationId: repository.organizationId,
        repositoryId: repository.id,
        sourceType: REPOSITORY_DOCS_SOURCE,
      },
    },
    create: {
      organizationId: repository.organizationId,
      repositoryId: repository.id,
      sourceType: REPOSITORY_DOCS_SOURCE,
    },
    update: {},
  });

  const results: IngestionResult[] = [];

  for (const path of paths) {
    try {
      const content = await fetchFileContent(token, repository.owner, repository.name, path, branch);
      const contentHash = hashContent(content);

      const existing = await prisma.document.findUnique({
        where: { knowledgeSourceId_path: { knowledgeSourceId: source.id, path } },
      });
      if (existing && existing.contentHash === contentHash) {
        results.push({ path, status: "skipped_unchanged" });
        continue;
      }

      const chunks = chunkMarkdown(content);
      const title = extractTitle(content);

      await prisma.$transaction(async (tx) => {
        const document = await tx.document.upsert({
          where: { knowledgeSourceId_path: { knowledgeSourceId: source.id, path } },
          create: { knowledgeSourceId: source.id, path, title, content, contentHash },
          update: { title, content, contentHash },
        });
        await tx.documentChunk.deleteMany({ where: { documentId: document.id } });
        if (chunks.length > 0) {
          await tx.documentChunk.createMany({
            data: chunks.map((chunk, index) => ({
              documentId: document.id,
              chunkIndex: index,
              content: chunk.content,
              tokenCount: chunk.tokenCount,
              metadata: { heading: chunk.heading },
            })),
          });
        }
      });

      results.push({ path, status: "ingested", chunks: chunks.length });
    } catch (err) {
      results.push({ path, status: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }

  // A truncated tree can omit files that still exist, so only prune
  // against a complete listing.
  if (truncated) return results;

  const stale = await prisma.document.findMany({
    where: { knowledgeSourceId: source.id, path: { notIn: paths } },
    select: { id: true, path: true },
  });
  if (stale.length > 0) {
    await prisma.document.deleteMany({ where: { id: { in: stale.map((d) => d.id) } } });
    for (const doc of stale) results.push({ path: doc.path, status: "removed" });
  }

  return results;
}
