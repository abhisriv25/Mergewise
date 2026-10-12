import { env } from "../env.js";

const MAX_OUTPUT_TOKENS = 1200;
const REQUEST_TIMEOUT_MS = 60_000;

export class LlmNotConfiguredError extends Error {}
export class LlmResponseError extends Error {}
export class LlmTimeoutError extends Error {}

export async function generateChatCompletion(params: {
  model: string;
  system: string;
  user: string;
}): Promise<string> {
  if (!env.LLM_API_KEY) throw new LlmNotConfiguredError("LLM_API_KEY is not set");

  let res: Response;
  try {
    res = await fetch(`${env.LLM_API_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.LLM_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
        response_format: { type: "json_object" },
        // Cost guard: bounds output spend per analysis. max_completion_tokens,
        // not the deprecated max_tokens, which newer OpenAI models reject.
        max_completion_tokens: MAX_OUTPUT_TOKENS,
      }),
      // A hung upstream must not hold the request open indefinitely.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new LlmTimeoutError(`LLM request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  }
  if (!res.ok) throw new Error(`LLM request failed (status ${res.status})`);

  const body = (await res.json()) as {
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  };
  const choice = body.choices?.[0];
  // Hitting the token cap cuts the JSON off mid-object; say so rather than
  // surfacing it later as an opaque parse failure.
  if (choice?.finish_reason === "length") {
    throw new LlmResponseError(`LLM response hit the ${MAX_OUTPUT_TOKENS}-token output cap`);
  }
  const content = choice?.message?.content;
  if (!content) throw new LlmResponseError("LLM response had no message content");
  return content;
}
