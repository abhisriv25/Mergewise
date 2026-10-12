import { createHmac } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  webhookEvent: { create: vi.fn() },
};

vi.mock("../prisma.js", () => ({ prisma: prismaMock }));

const { app } = await import("../app.js");

const SECRET = process.env.GITHUB_WEBHOOK_SECRET as string;

function sign(bodyString: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(bodyString).digest("hex")}`;
}

function post(
  bodyString: string,
  headers: Partial<Record<"X-Hub-Signature-256" | "X-GitHub-Delivery" | "X-GitHub-Event", string>>,
) {
  let req = request(app).post("/webhooks/github").set("Content-Type", "application/json");
  for (const [key, value] of Object.entries(headers)) {
    req = req.set(key, value);
  }
  return req.send(bodyString);
}

function pullRequestPayload(action: string) {
  return JSON.stringify({
    action,
    repository: { id: 555 },
    installation: { id: 777 },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /webhooks/github", () => {
  it("accepts a validly signed, fully-headered delivery", async () => {
    const body = pullRequestPayload("opened");
    prismaMock.webhookEvent.create.mockResolvedValueOnce({});

    const res = await post(body, {
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "delivery-1",
      "X-GitHub-Event": "pull_request",
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: "received" });
  });

  it("rejects a request with no signature header", async () => {
    const body = pullRequestPayload("opened");

    const res = await post(body, {
      "X-GitHub-Delivery": "delivery-2",
      "X-GitHub-Event": "pull_request",
    });

    expect(res.status).toBe(401);
    expect(prismaMock.webhookEvent.create).not.toHaveBeenCalled();
  });

  it("rejects a signature computed with the wrong secret", async () => {
    const body = pullRequestPayload("opened");

    const res = await post(body, {
      "X-Hub-Signature-256": `sha256=${createHmac("sha256", "wrong-secret").update(body).digest("hex")}`,
      "X-GitHub-Delivery": "delivery-3",
      "X-GitHub-Event": "pull_request",
    });

    expect(res.status).toBe(401);
  });

  it("rejects a tampered body (signature no longer matches)", async () => {
    const originalBody = pullRequestPayload("opened");
    const signature = sign(originalBody);
    const tamperedBody = pullRequestPayload("closed");

    const res = await post(tamperedBody, {
      "X-Hub-Signature-256": signature,
      "X-GitHub-Delivery": "delivery-4",
      "X-GitHub-Event": "pull_request",
    });

    expect(res.status).toBe(401);
  });

  it("rejects a validly signed request missing X-GitHub-Delivery", async () => {
    const body = pullRequestPayload("opened");

    const res = await post(body, {
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Event": "pull_request",
    });

    expect(res.status).toBe(400);
  });

  it("rejects a validly signed request missing X-GitHub-Event", async () => {
    const body = pullRequestPayload("opened");

    const res = await post(body, {
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "delivery-5",
    });

    expect(res.status).toBe(400);
  });

  it("stores a supported pull_request action as RECEIVED", async () => {
    const body = pullRequestPayload("synchronize");
    prismaMock.webhookEvent.create.mockResolvedValueOnce({});

    const res = await post(body, {
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "delivery-6",
      "X-GitHub-Event": "pull_request",
    });

    expect(res.status).toBe(202);
    expect(prismaMock.webhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RECEIVED" }) }),
    );
  });

  it("stores an unsupported pull_request action as IGNORED but still 2xx's", async () => {
    const body = pullRequestPayload("labeled");
    prismaMock.webhookEvent.create.mockResolvedValueOnce({});

    const res = await post(body, {
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "delivery-7",
      "X-GitHub-Event": "pull_request",
    });

    expect(res.status).toBe(202);
    expect(prismaMock.webhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "IGNORED" }) }),
    );
  });

  it("stores an out-of-scope event type (ping) as IGNORED but still 2xx's", async () => {
    const body = JSON.stringify({ zen: "Keep it logically awesome." });
    prismaMock.webhookEvent.create.mockResolvedValueOnce({});

    const res = await post(body, {
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "delivery-8",
      "X-GitHub-Event": "ping",
    });

    expect(res.status).toBe(202);
    expect(prismaMock.webhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "IGNORED" }) }),
    );
  });

  it("returns a harmless already_processed for a replayed delivery id, not a second row", async () => {
    const body = pullRequestPayload("opened");
    const prismaError = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const { Prisma } = await import("@prisma/client");
    Object.setPrototypeOf(prismaError, Prisma.PrismaClientKnownRequestError.prototype);
    prismaMock.webhookEvent.create.mockRejectedValueOnce(prismaError);

    const res = await post(body, {
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "delivery-9",
      "X-GitHub-Event": "pull_request",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "already_processed" });
  });

  it("returns 500 on an unexpected DB failure, so GitHub's own retry does the right thing", async () => {
    const body = pullRequestPayload("opened");
    prismaMock.webhookEvent.create.mockRejectedValueOnce(new Error("connection reset"));

    const res = await post(body, {
      "X-Hub-Signature-256": sign(body),
      "X-GitHub-Delivery": "delivery-10",
      "X-GitHub-Event": "pull_request",
    });

    expect(res.status).toBe(500);
  });
});
