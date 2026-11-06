"use server";

import { redirect } from "next/navigation";

import { formText, InputError, validateUuid } from "@/lib/validation";
import { requireUser } from "@/modules/auth/service";
import {
  disableFioIntegration,
  requestFioSync,
  verifyAndActivateFio,
} from "@/modules/fio/service";
import type { PaymentScope } from "@/modules/payments/service";

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

function safeMessage(error: unknown) {
  return error instanceof InputError
    ? error.message
    : "Spojení s bankou se nepodařilo bezpečně změnit.";
}

export async function verifyAndActivateFioAction(formData: FormData) {
  const user = await requireUser();
  const scope = paymentScope(formData);
  const path = financePath(scope);
  let message: string;
  try {
    const result = await verifyAndActivateFio({
      actorUserId: user.id,
      scope,
      bankAccountId: validateUuid(formText(formData, "bankAccountId"), "Účet"),
      token: formText(formData, "token"),
    });
    message = result.replaced
      ? "Token byl ověřen a bezpečně nahrazen. Ruční evidence zůstává dostupná."
      : `Fio synchronizace byla aktivována. ${result.initialReviewMovements} pohybů z posledních sedmi dní čeká ve frontě k posouzení.`;
  } catch (error) {
    redirect(`${path}&error=${encodeURIComponent(safeMessage(error))}`);
  }
  redirect(`${path}&success=${encodeURIComponent(message)}`);
}

export async function requestFioSyncAction(formData: FormData) {
  const user = await requireUser();
  const scope = paymentScope(formData);
  const path = financePath(scope);
  let message: string;
  try {
    const result = await requestFioSync({
      actorUserId: user.id,
      scope,
      bankAccountId: validateUuid(formText(formData, "bankAccountId"), "Účet"),
    });
    message = result.queued ? "Kontrola byla zařazena do fronty synchronizačního procesu." : "Kontrola už ve frontě čeká.";
  } catch (error) {
    redirect(`${path}&error=${encodeURIComponent(safeMessage(error))}`);
  }
  redirect(`${path}&success=${encodeURIComponent(message)}`);
}

export async function disableFioIntegrationAction(formData: FormData) {
  const user = await requireUser();
  const scope = paymentScope(formData);
  const path = financePath(scope);
  try {
    await disableFioIntegration({
      actorUserId: user.id,
      scope,
      bankAccountId: validateUuid(formText(formData, "bankAccountId"), "Účet"),
    });
  } catch (error) {
    redirect(`${path}&error=${encodeURIComponent(safeMessage(error))}`);
  }
  redirect(`${path}&success=${encodeURIComponent("Automatická synchronizace byla vypnuta a uložený token odstraněn. Ruční evidence zůstává dostupná.")}`);
}
