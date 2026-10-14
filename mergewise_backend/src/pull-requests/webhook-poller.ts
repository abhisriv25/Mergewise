import { logger } from "../logger.js";
import { processPendingWebhookEvents } from "./pull-request-processor.service.js";

const POLL_INTERVAL_MS = 3000;

/** A plain setInterval, not a real queue — nothing in this architecture
 * calls for BullMQ at this slice. Started only from server.ts, never from
 * app.ts/buildApp(), so tests that build the app directly never have a
 * background timer running against a mocked or absent database.
 *
 * A pass can outlast the interval (indexing a repo's docs after a push
 * takes a while), so a tick is skipped while one is still running —
 * otherwise two passes would pick up, and process, the same events. */
export function startWebhookPoller(): NodeJS.Timeout {
  let running = false;
  return setInterval(() => {
    if (running) return;
    running = true;
    processPendingWebhookEvents()
      .catch((err) => {
        logger.error({ err }, "Webhook poller pass failed");
      })
      .finally(() => {
        running = false;
      });
  }, POLL_INTERVAL_MS);
}
