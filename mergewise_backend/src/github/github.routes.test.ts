import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  user: { upsert: vi.fn(), findUnique: vi.fn() },
  organization: { create: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  membership: { create: vi.fn(), findFirst: vi.fn() },
  repository: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
};

vi.mock("../prisma.js", () => ({ prisma: prismaMock }));
const indexRepositoryDocsInBackgroundMock = vi.fn();
vi.mock("../knowledge/docs-indexer.js", () => ({ indexRepositoryDocsInBackground: indexRepositoryDocsInBackgroundMock }));
// This file signs in more than the real per-minute limit allows.
vi.mock("../middleware/rate-limit.js", () => {
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return { webhookRateLimiter: pass, authFlowRateLimiter: pass, invitationSendRateLimiter: pass, invitationLookupRateLimiter: pass, reassessRateLimiter: pass, repositoryActionRateLimiter: pass };
});

const { app } = await import("../app.js");

const GITHUB_USER = { id: 42, login: "octocat", name: null, avatar_url: null };

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as Promise<Response>;
}

/** Logs an agent in via a mocked OAuth round-trip and returns it, with the
 * user already resolved to organizationId "org-1" for subsequent calls. */
async function loginAgent() {
  prismaMock.user.upsert.mockResolvedValueOnce({
    id: "user-1",
    githubLogin: "octocat",
    displayName: null,
    avatarUrl: null,
    memberships: [{ id: "membership-1", organizationId: "org-1", role: "ADMIN" }],
  });

  const agent = request.agent(app);
  const loginRes = await agent.get("/auth/github/login");
  const state = new URL(loginRes.headers.location).searchParams.get("state");

  const fetchMock = vi.fn((url: string) => {
    if (url.includes("/login/oauth/access_token")) {
      return jsonResponse({ access_token: "oauth-token" });
    }
    if (url === "https://api.github.com/user") {
      return jsonResponse(GITHUB_USER);
    }
    throw new Error(`Unexpected fetch during login: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  await agent.get(`/auth/github/callback?code=abc&state=${state}`);
  vi.unstubAllGlobals();

  return agent;
}

const USER = { id: "user-1", githubId: "42", githubLogin: "octocat" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.membership.findFirst.mockResolvedValue({ organizationId: "org-1", role: "ADMIN" });
  prismaMock.user.findUnique.mockResolvedValue(USER);
  prismaMock.organization.findUniqueOrThrow.mockResolvedValue({ id: "org-1", githubAccountId: null });
  prismaMock.organization.update.mockResolvedValue({});
  prismaMock.repository.findMany.mockResolvedValue([]);
  prismaMock.repository.upsert.mockResolvedValue({ id: "repo-1" });
});

/** Starts an install as an admin and returns the agent plus its state token. */
async function startInstall() {
  const agent = await loginAgent();
  const installRes = await agent.get("/github/install-url");
  const state = new URL(installRes.headers.location).searchParams.get("state");
  return { agent, state };
}

/** GitHub stubbed for a setup: the installation belongs to `account`, and
 * `membership` answers the org-owner lookup. */
function stubGithubForSetup(
  account: { id: number; login: string; type: string },
  membership: { status: number; body?: unknown } = { status: 404 },
) {
  const fetchMock = vi.fn((url: string) => {
    if (url.endsWith("/app/installations/99")) return jsonResponse({ account });
    if (url.includes("/access_tokens")) return jsonResponse({ token: "installation-token" });
    if (url.includes("/orgs/") && url.includes("/memberships/")) {
      return jsonResponse(membership.body ?? {}, membership.status < 300, membership.status);
    }
    if (url.includes("/installation/repositories")) {
      return jsonResponse({
        repositories: [
          { id: 1, name: "hello-world", full_name: "octocat/hello-world", private: false, owner: { login: "octocat" } },
        ],
      });
    }
    throw new Error(`Unexpected fetch during setup: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /repositories", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/repositories");
    expect(res.status).toBe(401);
  });

  it("returns an empty list gracefully when the user has no organization", async () => {
    prismaMock.membership.findFirst.mockResolvedValueOnce(null);
    const agent = await loginAgent();

    const res = await agent.get("/repositories");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ repositories: [] });
  });

  it("is scoped to the caller's own organization, ignoring a spoofed query param", async () => {
    const agent = await loginAgent();
    prismaMock.repository.findMany.mockResolvedValueOnce([
      {
        id: "repo-1",
        owner: "octocat",
        name: "hello-world",
        fullName: "octocat/hello-world",
        private: false,
        connectedAt: new Date("2024-01-01T00:00:00.000Z"),
        disconnectedAt: null,
        docsIndexedAt: new Date("2024-01-02T00:00:00.000Z"),
      },
    ]);

    const res = await agent.get("/repositories?organizationId=some-other-org");

    expect(res.status).toBe(200);
    expect(prismaMock.repository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } }),
    );
    expect(res.body.repositories).toEqual([
      {
        id: "repo-1",
        owner: "octocat",
        name: "hello-world",
        fullName: "octocat/hello-world",
        private: false,
        connectedAt: "2024-01-01T00:00:00.000Z",
        disconnectedAt: null,
        docsIndexedAt: "2024-01-02T00:00:00.000Z",
      },
    ]);
  });
});

