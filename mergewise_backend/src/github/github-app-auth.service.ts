import jwt from "jsonwebtoken";
import { env } from "../env.js";
import { redis } from "../redis.js";

export class GithubAppError extends Error {}

/** GitHub answered 403: the App is missing a permission it needs (most often
 * Organization "Members: read", which an org owner has to accept). */
export class GithubPermissionError extends GithubAppError {}

// GitHub caps App JWTs at 10 minutes; back the issued-at off by 60s to
// tolerate clock drift between this process and GitHub's.
const JWT_EXPIRY_SECONDS = 9 * 60;

function buildAppJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const privateKey = env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n");

  return jwt.sign(
    {
      iat: now - 60,
      exp: now + JWT_EXPIRY_SECONDS,
      iss: env.GITHUB_APP_ID,
    },
    privateKey,
    { algorithm: "RS256" },
  );
}

// Installation tokens are valid for an hour; reuse one until 5 minutes
// before it expires so a caller never gets a token that dies mid-request.
const TOKEN_EXPIRY_MARGIN_SECONDS = 5 * 60;

function installationTokenCacheKey(installationId: string): string {
  return `devpulse:gh-installation-token:${installationId}`;
}

/** Returns a cached installation token when Redis has one, otherwise mints
 * a fresh one from GitHub and caches it. */
export async function fetchInstallationAccessToken(installationId: string): Promise<string> {
  const cacheKey = installationTokenCacheKey(installationId);
  const cached = await redis?.get(cacheKey);
  if (cached) return cached;

  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${buildAppJwt()}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "mergewise",
      },
    },
  );

  if (!res.ok) {
    throw new GithubAppError(`Failed to create installation access token (status ${res.status})`);
  }

  const body = (await res.json()) as { token?: string; expires_at?: string };
  if (!body.token) {
    throw new GithubAppError("Installation access token response had no token");
  }

  if (redis && body.expires_at) {
    const ttlSeconds =
      Math.floor((Date.parse(body.expires_at) - Date.now()) / 1000) - TOKEN_EXPIRY_MARGIN_SECONDS;
    if (ttlSeconds > 0) await redis.set(cacheKey, body.token, "EX", ttlSeconds);
  }

  return body.token;
}

export interface GithubInstallationAccount {
  id: string;
  login: string;
  /** "Organization" or "User". */
  type: string;
}

/** Which GitHub account an installation belongs to, asked of GitHub with
 * the App's own JWT — the installation id in a setup redirect is
 * client-supplied, so its owner has to come from GitHub, not the URL. */
export async function fetchInstallationAccount(installationId: string): Promise<GithubInstallationAccount> {
  const res = await fetch(`https://api.github.com/app/installations/${installationId}`, {
    headers: {
      Authorization: `Bearer ${buildAppJwt()}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "mergewise",
    },
  });

  if (!res.ok) {
    throw new GithubAppError(`Failed to fetch installation (status ${res.status})`);
  }

  const body = (await res.json()) as { account?: { id: number; login: string; type: string } | null };
  if (!body.account) {
    throw new GithubAppError("Installation has no account");
  }
  return { id: String(body.account.id), login: body.account.login, type: body.account.type };
}

/** A yes/no GitHub endpoint (204 = yes, 404 = no). Anything else — most
 * often 403 because the App lacks the permission — is an error, never a
 * "no", so callers can't mistake an outage for a definitive answer. */
async function githubYesNo(installationAccessToken: string, path: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${installationAccessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "mergewise",
    },
    redirect: "manual",
  });

  if (res.status === 204) return true;
  if (res.status === 404) return false;
  if (res.status === 403) throw new GithubPermissionError(`GitHub ${path} answered 403`);
  throw new GithubAppError(`GitHub ${path} answered ${res.status}`);
}

/** Needs the App's Organization "Members: read" permission. */
export function isGithubOrganizationMember(
  installationAccessToken: string,
  org: string,
  username: string,
): Promise<boolean> {
  return githubYesNo(installationAccessToken, `/orgs/${encodeURIComponent(org)}/members/${encodeURIComponent(username)}`);
}

export function isGithubRepositoryCollaborator(
  installationAccessToken: string,
  owner: string,
  repo: string,
  username: string,
): Promise<boolean> {
  return githubYesNo(
    installationAccessToken,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}`,
  );
}

/** True only for an active owner ("admin") of the GitHub organization.
 * Needs the App's Organization "Members: read" permission. */
export async function isGithubOrganizationOwner(
  installationAccessToken: string,
  org: string,
  username: string,
): Promise<boolean> {
  const res = await fetch(
    `https://api.github.com/orgs/${encodeURIComponent(org)}/memberships/${encodeURIComponent(username)}`,
    {
      headers: {
        Authorization: `Bearer ${installationAccessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "mergewise",
      },
    },
  );

  if (res.status === 404) return false;
  if (res.status === 403) throw new GithubPermissionError("GitHub org membership lookup answered 403");
  if (!res.ok) {
    throw new GithubAppError(`GitHub org membership lookup answered ${res.status}`);
  }
  const body = (await res.json()) as { role?: string; state?: string };
  return body.role === "admin" && body.state === "active";
}

export interface GithubInstallationRepo {
  githubRepoId: string;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
}

interface GithubApiRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: { login: string };
}

/** Never trusts a client-supplied repo list — always asks GitHub which
 * repos this specific installation actually has access to. */
export async function fetchInstallationRepositories(
  installationAccessToken: string,
): Promise<GithubInstallationRepo[]> {
  const repos: GithubInstallationRepo[] = [];
  let page = 1;

  for (;;) {
    const res = await fetch(
      `https://api.github.com/installation/repositories?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${installationAccessToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "mergewise",
        },
      },
    );

    if (!res.ok) {
      throw new GithubAppError(`Failed to fetch installation repositories (status ${res.status})`);
    }

    const body = (await res.json()) as { repositories: GithubApiRepo[] };

    for (const repo of body.repositories) {
      repos.push({
        githubRepoId: String(repo.id),
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
      });
    }

    if (body.repositories.length < 100) break;
    page += 1;
  }

  return repos;
}
