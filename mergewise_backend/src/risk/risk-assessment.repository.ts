import { Prisma, type RiskLevel } from "@prisma/client";
import { prisma } from "../prisma.js";
import type { RiskSignal } from "./risk-engine.js";

/** Every run is a new row, never an overwrite — a PR's score history is
 * never lost, and re-scoring the same PR is a legitimate, expected event
 * (a new commit, a re-run after the engine changed), not a correction. */
export async function createRiskAssessment(
  pullRequestId: string,
  score: number,
  level: RiskLevel,
  rulesTriggered: RiskSignal[],
  engineVersion: string,
) {
  return prisma.riskAssessment.create({
    data: {
      pullRequestId,
      score,
      level,
      rulesTriggered: rulesTriggered as unknown as Prisma.InputJsonValue,
      engineVersion,
    },
  });
}