describe("GET /github/install-url", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/github/install-url");
    expect(res.status).toBe(401);
  });

  it("rejects when the user has no organization", async () => {
    prismaMock.membership.findFirst.mockResolvedValueOnce(null);
    const agent = await loginAgent();

    const res = await agent.get("/github/install-url");

    expect(res.status).toBe(400);
  });

  it("refuses a MEMBER — connecting repos is an admin decision", async () => {
    prismaMock.membership.findFirst.mockResolvedValue({ organizationId: "org-1", role: "MEMBER" });
    const agent = await loginAgent();

    const res = await agent.get("/github/install-url");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:5173/repositories?error=admin_only");
  });

  it("redirects to GitHub's install page with a fresh state token", async () => {
    const agent = await loginAgent();

    const res = await agent.get("/github/install-url");

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.origin + location.pathname).toBe(
      "https://github.com/apps/test-app/installations/new",
    );
    expect(location.searchParams.get("state")).toBeTruthy();
  });
});

describe("GET /github/setup", () => {
  it("rejects a request missing installation_id/state", async () => {
    const res = await request(app).get("/github/setup");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:5173/repositories?error=install_failed");
  });

  it("rejects a mismatched or replayed state (CSRF protection)", async () => {
    const agent = await loginAgent();
    await agent.get("/github/install-url");

    const res = await agent.get("/github/setup?installation_id=99&state=not-the-real-state");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:5173/repositories?error=install_failed");
  });

  it("completes the install flow end-to-end, linking the installer's own account", async () => {
    const { agent, state } = await startInstall();
    stubGithubForSetup({ id: 42, login: "octocat", type: "User" });

    const res = await agent.get(`/github/setup?installation_id=99&state=${state}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:5173/repositories");
    expect(prismaMock.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { githubAccountId: "42", githubAccountLogin: "octocat", githubAccountType: "User", githubInstallationId: "99" },
    });
    expect(prismaMock.repository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_githubRepoId: { organizationId: "org-1", githubRepoId: "1" } },
        create: expect.objectContaining({ organizationId: "org-1", githubRepoId: "1" }),
      }),
    );
    expect(indexRepositoryDocsInBackgroundMock).toHaveBeenCalledWith(["repo-1"]);
  });

  it("links a GitHub organization when the installer is one of its owners", async () => {
    const { agent, state } = await startInstall();
    stubGithubForSetup({ id: 7, login: "acme", type: "Organization" }, { status: 200, body: { role: "admin", state: "active" } });

    const res = await agent.get(`/github/setup?installation_id=99&state=${state}`);

    expect(res.headers.location).toBe("http://localhost:5173/repositories");
    expect(prismaMock.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ githubAccountId: "7", githubAccountType: "Organization" }) }),
    );
  });

  it("refuses a forged installation_id for someone else's account", async () => {
    const { agent, state } = await startInstall();
    stubGithubForSetup({ id: 999, login: "someone-else", type: "User" });

    const res = await agent.get(`/github/setup?installation_id=99&state=${state}`);

    expect(res.headers.location).toBe("http://localhost:5173/repositories?error=not_account_owner");
    expect(prismaMock.organization.update).not.toHaveBeenCalled();
    expect(prismaMock.repository.upsert).not.toHaveBeenCalled();
  });

  it("refuses a GitHub organization the installer only belongs to as a member", async () => {
    const { agent, state } = await startInstall();
    stubGithubForSetup({ id: 7, login: "acme", type: "Organization" }, { status: 200, body: { role: "member", state: "active" } });

    const res = await agent.get(`/github/setup?installation_id=99&state=${state}`);

    expect(res.headers.location).toBe("http://localhost:5173/repositories?error=not_account_owner");
    expect(prismaMock.repository.upsert).not.toHaveBeenCalled();
  });

  it("explains when the App hasn't been granted Members permission", async () => {
    const { agent, state } = await startInstall();
    stubGithubForSetup({ id: 7, login: "acme", type: "Organization" }, { status: 403 });

    const res = await agent.get(`/github/setup?installation_id=99&state=${state}`);

    expect(res.headers.location).toBe("http://localhost:5173/repositories?error=app_permission_missing");
  });

  it("refuses to switch an organization to a different GitHub account", async () => {
    prismaMock.organization.findUniqueOrThrow.mockResolvedValue({ id: "org-1", githubAccountId: "555" });
    const { agent, state } = await startInstall();
    stubGithubForSetup({ id: 42, login: "octocat", type: "User" });

    const res = await agent.get(`/github/setup?installation_id=99&state=${state}`);

    expect(res.headers.location).toBe("http://localhost:5173/repositories?error=account_mismatch");
  });

  it("degrades to a clear error redirect if the GitHub API call fails", async () => {
    const agent = await loginAgent();
    const installRes = await agent.get("/github/install-url");
    const state = new URL(installRes.headers.location).searchParams.get("state");

    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({}, false, 500)),
    );

    const res = await agent.get(`/github/setup?installation_id=99&state=${state}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:5173/repositories?error=install_failed");
  });
});

const DISCONNECTED_REPO = {
  id: "repo-1",
  organizationId: "org-1",
  githubInstallationId: "99",
  githubRepoId: "1",
  owner: "octocat",
  name: "hello-world",
  fullName: "octocat/hello-world",
  private: false,
  connectedAt: new Date("2024-01-01T00:00:00.000Z"),
  disconnectedAt: new Date("2024-02-01T00:00:00.000Z"),
  docsIndexedAt: null,
};

/** An admin whose organization is already linked to installation 99. */
function adminMembership(role: "ADMIN" | "MEMBER" = "ADMIN") {
  return {
    organizationId: "org-1",
    role,
    organization: { id: "org-1", githubInstallationId: "99" },
  };
}

describe("POST /repositories/sync", () => {
  it("refuses a MEMBER", async () => {
    prismaMock.membership.findFirst.mockResolvedValue(adminMembership("MEMBER"));
    const agent = await loginAgent();

    expect((await agent.post("/repositories/sync")).status).toBe(403);
  });

  it("re-reads the installation's repos, indexes new ones and disconnects ones GitHub no longer lists", async () => {
    prismaMock.membership.findFirst.mockResolvedValue(adminMembership());
    prismaMock.repository.findMany.mockResolvedValue([
      { ...DISCONNECTED_REPO, id: "repo-gone", githubRepoId: "2", disconnectedAt: null },
    ]);
    prismaMock.repository.upsert.mockResolvedValue({ id: "repo-new" });
    const agent = await loginAgent();
    stubGithubForSetup({ id: 42, login: "octocat", type: "User" });

    const res = await agent.post("/repositories/sync");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ added: 1, disconnected: 1 });
    expect(prismaMock.repository.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["repo-gone"] } },
      data: { disconnectedAt: expect.any(Date) },
    });
    expect(indexRepositoryDocsInBackgroundMock).toHaveBeenCalledWith(["repo-new"]);
  });

  it("keeps a repo an admin disconnected disconnected, even though GitHub still lists it", async () => {
    prismaMock.membership.findFirst.mockResolvedValue(adminMembership());
    prismaMock.repository.findMany.mockResolvedValue([DISCONNECTED_REPO]);
    prismaMock.repository.upsert.mockResolvedValue(DISCONNECTED_REPO);
    const agent = await loginAgent();
    stubGithubForSetup({ id: 42, login: "octocat", type: "User" });

    const res = await agent.post("/repositories/sync");

    expect(res.body).toEqual({ added: 0, disconnected: 0 });
    expect(prismaMock.repository.upsert.mock.calls[0][0].update).not.toHaveProperty("disconnectedAt");
  });
});

