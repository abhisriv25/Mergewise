import { Router, type Response } from "express";
import { z } from "zod";
import { AlreadyInOrganizationError, createOrganizationForUser } from "../auth/auth.service.js";
import { requireAuth } from "../auth/auth.routes.js";
import {
  authFlowRateLimiter,
  invitationLookupRateLimiter,
  invitationSendRateLimiter,
} from "../middleware/rate-limit.js";
import { prisma } from "../prisma.js";
import { isEmailConfigured } from "./email.service.js";
import { ensureOrganizationLinked } from "./github-link.service.js";
import {
  createInvitations,
  INVITATION_TOKEN_PATTERN,
  invitationStatus,
  listInvitations,
  previewInvitation,
  resendInvitation,
  revokeInvitation,
} from "./invitation.service.js";
import { changeMemberRole, LastAdminError, listMembers, removeMember } from "./members.service.js";
import {
  currentMembership,
  findCurrentMembership,
  requireOrganizationAdmin,
} from "./membership.service.js";

export const organizationRouter = Router();

const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(60, "Organization name must be at most 60 characters"),
});

const MAX_INVITES_PER_REQUEST = 20;

const createInvitationsSchema = z.object({
  emails: z
    .array(z.string().trim().email("Enter valid email addresses"))
    .min(1, "Enter at least one email address")
    .max(MAX_INVITES_PER_REQUEST, `Invite at most ${MAX_INVITES_PER_REQUEST} people at a time`),
});

const changeRoleSchema = z.object({ role: z.enum(["ADMIN", "MEMBER"]) });

function badRequest(res: Response, error: z.ZodError) {
  res.status(400).json({ error: { message: error.issues[0].message } });
}

async function inviterOf(res: Response) {
  const membership = currentMembership(res);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: membership.userId } });
  return { id: user.id, githubLogin: user.githubLogin };
}

organizationRouter.post("/organizations", authFlowRateLimiter, requireAuth, async (req, res) => {
  const parsed = createOrganizationSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error);
    return;
  }

  try {
    const organization = await createOrganizationForUser(req.session.userId as string, parsed.data.name);
    res.status(201).json({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: "ADMIN",
    });
  } catch (err) {
    if (err instanceof AlreadyInOrganizationError) {
      res.status(409).json({ error: { message: err.message } });
      return;
    }
    throw err;
  }
});

/** The caller's organization, including which GitHub account it's tied to
 * and whether invitations go out by email. Any member can read it. */
organizationRouter.get("/organizations/current", requireAuth, async (req, res) => {
  const membership = await findCurrentMembership(req.session.userId as string);
  if (!membership) {
    res.status(404).json({ error: { message: "You don't belong to an organization" } });
    return;
  }

  const organization = await ensureOrganizationLinked(membership.organization);
  res.json({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    role: membership.role,
    github: organization.githubAccountLogin
      ? { login: organization.githubAccountLogin, type: organization.githubAccountType }
      : null,
    emailEnabled: isEmailConfigured(),
  });
});

organizationRouter.get("/organizations/current/members", requireAuth, requireOrganizationAdmin, async (_req, res) => {
  const members = await listMembers(currentMembership(res).organization);
  res.json({ members });
});

organizationRouter.patch(
  "/organizations/current/members/:membershipId",
  requireAuth,
  requireOrganizationAdmin,
  async (req, res) => {
    const parsed = changeRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, parsed.error);
      return;
    }

    try {
      const membership = await changeMemberRole(
        currentMembership(res).organizationId,
        req.params.membershipId,
        parsed.data.role,
      );
      if (!membership) {
        res.status(404).json({ error: { message: "Member not found" } });
        return;
      }
      res.json({ id: membership.id, role: membership.role });
    } catch (err) {
      if (err instanceof LastAdminError) {
        res.status(409).json({ error: { message: err.message } });
        return;
      }
      throw err;
    }
  },
);

organizationRouter.delete(
  "/organizations/current/members/:membershipId",
  requireAuth,
  requireOrganizationAdmin,
  async (req, res) => {
    try {
      const removed = await removeMember(currentMembership(res).organizationId, req.params.membershipId);
      if (!removed) {
        res.status(404).json({ error: { message: "Member not found" } });
        return;
      }
      res.status(204).end();
    } catch (err) {
      if (err instanceof LastAdminError) {
        res.status(409).json({ error: { message: err.message } });
        return;
      }
      throw err;
    }
  },
);

organizationRouter.get(
  "/organizations/current/invitations",
  requireAuth,
  requireOrganizationAdmin,
  async (_req, res) => {
    const invitations = await listInvitations(currentMembership(res).organizationId);
    res.json({
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        invitedBy: invitation.invitedBy?.githubLogin ?? null,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        status: invitationStatus(invitation),
      })),
    });
  },
);

function serializeIssued(issued: Awaited<ReturnType<typeof createInvitations>>[number]) {
  return {
    id: issued.invitation.id,
    email: issued.invitation.email,
    expiresAt: issued.invitation.expiresAt,
    url: issued.url,
    emailSent: issued.emailSent,
  };
}

/** Invitees must belong to the organization's GitHub account, so inviting
 * needs that link in place first. */
async function linkedOrganizationOr409(res: Response) {
  const organization = await ensureOrganizationLinked(currentMembership(res).organization);
  if (!organization.githubAccountId) {
    res.status(409).json({
      error: { message: "Connect your GitHub organization (Repositories → Connect repo) before inviting people" },
    });
    return null;
  }
  return organization;
}

organizationRouter.post(
  "/organizations/current/invitations",
  invitationSendRateLimiter,
  requireAuth,
  requireOrganizationAdmin,
  async (req, res) => {
    const parsed = createInvitationsSchema.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, parsed.error);
      return;
    }

    const organization = await linkedOrganizationOr409(res);
    if (!organization) return;

    const issued = await createInvitations(organization, await inviterOf(res), parsed.data.emails);
    res.status(201).json({ invitations: issued.map(serializeIssued) });
  },
);

organizationRouter.post(
  "/organizations/current/invitations/:invitationId/resend",
  invitationSendRateLimiter,
  requireAuth,
  requireOrganizationAdmin,
  async (req, res) => {
    const organization = await linkedOrganizationOr409(res);
    if (!organization) return;

    const issued = await resendInvitation(organization, req.params.invitationId, await inviterOf(res));
    if (!issued) {
      res.status(404).json({ error: { message: "Invitation not found" } });
      return;
    }
    res.status(201).json({ invitation: serializeIssued(issued) });
  },
);

organizationRouter.delete(
  "/organizations/current/invitations/:invitationId",
  requireAuth,
  requireOrganizationAdmin,
  async (req, res) => {
    const revoked = await revokeInvitation(currentMembership(res).organizationId, req.params.invitationId);
    if (!revoked) {
      res.status(404).json({ error: { message: "Invitation not found" } });
      return;
    }
    res.status(204).end();
  },
);

/** Public: what an invite link is for, so the accept page can say who's
 * inviting you where before you sign in. Unknown tokens are a plain 404. */
organizationRouter.get("/invitations/:token", invitationLookupRateLimiter, async (req, res) => {
  const { token } = req.params;
  const preview = INVITATION_TOKEN_PATTERN.test(token) ? await previewInvitation(token) : null;
  if (!preview) {
    res.status(404).json({ error: { message: "This invitation link isn't valid" } });
    return;
  }
  res.json(preview);
});
