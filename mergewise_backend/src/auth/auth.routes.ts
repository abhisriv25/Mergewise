import { randomBytes } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { env } from "../env.js";
import { authFlowRateLimiter } from "../middleware/rate-limit.js";
import { prisma } from "../prisma.js";
import { acceptInvitation, INVITATION_TOKEN_PATTERN } from "../organizations/invitation.service.js";
import { removeMembershipsLostOnGithub } from "../organizations/members.service.js";
import { findOrCreateUserForGithubProfile } from "./auth.service.js";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchGithubProfile,
  GithubOAuthError,
} from "./github-oauth.service.js";

export const authRouter = Router();

const CALLBACK_PATH = "/auth/github/callback";
const LAST_ACTIVE_RESOLUTION_MS = 5 * 60 * 1000;

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: { message: "Not signed in" } });
    return;
  }
  next();
}

authRouter.get("/auth/github/login", authFlowRateLimiter, (req, res) => {
  const state = randomBytes(16).toString("hex");
  req.session.oauthState = state;

  // Signing in from an invite link: remember the invitation for the
  // callback. Anything that isn't shaped like a token is ignored, and a
  // plain sign-in clears any invitation left over from an abandoned one.
  const invite = req.query.invite;
  req.session.pendingInvitationToken =
    typeof invite === "string" && INVITATION_TOKEN_PATTERN.test(invite) ? invite : undefined;

  const redirectUri = `${env.API_BASE_URL}${CALLBACK_PATH}`;
  res.redirect(buildAuthorizeUrl(state, redirectUri));
});

authRouter.get(CALLBACK_PATH, async (req, res) => {
  const failureRedirect = `${env.WEB_BASE_URL}/login?error=oauth_failed`;

  const { code, state } = req.query;
  const expectedState = req.session.oauthState;
  req.session.oauthState = undefined;

  if (
    typeof code !== "string" ||
    typeof state !== "string" ||
    !expectedState ||
    state !== expectedState
  ) {
    res.redirect(failureRedirect);
    return;
  }

  try {
    const redirectUri = `${env.API_BASE_URL}${CALLBACK_PATH}`;
    const accessToken = await exchangeCodeForToken(code, redirectUri);
    const profile = await fetchGithubProfile(accessToken);
    const user = await findOrCreateUserForGithubProfile(profile);

    req.session.userId = user.id;

    const invitationToken = req.session.pendingInvitationToken;
    req.session.pendingInvitationToken = undefined;

    if (invitationToken) {
      const result = await acceptInvitation(invitationToken, user);
      res.redirect(
        result.ok ? `${env.WEB_BASE_URL}/?joined=1` : `${env.WEB_BASE_URL}/invite/${invitationToken}?error=${result.reason}`,
      );
      return;
    }

    await removeMembershipsLostOnGithub(user);
    res.redirect(env.WEB_BASE_URL);
  } catch (err) {
    if (err instanceof GithubOAuthError) {
      res.redirect(failureRedirect);
      return;
    }
    throw err;
  }
});

authRouter.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("devpulse.sid");
    res.status(204).end();
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
    include: { memberships: { include: { organization: true } } },
  });

  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: { message: "Not signed in" } });
    return;
  }

  // Every app page loads /me, so this is "last active" — written at most
  // every few minutes rather than on every request.
  const now = new Date();
  if (!user.lastActiveAt || now.getTime() - user.lastActiveAt.getTime() > LAST_ACTIVE_RESOLUTION_MS) {
    await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: now } });
  }

  res.json({
    id: user.id,
    githubLogin: user.githubLogin,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    organizations: user.memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
    })),
  });
});
