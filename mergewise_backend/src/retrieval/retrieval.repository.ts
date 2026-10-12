import { prisma } from "../prisma.js";
import { toVectorLiteral } from "../embeddings/embedding.repository.js";

export interface RetrievedChunk {
  chunkId: string;
  path: string;
  title: string | null;
  heading: string | null;
  content: string;
  similarity: number;
}

interface Row {
  id: string;
  content: string;
  metadata: { heading?: string | null } | null;
  path: string;
  title: string | null;
  similarity: number;
}

/** Tenant isolation is in the WHERE clause (KnowledgeSource.organizationId),
 * never a post-filter. Only chunks embedded with the same model/dimensions
 * as the query vector are comparable. */
export async function searchSimilarChunks(params: {
  organizationId: string;
  queryVector: number[];
  model: string;
  topK: number;
}): Promise<RetrievedChunk[]> {
  const literal = toVectorLiteral(params.queryVector);
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT c.id, c.content, c.metadata, d.path, d.title,
           1 - (c.embedding <=> ${literal}::vector) AS similarity
    FROM "DocumentChunk" c
    JOIN "Document" d ON d.id = c."documentId"
    JOIN "KnowledgeSource" ks ON ks.id = d."knowledgeSourceId"
    WHERE ks."organizationId" = ${params.organizationId}
      AND c.embedding IS NOT NULL
      AND c."embeddingModel" = ${params.model}
      AND c."embeddingDimensions" = ${params.queryVector.length}
    ORDER BY c.embedding <=> ${literal}::vector
    LIMIT ${params.topK}`;

  return rows.map((r) => ({
    chunkId: r.id,
    path: r.path,
    title: r.title,
    heading: r.metadata?.heading ?? null,
    content: r.content,
    similarity: Number(r.similarity),
  }));
}
