"use server";

import { redirect } from "next/navigation";

import {
  formText,
  InputError,
  normalizeBankAccount,
  parseCzkAmount,
  validateDueDate,
  validateEntityName,
  validatePaymentMessage,
  validateUuid,
} from "@/lib/validation";
import {
  createAssessment,
  retryReceivableDelivery,
  setTeamBankAccount,
} from "@/modules/assessments/service";
import { requireUser } from "@/modules/auth/service";

function message(error: unknown) {
  return error instanceof InputError
    ? error.message
    : "Akci se nepodařilo dokončit. Zkuste to znovu.";
}

export async function createAssessmentAction(formData: FormData) {
  const user = await requireUser();
  const clubId = validateUuid(formText(formData, "clubId"), "Klub");
  const rawTeamId = formText(formData, "teamId");
  const teamId = rawTeamId ? validateUuid(rawTeamId, "Tým") : null;
  const returnPath = teamId
    ? `/predpisy/novy?teamId=${encodeURIComponent(teamId)}`
    : `/predpisy/novy?clubId=${encodeURIComponent(clubId)}`;
  let result: Awaited<ReturnType<typeof createAssessment>>;

  try {
    result = await createAssessment({
      actorUserId: user.id,
      clubId,
      teamId,
      title: validateEntityName(formText(formData, "title"), "Název předpisu"),
      amountHalere: parseCzkAmount(formText(formData, "amount")),
      dueDate: validateDueDate(formText(formData, "dueDate")),
      paymentMessage: validatePaymentMessage(formText(formData, "paymentMessage")),
      idempotencyKey: validateUuid(
        formText(formData, "idempotencyKey"),
        "Klíč formuláře",
      ),
      athleteIds: formData
        .getAll("athleteId")
        .filter((value): value is string => typeof value === "string")
        .map((value) => validateUuid(value, "Sportovec")),
    });
  } catch (error) {
    redirect(`${returnPath}&error=${encodeURIComponent(message(error))}`);
  }

  const success = result.created
    ? "Předpis byl vytvořen. E-mailová doručení jsou evidována samostatně."
    : "Tento formulář už byl zpracován; žádné další dluhy nevznikly.";
  redirect(`/predpisy/${result.assessmentId}?success=${encodeURIComponent(success)}`);
}

export async function setTeamBankAccountAction(formData: FormData) {
  const user = await requireUser();
  const teamId = validateUuid(formText(formData, "teamId"), "Tým");

  try {
    await setTeamBankAccount({
      actorUserId: user.id,
      teamId,
      accountNumber: normalizeBankAccount(formText(formData, "accountNumber")),
    });
  } catch (error) {
    redirect(`/tymy/${teamId}?error=${encodeURIComponent(message(error))}`);
  }

  redirect(`/tymy/${teamId}?success=${encodeURIComponent("Týmový účet byl uložen.")}`);
}

export async function retryReceivableDeliveryAction(formData: FormData) {
  const user = await requireUser();
  const assessmentId = validateUuid(
    formText(formData, "assessmentId"),
    "Předpis",
  );

  try {
    await retryReceivableDelivery({
      actorUserId: user.id,
      assessmentId,
      receivableId: validateUuid(formText(formData, "receivableId"), "Dluh"),
    });
  } catch (error) {
    redirect(`/predpisy/${assessmentId}?error=${encodeURIComponent(message(error))}`);
  }

  redirect(
    `/predpisy/${assessmentId}?success=${encodeURIComponent("Opakované doručení bylo zpracováno; stav je uveden u dluhu.")}`,
  );
}
