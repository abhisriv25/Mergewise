import { createHash } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  user: { upsert: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  organization: { update: vi.fn(), findUniqueOrThrow: vi.fn() },
  membership: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  },
  invitation: { updateMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  repository: { findFirst: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("../prisma.js", () => ({ prisma: prismaMock }));
// This file signs in more than the real per-minute limit allows.
vi.mock("../middleware/rate-limit.js", () => {
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    webhookRateLimiter: pass,
    authFlowRateLimiter: pass,
    invitationSendRateLimiter: pass,
    invitationLookupRateLimiter: pass,
  };
});

const { app } = await import("../app.js");

const USER = { id: "user-1", githubId: "42", githubLogin: "octocat", displayName: null, avatarUrl: null };
const ORG = {
  id: "org-1",
  name: "Acme",
  slug: "acme",
  githubAccountId: "7",
  githubAccountLogin: "acme",
  githubAccountType: "Organization",
  githubInstallationId: "99",
};
const ADMIN_MEMBERSHIP = { id: "m-admin", userId: "user-1", organizationId: "org-1", role: "ADMIN", organization: ORG };
const TOKEN = "a".repeat(43);
const HOUR = 60 * 60 * 1000;

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as Promise<Response>;
}

/** GitHub stubbed for OAuth plus the App calls invitations make.
 * `orgMember` is what GET /orgs/acme/members/:user answers. */
