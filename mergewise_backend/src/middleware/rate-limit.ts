import rateLimit from "express-rate-limit";

/** GitHub's own webhook traffic is legitimately bursty (an installation
 * syncing hundreds of repos can fire many deliveries in a short window) —
 * generous on purpose, not tuned to throttle a real installation. */
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

/** User-initiated OAuth/install entry points don't need anywhere near that
 * volume — a much tighter limit on the routes a person (or an attacker)
 * can trigger directly. */
export const authFlowRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Sending invitations emails real people, so it's capped per hour — enough
 * to invite a whole team, not enough to use Mergewise as a spam relay. */
export const invitationSendRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Looking up an invite link by its token — tight enough that guessing
 * tokens is hopeless (they're 256-bit anyway). */
export const invitationLookupRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Re-assessing a PR costs two GitHub API calls (the PR, then its files) —
 * a handful a minute covers someone clicking through a review queue. */
export const reassessRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Admin repository actions (sync, disconnect, reconnect) each call GitHub. */
export const repositoryActionRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
