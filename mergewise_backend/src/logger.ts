import pino, { type LoggerOptions } from "pino";
import { env } from "./env.js";

/** Never write credentials to logs: session cookies, auth headers, and
 * GitHub's webhook signature would let anyone reading logs replay them. */
export const LOG_REDACT: LoggerOptions["redact"] = {
  paths: [
    "req.headers.cookie",
    "req.headers.authorization",
    'req.headers["x-hub-signature-256"]',
    'res.headers["set-cookie"]',
  ],
  censor: "[redacted]",
};

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : "info",
  redact: LOG_REDACT,
});
