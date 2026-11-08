"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/modules/auth/service";
import {
  leaveTeam,
  removeMember,
  transferMember,
} from "@/modules/memberships/lifecycle";
import {
  acceptMemberInvitation,
  createMemberInvitations,
  generateTeamJoinCode,
  parseInvitationEmails,
  requestJoinByCode,
  revokeInvitation,
  reviewJoinRequest,
} from "@/modules/memberships/service";
import {
  formText,
  InputError,
  normalizeJoinCode,
  validateEntityName,
  validateBirthYear,
  validateUuid,
} from "@/lib/validation";

type InviteMembersState = {
  error?: string;
  links?: Array<{ email: string; link: string }>;
};

type JoinCodeState = {
  error?: string;
  code?: string;
  expiresAt?: string;
};

function message(error: unknown) {
  return error instanceof InputError
    ? error.message
    : "Akci se nepodařilo dokončit. Zkuste to znovu.";
}

function athleteFromForm(formData: FormData) {
  const kind = formText(formData, "entryKind");
  const creationKey = validateUuid(
    formText(formData, "profileCreationKey"),
    "Klíč formuláře",
  );

  if (kind === "self") {
    const claimAthleteId = formText(formData, "selfAthleteId");
    return {
      kind,
      creationKey,
      claimAthleteId: claimAthleteId
        ? validateUuid(claimAthleteId, "Profil sportovce")
        : undefined,
    } as const;
  }

  if (kind !== "child") {
    throw new InputError("invalid_entry_kind", "Vyberte, kdo vstupuje do týmu.");
  }

  const choice = formText(formData, "childAthleteId");
  if (choice !== "new") {
    return {
      kind,
      creationKey,
      athleteId: validateUuid(choice, "Profil dítěte"),
    } as const;
  }

  const rawBirthYear = formText(formData, "birthYear");
  return {
    kind,
    creationKey,
    fullName: validateEntityName(formText(formData, "fullName"), "Celé jméno", 160),
    birthYear: rawBirthYear ? validateBirthYear(rawBirthYear) : undefined,
  } as const;
}

