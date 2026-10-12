import { Prisma, type PRAnalysis } from "@prisma/client";
import { prisma } from "../prisma.js";
import { RETRIEVAL_VERSION } from "../retrieval/retrieval.service.js";
import { getOrCreateLatestRiskAssessment } from "../risk/risk-assessment.service.js";
import { RISK_ENGINE_VERSION } from "../risk/risk-rules.config.js";
import { analyzePullRequest } from "./pr-analysis.service.js";
import { PROMPT_VERSION } from "./prompt-builder.js";

export type PrIntelligenceResult =
  | { status: "skipped_low_risk"; score: number; level: string }
  | { status: "analyzed"; analysis: PRAnalysis };

/** Generations in progress, keyed by risk assessment, so concurrent views of
 * the same PR share one LLM call instead of each paying for their own. */
const inFlight = new Map<string, Promise<PrIntelligenceResult>>();

/** Reuse the stored analysis for the current risk assessment; otherwise
 * analyze and persist it, stamped with every version that shaped it.
 * A LOW-risk skip is never persisted. */
export async function getOrCreatePrIntelligence(pullRequestId: string): Promise<PrIntelligenceResult> {
  const assessment = await getOrCreateLatestRiskAssessment(pullRequestId);

  const existing = await findStoredAnalysis(pullRequestId, assessment.id);
  if (existing) return { status: "analyzed", analysis: existing };

  const pending = inFlight.get(assessment.id);
  if (pending) return pending;

  const generation = generateAndStore(pullRequestId, assessment).finally(() => inFlight.delete(assessment.id));
  inFlight.set(assessment.id, generation);
  return generation;
}

function findStoredAnalysis(pullRequestId: string, riskAssessmentId: string) {
  return prisma.pRAnalysis.findUnique({
    where: { pullRequestId_riskAssessmentId: { pullRequestId, riskAssessmentId } },
  });
}

async function generateAndStore(
  pullRequestId: string,
  assessment: Awaited<ReturnType<typeof getOrCreateLatestRiskAssessment>>,
): Promise<PrIntelligenceResult> {
  const result = await analyzePullRequest(pullRequestId, assessment);
  if (result.status === "skipped_low_risk") return result;

  try {
    const analysis = await prisma.pRAnalysis.create({
      data: {
        pullRequestId,
        riskAssessmentId: result.riskAssessmentId,
        deterministicScore: result.score,
        riskLevel: result.level,
        summary: result.analysis.summary,
        findings: result.analysis.riskExplanation as unknown as Prisma.InputJsonValue,
        recommendations: result.analysis.recommendations as unknown as Prisma.InputJsonValue,
        confidence: result.analysis.confidence,
        riskEngineVersion: RISK_ENGINE_VERSION,
        promptVersion: PROMPT_VERSION,
        embeddingModel: result.embeddingModel,
        retrievalVersion: RETRIEVAL_VERSION,
        llmModel: result.model,
      },
    });
    return { status: "analyzed", analysis };
  } catch (err) {
    // Another API process stored one first (the unique index on
    // pullRequestId + riskAssessmentId); serve that one, one row per assessment.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await findStoredAnalysis(pullRequestId, result.riskAssessmentId);
      if (winner) return { status: "analyzed", analysis: winner };
    }
    throw err;
  }
}
