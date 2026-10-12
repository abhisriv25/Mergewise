import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, { value: string; ttl: number }>();
const redisMock = {
  get: vi.fn(async (key: string) => store.get(key)?.value ?? null),
  set: vi.fn(async (key: string, value: string, _mode: string, ttl: number) => {
    store.set(key, { value, ttl });
    return "OK";
  }),
};

vi.mock("../redis.js", () => ({ redis: redisMock }));

const { fetchInstallationAccessToken } = await import("./github-app-auth.service.js");

const fetchMock = vi.fn();

function tokenResponse(token: string, expiresInSeconds: number) {
  return new Response(
    JSON.stringify({
      token,
      expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    }),
    { status: 201 },
  );
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchInstallationAccessToken caching", () => {
  it("mints a token once and serves repeat calls from the cache", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse("token-1", 3600));

    expect(await fetchInstallationAccessToken("42")).toBe("token-1");
    expect(await fetchInstallationAccessToken("42")).toBe("token-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches until 5 minutes before GitHub's expiry", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse("token-1", 3600));

    await fetchInstallationAccessToken("42");

    const ttl = store.get("devpulse:gh-installation-token:42")?.ttl ?? 0;
    expect(ttl).toBeGreaterThan(3290);
    expect(ttl).toBeLessThanOrEqual(3300);
  });

  it("keeps tokens for different installations separate", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("token-a", 3600))
      .mockResolvedValueOnce(tokenResponse("token-b", 3600));

    expect(await fetchInstallationAccessToken("1")).toBe("token-a");
    expect(await fetchInstallationAccessToken("2")).toBe("token-b");
  });

  it("does not cache a token that is already inside the expiry margin", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse("short-lived", 60));

    expect(await fetchInstallationAccessToken("42")).toBe("short-lived");
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it("does not cache when GitHub rejects the request", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 401 }));

    await expect(fetchInstallationAccessToken("42")).rejects.toThrow("status 401");
    expect(redisMock.set).not.toHaveBeenCalled();
  });
});
