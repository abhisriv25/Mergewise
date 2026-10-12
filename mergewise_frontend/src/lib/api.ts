export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: "ADMIN" | "MEMBER";
}

export interface CurrentUser {
  id: string;
  githubLogin: string;
  displayName: string | null;
  avatarUrl: string | null;
  organizations: Organization[];
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include", // send/receive the devpulse.sid session cookie
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.error?.message ?? `Request failed: ${res.status}`);
  }

  // 204 No Content has no body to parse
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return apiFetch<CurrentUser>("/me");
}

/** Creates an organization with the caller as its ADMIN. Only for users who
 * don't belong to one yet — the API answers 409 otherwise. */
export function createOrganization(name: string): Promise<Organization> {
  return apiFetch<Organization>("/organizations", { method: "POST", body: JSON.stringify({ name }) });
}

export interface OrganizationDetails extends Organization {
  /** The GitHub account the organization is tied to — invitees must belong to it. */
  github: { login: string; type: "Organization" | "User" | string } | null;
  /** Whether invitations go out by email, or the admin shares the link. */
  emailEnabled: boolean;
}

export function fetchCurrentOrganization(): Promise<OrganizationDetails> {
  return apiFetch<OrganizationDetails>("/organizations/current");
}

export type GithubMembershipStatus = "member" | "not_member" | "unknown";

export interface Member {
  id: string;
  role: "ADMIN" | "MEMBER";
  joinedAt: string;
  user: {
    id: string;
    githubLogin: string;
    displayName: string | null;
    avatarUrl: string | null;
    lastActiveAt: string | null;
  };
  invitedEmail: string | null;
  invitedBy: string | null;
  githubStatus: GithubMembershipStatus;
}

export function fetchMembers(): Promise<{ members: Member[] }> {
  return apiFetch<{ members: Member[] }>("/organizations/current/members");
}

export function changeMemberRole(membershipId: string, role: Member["role"]): Promise<{ id: string; role: Member["role"] }> {
  return apiFetch(`/organizations/current/members/${membershipId}`, { method: "PATCH", body: JSON.stringify({ role }) });
}

export function removeMember(membershipId: string): Promise<void> {
  return apiFetch<void>(`/organizations/current/members/${membershipId}`, { method: "DELETE" });
}

export type InvitationStatus = "pending" | "expired" | "accepted" | "revoked";

export interface PendingInvitation {
  id: string;
  email: string;
  invitedBy: string | null;
  createdAt: string;
  expiresAt: string;
  status: InvitationStatus;
}

/** A just-issued invitation. `url` is only ever available here — the server
 * keeps a hash, not the link — so the UI must show it now or never. */
export interface IssuedInvitation {
  id: string;
  email: string;
  expiresAt: string;
  url: string;
  emailSent: boolean;
}

export function fetchInvitations(): Promise<{ invitations: PendingInvitation[] }> {
  return apiFetch<{ invitations: PendingInvitation[] }>("/organizations/current/invitations");
}

export function createInvitations(emails: string[]): Promise<{ invitations: IssuedInvitation[] }> {
  return apiFetch("/organizations/current/invitations", { method: "POST", body: JSON.stringify({ emails }) });
}

export function resendInvitation(invitationId: string): Promise<{ invitation: IssuedInvitation }> {
  return apiFetch(`/organizations/current/invitations/${invitationId}/resend`, { method: "POST" });
}

export function revokeInvitation(invitationId: string): Promise<void> {
  return apiFetch<void>(`/organizations/current/invitations/${invitationId}`, { method: "DELETE" });
}

export interface InvitationPreview {
  organizationName: string;
  githubAccountLogin: string | null;
  githubAccountType: string | null;
  invitedBy: string | null;
  email: string;
  expiresAt: string;
  status: InvitationStatus;
}

export function fetchInvitationPreview(token: string): Promise<InvitationPreview> {
  return apiFetch<InvitationPreview>(`/invitations/${encodeURIComponent(token)}`);
}

/** Sign in with GitHub from an invite link — the API accepts the
 * invitation as soon as GitHub confirms who this is. */
export function githubLoginUrlForInvite(token: string): string {
  return `${API_BASE_URL}/auth/github/login?invite=${encodeURIComponent(token)}`;
}

