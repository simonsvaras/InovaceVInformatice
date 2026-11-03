"use server";

import { redirect } from "next/navigation";

import {
  acceptCoachInvitation,
  createClubWithFirstTeam,
  createTeamForClub,
  inviteCoach,
  setActiveCoachTeam,
} from "@/modules/clubs/service";
import { requireUser } from "@/modules/auth/service";
import {
  formText,
  InputError,
  normalizeBankAccount,
  normalizeEmail,
  validateEntityName,
  validateIco,
} from "@/lib/validation";

function message(error: unknown) {
  return error instanceof InputError
    ? error.message
    : "Akci se nepodařilo dokončit. Zkuste to znovu.";
}

export async function createClubAction(formData: FormData) {
  const user = await requireUser();
  let clubId: string;

  try {
    const result = await createClubWithFirstTeam(user.id, {
      clubName: validateEntityName(formText(formData, "clubName"), "Název klubu"),
      ico: validateIco(formText(formData, "ico")),
      accountNumber: normalizeBankAccount(formText(formData, "accountNumber")),
      teamName: validateEntityName(formText(formData, "teamName"), "Název týmu"),
    });
    clubId = result.clubId;
  } catch (error) {
    redirect(`/kluby/novy?error=${encodeURIComponent(message(error))}`);
  }

  redirect(`/kluby/${clubId}?success=${encodeURIComponent("Klub a první tým byly založeny.")}`);
}

export async function createTeamAction(formData: FormData) {
  const user = await requireUser();
  const clubId = formText(formData, "clubId");

  try {
    await createTeamForClub(
      user.id,
      clubId,
      validateEntityName(formText(formData, "teamName"), "Název týmu"),
    );
  } catch (error) {
    redirect(`/kluby/${clubId}?error=${encodeURIComponent(message(error))}`);
  }

  redirect(`/kluby/${clubId}?success=${encodeURIComponent("Tým byl vytvořen.")}`);
}

export async function inviteCoachAction(formData: FormData) {
  const user = await requireUser();
  const clubId = formText(formData, "clubId");
  let inviteLink: string;

  try {
    const result = await inviteCoach({
      actorUserId: user.id,
      clubId,
      teamId: formText(formData, "teamId"),
      email: normalizeEmail(formText(formData, "email")),
      replaceExisting: formData.get("replaceExisting") === "on",
    });
    inviteLink = result.link;
  } catch (error) {
    redirect(`/kluby/${clubId}?error=${encodeURIComponent(message(error))}`);
  }

  redirect(
    `/kluby/${clubId}?success=${encodeURIComponent("Pozvánka trenéra byla vytvořena.")}&inviteLink=${encodeURIComponent(inviteLink)}`,
  );
}

export async function acceptCoachInvitationAction(formData: FormData) {
  const user = await requireUser();
  const token = formText(formData, "token");
  let teamId: string;

  try {
    const result = await acceptCoachInvitation(user, token);
    teamId = result.teamId;
  } catch (error) {
    redirect(
      `/pozvanka/${encodeURIComponent(token)}?error=${encodeURIComponent(message(error))}`,
    );
  }

  redirect(`/tymy/${teamId}?success=${encodeURIComponent("Pozvánka trenéra byla přijata.")}`);
}

export async function switchCoachTeamAction(formData: FormData) {
  const user = await requireUser();
  const teamId = formText(formData, "teamId");
  await setActiveCoachTeam(user.id, teamId);
  redirect(`/tymy/${teamId}`);
}