describe("POST /repositories/:id/disconnect", () => {
  it("refuses a MEMBER", async () => {
    prismaMock.membership.findFirst.mockResolvedValue(adminMembership("MEMBER"));
    const agent = await loginAgent();

    expect((await agent.post("/repositories/repo-1/disconnect")).status).toBe(403);
    expect(prismaMock.repository.update).not.toHaveBeenCalled();
  });

  it("404s for a repository in another organization", async () => {
    prismaMock.membership.findFirst.mockResolvedValue(adminMembership());
    prismaMock.repository.findFirst.mockResolvedValueOnce(null);
    const agent = await loginAgent();

    expect((await agent.post("/repositories/elsewhere/disconnect")).status).toBe(404);
    expect(prismaMock.repository.findFirst).toHaveBeenCalledWith({ where: { id: "elsewhere", organizationId: "org-1" } });
  });

  it("marks the repository disconnected without deleting it", async () => {
    prismaMock.membership.findFirst.mockResolvedValue(adminMembership());
    prismaMock.repository.findFirst.mockResolvedValueOnce({ ...DISCONNECTED_REPO, disconnectedAt: null });
    prismaMock.repository.update.mockResolvedValueOnce(DISCONNECTED_REPO);
    const agent = await loginAgent();

    const res = await agent.post("/repositories/repo-1/disconnect");

    expect(res.status).toBe(200);
    expect(res.body.disconnectedAt).toBe("2024-02-01T00:00:00.000Z");
    expect(prismaMock.repository.update).toHaveBeenCalledWith({
      where: { id: "repo-1" },
      data: { disconnectedAt: expect.any(Date) },
    });
  });
});

