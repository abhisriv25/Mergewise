-- Keep the earliest analysis per (pull request, risk assessment) before the
-- unique index goes on; duplicates could exist from concurrent first views.
DELETE FROM "PRAnalysis" a
USING "PRAnalysis" b
WHERE a."pullRequestId" = b."pullRequestId"
  AND a."riskAssessmentId" = b."riskAssessmentId"
  AND (a."createdAt", a."id") > (b."createdAt", b."id");

-- CreateIndex
CREATE UNIQUE INDEX "PRAnalysis_pullRequestId_riskAssessmentId_key" ON "PRAnalysis"("pullRequestId", "riskAssessmentId");
