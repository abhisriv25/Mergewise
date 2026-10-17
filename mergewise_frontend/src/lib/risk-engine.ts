/** The backend's deterministic risk engine, run in the browser. Same rules,
 * same points, same version: imported, not copied (see vite.config.ts). */
import { SENSITIVE_DIR_SEGMENTS, SENSITIVE_EXACT_FILENAMES, SENSITIVE_FILENAME_STEMS } from "@risk-engine/risk-rules.config";

export { calculateRiskScore, calculateRiskSignals } from "@risk-engine/risk-engine";
export type { RiskInput, RiskSignal as EngineSignal } from "@risk-engine/risk-engine";
export {
  DEPENDENCY_CHANGE_POINTS,
  DIFF_SIZE_BUCKETS,
  FILE_COUNT_BUCKETS,
  MAX_SCORE,
  MIGRATION_CHANGE_POINTS,
  NO_TEST_FILES_POINTS,
  RISK_ENGINE_VERSION,
  SENSITIVE_PATH_POINTS,
} from "@risk-engine/risk-rules.config";

function listOf(items: string[], conjunction = "or"): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}`;
}

/** The sensitive-path rule in words, built from the engine's own lists so
 * every place that describes it says the same thing. */
export const SENSITIVE_PATHS_SUMMARY = `${listOf([...SENSITIVE_DIR_SEGMENTS].map((s) => `${s}/`))} folders, files named ${listOf(
  [...SENSITIVE_FILENAME_STEMS].map((s) => `${s}.*`),
)}, and ${listOf([...SENSITIVE_EXACT_FILENAMES])}`;
