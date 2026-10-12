import { Prisma } from "@prisma/client";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  user: { upsert: vi.fn() },
  organization: { create: vi.fn() },
  membership: { findFirst: vi.fn() },
};

vi.mock("../prisma.js", () => ({ prisma: prismaMock }));

const { app } = await import("../app.js");
const { slugifyOrganizationName } = await import("../auth/auth.service.js");

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) }) as unknown as Promise<Response>;
}

async function loginAgent() {
  prismaMock.user.upsert.mockResolvedValueOnce({
    id: "user-1",
    githubLogin: "octocat",
    displayName: null,
    avatarUrl: null,
  });

  const agent = request.agent(app);
  const loginRes = await agent.get("/auth/github/login");
  const state = new URL(loginRes.headers.location).searchParams.get("state");

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/login/oauth/access_token")) return jsonResponse({ access_token: "oauth-token" });
      if (url === "https://api.github.com/user") {
        return jsonResponse({ id: 42, login: "octocat", name: null, avatar_url: null });
      }
      throw new Error(`Unexpected fetch during login: ${url}`);
    }),
  );
  await agent.get(`/auth/github/callback?code=abc&state=${state}`);
  vi.unstubAllGlobals();

  return agent;
}

function slugCollision() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["slug"] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.membership.findFirst.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("signing in", () => {
  it("does not create an organization", async () => {
    await loginAgent();
    expect(prismaMock.organization.create).not.toHaveBeenCalled();
  });
});

describe("POST /organizations", () => {
  it("requires auth", async () => {
    const res = await request(app).post("/organizations").send({ name: "Acme" });
    expect(res.status).toBe(401);
  });

  it("rejects a missing or too-short name", async () => {
    const agent = await loginAgent();

    for (const body of [{}, { name: " " }, { name: "A" }, { name: "x".repeat(61) }]) {
      const res = await agent.post("/organizations").send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBeTruthy();
    }
    expect(prismaMock.organization.create).not.toHaveBeenCalled();
  });

  it("creates the organization with the caller as ADMIN", async () => {
    prismaMock.organization.create.mockResolvedValueOnce({ id: "org-1", name: "Acme Inc.", slug: "acme-inc" });
    const agent = await loginAgent();

    const res = await agent.post("/organizations").send({ name: "  Acme Inc.  " });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "org-1", name: "Acme Inc.", slug: "acme-inc", role: "ADMIN" });
    expect(prismaMock.organization.create).toHaveBeenCalledWith({
      data: {
        name: "Acme Inc.",
        slug: "acme-inc",
        memberships: { create: { userId: "user-1", role: "ADMIN" } },
      },
    });
  });

  it("refuses a second organization for someone who already has one", async () => {
    prismaMock.membership.findFirst.mockResolvedValue({ organizationId: "org-1" });
    const agent = await loginAgent();

    const res = await agent.post("/organizations").send({ name: "Another" });

    expect(res.status).toBe(409);
    expect(prismaMock.organization.create).not.toHaveBeenCalled();
  });

  it("retries with a suffixed slug when the slug is taken", async () => {
    prismaMock.organization.create
      .mockRejectedValueOnce(slugCollision())
      .mockResolvedValueOnce({ id: "org-2", name: "Acme", slug: "acme-1a2b3c" });
    const agent = await loginAgent();

    const res = await agent.post("/organizations").send({ name: "Acme" });

    expect(res.status).toBe(201);
    const secondSlug = prismaMock.organization.create.mock.calls[1][0].data.slug;
    expect(secondSlug).toMatch(/^acme-[0-9a-f]{6}$/);
  });
});

describe("slugifyOrganizationName", () => {
  it.each([
    ["Acme Inc.", "acme-inc"],
    ["  Dev  Pulse  ", "dev-pulse"],
    ["Café Team", "cafe-team"],
    ["Résumé", "resume"],
    ["!!!", "org"],
  ])("%s -> %s", (name, slug) => {
    expect(slugifyOrganizationName(name)).toBe(slug);
  });
});
