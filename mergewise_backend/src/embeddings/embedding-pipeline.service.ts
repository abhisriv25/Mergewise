import { env } from "../env.js";
import { logger } from "../logger.js";
import { embedTexts } from "./embedding-provider.js";
import { findChunksNeedingEmbedding, saveEmbedding } from "./embedding.repository.js";

export const DEFAULT_EMBED_BATCH = 100;

export interface EmbeddingRunResult {
  embedded: number;
  failed: number;
}

/** Embeds pending chunks in a single batched API call. A whole-batch
 * failure fails every chunk in it; a per-chunk save failure is isolated. */
export async function embedPendingChunks(limit = DEFAULT_EMBED_BATCH): Promise<EmbeddingRunResult> {
  const pending = await findChunksNeedingEmbedding(env.EMBEDDING_MODEL, limit);
  if (pending.length === 0) return { embedded: 0, failed: 0 };

  let batch;
  try {
    batch = await embedTexts(pending.map((c) => c.content));
  } catch (err) {
    logger.error({ err }, "Embedding batch failed");
    return { embedded: 0, failed: pending.length };
  }

  let embedded = 0;
  let failed = 0;
  for (const [i, chunk] of pending.entries()) {
    try {
      await saveEmbedding(chunk.id, batch.vectors[i], batch.model, batch.dimensions);
      embedded += 1;
    } catch (err) {
      failed += 1;
      logger.error({ err, chunkId: chunk.id }, "Failed to save embedding");
    }
  }
  return { embedded, failed };
}

/** Runs batches until nothing is left to embed. Stops on a batch that makes
 * no progress, since chunks that failed stay pending and would come back
 * forever; `failed` is what that final batch couldn't embed. */
export async function embedAllPendingChunks(batchSize = DEFAULT_EMBED_BATCH): Promise<EmbeddingRunResult> {
  let embedded = 0;
  for (;;) {
    const run = await embedPendingChunks(batchSize);
    embedded += run.embedded;
    const lastBatch = run.embedded + run.failed < batchSize;
    if (run.embedded === 0 || (lastBatch && run.failed === 0)) return { embedded, failed: run.failed };
  }
}
