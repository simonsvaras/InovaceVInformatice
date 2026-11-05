"use server";

import { redirect } from "next/navigation";

import { formText, InputError, parseCzkAmount, validateReason, validateUuid } from "@/lib/validation";
import { requireUser } from "@/modules/auth/service";
import {
  activateDemoIntegration,
  allocateSimulatedTransaction,
  ignoreSimulatedTransaction,
  ingestSimulatedTransaction,
  linkSimulatedTransactionToManualEvent,
  markSimulatedTransactionDifferent,
} from "@/modules/bank-simulator/service";
import type { PaymentScope } from "@/modules/payments/service";

function errorMessage(error: unknown) {
  return error instanceof InputError ? error.message : "Akci se nepodařilo bezpečně dokončit.";
}

function paymentScope(formData: FormData): PaymentScope {
  const teamId = formText(formData, "teamId");
  const clubId = formText(formData, "clubId");
  if (teamId && !clubId) return { teamId: validateUuid(teamId, "Tým") };
  if (clubId && !teamId) return { clubId: validateUuid(clubId, "Klub") };
  throw new InputError("invalid_scope", "Finanční rozsah není platný.");
}

function financePath(scope: PaymentScope) {
  return scope.teamId
    ? `/finance?teamId=${encodeURIComponent(scope.teamId)}`
    : `/finance?clubId=${encodeURIComponent(scope.clubId!)}`;
}

function variableSymbol(value: string) {
  const normalized = value.replace(/\s/g, "");
  if (!normalized) return null;
  if (!/^\d{1,10}$/.test(normalized)) throw new InputError("invalid_vs", "Variabilní symbol smí obsahovat nejvýše 10 číslic.");
  return normalized;
}

export async function activateDemoIntegrationAction(formData: FormData) {
  const user = await requireUser();
  const scope = paymentScope(formData);
  const path = financePath(scope);
  try {
    await activateDemoIntegration({
      actorUserId: user.id,
      scope,
      bankAccountId: validateUuid(formText(formData, "bankAccountId"), "Účet"),
    });
  } catch (error) {
    redirect(`${path}&error=${encodeURIComponent(errorMessage(error))}`);
  }
  redirect(`${path}&success=${encodeURIComponent("Demo synchronizace byla technicky aktivována. Ruční hlášení a evidence zůstávají dostupné.")}`);
}

export async function simulateBankPaymentAction(formData: FormData) {
  const user = await requireUser();
  const receivableId = validateUuid(formText(formData, "receivableId"), "Dluh");
  const sourceTransactionId = validateUuid(formText(formData, "sourceTransactionId"), "Demo ID");
  const path = `/demo-banka/${receivableId}?sourceId=${encodeURIComponent(sourceTransactionId)}`;
  let result;
  try {
    result = await ingestSimulatedTransaction({
      actorUserId: user.id,
      receivableId,
      sourceTransactionId,
      amountHalere: parseCzkAmount(formText(formData, "amount")),
      variableSymbol: variableSymbol(formText(formData, "variableSymbol")),
      occurredAt: new Date(),
    });
  } catch (error) {
    redirect(`${path}&error=${encodeURIComponent(errorMessage(error))}`);
  }
  const success = !result.created
    ? "Tento demo pohyb už byl přijat; nevznikla druhá alokace. Případné nedoručené oznámení bylo bezpečně zopakováno."
    : result.autoAllocated
      ? "Demo pohyb byl přijat a jednoznačně přiřazen. Nejde o skutečný ani bankovně ověřený převod."
      : "Demo pohyb byl přijat do fronty smíření. Nejde o skutečný ani bankovně ověřený převod.";
  redirect(`${path}&success=${encodeURIComponent(success)}`);
}

export async function markSimulatedTransactionDifferentAction(formData: FormData) {
  const user = await requireUser();
  const scope = paymentScope(formData);
  const path = financePath(scope);
  try {
    await markSimulatedTransactionDifferent({
      actorUserId: user.id,
      scope,
      bankTransactionId: validateUuid(formText(formData, "bankTransactionId"), "Pohyb"),
      reason: validateReason(formText(formData, "reason")),
    });
  } catch (error) {
    redirect(`${path}&error=${encodeURIComponent(errorMessage(error))}`);
  }
  redirect(`${path}&success=${encodeURIComponent("Rozhodnutí „jiná platba“ bylo auditováno; pohyb zůstává dostupný k ručnímu přiřazení.")}`);
}

export async function ignoreSimulatedTransactionAction(formData: FormData) {
  const user = await requireUser();
  const scope = paymentScope(formData);
  const path = financePath(scope);
  try {
    await ignoreSimulatedTransaction({
      actorUserId: user.id,
      scope,
      bankTransactionId: validateUuid(formText(formData, "bankTransactionId"), "Pohyb"),
      reason: validateReason(formText(formData, "reason")),
    });
  } catch (error) {
    redirect(`${path}&error=${encodeURIComponent(errorMessage(error))}`);
  }
  redirect(`${path}&success=${encodeURIComponent("Pohyb byl s důvodem uzavřen jako jiná platba bez alokace.")}`);
}

export async function linkSimulatedTransactionAction(formData: FormData) {
  const user = await requireUser();
  const scope = paymentScope(formData);
  const path = financePath(scope);
  try {
    await linkSimulatedTransactionToManualEvent({
      actorUserId: user.id,
      scope,
      bankTransactionId: validateUuid(formText(formData, "bankTransactionId"), "Pohyb"),
      paymentEventId: validateUuid(formText(formData, "paymentEventId"), "Ruční úhrada"),
      reason: validateReason(formText(formData, "reason")),
    });
  } catch (error) {
    redirect(`${path}&error=${encodeURIComponent(errorMessage(error))}`);
  }
  redirect(`${path}&success=${encodeURIComponent("Demo pohyb byl spojen s existující ruční úhradou bez nové alokace.")}`);
}

export async function allocateSimulatedTransactionAction(formData: FormData) {
  const user = await requireUser();
  const scope = paymentScope(formData);
  const path = financePath(scope);
  try {
    await allocateSimulatedTransaction({
      actorUserId: user.id,
      scope,
      bankTransactionId: validateUuid(formText(formData, "bankTransactionId"), "Pohyb"),
      receivableId: validateUuid(formText(formData, "receivableId"), "Dluh"),
      amountHalere: parseCzkAmount(formText(formData, "amount")),
      idempotencyKey: validateUuid(formText(formData, "idempotencyKey"), "Klíč formuláře"),
      reason: validateReason(formText(formData, "reason")),
      confirmDistinctFromManual: formData.get("confirmDistinctFromManual") === "on",
    });
  } catch (error) {
    redirect(`${path}&error=${encodeURIComponent(errorMessage(error))}`);
  }
  redirect(`${path}&success=${encodeURIComponent("Dosud volná část demo pohybu byla auditovaně přiřazena.")}`);
}
