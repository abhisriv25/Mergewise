import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../app.js";

describe("GET /auth/github/login", () => {
  it("redirects to GitHub's authorize endpoint with a state param", async () => {
    const res = await request(app).get("/auth/github/login");

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("state")).toBeTruthy();
  });
});

describe("GET /auth/github/callback", () => {
  it("rejects a callback with no prior session state (CSRF protection)", async () => {
    const res = await request(app).get("/auth/github/callback?code=abc&state=whatever");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:5173/login?error=oauth_failed");
  });

  it("rejects a callback whose state doesn't match the one issued at login", async () => {
    const agent = request.agent(app);

    const loginRes = await agent.get("/auth/github/login");
    const issuedState = new URL(loginRes.headers.location).searchParams.get("state");
    expect(issuedState).toBeTruthy();

    const callbackRes = await agent.get(
      `/auth/github/callback?code=abc&state=not-${issuedState}`,
    );

    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers.location).toBe("http://localhost:5173/login?error=oauth_failed");
  });
});

describe("GET /me", () => {
  it("returns 401 when not signed in", async () => {
    const res = await request(app).get("/me");

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBeTruthy();
  });
});
