import { logger } from "../logger.js";
import { processPendingWebhookEvents } from "./pull-request-processor.service.js";

const POLL_INTERVAL_MS = 3000;

/** A plain setInterval, not a real queue — nothing in this architecture
 * calls for BullMQ at this slice. Started only from server.ts, never from
 * app.ts/buildApp(), so tests that build the app directly never have a
 * background timer running against a mocked or absent database. */
export function startWebhookPoller(): NodeJS.Timeout {
  return setInterval(() => {
    processPendingWebhookEvents().catch((err) => {
      logger.error({ err }, "Webhook poller pass failed");
    });
  }, POLL_INTERVAL_MS);
}
