import { embedTexts } from "../embeddings/embedding-provider.js";
import { searchSimilarChunks, type RetrievedChunk } from "./retrieval.repository.js";

export const RETRIEVAL_VERSION = "v1";
export const DEFAULT_TOP_K = 5;

export async function retrieveRelevantContext(params: {
  organizationId: string;
  query: string;
  topK?: number;
}): Promise<RetrievedChunk[]> {
  if (!params.query.trim()) return [];

  const { model, vectors } = await embedTexts([params.query]);
  return searchSimilarChunks({
    organizationId: params.organizationId,
    queryVector: vectors[0],
    model,
    topK: params.topK ?? DEFAULT_TOP_K,
  });
}
