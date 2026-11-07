"use server";

import { redirect } from "next/navigation";

import { todayInPrague } from "@/lib/dates";
import {
  formText,
  InputError,
  parseCzkAmount,
  validatePaymentDate,
  validateReason,
  validateUuid,
} from "@/lib/validation";
import { requireUser } from "@/modules/auth/service";
import {
  recordCashPayment,
  reportManualPayment,
  reviewPaymentClaims,
  reversePaymentEvent,
  sendBulkReminders,
  type PaymentScope,
  withdrawManualPayment,
} from "@/modules/payments/service";

function message(error: unknown) {
  return error instanceof InputError
    ? error.message
    : "Akci se nepodařilo dokončit. Zkuste to znovu.";
}

function paymentScope(formData: FormData): PaymentScope {
  const teamId = formText(formData, "teamId");
  const clubId = formText(formData, "clubId");
  if (teamId && !clubId) return { teamId: validateUuid(teamId, "Tým") };
  if (clubId && !teamId) return { clubId: validateUuid(clubId, "Klub") };
  throw new InputError("invalid_scope", "Finanční rozsah není platný.");
}

function financePath(scope: PaymentScope) {
  return "teamId" in scope
    ? `/finance?teamId=${encodeURIComponent(scope.teamId!)}`
    : `/finance?clubId=${encodeURIComponent(scope.clubId!)}`;
}

export async function reportManualPaymentAction(formData: FormData) {
  const user = await requireUser();
  const receivableId = validateUuid(formText(formData, "receivableId"), "Dluh");
  try {
    await reportManualPayment({
      actorUserId: user.id,
      receivableId,
      amountHalere: parseCzkAmount(formText(formData, "amount")),
    });
  } catch (error) {
    redirect(`/dluhy/${receivableId}?error=${encodeURIComponent(message(error))}`);
  }
  redirect(
    `/dluhy/${receivableId}?success=${encodeURIComponent("Hlášení bylo uloženo a čeká na potvrzení.")}`,
  );
}

export async function withdrawManualPaymentAction(formData: FormData) {
  const user = await requireUser();
  const receivableId = validateUuid(formText(formData, "receivableId"), "Dluh");
  try {
    await withdrawManualPayment({
      actorUserId: user.id,
      claimId: validateUuid(formText(formData, "claimId"), "Hlášení"),
    });
  } catch (error) {
    redirect(`/dluhy/${receivableId}?error=${encodeURIComponent(message(error))}`);
  }
  redirect(`/dluhy/${receivableId}?success=${encodeURIComponent("Hlášení bylo odvoláno.")}`);
}

export async function reviewPaymentClaimsAction(formData: FormData) {
  const user = await requireUser();
  const scope = paymentScope(formData);
  const returnPath = financePath(scope);
  const decision = formText(formData, "decision");
  let processed = 0;
  let skipped = 0;
  try {
    if (decision !== "approved" && decision !== "rejected") {
      throw new InputError("invalid_decision", "Zvolte potvrzení nebo zamítnutí.");
    }
    const result = await reviewPaymentClaims({
      actorUserId: user.id,
      scope,
      claimIds: formData
        .getAll("claimId")
        .filter((value): value is string => typeof value === "string")
        .map((value) => validateUuid(value, "Hlášení")),
      decision,
      rejectionReason:
        decision === "rejected"
          ? validateReason(formText(formData, "rejectionReason"), "Důvod zamítnutí")
          : undefined,
    });
    processed = result.processed;
    skipped = result.skipped;
  } catch (error) {
    redirect(`${returnPath}&error=${encodeURIComponent(message(error))}`);
  }
  redirect(
    `${returnPath}&success=${encodeURIComponent(`Zpracováno: ${processed}, beze změny: ${skipped}.`)}`,
  );
}

export async function recordCashPaymentAction(formData: FormData) {
  const user = await requireUser();
  const scope = paymentScope(formData);
  const returnPath = financePath(scope);
  let created = false;
  try {
    const result = await recordCashPayment({
      actorUserId: user.id,
      scope,
      receivableId: validateUuid(formText(formData, "receivableId"), "Dluh"),
      amountHalere: parseCzkAmount(formText(formData, "amount")),
      occurredOn: validatePaymentDate(formText(formData, "occurredOn"), todayInPrague()),
      idempotencyKey: validateUuid(formText(formData, "idempotencyKey"), "Klíč formuláře"),
    });
    created = result.created;
  } catch (error) {
    redirect(`${returnPath}&error=${encodeURIComponent(message(error))}`);
  }
  const success = created
    ? "Hotovost byla zaevidována."
    : "Tento zápis hotovosti už byl zpracován; další částka nevznikla.";
  redirect(`${returnPath}&success=${encodeURIComponent(success)}`);
}

export async function reversePaymentEventAction(formData: FormData) {
  const user = await requireUser();
  const scope = paymentScope(formData);
  const returnPath = financePath(scope);
  try {
    await reversePaymentEvent({
      actorUserId: user.id,
      scope,
      paymentEventId: validateUuid(formText(formData, "paymentEventId"), "Platba"),
      reason: validateReason(formText(formData, "reason"), "Důvod opravy"),
      idempotencyKey: validateUuid(formText(formData, "idempotencyKey"), "Klíč formuláře"),
    });
  } catch (error) {
    redirect(`${returnPath}&error=${encodeURIComponent(message(error))}`);
  }
  redirect(`${returnPath}&success=${encodeURIComponent("Oprava byla zapsána protizápisem; historie zůstala zachována.")}`);
}

export async function sendBulkRemindersAction(formData: FormData) {
  const user = await requireUser();
  const scope = paymentScope(formData);
  const returnPath = financePath(scope);
  let created = false;
  let recipientCount = 0;
  try {
    const result = await sendBulkReminders({
      actorUserId: user.id,
      scope,
      idempotencyKey: validateUuid(formText(formData, "idempotencyKey"), "Klíč formuláře"),
    });
    created = result.created;
    recipientCount = result.recipientCount;
  } catch (error) {
    redirect(`${returnPath}&error=${encodeURIComponent(message(error))}`);
  }
  const success = created
    ? `Neutrální upomínka byla připravena pro ${recipientCount} dluhů.`
    : "Tento požadavek na upomínky už byl zpracován.";
  redirect(`${returnPath}&success=${encodeURIComponent(success)}`);
}
