import { afterEach, describe, expect, it, vi } from "vitest";

process.env.LLM_API_KEY = "test-llm-key";
const { generateChatCompletion, LlmResponseError, LlmTimeoutError } = await import("./llm-client.js");

const PARAMS = { model: "m", system: "s", user: "u" };

function completion(choice: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ choices: [choice] }),
  }) as unknown as Promise<Response>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generateChatCompletion", () => {
  it("caps output with max_completion_tokens and sends an abort signal", async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
      completion({ message: { content: "{}" }, finish_reason: "stop" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await generateChatCompletion(PARAMS)).toBe("{}");

    const init = fetchMock.mock.calls[0][1];
    const body = JSON.parse(init.body as string);
    expect(body.max_completion_tokens).toBe(1200);
    expect(body).not.toHaveProperty("max_tokens");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("turns a timeout into LlmTimeoutError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"))),
    );

    await expect(generateChatCompletion(PARAMS)).rejects.toBeInstanceOf(LlmTimeoutError);
  });

  it("reports a reply cut off by the token cap", async () => {
    vi.stubGlobal("fetch", vi.fn(() => completion({ message: { content: '{"summary": "trunc' }, finish_reason: "length" })));

    await expect(generateChatCompletion(PARAMS)).rejects.toThrow(LlmResponseError);
  });
});
