// Every bucket, point value, path list, and severity cutoff the risk
// engine uses lives here, each documented as a product decision rather
// than a derived fact. Tuning the engine later means editing constants in
// this one file, not hunting through rule logic.

/** The scoring logic (thresholds, rules) will change over time — every
 * RiskAssessment row is stamped with the version that produced it, so a
 * score changing between runs is traceable to "the engine changed," not a
 * mystery. */
export const RISK_ENGINE_VERSION = "v1";

export const MAX_SCORE = 100;

interface Bucket {
  maxInclusive: number;
  points: number;
}

/** additions + deletions, bucketed. */
export const DIFF_SIZE_BUCKETS: Bucket[] = [
  { maxInclusive: 49, points: 0 },
  { maxInclusive: 199, points: 5 },
  { maxInclusive: 499, points: 10 },
  { maxInclusive: 999, points: 20 },
  { maxInclusive: Infinity, points: 30 },
];

/** Count of files touched, bucketed. */
export const FILE_COUNT_BUCKETS: Bucket[] = [
  { maxInclusive: 5, points: 0 },
  { maxInclusive: 15, points: 5 },
  { maxInclusive: 30, points: 10 },
  { maxInclusive: 60, points: 20 },
  { maxInclusive: Infinity, points: 30 },
];

export const SENSITIVE_PATH_POINTS = 20;
export const DEPENDENCY_CHANGE_POINTS = 10;
export const MIGRATION_CHANGE_POINTS = 15;
export const NO_TEST_FILES_POINTS = 15;

/** Exact path *segments* (a full directory or file name between slashes) —
 * never a substring match. "src/auth/login.ts" triggers on the "auth"
 * segment; "src/authors.ts" does not, since "authors.ts" is a filename,
 * not the segment "auth". */
export const SENSITIVE_DIR_SEGMENTS = new Set([
  "auth",
  "security",
  "payments",
  "billing",
  "secrets",
  "credentials",
  "iam",
]);

/** Exact filename stem (basename with its final extension stripped) — so
 * "config.yml" triggers (stem "config") but "webpack.config.js" does not
 * (stem "webpack.config", not "config"). */
export const SENSITIVE_FILENAME_STEMS = new Set(["config", "secrets", "credentials"]);

/** Exact full filenames with no extension-stripping (dotfiles). */
export const SENSITIVE_EXACT_FILENAMES = new Set([".env", ".env.local", ".env.production", ".npmrc"]);

export const MIGRATION_DIR_SEGMENTS = new Set(["migrations", "migrate"]);

/** Exact filenames only — a file that merely mentions "dependency" in its
 * name doesn't count; these are the actual manifest/lockfiles across the
 * ecosystems this engine knows about. */
export const DEPENDENCY_MANIFEST_FILENAMES = new Set([
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Gemfile",
  "Gemfile.lock",
  "requirements.txt",
  "poetry.lock",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "Cargo.lock",
  "pom.xml",
  "build.gradle",
]);

export const TEST_DIR_SEGMENTS = new Set(["__tests__", "test", "tests"]);
export const TEST_FILENAME_PATTERN = /\.(test|spec)\.[^.]+$/;

/** Same values as the Prisma RiskLevel enum, declared here so the engine and
 * this config have no dependencies at all — the frontend imports them to run
 * the identical engine in the browser (landing page playground). */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface LevelBucket {
  maxInclusive: number;
  level: RiskLevel;
}

export const LEVEL_BUCKETS: LevelBucket[] = [
  { maxInclusive: 24, level: "LOW" },
  { maxInclusive: 49, level: "MEDIUM" },
  { maxInclusive: 74, level: "HIGH" },
  { maxInclusive: MAX_SCORE, level: "CRITICAL" },
];
