import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { notificationDeliveries } from "@/db/schema";

type EmailMessage = {
  userId?: string;
  recipient: string;
  kind: string;
  referenceId?: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    content_type?: string;
    content_id?: string;
  }>;
};

function publicAppUrl(): URL {
  const raw = process.env.PUBLIC_APP_URL;
  if (!raw) {
    throw new Error("PUBLIC_APP_URL must be configured.");
  }
  const url = new URL(raw);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("PUBLIC_APP_URL must use HTTP or HTTPS.");
  }
  if (process.env.NODE_ENV === "production" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("PUBLIC_APP_URL must not use localhost in production.");
  }

  return url;
}

export function absoluteAppUrl(path: string): string {
  return new URL(path, publicAppUrl()).toString();
}

export async function sendTransactionalEmail(message: EmailMessage) {
  const database = getDatabase();
  const [createdDelivery] = await database
    .insert(notificationDeliveries)
    .values({
      userId: message.userId,
      recipientEmail: message.recipient,
      kind: message.kind,
      referenceId: message.referenceId,
      status: "pending",
    })
    .onConflictDoNothing()
    .returning({ id: notificationDeliveries.id });

  if (!createdDelivery && message.referenceId) {
    const [existing] = await database
      .select({ id: notificationDeliveries.id, status: notificationDeliveries.status })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.kind, message.kind),
          eq(notificationDeliveries.referenceId, message.referenceId),
        ),
      )
      .limit(1);
    if (!existing) return { delivered: false as const, reason: "already_recorded" };
    return sendRecordedTransactionalEmail(existing.id, message);
  }

  if (!createdDelivery) {
    throw new Error("Notification delivery could not be created.");
  }

  return sendRecordedTransactionalEmail(createdDelivery.id, message);
}

export async function sendRecordedTransactionalEmail(
  deliveryId: string,
  message: EmailMessage,
) {
  const database = getDatabase();
  const staleBefore = new Date(Date.now() - 5 * 60_000);
  const attemptToken = randomUUID();
  const attemptStartedAt = new Date();
  const [delivery] = await database
    .update(notificationDeliveries)
    .set({
      status: "sending",
      errorCode: null,
      attemptStartedAt,
      attemptToken,
    })
    .where(
      and(
        eq(notificationDeliveries.id, deliveryId),
        or(
          inArray(notificationDeliveries.status, ["pending", "failed"]),
          and(
            eq(notificationDeliveries.status, "sending"),
            or(
              isNull(notificationDeliveries.attemptStartedAt),
              lt(notificationDeliveries.attemptStartedAt, staleBefore),
            ),
          ),
        ),
      ),
    )
    .returning({ id: notificationDeliveries.id });

  if (!delivery) {
    const [existing] = await database
      .select({ status: notificationDeliveries.status })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.id, deliveryId))
      .limit(1);
    return {
      delivered: existing?.status === "sent",
      reason: "already_recorded",
    } as const;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    await database
      .update(notificationDeliveries)
      .set({ status: "failed", errorCode: "email_not_configured" })
      .where(
        and(
          eq(notificationDeliveries.id, delivery.id),
          eq(notificationDeliveries.attemptToken, attemptToken),
        ),
      );
    return { delivered: false as const, reason: "email_not_configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": delivery.id,
      },
      body: JSON.stringify({
        from,
        to: [message.recipient],
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments,
      }),
    });

    if (!response.ok) {
      await database
        .update(notificationDeliveries)
        .set({ status: "failed", errorCode: `resend_http_${response.status}` })
        .where(
          and(
            eq(notificationDeliveries.id, delivery.id),
            eq(notificationDeliveries.attemptToken, attemptToken),
          ),
        );
      return { delivered: false as const, reason: "provider_error" };
    }

    const payload = (await response.json()) as { id?: string };
    await database
      .update(notificationDeliveries)
      .set({
        status: "sent",
        providerId: payload.id ?? null,
        sentAt: new Date(),
      })
      .where(
        and(
          eq(notificationDeliveries.id, delivery.id),
          eq(notificationDeliveries.attemptToken, attemptToken),
        ),
      );

    return { delivered: true as const };
  } catch {
    await database
      .update(notificationDeliveries)
      .set({ status: "failed", errorCode: "provider_unreachable" })
      .where(
        and(
          eq(notificationDeliveries.id, delivery.id),
          eq(notificationDeliveries.attemptToken, attemptToken),
        ),
      );
    return { delivered: false as const, reason: "provider_unreachable" };
  }
}

export async function failRecordedDelivery(deliveryId: string, errorCode: string) {
  await getDatabase()
    .update(notificationDeliveries)
    .set({ status: "failed", errorCode })
    .where(
      and(
        eq(notificationDeliveries.id, deliveryId),
        inArray(notificationDeliveries.status, ["pending", "failed"]),
      ),
    );
}
