import { embedAllPendingChunks } from "../embeddings/embedding-pipeline.service.js";
import { prisma } from "../prisma.js";
import { ingestRepositoryDocs } from "./document-ingestion.service.js";

// Usage: npm run ingest --workspace=mergewise_backend [-- <repositoryId>]  (default: every repository)
const [repositoryId] = process.argv.slice(2);
const repositories = repositoryId
  ? [{ id: repositoryId, fullName: repositoryId }]
  : await prisma.repository.findMany({ select: { id: true, fullName: true } });

for (const repo of repositories) {
  console.log(`Ingesting ${repo.fullName}`);
  console.table(await ingestRepositoryDocs(repo.id));
}

console.log("Embedding pending chunks:", await embedAllPendingChunks());
await prisma.$disconnect();
