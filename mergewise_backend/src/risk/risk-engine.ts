import {
  DEPENDENCY_CHANGE_POINTS,
  DEPENDENCY_MANIFEST_FILENAMES,
  DIFF_SIZE_BUCKETS,
  FILE_COUNT_BUCKETS,
  LEVEL_BUCKETS,
  MAX_SCORE,
  MIGRATION_CHANGE_POINTS,
  MIGRATION_DIR_SEGMENTS,
  NO_TEST_FILES_POINTS,
  SENSITIVE_DIR_SEGMENTS,
  SENSITIVE_EXACT_FILENAMES,
  SENSITIVE_FILENAME_STEMS,
  SENSITIVE_PATH_POINTS,
  TEST_DIR_SEGMENTS,
  TEST_FILENAME_PATTERN,
  type RiskLevel,
} from "./risk-rules.config.js";

export type RiskRuleCode =
  | "DIFF_SIZE"
  | "FILE_COUNT"
  | "SENSITIVE_PATH"
  | "DEPENDENCY_CHANGE"
  | "MIGRATION_CHANGE"
  | "NO_TEST_FILES";

export interface RiskSignal {
  code: RiskRuleCode;
  triggered: boolean;
  points: number;
  explanation: string;
  evidence: string[];
}

export interface RiskInput {
  additions: number;
  deletions: number;
  changedFilesCount: number;
  changedFiles: string[];
}

function bucketPoints(value: number, buckets: { maxInclusive: number; points: number }[]): number {
  for (const bucket of buckets) {
    if (value <= bucket.maxInclusive) return bucket.points;
  }
  return buckets[buckets.length - 1].points;
}

function segments(filePath: string): string[] {
  return filePath.split("/");
}

function basename(filePath: string): string {
  const parts = segments(filePath);
  return parts[parts.length - 1] ?? filePath;
}

function filenameStem(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex > 0 ? name.slice(0, dotIndex) : name;
}

function isSensitivePath(filePath: string): boolean {
  if (segments(filePath).some((segment) => SENSITIVE_DIR_SEGMENTS.has(segment))) {
    return true;
  }
  const name = basename(filePath);
  if (SENSITIVE_EXACT_FILENAMES.has(name)) return true;
  return SENSITIVE_FILENAME_STEMS.has(filenameStem(name));
}

function isDependencyManifest(filePath: string): boolean {
  return DEPENDENCY_MANIFEST_FILENAMES.has(basename(filePath));
}

function isMigrationPath(filePath: string): boolean {
  return segments(filePath).some((segment) => MIGRATION_DIR_SEGMENTS.has(segment));
}

function isTestFile(filePath: string): boolean {
  if (segments(filePath).some((segment) => TEST_DIR_SEGMENTS.has(segment))) return true;
  return TEST_FILENAME_PATTERN.test(basename(filePath));
}

function diffSizeSignal(input: RiskInput): RiskSignal {
  const totalLines = input.additions + input.deletions;
  const points = bucketPoints(totalLines, DIFF_SIZE_BUCKETS);
  return {
    code: "DIFF_SIZE",
    triggered: points > 0,
    points,
    explanation: `${totalLines} line${totalLines === 1 ? "" : "s"} changed (+${input.additions}/-${input.deletions})`,
    evidence: [],
  };
}

function fileCountSignal(input: RiskInput): RiskSignal {
  const points = bucketPoints(input.changedFilesCount, FILE_COUNT_BUCKETS);
  return {
    code: "FILE_COUNT",
    triggered: points > 0,
    points,
    explanation: `${input.changedFilesCount} file${input.changedFilesCount === 1 ? "" : "s"} changed`,
    evidence: [],
  };
}

function sensitivePathSignal(input: RiskInput): RiskSignal {
  const evidence = input.changedFiles.filter(isSensitivePath);
  return {
    code: "SENSITIVE_PATH",
    triggered: evidence.length > 0,
    points: evidence.length > 0 ? SENSITIVE_PATH_POINTS : 0,
    explanation:
      evidence.length > 0
        ? "Touches a sensitive path (auth, security, secrets, or config)"
        : "No sensitive paths touched",
    evidence,
  };
}

function dependencyChangeSignal(input: RiskInput): RiskSignal {
  const evidence = input.changedFiles.filter(isDependencyManifest);
  return {
    code: "DEPENDENCY_CHANGE",
    triggered: evidence.length > 0,
    points: evidence.length > 0 ? DEPENDENCY_CHANGE_POINTS : 0,
    explanation:
      evidence.length > 0 ? "Modifies a dependency manifest/lockfile" : "No dependency manifests touched",
    evidence,
  };
}

function migrationChangeSignal(input: RiskInput): RiskSignal {
  const evidence = input.changedFiles.filter(isMigrationPath);
  return {
    code: "MIGRATION_CHANGE",
    triggered: evidence.length > 0,
    points: evidence.length > 0 ? MIGRATION_CHANGE_POINTS : 0,
    explanation: evidence.length > 0 ? "Modifies a database migration" : "No migrations touched",
    evidence,
  };
}

/** Claims only "no test file was changed in this diff" — never the
 * stronger (and often false) claim "this change is untested". Never
 * triggers on an empty diff: there's nothing to penalize. */
function noTestFilesSignal(input: RiskInput): RiskSignal {
  const hasChanges = input.changedFiles.length > 0;
  const hasTestFile = input.changedFiles.some(isTestFile);
  const triggered = hasChanges && !hasTestFile;
  return {
    code: "NO_TEST_FILES",
    triggered,
    points: triggered ? NO_TEST_FILES_POINTS : 0,
    explanation: triggered
      ? "No test file changed in this diff"
      : "At least one test file changed in this diff",
    evidence: [],
  };
}

export function calculateRiskSignals(input: RiskInput): RiskSignal[] {
  return [
    diffSizeSignal(input),
    fileCountSignal(input),
    sensitivePathSignal(input),
    dependencyChangeSignal(input),
    migrationChangeSignal(input),
    noTestFilesSignal(input),
  ];
}

function scoreToLevel(score: number): RiskLevel {
  for (const bucket of LEVEL_BUCKETS) {
    if (score <= bucket.maxInclusive) return bucket.level;
  }
  return LEVEL_BUCKETS[LEVEL_BUCKETS.length - 1].level;
}

export function calculateRiskScore(signals: RiskSignal[]): { score: number; level: RiskLevel } {
  const rawScore = signals.filter((signal) => signal.triggered).reduce((sum, signal) => sum + signal.points, 0);
  const score = Math.min(rawScore, MAX_SCORE);
  return { score, level: scoreToLevel(score) };
}
