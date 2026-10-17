import { embedAllPendingChunks } from "../embeddings/embedding-pipeline.service.js";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { prisma } from "../prisma.js";
import { ingestRepositoryDocs } from "./document-ingestion.service.js";

/** Ingests a repo's docs, then embeds whatever chunks are new, so AI review
 * can cite them. Embedding is skipped (not failed) without an embedding
 * key: the chunks stay pending and get embedded once a key is added and
 * the docs are indexed again. */
export async function indexRepositoryDocs(repositoryId: string) {
  const results = await ingestRepositoryDocs(repositoryId);
  await prisma.repository.update({ where: { id: repositoryId }, data: { docsIndexedAt: new Date() } });
  const embedding = env.EMBEDDING_API_KEY ? await embedAllPendingChunks() : null;

  logger.info(
    {
      repositoryId,
      ingested: results.filter((r) => r.status === "ingested").length,
      removed: results.filter((r) => r.status === "removed").length,
      failed: results.filter((r) => r.status === "failed").length,
      embedding,
    },
    "Indexed repository docs",
  );
  return results;
}

/** For callers that mustn't wait (a request handler, a webhook that just
 * connected repos): indexes each repo in turn, after the caller returns.
 * A failure is logged, and the next docs push or reconnect tries again. */
export function indexRepositoryDocsInBackground(repositoryIds: string[]) {
  if (repositoryIds.length === 0) return;
  void (async () => {
    for (const repositoryId of repositoryIds) {
      try {
        await indexRepositoryDocs(repositoryId);
      } catch (err) {
        logger.warn({ err, repositoryId }, "Couldn't index repository docs");
      }
    }
  })();
}
