import { env } from "../env.js";

const REQUEST_TIMEOUT_MS = 30_000;

export class EmbeddingNotConfiguredError extends Error {}

export interface EmbeddingBatch {
  model: string;
  dimensions: number;
  vectors: number[][];
}

/** One batched request for all texts; vectors are placed by the response's
 * own `index`, since the API doesn't guarantee order. */
export async function embedTexts(texts: string[]): Promise<EmbeddingBatch> {
  if (texts.length === 0) return { model: env.EMBEDDING_MODEL, dimensions: 0, vectors: [] };
  if (!env.EMBEDDING_API_KEY) throw new EmbeddingNotConfiguredError("EMBEDDING_API_KEY is not set");

  const res = await fetch(`${env.EMBEDDING_API_BASE_URL}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.EMBEDDING_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.EMBEDDING_MODEL, input: texts }),
    // Retrieval runs inside a page request, so a hung upstream must not stall it.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Embedding request failed (status ${res.status})`);

  const body = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  const vectors: number[][] = new Array(texts.length);
  for (const item of body.data) vectors[item.index] = item.embedding;
  if (vectors.some((v) => !v)) throw new Error("Embedding response was missing vectors");

  return { model: env.EMBEDDING_MODEL, dimensions: vectors[0].length, vectors };
}