function stubGithub({ orgMember = 204 }: { orgMember?: number } = {}) {
  const fetchMock = vi.fn((url: string) => {
    if (url.includes("/login/oauth/access_token")) return jsonResponse({ access_token: "oauth-token" });
    if (url === "https://api.github.com/user") {
      return jsonResponse({ id: 42, login: "octocat", name: null, avatar_url: null });
    }
    if (url.includes("/access_tokens")) return jsonResponse({ token: "installation-token" });
    if (url.includes("/orgs/acme/members/")) return jsonResponse({}, orgMember);
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Signs in through the mocked OAuth round-trip, optionally from an invite
 * link, and returns the agent and where the callback redirected. */
async function signIn(invite?: string) {
  prismaMock.user.upsert.mockResolvedValueOnce(USER);
  const agent = request.agent(app);
  const loginRes = await agent.get(`/auth/github/login${invite ? `?invite=${invite}` : ""}`);
  const state = new URL(loginRes.headers.location).searchParams.get("state");
  const callbackRes = await agent.get(`/auth/github/callback?code=abc&state=${state}`);
  return { agent, location: callbackRes.headers.location as string };
}

function invitation(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    organizationId: "org-1",
    email: "dev@acme.com",
    tokenHash: createHash("sha256").update(TOKEN).digest("hex"),
    role: "MEMBER",
    invitedById: "user-1",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + HOUR),
    acceptedAt: null,
    acceptedById: null,
    revokedAt: null,
    organization: ORG,
    invitedBy: { githubLogin: "octocat" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation((fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
  prismaMock.membership.findFirst.mockResolvedValue(ADMIN_MEMBERSHIP);
  prismaMock.membership.findMany.mockResolvedValue([]);
  prismaMock.user.findUniqueOrThrow.mockResolvedValue(USER);
  prismaMock.invitation.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.invitation.findMany.mockResolvedValue([]);
  prismaMock.invitation.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: `inv-${String(data.email)}`, createdAt: new Date(), ...data }),
  );
  stubGithub();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /organizations/current/invitations", () => {
  it("requires auth", async () => {
    const res = await request(app).post("/organizations/current/invitations").send({ emails: ["a@b.co"] });
    expect(res.status).toBe(401);
  });

  it("is admin-only", async () => {
    const { agent } = await signIn();
    prismaMock.membership.findFirst.mockResolvedValue({ ...ADMIN_MEMBERSHIP, role: "MEMBER" });

    const res = await agent.post("/organizations/current/invitations").send({ emails: ["a@b.co"] });

    expect(res.status).toBe(403);
    expect(prismaMock.invitation.create).not.toHaveBeenCalled();
  });

  it("rejects invalid email addresses", async () => {
    const { agent } = await signIn();

    for (const emails of [[], ["not-an-email"], Array.from({ length: 21 }, (_, i) => `p${i}@acme.com`)]) {
      const res = await agent.post("/organizations/current/invitations").send({ emails });
      expect(res.status).toBe(400);
    }
  });

  it("needs the organization linked to GitHub first", async () => {
    const unlinked = { ...ORG, githubAccountId: null, githubAccountLogin: null, githubInstallationId: null };
    prismaMock.membership.findFirst.mockResolvedValue({ ...ADMIN_MEMBERSHIP, organization: unlinked });
    prismaMock.repository.findFirst.mockResolvedValue(null);
    const { agent } = await signIn();

    const res = await agent.post("/organizations/current/invitations").send({ emails: ["dev@acme.com"] });

    expect(res.status).toBe(409);
    expect(prismaMock.invitation.create).not.toHaveBeenCalled();
  });

  it("issues one single-use, day-long link per unique email, storing only its hash", async () => {
    const { agent } = await signIn();

    const res = await agent
      .post("/organizations/current/invitations")
      .send({ emails: ["Dev@Acme.com", "dev@acme.com ", "ops@acme.com"] });

    expect(res.status).toBe(201);
    expect(res.body.invitations).toHaveLength(2);

    const [first] = res.body.invitations;
    expect(first.email).toBe("dev@acme.com");
    expect(first.emailSent).toBe(false); // Resend isn't configured in tests
    const token = first.url.match(/\/invite\/([A-Za-z0-9_-]{43})$/)?.[1];
    expect(token).toBeTruthy();

    const created = prismaMock.invitation.create.mock.calls[0][0].data;
    expect(created.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(created)).not.toContain(token);
    const ttl = created.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(23 * HOUR);
    expect(ttl).toBeLessThanOrEqual(24 * HOUR);

    // Any older open invitation for the same person stops working.
    expect(prismaMock.invitation.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", email: "dev@acme.com", acceptedAt: null, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe("DELETE /organizations/current/invitations/:id", () => {
  it("revokes an open invitation in the caller's organization only", async () => {
    const { agent } = await signIn();

    const res = await agent.delete("/organizations/current/invitations/inv-1");

    expect(res.status).toBe(204);
    expect(prismaMock.invitation.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", organizationId: "org-1", acceptedAt: null, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("404s when there's nothing to revoke", async () => {
    prismaMock.invitation.updateMany.mockResolvedValue({ count: 0 });
    const { agent } = await signIn();

    const res = await agent.delete("/organizations/current/invitations/someone-elses");

    expect(res.status).toBe(404);
  });
});

describe("GET /invitations/:token", () => {
  it("404s a malformed token without touching the database", async () => {
    const res = await request(app).get("/invitations/not-a-token");

    expect(res.status).toBe(404);
    expect(prismaMock.invitation.findUnique).not.toHaveBeenCalled();
  });

  it("describes a valid invitation", async () => {
    prismaMock.invitation.findUnique.mockResolvedValue(invitation());

    const res = await request(app).get(`/invitations/${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      organizationName: "Acme",
      githubAccountLogin: "acme",
      invitedBy: "octocat",
      email: "dev@acme.com",
      status: "pending",
    });
  });

  it("reports an expired invitation as expired", async () => {
    prismaMock.invitation.findUnique.mockResolvedValue(invitation({ expiresAt: new Date(Date.now() - 1000) }));

    const res = await request(app).get(`/invitations/${TOKEN}`);

    expect(res.body.status).toBe("expired");
  });
});

describe("accepting an invitation by signing in", () => {
  beforeEach(() => {
    prismaMock.membership.findFirst.mockResolvedValue(null); // a newcomer
  });

  it("joins the organization as a MEMBER and uses up the link", async () => {
    prismaMock.invitation.findUnique.mockResolvedValue(invitation());

    const { location } = await signIn(TOKEN);

    expect(location).toBe("http://localhost:5173/?joined=1");
    expect(prismaMock.invitation.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", acceptedAt: null, revokedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { acceptedAt: expect.any(Date), acceptedById: "user-1" },
    });
    expect(prismaMock.membership.create).toHaveBeenCalledWith({
      data: { userId: "user-1", organizationId: "org-1", role: "MEMBER" },
    });
  });

  it.each([
    ["expired", { expiresAt: new Date(Date.now() - 1000) }],
    ["used", { acceptedAt: new Date(), acceptedById: "someone-else" }],
    ["revoked", { revokedAt: new Date() }],
  ])("turns away a %s link", async (reason, overrides) => {
    prismaMock.invitation.findUnique.mockResolvedValue(invitation(overrides));

    const { location } = await signIn(TOKEN);

    expect(location).toBe(`http://localhost:5173/invite/${TOKEN}?error=${reason}`);
    expect(prismaMock.membership.create).not.toHaveBeenCalled();
  });

  it("turns away an unknown link", async () => {
    prismaMock.invitation.findUnique.mockResolvedValue(null);

    const { location } = await signIn(TOKEN);

    expect(location).toBe(`http://localhost:5173/invite/${TOKEN}?error=invalid`);
  });

  it("turns away someone outside the organization's GitHub organization", async () => {
    prismaMock.invitation.findUnique.mockResolvedValue(invitation());
    stubGithub({ orgMember: 404 });

    const { location } = await signIn(TOKEN);

    expect(location).toBe(`http://localhost:5173/invite/${TOKEN}?error=not_in_github`);
    expect(prismaMock.membership.create).not.toHaveBeenCalled();
  });

  it("doesn't treat a GitHub error as 'not a member'", async () => {
    prismaMock.invitation.findUnique.mockResolvedValue(invitation());
    stubGithub({ orgMember: 403 });

    const { location } = await signIn(TOKEN);

    expect(location).toBe(`http://localhost:5173/invite/${TOKEN}?error=github_unavailable`);
    expect(prismaMock.membership.create).not.toHaveBeenCalled();
  });

  it("turns away someone already in another organization", async () => {
    prismaMock.invitation.findUnique.mockResolvedValue(invitation());
    prismaMock.membership.findFirst.mockResolvedValue({ organizationId: "org-2", role: "ADMIN" });

    const { location } = await signIn(TOKEN);

    expect(location).toBe(`http://localhost:5173/invite/${TOKEN}?error=other_organization`);
    expect(prismaMock.membership.create).not.toHaveBeenCalled();
  });

  it("lets only one of two simultaneous uses win", async () => {
    prismaMock.invitation.findUnique.mockResolvedValue(invitation());
    prismaMock.invitation.updateMany.mockResolvedValue({ count: 0 }); // the other one claimed it first

    const { location } = await signIn(TOKEN);

    expect(location).toBe(`http://localhost:5173/invite/${TOKEN}?error=used`);
    expect(prismaMock.membership.create).not.toHaveBeenCalled();
  });

  it("ignores a malformed invite parameter and signs in normally", async () => {
    const { location } = await signIn("<script>");

    expect(location).toBe("http://localhost:5173");
    expect(prismaMock.invitation.findUnique).not.toHaveBeenCalled();
  });
});

describe("members", () => {
  const MEMBER_ROW = {
    id: "m-dev",
    userId: "user-2",
    organizationId: "org-1",
    role: "MEMBER",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    user: { id: "user-2", githubLogin: "dev", displayName: "Dev", avatarUrl: null, lastActiveAt: null },
  };

  it("lists members with how they joined and their live GitHub status", async () => {
    const { agent } = await signIn();
    prismaMock.membership.findMany.mockResolvedValue([MEMBER_ROW]);
    prismaMock.invitation.findMany.mockResolvedValue([
      { acceptedById: "user-2", email: "dev@acme.com", invitedBy: { githubLogin: "octocat" } },
    ]);
    stubGithub({ orgMember: 404 });

    const res = await agent.get("/organizations/current/members");

    expect(res.status).toBe(200);
    expect(res.body.members).toEqual([
      expect.objectContaining({
        id: "m-dev",
        role: "MEMBER",
        invitedEmail: "dev@acme.com",
        invitedBy: "octocat",
        githubStatus: "not_member",
        user: expect.objectContaining({ githubLogin: "dev" }),
      }),
    ]);
  });

  it("is admin-only", async () => {
    const { agent } = await signIn();
    prismaMock.membership.findFirst.mockResolvedValue({ ...ADMIN_MEMBERSHIP, role: "MEMBER" });

    const res = await agent.get("/organizations/current/members");

    expect(res.status).toBe(403);
  });

  it("won't demote the last admin", async () => {
    const { agent } = await signIn();
    prismaMock.membership.findFirst.mockResolvedValueOnce(ADMIN_MEMBERSHIP).mockResolvedValueOnce(ADMIN_MEMBERSHIP);
    prismaMock.membership.count.mockResolvedValue(1);

    const res = await agent.patch("/organizations/current/members/m-admin").send({ role: "MEMBER" });

    expect(res.status).toBe(409);
    expect(prismaMock.membership.update).not.toHaveBeenCalled();
  });

  it("won't remove the last admin", async () => {
    const { agent } = await signIn();
    prismaMock.membership.findFirst.mockResolvedValueOnce(ADMIN_MEMBERSHIP).mockResolvedValueOnce(ADMIN_MEMBERSHIP);
    prismaMock.membership.count.mockResolvedValue(1);

    const res = await agent.delete("/organizations/current/members/m-admin");

    expect(res.status).toBe(409);
    expect(prismaMock.membership.delete).not.toHaveBeenCalled();
  });

  it("removes a member of the caller's organization", async () => {
    const { agent } = await signIn();
    prismaMock.membership.findFirst.mockResolvedValueOnce(ADMIN_MEMBERSHIP).mockResolvedValueOnce(MEMBER_ROW);

    const res = await agent.delete("/organizations/current/members/m-dev");

    expect(res.status).toBe(204);
    expect(prismaMock.membership.findFirst).toHaveBeenLastCalledWith({ where: { id: "m-dev", organizationId: "org-1" } });
    expect(prismaMock.membership.delete).toHaveBeenCalledWith({ where: { id: "m-dev" } });
  });

  it("404s a member of another organization", async () => {
    const { agent } = await signIn();
    prismaMock.membership.findFirst.mockResolvedValueOnce(ADMIN_MEMBERSHIP).mockResolvedValueOnce(null);

    const res = await agent.delete("/organizations/current/members/elsewhere");

    expect(res.status).toBe(404);
    expect(prismaMock.membership.delete).not.toHaveBeenCalled();
  });

  it("promotes a member to admin", async () => {
    const { agent } = await signIn();
    prismaMock.membership.findFirst.mockResolvedValueOnce(ADMIN_MEMBERSHIP).mockResolvedValueOnce(MEMBER_ROW);
    prismaMock.membership.update.mockResolvedValue({ ...MEMBER_ROW, role: "ADMIN" });

    const res = await agent.patch("/organizations/current/members/m-dev").send({ role: "ADMIN" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "m-dev", role: "ADMIN" });
  });
});

describe("signing in after leaving the GitHub organization", () => {
  it("removes that MEMBER's membership", async () => {
    prismaMock.membership.findMany.mockResolvedValue([{ id: "m-dev", organizationId: "org-1", organization: ORG }]);
    stubGithub({ orgMember: 404 });

    await signIn();

    expect(prismaMock.membership.delete).toHaveBeenCalledWith({ where: { id: "m-dev" } });
  });

  it("keeps it when GitHub can't answer", async () => {
    prismaMock.membership.findMany.mockResolvedValue([{ id: "m-dev", organizationId: "org-1", organization: ORG }]);
    stubGithub({ orgMember: 500 });

    await signIn();

    expect(prismaMock.membership.delete).not.toHaveBeenCalled();
  });
});
