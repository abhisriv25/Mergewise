import { prisma } from "../prisma.js";

export interface PendingChunk {
  id: string;
  content: string;
}

export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/** Chunks with no embedding, or embedded by a different model than the
 * currently configured one (so a model change self-heals). */
export function findChunksNeedingEmbedding(model: string, limit: number): Promise<PendingChunk[]> {
  return prisma.$queryRaw<PendingChunk[]>`
    SELECT id, content FROM "DocumentChunk"
    WHERE embedding IS NULL OR "embeddingModel" IS DISTINCT FROM ${model}
    ORDER BY "createdAt"
    LIMIT ${limit}`;
}

export async function saveEmbedding(chunkId: string, vector: number[], model: string, dimensions: number) {
  await prisma.$executeRaw`
    UPDATE "DocumentChunk"
    SET embedding = ${toVectorLiteral(vector)}::vector,
        "embeddingModel" = ${model},
        "embeddingDimensions" = ${dimensions},
        "embeddedAt" = NOW()
    WHERE id = ${chunkId}`;
}
