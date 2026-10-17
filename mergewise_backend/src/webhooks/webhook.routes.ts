import { Router } from "express";
import { env } from "../env.js";
import { isDocPath } from "../github/docs.service.js";
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
const SUPPORTED_PULL_REQUEST_ACTIONS = new Set([
  "opened",
  "reopened",
  "synchronize",
  "closed",
  "edited",
  "ready_for_review",
  "converted_to_draft",
]);
const SUPPORTED_INSTALLATION_REPOSITORIES_ACTIONS = new Set(["added", "removed"]);
const SUPPORTED_INSTALLATION_ACTIONS = new Set(["deleted", "suspend"]);
// GitHub lists at most 20 commits in a push payload; a longer push may have
// touched docs in commits it left out.
const PUSH_PAYLOAD_COMMIT_LIMIT = 20;

interface GithubWebhookPayload {
  action?: string;
  ref?: string;
  commits?: { added?: string[]; modified?: string[]; removed?: string[] }[];
  repository?: { id?: number; default_branch?: string };
  installation?: { id?: number };
}

/** Only a push to the default branch that changes README.md or docs/ is
 * worth re-indexing for — everything else is stored as IGNORED. */
function isDocsPush(payload: GithubWebhookPayload): boolean {
  const defaultBranch = payload.repository?.default_branch;
  if (!defaultBranch || payload.ref !== `refs/heads/${defaultBranch}`) return false;

  const commits = payload.commits ?? [];
  if (commits.length >= PUSH_PAYLOAD_COMMIT_LIMIT) return true;
  return commits.some((commit) =>
    [...(commit.added ?? []), ...(commit.modified ?? []), ...(commit.removed ?? [])].some(isDocPath),
  );
}

function shouldProcess(eventType: string, action: string | undefined, payload: GithubWebhookPayload): boolean {
  switch (eventType) {
    case "pull_request":
      return action !== undefined && SUPPORTED_PULL_REQUEST_ACTIONS.has(action);
    case "push":
      return isDocsPush(payload);
    case "installation_repositories":
      return action !== undefined && SUPPORTED_INSTALLATION_REPOSITORIES_ACTIONS.has(action);
    case "installation":
      return action !== undefined && SUPPORTED_INSTALLATION_ACTIONS.has(action);
    default:
      return false;
  }
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

  try {
    const result = await recordWebhookEvent({
      deliveryId,
      eventType,
      action,
      githubRepoId: payload.repository?.id != null ? String(payload.repository.id) : undefined,
      githubInstallationId:
        payload.installation?.id != null ? String(payload.installation.id) : undefined,
      payload,
      status: shouldProcess(eventType, action, payload) ? "RECEIVED" : "IGNORED",
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
