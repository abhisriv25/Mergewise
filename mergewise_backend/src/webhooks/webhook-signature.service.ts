import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";

/** HMAC-SHA256 over the raw request bytes, checked with a timing-safe
 * comparison — never a plain `===`, which would leak timing information
 * about how many leading bytes matched. */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const provided = Buffer.from(signatureHeader.slice(SIGNATURE_PREFIX.length), "utf8");
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "utf8");

  // timingSafeEqual throws on mismatched-length buffers rather than
  // returning false, so length must be checked first.
  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}
