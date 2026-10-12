import type { RiskAssessment, RiskLevel } from "@prisma/client";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { prisma } from "../prisma.js";
import type { RetrievedChunk } from "../retrieval/retrieval.repository.js";
import { retrieveRelevantContext } from "../retrieval/retrieval.service.js";
import {
  getOrCreateLatestRiskAssessment,
  PullRequestNotFoundError,
  RepositoryNotFoundError,
} from "../risk/risk-assessment.service.js";
import type { RiskSignal } from "../risk/risk-engine.js";
import { generateChatCompletion } from "./llm-client.js";
import { selectModel } from "./model-selector.js";
import { parseLlmResponse, type PrAnalysisOutput } from "./pr-analysis.types.js";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt-builder.js";

export type PrAnalysisResult =
  | { status: "skipped_low_risk"; score: number; level: RiskLevel }
  | {
      status: "analyzed";
      model: string;
      riskAssessmentId: string;
      score: number;
      level: RiskLevel;
      embeddingModel: string | null;
      analysis: PrAnalysisOutput;
    };

/** Explains the deterministic assessment with an LLM grounded in the org's
 * docs. Stores nothing — persistence is pr-intelligence.service's job. */
export async function analyzePullRequest(
  pullRequestId: string,
  existingAssessment?: RiskAssessment,
): Promise<PrAnalysisResult> {
  const pullRequest = await prisma.pullRequest.findUnique({ where: { id: pullRequestId } });
  if (!pullRequest) throw new PullRequestNotFoundError(`Pull request ${pullRequestId} not found`);

  const repository = await prisma.repository.findUnique({ where: { id: pullRequest.repositoryId } });
  if (!repository) throw new RepositoryNotFoundError(`Repository ${pullRequest.repositoryId} not found`);

  const assessment = existingAssessment ?? (await getOrCreateLatestRiskAssessment(pullRequestId));

  const model = selectModel(assessment.level);
  if (!model) return { status: "skipped_low_risk", score: assessment.score, level: assessment.level };

  const signals = assessment.rulesTriggered as unknown as RiskSignal[];

  const query = [pullRequest.title, ...signals.filter((s) => s.triggered).map((s) => s.explanation)].join("\n");
  let context: RetrievedChunk[] = [];
  let embeddingModel: string | null = null;
  try {
    context = await retrieveRelevantContext({ organizationId: repository.organizationId, query });
    embeddingModel = context.length > 0 ? env.EMBEDDING_MODEL : null;
  } catch (err) {
    logger.warn({ err }, "Retrieval unavailable; analyzing without engineering memory");
  }

  const raw = await generateChatCompletion({
    model,
    system: SYSTEM_PROMPT,
    user: buildUserPrompt({
      title: pullRequest.title,
      body: pullRequest.body,
      baseBranch: pullRequest.baseBranch,
      headBranch: pullRequest.headBranch,
      additions: pullRequest.additions,
      deletions: pullRequest.deletions,
      changedFilesCount: pullRequest.changedFilesCount,
      score: assessment.score,
      level: assessment.level,
      signals,
      context,
    }),
  });

  return {
    status: "analyzed",
    model,
    riskAssessmentId: assessment.id,
    score: assessment.score,
    level: assessment.level,
    embeddingModel,
    analysis: parseLlmResponse(raw),
  };
}
