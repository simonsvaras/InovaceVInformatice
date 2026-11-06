"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { formText, InputError, validateUuid } from "@/lib/validation";
import { requireUser } from "@/modules/auth/service";
import { confirmPublicQrPayment } from "@/modules/bank-simulator/service";
import { rotatePublicPaymentLink } from "@/modules/public-payments/service";
import { consumeRateLimit } from "@/modules/security/rate-limit";

function message(error: unknown) {
  return error instanceof InputError
    ? error.message
    : "Platbu se nepodařilo zpracovat. Zkuste to znovu.";
}

export async function rotatePublicPaymentLinkAction(formData: FormData) {
  const user = await requireUser();
  const receivableId = validateUuid(
    formText(formData, "receivableId"),
    "Dluh",
  );
  try {
    await rotatePublicPaymentLink({ actorUserId: user.id, receivableId });
  } catch (error) {
    redirect(`/dluhy/${receivableId}?error=${encodeURIComponent(message(error))}`);
  }
  redirect(`/dluhy/${receivableId}?success=${encodeURIComponent("Původní veřejný odkaz byl zrušen a byl vydán nový.")}`);
}

export async function confirmPublicPaymentAction(formData: FormData) {
  const issueId = validateUuid(formText(formData, "issueId"), "Platební odkaz");
  const token = formText(formData, "token");
  const expectedAmountHalere = Number.parseInt(
    formText(formData, "expectedAmountHalere"),
    10,
  );
  const requestHeaders = await headers();
  const clientAddress =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-real-ip") ??
    "unknown";
  const returnPath = `/platba/${encodeURIComponent(issueId)}/${encodeURIComponent(token)}`;

  let result: Awaited<ReturnType<typeof confirmPublicQrPayment>>;
  try {
    await consumeRateLimit("public_qr_payment", `${issueId}:${clientAddress}`, 8, 10);
    await consumeRateLimit("public_qr_link", issueId, 30, 60);
    result = await confirmPublicQrPayment({
      issueId,
      rawToken: token,
      expectedAmountHalere,
    });
  } catch (error) {
    redirect(`${returnPath}?error=${encodeURIComponent(message(error))}`);
  }
  if (result.requiresReconfirmation) {
    redirect(`${returnPath}?changed=1`);
  }
  redirect(returnPath);
}
