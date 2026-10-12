import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { LOG_REDACT } from "./logger.js";

describe("LOG_REDACT", () => {
  it("strips session cookies, auth headers and webhook signatures from request logs", () => {
    let output = "";
    const sink = new Writable({
      write(chunk, _encoding, done) {
        output += chunk.toString();
        done();
      },
    });

    pino({ redact: LOG_REDACT }, sink).info({
      req: {
        headers: {
          host: "api.example.com",
          cookie: "devpulse.sid=s:session-secret",
          authorization: "Bearer token-secret",
          "x-hub-signature-256": "sha256=signature-secret",
        },
      },
      res: { headers: { "set-cookie": "devpulse.sid=s:session-secret" } },
    });

    expect(output).not.toMatch(/session-secret|token-secret|signature-secret/);
    expect(output).toContain('"host":"api.example.com"');
    expect(output).toContain("[redacted]");
  });
});
