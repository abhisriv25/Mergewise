import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  pRAnalysis: { findUnique: vi.fn(), create: vi.fn() },
};
const getOrCreateLatestRiskAssessmentMock = vi.fn();
const analyzePullRequestMock = vi.fn();

vi.mock("../prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../risk/risk-assessment.service.js", () => ({
  getOrCreateLatestRiskAssessment: getOrCreateLatestRiskAssessmentMock,
}));
vi.mock("./pr-analysis.service.js", () => ({ analyzePullRequest: analyzePullRequestMock }));

const { getOrCreatePrIntelligence } = await import("./pr-intelligence.service.js");

const ASSESSMENT = { id: "risk-1", score: 60, level: "HIGH" };
const ANALYZED = {
  status: "analyzed",
  model: "gpt-4o",
  riskAssessmentId: "risk-1",
  score: 60,
  level: "HIGH",
  embeddingModel: null,
  analysis: { summary: "s", riskExplanation: [], recommendations: [], confidence: "HIGH" },
};

beforeEach(() => {
  vi.resetAllMocks();
  getOrCreateLatestRiskAssessmentMock.mockResolvedValue(ASSESSMENT);
  prismaMock.pRAnalysis.findUnique.mockResolvedValue(null);
});

describe("getOrCreatePrIntelligence", () => {
  it("serves a stored analysis without calling the LLM", async () => {
    prismaMock.pRAnalysis.findUnique.mockResolvedValueOnce({ id: "analysis-1" });

    const result = await getOrCreatePrIntelligence("pr-1");

    expect(result).toEqual({ status: "analyzed", analysis: { id: "analysis-1" } });
    expect(analyzePullRequestMock).not.toHaveBeenCalled();
  });

  it("shares one generation between concurrent requests", async () => {
    let finish!: (value: typeof ANALYZED) => void;
    analyzePullRequestMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    prismaMock.pRAnalysis.create.mockResolvedValueOnce({ id: "analysis-1" });

    const first = getOrCreatePrIntelligence("pr-1");
    const second = getOrCreatePrIntelligence("pr-1");
    await vi.waitFor(() => expect(analyzePullRequestMock).toHaveBeenCalled());
    finish(ANALYZED);

    expect(await first).toEqual({ status: "analyzed", analysis: { id: "analysis-1" } });
    expect(await second).toEqual({ status: "analyzed", analysis: { id: "analysis-1" } });
    expect(analyzePullRequestMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.pRAnalysis.create).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed generation instead of caching the failure", async () => {
    analyzePullRequestMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(ANALYZED);
    prismaMock.pRAnalysis.create.mockResolvedValueOnce({ id: "analysis-1" });

    await expect(getOrCreatePrIntelligence("pr-1")).rejects.toThrow("boom");
    expect(await getOrCreatePrIntelligence("pr-1")).toEqual({ status: "analyzed", analysis: { id: "analysis-1" } });
  });

  it("serves the other process's row when the unique index rejects a duplicate", async () => {
    analyzePullRequestMock.mockResolvedValueOnce(ANALYZED);
    prismaMock.pRAnalysis.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "5" }),
    );
    prismaMock.pRAnalysis.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "winner" });

    expect(await getOrCreatePrIntelligence("pr-1")).toEqual({ status: "analyzed", analysis: { id: "winner" } });
  });

  it("passes a LOW-risk skip through without storing it", async () => {
    analyzePullRequestMock.mockResolvedValueOnce({ status: "skipped_low_risk", score: 5, level: "LOW" });

    expect(await getOrCreatePrIntelligence("pr-1")).toEqual({ status: "skipped_low_risk", score: 5, level: "LOW" });
    expect(prismaMock.pRAnalysis.create).not.toHaveBeenCalled();
  });
});
