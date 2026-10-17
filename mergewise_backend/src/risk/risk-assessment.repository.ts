import { Prisma, type RiskLevel } from "@prisma/client";
import { prisma } from "../prisma.js";
import type { RiskSignal } from "./risk-engine.js";

/** Every run is a new row, never an overwrite — a PR's score history is
 * never lost, and re-scoring the same PR is a legitimate, expected event
 * (a new commit, a re-run after the engine changed), not a correction.
 * The PR's own latestRisk* columns are updated in the same transaction, so
 * the list's risk filter and sort never disagree with the newest row. */
export async function createRiskAssessment(
  pullRequestId: string,
  score: number,
  level: RiskLevel,
  rulesTriggered: RiskSignal[],
  engineVersion: string,
) {
  const [assessment] = await prisma.$transaction([
    prisma.riskAssessment.create({
      data: {
        pullRequestId,
        score,
        level,
        rulesTriggered: rulesTriggered as unknown as Prisma.InputJsonValue,
        engineVersion,
      },
    }),
    prisma.pullRequest.update({
      where: { id: pullRequestId },
      data: { latestRiskScore: score, latestRiskLevel: level },
    }),
  ]);
  return assessment;
}