describe("POST /repositories/:id/reconnect", () => {
  it("reconnects and re-indexes a repo the App can still see", async () => {
    prismaMock.membership.findFirst.mockResolvedValue(adminMembership());
    prismaMock.repository.findFirst.mockResolvedValueOnce(DISCONNECTED_REPO);
    prismaMock.repository.update.mockResolvedValueOnce({ ...DISCONNECTED_REPO, disconnectedAt: null });
    const agent = await loginAgent();
    stubGithubForSetup({ id: 42, login: "octocat", type: "User" });

    const res = await agent.post("/repositories/repo-1/reconnect");

    expect(res.status).toBe(200);
    expect(res.body.disconnectedAt).toBeNull();
    expect(prismaMock.repository.update).toHaveBeenCalledWith({ where: { id: "repo-1" }, data: { disconnectedAt: null } });
    expect(indexRepositoryDocsInBackgroundMock).toHaveBeenCalledWith(["repo-1"]);
  });

  it("explains when GitHub no longer gives the App access to the repo", async () => {
    prismaMock.membership.findFirst.mockResolvedValue(adminMembership());
    prismaMock.repository.findFirst.mockResolvedValueOnce({ ...DISCONNECTED_REPO, githubRepoId: "404" });
    const agent = await loginAgent();
    stubGithubForSetup({ id: 42, login: "octocat", type: "User" });

    const res = await agent.post("/repositories/repo-1/reconnect");

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("access_removed");
    expect(prismaMock.repository.update).not.toHaveBeenCalled();
  });
});

describe("GET /github/setup?setup_action=update", () => {
  it("re-syncs when an admin changed the installation's repos on GitHub", async () => {
    prismaMock.membership.findFirst.mockResolvedValue(adminMembership());
    prismaMock.repository.upsert.mockResolvedValue({ id: "repo-new" });
    const agent = await loginAgent();
    stubGithubForSetup({ id: 42, login: "octocat", type: "User" });

    const res = await agent.get("/github/setup?installation_id=99&setup_action=update");

    expect(res.headers.location).toBe("http://localhost:5173/repositories");
    expect(prismaMock.repository.upsert).toHaveBeenCalled();
    expect(prismaMock.organization.update).not.toHaveBeenCalled();
  });

  it("refuses an installation that isn't the admin's organization's", async () => {
    prismaMock.membership.findFirst.mockResolvedValue(adminMembership());
    const agent = await loginAgent();

    const res = await agent.get("/github/setup?installation_id=12345&setup_action=update");

    expect(res.headers.location).toBe("http://localhost:5173/repositories?error=install_failed");
    expect(prismaMock.repository.upsert).not.toHaveBeenCalled();
  });
});
