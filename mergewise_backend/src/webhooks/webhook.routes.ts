import { Router } from "express";
import { env } from "../env.js";
import { webhookRateLimiter } from "../middleware/rate-limit.js";
import { recordWebhookEvent } from "./webhook-event.repository.js";
import { verifyWebhookSignature } from "./webhook-signature.service.js";

export const webhookRouter = Router();

// The entire scope of this route: verify, dedupe, and durably record a
// GitHub webhook delivery. No PR sync, no risk scoring, no calling back
// out to GitHub's API happens here — deliberately, so a slow downstream
// call can never turn into a webhook timeout that GitHub interprets as
// failure and retries. A separate processor (a later slice) consumes
// RECEIVED rows.
const SUPPORTED_PULL_REQUEST_ACTIONS = new Set(["opened", "reopened", "synchronize", "closed"]);

interface GithubWebhookPayload {
  action?: string;
  repository?: { id?: number };
  installation?: { id?: number };
}

webhookRouter.post("/webhooks/github", webhookRateLimiter, async (req, res) => {
  const signature = req.headers["x-hub-signature-256"];
  const deliveryId = req.headers["x-github-delivery"];
  const eventType = req.headers["x-github-event"];
  const rawBody = req.body;

  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== "string" ||
    !verifyWebhookSignature(rawBody, signature, env.GITHUB_WEBHOOK_SECRET)
  ) {
    res.status(401).json({ error: { message: "Invalid signature" } });
    return;
  }

  if (typeof deliveryId !== "string" || typeof eventType !== "string") {
    res.status(400).json({ error: { message: "Missing required GitHub webhook headers" } });
    return;
  }

  let payload: GithubWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: { message: "Invalid JSON payload" } });
    return;
  }

  const action = typeof payload.action === "string" ? payload.action : undefined;
  const isSupportedPullRequestEvent =
    eventType === "pull_request" && action !== undefined && SUPPORTED_PULL_REQUEST_ACTIONS.has(action);

  try {
    const result = await recordWebhookEvent({
      deliveryId,
      eventType,
      action,
      githubRepoId: payload.repository?.id != null ? String(payload.repository.id) : undefined,
      githubInstallationId:
        payload.installation?.id != null ? String(payload.installation.id) : undefined,
      payload,
      status: isSupportedPullRequestEvent ? "RECEIVED" : "IGNORED",
    });

    if (result === "duplicate") {
      res.status(200).json({ status: "already_processed" });
      return;
    }

    res.status(202).json({ status: "received" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: { message: "Internal server error" } });
  }
});
