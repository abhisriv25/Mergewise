import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./webhook-signature.service.js";

const SECRET = "test-secret";

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed body", () => {
    const bodyString = JSON.stringify({ hello: "world" });
    const body = Buffer.from(bodyString);

    expect(verifyWebhookSignature(body, sign(bodyString), SECRET)).toBe(true);
  });

  it("rejects a signature produced with the wrong secret", () => {
    const bodyString = JSON.stringify({ hello: "world" });
    const body = Buffer.from(bodyString);

    expect(verifyWebhookSignature(body, sign(bodyString, "wrong-secret"), SECRET)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const originalString = JSON.stringify({ hello: "world" });
    const signature = sign(originalString);
    const tamperedBody = Buffer.from(JSON.stringify({ hello: "mallory" }));

    expect(verifyWebhookSignature(tamperedBody, signature, SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    const body = Buffer.from("{}");

    expect(verifyWebhookSignature(body, undefined, SECRET)).toBe(false);
  });

  it("rejects a header missing the sha256= prefix", () => {
    const bodyString = "{}";
    const body = Buffer.from(bodyString);
    const rawHex = createHmac("sha256", SECRET).update(bodyString).digest("hex");

    expect(verifyWebhookSignature(body, rawHex, SECRET)).toBe(false);
  });

  it("rejects mismatched-length garbage without throwing", () => {
    const body = Buffer.from("{}");

    expect(() => verifyWebhookSignature(body, "sha256=not-a-real-signature", SECRET)).not.toThrow();
    expect(verifyWebhookSignature(body, "sha256=not-a-real-signature", SECRET)).toBe(false);
  });
});
