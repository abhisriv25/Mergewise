import { Prisma, type WebhookEventStatus } from "@prisma/client";
import { prisma } from "../prisma.js";

export interface WebhookEventInput {
  deliveryId: string;
  eventType: string;
  action?: string;
  githubRepoId?: string;
  githubInstallationId?: string;
  payload: unknown;
  status: WebhookEventStatus;
}

export type RecordWebhookEventResult = "created" | "duplicate";

/** A duplicate `deliveryId` is expected under GitHub's own delivery-retry
 * behavior, not an error condition. Relies on the DB's unique constraint —
 * not a check-then-insert, which would leave a race window under
 * concurrent retries — so a replayed delivery is caught here as a
 * constraint violation and reported back as a harmless duplicate. */
export async function recordWebhookEvent(
  input: WebhookEventInput,
): Promise<RecordWebhookEventResult> {
  try {
    await prisma.webhookEvent.create({
      data: {
        deliveryId: input.deliveryId,
        eventType: input.eventType,
        action: input.action,
        githubRepoId: input.githubRepoId,
        githubInstallationId: input.githubInstallationId,
        payload: input.payload as Prisma.InputJsonValue,
        status: input.status,
      },
    });
    return "created";
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return "duplicate";
    }
    throw err;
  }
}