export function logout(): Promise<void> {
  return apiFetch<void>("/auth/logout", { method: "POST" });
}

export function githubLoginUrl(): string {
  return `${API_BASE_URL}/auth/github/login`;
}

export interface Repository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  connectedAt: string;
}

export function fetchRepositories(): Promise<{ repositories: Repository[] }> {
  return apiFetch<{ repositories: Repository[] }>("/repositories");
}

/** Not a fetch — a plain link the browser navigates to directly, same as
 * githubLoginUrl(). The backend redirects on to GitHub's App install page
 * after stashing CSRF state in the session. */
export function githubInstallUrl(): string {
  return `${API_BASE_URL}/github/install-url`;
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PullRequestRepositorySummary {
  id: string;
  owner: string;
  name: string;
  fullName: string;
}

export interface LatestRiskSummary {
  score: number;
  level: RiskLevel;
  createdAt: string;
}

export interface PullRequestListItem {
  id: string;
  number: number;
  title: string;
  author: string;
  state: string;
  url: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  additions: number;
  deletions: number;
  changedFilesCount: number;
  repository: PullRequestRepositorySummary;
  latestRisk: LatestRiskSummary | null;
}

export interface PullRequestDetail {
  id: string;
  number: number;
  title: string;
  body: string | null;
  state: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  baseSha: string;
  headSha: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  additions: number;
  deletions: number;
  changedFilesCount: number;
  repository: PullRequestRepositorySummary;
}

export interface RiskSignal {
  code: string;
  triggered: boolean;
  points: number;
  explanation: string;
  evidence: string[];
}

export interface RiskAssessment {
  id: string;
  pullRequestId: string;
  score: number;
  level: RiskLevel;
  rulesTriggered: RiskSignal[];
  engineVersion: string;
  createdAt: string;
}

export function fetchPullRequests(filters: { repositoryId?: string } = {}): Promise<{
  pullRequests: PullRequestListItem[];
}> {
  const params = new URLSearchParams();
  if (filters.repositoryId) params.set("repositoryId", filters.repositoryId);
  const query = params.toString();
  return apiFetch<{ pullRequests: PullRequestListItem[] }>(`/pull-requests${query ? `?${query}` : ""}`);
}

export function fetchPullRequest(id: string): Promise<PullRequestDetail> {
  return apiFetch<PullRequestDetail>(`/pull-requests/${id}`);
}

/** Slower than the other GETs on this page — an uncached assessment means
 * the API is calling out to GitHub before responding. Callers should show
 * a loading state, not assume this is instant. */
export function fetchPullRequestRisk(id: string): Promise<RiskAssessment> {
  return apiFetch<RiskAssessment>(`/pull-requests/${id}/risk`);
}

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RiskExplanationItem {
  title: string;
  severity: RiskLevel;
  reason: string;
  evidence: string[];
}

export interface RecommendationItem {
  action: string;
  reason: string;
  source: string | null;
}

export interface PrIntelligence {
  id: string;
  pullRequestId: string;
  riskAssessmentId: string;
  deterministicScore: number;
  riskLevel: RiskLevel;
  summary: string;
  findings: RiskExplanationItem[];
  recommendations: RecommendationItem[];
  confidence: ConfidenceLevel;
  riskEngineVersion: string;
  promptVersion: string;
  embeddingModel: string | null;
  retrievalVersion: string;
  llmModel: string;
  createdAt: string;
}

export type PrIntelligenceResponse =
  | { status: "analyzed"; intelligence: PrIntelligence }
  | { status: "skipped_low_risk"; score: number; level: RiskLevel };

/** Slice 10's unified endpoint — deterministic score plus grounded AI
 * summary/findings/recommendations in one response. Same "first view can
 * be slow" caveat as fetchPullRequestRisk: an uncached analysis means a
 * real LLM call happens server-side before this resolves. A LOW-risk PR
 * returns `{ status: "skipped_low_risk" }` by design — see the risk
 * engine's own cost-control reasoning — not an error. */
export function fetchPullRequestIntelligence(id: string): Promise<PrIntelligenceResponse> {
  return apiFetch<PrIntelligenceResponse>(`/pull-requests/${id}/intelligence`);
}
