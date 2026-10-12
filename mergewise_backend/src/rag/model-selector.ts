import type { RiskLevel } from "@prisma/client";
import { env } from "../env.js";

/** LOW-risk PRs never cost an LLM call (returns null). */
export function selectModel(level: RiskLevel): string | null {
  switch (level) {
    case "LOW":
      return null;
    case "MEDIUM":
      return env.LLM_MODEL_SMALL;
    case "HIGH":
    case "CRITICAL":
      return env.LLM_MODEL_STRONG;
  }
}
