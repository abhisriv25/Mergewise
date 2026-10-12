import { Router } from "express";
import { prisma } from "../prisma.js";
import { redis } from "../redis.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Checks the database, and Redis too when it's configured (sessions and
// caching depend on it).
healthRouter.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    if (redis) await redis.ping();
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});
