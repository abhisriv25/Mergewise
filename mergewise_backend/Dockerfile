# Build from the repo root (the npm workspace lockfile lives there):
#   docker build -f mergewise_backend/Dockerfile .
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY mergewise_backend/package.json mergewise_backend/
RUN npm ci --workspace=mergewise_backend --include-workspace-root=false

COPY mergewise_backend/ mergewise_backend/
WORKDIR /app/mergewise_backend
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Apply any pending migrations, then start. Safe with a single instance.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
