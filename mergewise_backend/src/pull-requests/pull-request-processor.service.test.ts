import type { WebhookEvent } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  webhookEvent: { update: vi.fn(), findMany: vi.fn() },
  organization: { findFirst: vi.fn() },
  repository: { updateMany: vi.fn() },
};
vi.mock("../prisma.js", () => ({ prisma: prismaMock }));

class GithubAppError extends Error {}
const githubAppAuthMock = { fetchInstallationAccessToken: vi.fn(), GithubAppError };
vi.mock("../github/github-app-auth.service.js", () => githubAppAuthMock);

class GithubApiNotFoundError extends Error {}
const fetchPullRequestMock = vi.fn();
vi.mock("../github/pull-request.service.js", () => ({
  fetchPullRequest: fetchPullRequestMock,
  GithubApiNotFoundError,
}));

const findRepositoryByGithubIdsMock = vi.fn();
const syncInstallationRepositoriesMock = vi.fn();
vi.mock("../github/repository.service.js", () => ({
  findRepositoryByGithubIds: findRepositoryByGithubIdsMock,
  syncInstallationRepositories: syncInstallationRepositoriesMock,
}));

const indexRepositoryDocsMock = vi.fn();
const indexRepositoryDocsInBackgroundMock = vi.fn();
vi.mock("../knowledge/docs-indexer.js", () => ({
  indexRepositoryDocs: indexRepositoryDocsMock,
  indexRepositoryDocsInBackground: indexRepositoryDocsInBackgroundMock,
}));

const upsertPullRequestMock = vi.fn();
vi.mock("./pull-request.repository.js", () => ({ upsertPullRequest: upsertPullRequestMock }));

const getOrCreateLatestRiskAssessmentMock = vi.fn();
vi.mock("../risk/risk-assessment.service.js", () => ({
  getOrCreateLatestRiskAssessment: getOrCreateLatestRiskAssessmentMock,
}));

const { processWebhookEvent, processPendingWebhookEvents } = await import(
  "./pull-request-processor.service.js"
);

const REPO = { id: "repo-1", owner: "octocat", name: "hello-world" };
const FETCHED_PR = { githubPrId: "999", number: 7 };

function makeEvent(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    id: "event-1",
    deliveryId: "delivery-1",
    eventType: "pull_request",
    action: "opened",
    githubRepoId: "555",
    githubInstallationId: "777",
    payload: { action: "opened", number: 7 },
    status: "RECEIVED",
    receivedAt: new Date(),
    processedAt: null,
    ...overrides,
  } as WebhookEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  findRepositoryByGithubIdsMock.mockResolvedValue(REPO);
  githubAppAuthMock.fetchInstallationAccessToken.mockResolvedValue("installation-token");
  fetchPullRequestMock.mockResolvedValue(FETCHED_PR);
  prismaMock.webhookEvent.update.mockResolvedValue({});
  upsertPullRequestMock.mockResolvedValue({ id: "pr-1" });
  getOrCreateLatestRiskAssessmentMock.mockResolvedValue({ id: "risk-1" });
});

describe("processWebhookEvent risk scoring", () => {
  it("scores the pull request right after saving it", async () => {
    await processWebhookEvent(makeEvent());

    expect(getOrCreateLatestRiskAssessmentMock).toHaveBeenCalledWith("pr-1");
  });

  it("still marks the event PROCESSED when scoring fails", async () => {
    getOrCreateLatestRiskAssessmentMock.mockRejectedValueOnce(new Error("GitHub 502"));

    await expect(processWebhookEvent(makeEvent())).resolves.toBeUndefined();

    expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PROCESSED" }) }),
    );
    expect(prismaMock.webhookEvent.update).toHaveBeenCalledTimes(1);
  });

  it("doesn't score when the pull request couldn't be fetched", async () => {
    fetchPullRequestMock.mockRejectedValueOnce(new GithubApiNotFoundError("gone"));

    await processWebhookEvent(makeEvent());

    expect(getOrCreateLatestRiskAssessmentMock).not.toHaveBeenCalled();
  });
});

