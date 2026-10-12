import { z } from "zod";

export const prAnalysisSchema = z.object({
  summary: z.string().min(1),
  riskExplanation: z.array(
    z.object({
      title: z.string().min(1),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
      reason: z.string().min(1),
      evidence: z.array(z.string()).default([]),
    }),
  ),
  recommendations: z.array(
    z.object({
      action: z.string().min(1),
      reason: z.string().min(1),
      source: z.string().nullable(),
    }),
  ),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
});

export type PrAnalysisOutput = z.infer<typeof prAnalysisSchema>;

export class InvalidLlmResponseError extends Error {}

/** Model output is untrusted: parse, then schema-validate, or throw. */
export function parseLlmResponse(raw: string): PrAnalysisOutput {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new InvalidLlmResponseError("LLM response was not valid JSON");
  }
  const parsed = prAnalysisSchema.safeParse(json);
  if (!parsed.success) {
    throw new InvalidLlmResponseError(`LLM response failed validation: ${parsed.error.message}`);
  }
  return parsed.data;
}