export async function inviteMembersAction(
  _previousState: InviteMembersState,
  formData: FormData,
): Promise<InviteMembersState> {
  const user = await requireUser();

  try {
    const result = await createMemberInvitations({
      actorUserId: user.id,
      teamId: formText(formData, "teamId"),
      emails: parseInvitationEmails(formText(formData, "emails")),
    });
    return { links: result.links };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function generateJoinCodeAction(
  _previousState: JoinCodeState,
  formData: FormData,
): Promise<JoinCodeState> {
  const user = await requireUser();

  try {
    const result = await generateTeamJoinCode(
      user.id,
      formText(formData, "teamId"),
    );
    return {
      code: result.code,
      expiresAt: result.expiresAt.toISOString(),
    };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function acceptMemberInvitationAction(formData: FormData) {
  const user = await requireUser();
  const token = formText(formData, "token");

  try {
    await acceptMemberInvitation({
      user,
      rawToken: token,
      athlete: athleteFromForm(formData),
    });
  } catch (error) {
    redirect(
      `/pozvanka/${encodeURIComponent(token)}?error=${encodeURIComponent(message(error))}`,
    );
  }

  redirect(`/prehled?success=${encodeURIComponent("Členství bylo z pozvánky rovnou aktivováno.")}`);
}

export async function requestJoinByCodeAction(formData: FormData) {
  const user = await requireUser();

  try {
    await requestJoinByCode({
      userId: user.id,
      normalizedCode: normalizeJoinCode(formText(formData, "joinCode")),
      athlete: athleteFromForm(formData),
    });
  } catch (error) {
    redirect(`/vstup?error=${encodeURIComponent(message(error))}`);
  }

  redirect(`/prehled?success=${encodeURIComponent("Žádost čeká na schválení trenérem.")}`);
}

export async function reviewJoinRequestAction(formData: FormData) {
  const user = await requireUser();
  const teamId = formText(formData, "teamId");

  try {
    const decision = formText(formData, "decision");
    if (decision !== "approved" && decision !== "rejected") {
      throw new InputError("invalid_decision", "Neplatné rozhodnutí.");
    }
    await reviewJoinRequest({
      actorUserId: user.id,
      teamId,
      requestId: formText(formData, "requestId"),
      decision,
    });
  } catch (error) {
    redirect(`/tymy/${teamId}?error=${encodeURIComponent(message(error))}`);
  }

  redirect(`/tymy/${teamId}?success=${encodeURIComponent("Žádost byla vyřízena.")}`);
}

export async function revokeInvitationAction(formData: FormData) {
  const user = await requireUser();
  const teamId = formText(formData, "teamId");

  try {
    await revokeInvitation({
      actorUserId: user.id,
      teamId,
      invitationId: formText(formData, "invitationId"),
    });
  } catch (error) {
    redirect(`/tymy/${teamId}?error=${encodeURIComponent(message(error))}`);
  }

  redirect(`/tymy/${teamId}?success=${encodeURIComponent("Pozvánka byla zrušena.")}`);
}

function debtNote(openDebts: { count: number; halere: number }) {
  if (!openDebts.count) return "";
  const amount = new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
  }).format(openDebts.halere / 100);
  return ` Nezaplacené předpisy zůstávají evidované: ${openDebts.count} (${amount}).`;
}

function requireConfirmation(formData: FormData) {
  if (formText(formData, "confirm") !== "yes") {
    throw new InputError("confirm_required", "Potvrďte změnu členství.");
  }
}

export async function leaveTeamAction(formData: FormData) {
  const user = await requireUser();
  const teamId = validateUuid(formText(formData, "teamId"), "Tým");
  let success: string;
  try {
    requireConfirmation(formData);
    const result = await leaveTeam({
      actorUserId: user.id,
      teamId,
      athleteId: validateUuid(formText(formData, "athleteId"), "Sportovec"),
    });
    success = `${result.athleteName} byl(a) odhlášen(a) z týmu.${debtNote(result.openDebts)}`;
  } catch (error) {
    redirect(`/tymy/${teamId}?error=${encodeURIComponent(message(error))}`);
  }
  redirect(`/prehled?success=${encodeURIComponent(success)}`);
}

export async function removeMemberAction(formData: FormData) {
  const user = await requireUser();
  const teamId = validateUuid(formText(formData, "teamId"), "Tým");
  let success: string;
  try {
    requireConfirmation(formData);
    const result = await removeMember({
      actorUserId: user.id,
      teamId,
      athleteId: validateUuid(formText(formData, "athleteId"), "Sportovec"),
    });
    success = `${result.athleteName} byl(a) vyřazen(a) z týmu. Rodič dostane oznámení.${debtNote(result.openDebts)}`;
  } catch (error) {
    redirect(`/tymy/${teamId}?error=${encodeURIComponent(message(error))}`);
  }
  redirect(`/tymy/${teamId}?success=${encodeURIComponent(success)}`);
}

export async function transferMemberAction(formData: FormData) {
  const user = await requireUser();
  const teamId = validateUuid(formText(formData, "teamId"), "Tým");
  let success: string;
  try {
    requireConfirmation(formData);
    const result = await transferMember({
      actorUserId: user.id,
      teamId,
      targetTeamId: validateUuid(formText(formData, "targetTeamId"), "Cílový tým"),
      athleteId: validateUuid(formText(formData, "athleteId"), "Sportovec"),
    });
    success = `${result.athleteName} byl(a) přesunut(a) do týmu ${result.targetTeamName}.${debtNote(result.openDebts)}`;
  } catch (error) {
    redirect(`/tymy/${teamId}?error=${encodeURIComponent(message(error))}`);
  }
  redirect(`/tymy/${teamId}?success=${encodeURIComponent(success)}`);
}
