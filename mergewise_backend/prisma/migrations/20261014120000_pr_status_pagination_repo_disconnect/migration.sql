-- Draft pull requests, and the latest risk score copied onto the PR so the
-- list can be filtered, sorted and paginated by risk in SQL.
ALTER TABLE "PullRequest" ADD COLUMN "draft" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PullRequest" ADD COLUMN "latestRiskScore" INTEGER;
ALTER TABLE "PullRequest" ADD COLUMN "latestRiskLevel" "RiskLevel";

UPDATE "PullRequest" AS pr
SET "latestRiskScore" = latest.score, "latestRiskLevel" = latest.level
FROM (
  SELECT DISTINCT ON ("pullRequestId") "pullRequestId", score, level
  FROM "RiskAssessment"
  ORDER BY "pullRequestId", "createdAt" DESC
) AS latest
WHERE latest."pullRequestId" = pr.id;

-- Disconnecting a repository, and when its docs were last indexed.
ALTER TABLE "Repository" ADD COLUMN "disconnectedAt" TIMESTAMP(3);
ALTER TABLE "Repository" ADD COLUMN "docsIndexedAt" TIMESTAMP(3);
