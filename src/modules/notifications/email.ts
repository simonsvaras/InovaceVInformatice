import { eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { notificationDeliveries } from "@/db/schema";

type EmailMessage = {
  userId?: string;
  recipient: string;
  kind: string;
  subject: string;
  text: string;
};

function publicAppUrl(): URL {
  const raw = process.env.PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL(raw);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("PUBLIC_APP_URL must use HTTP or HTTPS.");
  }

  return url;
}

export function absoluteAppUrl(path: string): string {
  return new URL(path, publicAppUrl()).toString();
}

export async function sendTransactionalEmail(message: EmailMessage) {
  const database = getDatabase();
  const [delivery] = await database
    .insert(notificationDeliveries)
    .values({
      userId: message.userId,
      recipientEmail: message.recipient,
      kind: message.kind,
      status: "pending",
    })
    .returning({ id: notificationDeliveries.id });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    await database
      .update(notificationDeliveries)
      .set({ status: "failed", errorCode: "email_not_configured" })
      .where(eq(notificationDeliveries.id, delivery.id));
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
      }),
    });

    if (!response.ok) {
      await database
        .update(notificationDeliveries)
        .set({ status: "failed", errorCode: `resend_http_${response.status}` })
        .where(eq(notificationDeliveries.id, delivery.id));
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
      .where(eq(notificationDeliveries.id, delivery.id));

    return { delivered: true as const };
  } catch {
    await database
      .update(notificationDeliveries)
      .set({ status: "failed", errorCode: "provider_unreachable" })
      .where(eq(notificationDeliveries.id, delivery.id));
    return { delivered: false as const, reason: "provider_unreachable" };
  }
}
