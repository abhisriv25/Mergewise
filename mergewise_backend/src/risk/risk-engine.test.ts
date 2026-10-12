import { describe, expect, it } from "vitest";
import { calculateRiskScore, calculateRiskSignals, type RiskInput } from "./risk-engine.js";

function baseInput(overrides: Partial<RiskInput> = {}): RiskInput {
  return {
    additions: 0,
    deletions: 0,
    changedFilesCount: 0,
    changedFiles: [],
    ...overrides,
  };
}

function signalFor(input: RiskInput, code: string) {
  const signal = calculateRiskSignals(input).find((s) => s.code === code);
  if (!signal) throw new Error(`No signal found for ${code}`);
  return signal;
}

describe("DIFF_SIZE rule", () => {
  it.each([
    [0, 0, false],
    [49, 0, false],
    [50, 5, true],
    [199, 5, true],
    [200, 10, true],
    [499, 10, true],
    [500, 20, true],
    [999, 20, true],
    [1000, 30, true],
    [5000, 30, true],
  ])("totalLines=%i -> %i points (triggered=%s)", (totalLines, expectedPoints, expectedTriggered) => {
    const signal = signalFor(baseInput({ additions: totalLines, deletions: 0 }), "DIFF_SIZE");
    expect(signal.points).toBe(expectedPoints);
    expect(signal.triggered).toBe(expectedTriggered);
  });

  it("sums additions and deletions", () => {
    const signal = signalFor(baseInput({ additions: 30, deletions: 25 }), "DIFF_SIZE");
    expect(signal.points).toBe(5); // 55 total -> 50-199 bucket
  });
});

describe("FILE_COUNT rule", () => {
  it.each([
    [0, 0, false],
    [5, 0, false],
    [6, 5, true],
    [15, 5, true],
    [16, 10, true],
    [30, 10, true],
    [31, 20, true],
    [60, 20, true],
    [61, 30, true],
  ])("changedFilesCount=%i -> %i points (triggered=%s)", (count, expectedPoints, expectedTriggered) => {
    const signal = signalFor(baseInput({ changedFilesCount: count }), "FILE_COUNT");
    expect(signal.points).toBe(expectedPoints);
    expect(signal.triggered).toBe(expectedTriggered);
  });
});

describe("SENSITIVE_PATH rule", () => {
  it("triggers on an exact sensitive directory segment", () => {
    const signal = signalFor(baseInput({ changedFiles: ["src/auth/login.ts"] }), "SENSITIVE_PATH");
    expect(signal.triggered).toBe(true);
    expect(signal.evidence).toEqual(["src/auth/login.ts"]);
  });

  it("triggers on an exact sensitive filename stem", () => {
    const signal = signalFor(baseInput({ changedFiles: ["config.yml"] }), "SENSITIVE_PATH");
    expect(signal.triggered).toBe(true);
  });

  it("does not trigger on a substring match of a filename", () => {
    const signal = signalFor(baseInput({ changedFiles: ["src/authors.ts"] }), "SENSITIVE_PATH");
    expect(signal.triggered).toBe(false);
  });

  it("does not trigger on an unrelated *.config.js file", () => {
    const signal = signalFor(baseInput({ changedFiles: ["webpack.config.js"] }), "SENSITIVE_PATH");
    expect(signal.triggered).toBe(false);
  });

  it("has zero points when not triggered", () => {
    const signal = signalFor(baseInput({ changedFiles: ["src/index.ts"] }), "SENSITIVE_PATH");
    expect(signal.points).toBe(0);
  });
});

describe("MIGRATION_CHANGE rule", () => {
  it("triggers on a migrations/ directory segment", () => {
    const signal = signalFor(
      baseInput({ changedFiles: ["db/migrations/0001_init.sql"] }),
      "MIGRATION_CHANGE",
    );
    expect(signal.triggered).toBe(true);
    expect(signal.evidence).toEqual(["db/migrations/0001_init.sql"]);
  });

  it("does not trigger on an unrelated path", () => {
    const signal = signalFor(baseInput({ changedFiles: ["src/index.ts"] }), "MIGRATION_CHANGE");
    expect(signal.triggered).toBe(false);
  });
});

