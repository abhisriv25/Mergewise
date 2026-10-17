import type { RiskSignal } from "./api";
import { calculateRiskScore, calculateRiskSignals } from "./risk-engine";

/** The one example pull request the landing page shows (hero, score
 * section, AI preview). Its score and every point are computed by the real
 * engine from these inputs, so the page's numbers can't disagree with each
 * other or with the rules. It matches the playground's "Auth rewrite"
 * preset: 420 changed lines across 7 files, none of them tests. */
export const EXAMPLE_PR = {
  number: 482,
  repo: "acme/api",
  author: "priyaverma",
  title: "Rework session refresh to avoid token race",
  additions: 336,
  deletions: 84,
  changedFiles: [
    "src/auth/session.ts",
    "src/auth/refresh.ts",
    "src/auth/token-store.ts",
    "db/migrations/0042_tokens.sql",
    "src/api/routes/session.ts",
    "src/api/middleware.ts",
    "src/lib/clock.ts",
  ],
};

const signals = calculateRiskSignals({
  additions: EXAMPLE_PR.additions,
  deletions: EXAMPLE_PR.deletions,
  changedFilesCount: EXAMPLE_PR.changedFiles.length,
  changedFiles: EXAMPLE_PR.changedFiles,
});

export const EXAMPLE_SIGNALS: RiskSignal[] = signals.filter((s) => s.triggered);
export const EXAMPLE_RISK = calculateRiskScore(signals);

const fileCount = EXAMPLE_PR.changedFiles.length;
const testCount = 0;

function firstAndMore(paths: string[]): string {
  return paths.length > 1 ? `${paths[0]} +${paths.length - 1} more` : paths[0] ?? "";
}

/** What each triggered signal shows as its one-line detail. */
export function exampleDetail(code: string): string {
  const signal = EXAMPLE_SIGNALS.find((s) => s.code === code);
  switch (code) {
    case "NO_TEST_FILES":
      return `${testCount} of ${fileCount} files are tests`;
    case "DIFF_SIZE":
      return `+${EXAMPLE_PR.additions} −${EXAMPLE_PR.deletions} lines`;
    case "FILE_COUNT":
      return `${fileCount} files changed`;
    default:
      return firstAndMore(signal?.evidence ?? []);
  }
}
