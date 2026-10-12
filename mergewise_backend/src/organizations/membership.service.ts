import type { NextFunction, Request, Response } from "express";
import { prisma } from "../prisma.js";

/** The caller's membership (with its organization), or null before they've
 * created or joined one. One membership per user today — same assumption
 * as resolvePrimaryOrganizationId. */
export function findCurrentMembership(userId: string) {
  return prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { organization: true },
  });
}

export type CurrentMembership = NonNullable<Awaited<ReturnType<typeof findCurrentMembership>>>;

/** Use after requireAuth. Loads the caller's membership into
 * res.locals.membership; 404 when they have no organization (nothing to
 * manage), 403 when they're a MEMBER. Enforced here on the server — the
 * UI hiding admin pages is a convenience, not the protection. */
export async function requireOrganizationAdmin(req: Request, res: Response, next: NextFunction) {
  const membership = await findCurrentMembership(req.session.userId as string);
  if (!membership) {
    res.status(404).json({ error: { message: "You don't belong to an organization" } });
    return;
  }
  if (membership.role !== "ADMIN") {
    res.status(403).json({ error: { message: "Only organization admins can do this" } });
    return;
  }
  res.locals.membership = membership;
  next();
}

export function currentMembership(res: Response): CurrentMembership {
  return res.locals.membership as CurrentMembership;
}