describe("DEPENDENCY_CHANGE rule", () => {
  it("triggers on package.json", () => {
    const signal = signalFor(baseInput({ changedFiles: ["package.json"] }), "DEPENDENCY_CHANGE");
    expect(signal.triggered).toBe(true);
  });

  it("triggers on a lockfile nested in a subdirectory", () => {
    const signal = signalFor(baseInput({ changedFiles: ["mergewise_backend/package-lock.json"] }), "DEPENDENCY_CHANGE");
    expect(signal.triggered).toBe(true);
  });

  it("does not trigger on an unrelated JSON file", () => {
    const signal = signalFor(baseInput({ changedFiles: ["src/data/fixture.json"] }), "DEPENDENCY_CHANGE");
    expect(signal.triggered).toBe(false);
  });
});

describe("NO_TEST_FILES rule", () => {
  it("triggers when no test file is in the diff", () => {
    const signal = signalFor(baseInput({ changedFiles: ["src/index.ts"] }), "NO_TEST_FILES");
    expect(signal.triggered).toBe(true);
  });

  it("does not trigger when a *.test.ts file is present", () => {
    const signal = signalFor(
      baseInput({ changedFiles: ["src/index.ts", "src/index.test.ts"] }),
      "NO_TEST_FILES",
    );
    expect(signal.triggered).toBe(false);
  });

  it("does not trigger when a *.spec.ts file is present", () => {
    const signal = signalFor(baseInput({ changedFiles: ["src/index.spec.ts"] }), "NO_TEST_FILES");
    expect(signal.triggered).toBe(false);
  });

  it("does not trigger for a file under a __tests__/ directory", () => {
    const signal = signalFor(baseInput({ changedFiles: ["src/__tests__/index.ts"] }), "NO_TEST_FILES");
    expect(signal.triggered).toBe(false);
  });

  it("never triggers on an empty diff", () => {
    const signal = signalFor(baseInput({ changedFiles: [] }), "NO_TEST_FILES");
    expect(signal.triggered).toBe(false);
  });
});

describe("calculateRiskScore", () => {
  it("sums points across multiple simultaneously-triggered rules", () => {
    const input = baseInput({
      additions: 600, // DIFF_SIZE 20
      changedFilesCount: 40, // FILE_COUNT 20
      changedFiles: ["src/auth/login.ts", "package.json"], // SENSITIVE_PATH 20 + DEPENDENCY_CHANGE 10 + NO_TEST_FILES 15
    });
    const { score } = calculateRiskScore(calculateRiskSignals(input));
    expect(score).toBe(20 + 20 + 20 + 10 + 15);
  });

  it("caps the total score at 100", () => {
    const input = baseInput({
      additions: 5000,
      changedFilesCount: 100,
      changedFiles: ["src/auth/login.ts", "package.json", "db/migrations/x.sql"],
    });
    const { score } = calculateRiskScore(calculateRiskSignals(input));
    expect(score).toBe(100);
  });

  it.each([
    [0, "LOW"],
    [24, "LOW"],
    [25, "MEDIUM"],
    [49, "MEDIUM"],
    [50, "HIGH"],
    [74, "HIGH"],
    [75, "CRITICAL"],
    [100, "CRITICAL"],
  ])("maps a score of %i to level %s", (score, expectedLevel) => {
    // Force this exact score via a single signal's worth of points so the
    // level-mapping boundary is tested in isolation from the bucket rules.
    const signals = [
      { code: "DIFF_SIZE" as const, triggered: score > 0, points: score, explanation: "", evidence: [] },
    ];
    const result = calculateRiskScore(signals);
    expect(result.level).toBe(expectedLevel);
  });
});
