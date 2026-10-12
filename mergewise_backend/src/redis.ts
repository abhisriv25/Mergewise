import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

/** Shared Redis client for session storage and caching. Null when
 * REDIS_URL isn't set (tests, bare local dev) — callers fall back to
 * in-process sessions and skip caching rather than failing.
 * family: 0 resolves both IPv4 and IPv6 — Railway's private network
 * (redis.railway.internal) is IPv6, which ioredis skips by default. */
export const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, family: 0 })
  : null;

redis?.on("error", (err) => logger.error({ err }, "Redis connection error"));
