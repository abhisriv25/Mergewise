import { env } from "../env.js";

export interface GithubOAuthProfile {
  githubId: string;
  githubLogin: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export class GithubOAuthError extends Error {}

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", env.GITHUB_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    throw new GithubOAuthError(`GitHub token exchange failed with status ${res.status}`);
  }

  const body = (await res.json()) as { access_token?: string; error?: string };
  if (!body.access_token) {
    throw new GithubOAuthError(body.error ?? "GitHub token exchange returned no access_token");
  }

  return body.access_token;
}

export async function fetchGithubProfile(accessToken: string): Promise<GithubOAuthProfile> {
  const res = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "mergewise",
    },
  });

  if (!res.ok) {
    throw new GithubOAuthError(`GitHub profile fetch failed with status ${res.status}`);
  }

  const body = (await res.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
  };

  return {
    githubId: String(body.id),
    githubLogin: body.login,
    displayName: body.name,
    avatarUrl: body.avatar_url,
  };
}