describe("processWebhookEvent", () => {
  it.each(["opened", "reopened", "synchronize", "closed", "edited", "ready_for_review", "converted_to_draft"])(
    "fetches current state and marks the event PROCESSED for a %s action",
    async (action) => {
      await processWebhookEvent(makeEvent({ action, payload: { action, number: 7 } }));

      expect(fetchPullRequestMock).toHaveBeenCalledWith("installation-token", "octocat", "hello-world", 7);
      expect(upsertPullRequestMock).toHaveBeenCalledWith("repo-1", FETCHED_PR);
      expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "event-1" }, data: expect.objectContaining({ status: "PROCESSED" }) }),
      );
    },
  );

  it("reads the PR number from the top-level `number` field", async () => {
    await processWebhookEvent(makeEvent({ payload: { number: 42 } }));

    expect(fetchPullRequestMock).toHaveBeenCalledWith("installation-token", "octocat", "hello-world", 42);
  });

  it("reads the PR number from a nested `pull_request.number` field", async () => {
    await processWebhookEvent(makeEvent({ payload: { pull_request: { number: 43 } } }));

    expect(fetchPullRequestMock).toHaveBeenCalledWith("installation-token", "octocat", "hello-world", 43);
  });

  it("marks the event FAILED when githubRepoId is missing", async () => {
    await processWebhookEvent(makeEvent({ githubRepoId: null }));

    expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
    expect(findRepositoryByGithubIdsMock).not.toHaveBeenCalled();
  });

  it("marks the event FAILED when githubInstallationId is missing", async () => {
    await processWebhookEvent(makeEvent({ githubInstallationId: null }));

    expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });

  it("marks the event FAILED when no PR number can be extracted", async () => {
    await processWebhookEvent(makeEvent({ payload: { action: "opened" } }));

    expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });

  it("marks an event for an unmatched repo/installation as IGNORED without calling GitHub", async () => {
    findRepositoryByGithubIdsMock.mockResolvedValueOnce(null);

    await processWebhookEvent(makeEvent());

    expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "IGNORED" }) }),
    );
    expect(githubAppAuthMock.fetchInstallationAccessToken).not.toHaveBeenCalled();
    expect(fetchPullRequestMock).not.toHaveBeenCalled();
  });

  it("marks the event FAILED on a GitHub 404 (permanent)", async () => {
    fetchPullRequestMock.mockRejectedValueOnce(new GithubApiNotFoundError("not found"));

    await processWebhookEvent(makeEvent());

    expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });

  it("leaves the event untouched at RECEIVED on any other GitHub failure (retryable)", async () => {
    fetchPullRequestMock.mockRejectedValueOnce(new Error("connection reset"));

    await processWebhookEvent(makeEvent());

    expect(prismaMock.webhookEvent.update).not.toHaveBeenCalled();
  });
});

describe("processPendingWebhookEvents", () => {
  it("processes every RECEIVED event in a batch and reports how many it handled", async () => {
    prismaMock.webhookEvent.findMany.mockResolvedValueOnce([makeEvent({ id: "e1" }), makeEvent({ id: "e2" })]);

    const result = await processPendingWebhookEvents();

    expect(result).toEqual({ processed: 2 });
    expect(upsertPullRequestMock).toHaveBeenCalledTimes(2);
  });
});

describe("processWebhookEvent for a docs push", () => {
  const pushEvent = () => makeEvent({ eventType: "push", action: null, payload: { ref: "refs/heads/main" } });

  it("re-indexes the repository's docs and marks the event PROCESSED", async () => {
    await processWebhookEvent(pushEvent());

    expect(indexRepositoryDocsMock).toHaveBeenCalledWith("repo-1");
    expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PROCESSED" }) }),
    );
    expect(fetchPullRequestMock).not.toHaveBeenCalled();
  });

  it("ignores a push for a disconnected or unknown repository", async () => {
    findRepositoryByGithubIdsMock.mockResolvedValueOnce(null);

    await processWebhookEvent(pushEvent());

    expect(indexRepositoryDocsMock).not.toHaveBeenCalled();
    expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "IGNORED" }) }),
    );
  });

  it("leaves the event at RECEIVED to retry when GitHub fails", async () => {
    indexRepositoryDocsMock.mockRejectedValueOnce(new Error("GitHub 502"));

    await processWebhookEvent(pushEvent());

    expect(prismaMock.webhookEvent.update).not.toHaveBeenCalled();
  });
});

describe("processWebhookEvent for installation changes", () => {
  it("re-syncs the installation's repos, reconnects the added ones and indexes the new ones", async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce({ id: "org-1" });
    syncInstallationRepositoriesMock.mockResolvedValueOnce({ newlyConnectedIds: ["repo-9"], disconnectedIds: [] });

    await processWebhookEvent(
      makeEvent({
        eventType: "installation_repositories",
        action: "added",
        githubRepoId: null,
        payload: { action: "added", repositories_added: [{ id: 321 }] },
      }),
    );

    expect(prismaMock.organization.findFirst).toHaveBeenCalledWith({ where: { githubInstallationId: "777" } });
    expect(syncInstallationRepositoriesMock).toHaveBeenCalledWith("org-1", "777", { reconnectGithubRepoIds: ["321"] });
    expect(indexRepositoryDocsInBackgroundMock).toHaveBeenCalledWith(["repo-9"]);
    expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PROCESSED" }) }),
    );
  });

  it("ignores an installation no organization is linked to", async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce(null);

    await processWebhookEvent(makeEvent({ eventType: "installation_repositories", action: "removed", payload: {} }));

    expect(syncInstallationRepositoriesMock).not.toHaveBeenCalled();
    expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "IGNORED" }) }),
    );
  });

  it("disconnects every repo of an uninstalled App", async () => {
    await processWebhookEvent(makeEvent({ eventType: "installation", action: "deleted", payload: {} }));

    expect(prismaMock.repository.updateMany).toHaveBeenCalledWith({
      where: { githubInstallationId: "777", disconnectedAt: null },
      data: { disconnectedAt: expect.any(Date) },
    });
  });
});
