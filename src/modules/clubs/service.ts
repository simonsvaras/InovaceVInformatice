import { and, eq, isNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import {
  auditEvents,
  bankAccounts,
  clubAdmins,
  clubs,
  invitations,
  teamCoaches,
  teams,
  userPreferences,
  users,
} from "@/db/schema";
import { createOpaqueToken, hashOpaqueToken } from "@/lib/tokens";
import { InputError } from "@/lib/validation";
import { requireClubAdminAccess } from "@/modules/authorization/service";
import {
  absoluteAppUrl,
  sendTransactionalEmail,
} from "@/modules/notifications/email";
import { consumeRateLimit } from "@/modules/security/rate-limit";

const INVITATION_HOURS = 48;

function databaseConstraint(error: unknown, message: string): never {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  ) {
    throw new InputError("duplicate", message);
  }
  throw error;
}

export async function createClubWithFirstTeam(
  userId: string,
  input: { clubName: string; ico: string; accountNumber: string; teamName: string },
) {
  const database = getDatabase();

  try {
    return await database.transaction(async (transaction) => {
      const [club] = await transaction
        .insert(clubs)
        .values({ name: input.clubName, ico: input.ico })
        .returning({ id: clubs.id });
      await transaction.insert(clubAdmins).values({ clubId: club.id, userId });
      await transaction.insert(bankAccounts).values({
        clubId: club.id,
        accountNumber: input.accountNumber,
        isDefault: true,
        verificationMode: "manual",
      });
      const [team] = await transaction
        .insert(teams)
        .values({ clubId: club.id, name: input.teamName })
        .returning({ id: teams.id });
      await transaction.insert(auditEvents).values({
        actorUserId: userId,
        clubId: club.id,
        teamId: team.id,
        eventType: "club.created",
        targetType: "club",
        targetId: club.id,
        details: { firstTeamCreated: true },
      });
      return { clubId: club.id, teamId: team.id };
    });
  } catch (error) {
    databaseConstraint(
      error,
      "Klub s tímto IČO nebo bankovním účtem už v demu existuje.",
    );
  }
}

export async function createTeamForClub(
  actorUserId: string,
  clubId: string,
  name: string,
) {
  await requireClubAdminAccess(actorUserId, clubId);
  const database = getDatabase();

  try {
    const [team] = await database
      .insert(teams)
      .values({ clubId, name })
      .returning({ id: teams.id });
    await database.insert(auditEvents).values({
      actorUserId,
      clubId,
      teamId: team.id,
      eventType: "team.created",
      targetType: "team",
      targetId: team.id,
    });
    return team;
  } catch (error) {
    databaseConstraint(error, "Tým s tímto názvem už v klubu existuje.");
  }
}

export async function getUserContexts(userId: string) {
  const database = getDatabase();
  const [adminClubs, coachedTeams, [preference]] = await Promise.all([
    database
      .select({ id: clubs.id, name: clubs.name })
      .from(clubAdmins)
      .innerJoin(clubs, eq(clubs.id, clubAdmins.clubId))
      .where(eq(clubAdmins.userId, userId))
      .orderBy(clubs.name),
    database
      .select({
        id: teams.id,
        name: teams.name,
        clubId: clubs.id,
        clubName: clubs.name,
      })
      .from(teamCoaches)
      .innerJoin(teams, eq(teams.id, teamCoaches.teamId))
      .innerJoin(clubs, eq(clubs.id, teams.clubId))
      .where(
        and(
          eq(teamCoaches.userId, userId),
          isNull(teamCoaches.endedAt),
          isNull(teams.archivedAt),
        ),
      )
      .orderBy(clubs.name, teams.name),
    database
      .select({ activeTeamId: userPreferences.activeTeamId })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1),
  ]);

  return {
    adminClubs,
    coachedTeams,
    activeTeamId: preference?.activeTeamId ?? null,
  };
}

export async function getClubAdminDashboard(userId: string, clubId: string) {
  const club = await requireClubAdminAccess(userId, clubId);
  const database = getDatabase();
  const [account] = await database
    .select({ accountNumber: bankAccounts.accountNumber })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.clubId, clubId), eq(bankAccounts.isDefault, true)))
    .limit(1);
  const teamRows = await database
    .select({
      id: teams.id,
      name: teams.name,
      coachName: users.displayName,
      coachEmail: users.email,
    })
    .from(teams)
    .leftJoin(
      teamCoaches,
      and(eq(teamCoaches.teamId, teams.id), isNull(teamCoaches.endedAt)),
    )
    .leftJoin(users, eq(users.id, teamCoaches.userId))
    .where(and(eq(teams.clubId, clubId), isNull(teams.archivedAt)))
    .orderBy(teams.name);

  return { ...club, accountNumber: account?.accountNumber ?? "", teams: teamRows };
}

export async function inviteCoach(input: {
  actorUserId: string;
  clubId: string;
  teamId: string;
  email: string;
  replaceExisting: boolean;
}) {
  await requireClubAdminAccess(input.actorUserId, input.clubId);
  await consumeRateLimit("coach_invitation", input.actorUserId, 10, 15);
  const database = getDatabase();
  const rawToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + INVITATION_HOURS * 3_600_000);

  const invitation = await database.transaction(async (transaction) => {
    const [team] = await transaction
      .select({ id: teams.id, name: teams.name, clubName: clubs.name })
      .from(teams)
      .innerJoin(clubs, eq(clubs.id, teams.clubId))
      .where(
        and(
          eq(teams.id, input.teamId),
          eq(teams.clubId, input.clubId),
          isNull(teams.archivedAt),
        ),
      )
      .limit(1);

    if (!team) {
      notFound();
    }

    const [activeCoach] = await transaction
      .select({ id: teamCoaches.id, email: users.email })
      .from(teamCoaches)
      .innerJoin(users, eq(users.id, teamCoaches.userId))
      .where(
        and(eq(teamCoaches.teamId, input.teamId), isNull(teamCoaches.endedAt)),
      )
      .limit(1);

    if (activeCoach && !input.replaceExisting) {
      throw new InputError(
        "coach_exists",
        "Tým už má aktivního trenéra. Pro výměnu potvrďte upozornění.",
      );
    }

    if (activeCoach?.email === input.email) {
      throw new InputError("coach_same", "Tento účet už je trenérem týmu.");
    }

    await transaction
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.teamId, input.teamId),
          eq(invitations.kind, "coach"),
          isNull(invitations.consumedAt),
          isNull(invitations.revokedAt),
        ),
      );
    const [created] = await transaction
      .insert(invitations)
      .values({
        kind: "coach",
        clubId: input.clubId,
        teamId: input.teamId,
        email: input.email,
        tokenHash: hashOpaqueToken(rawToken),
        replaceExistingCoach: input.replaceExisting,
        expiresAt,
        createdByUserId: input.actorUserId,
      })
      .returning({ id: invitations.id });
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: input.clubId,
      teamId: input.teamId,
      eventType: "coach.invited",
      targetType: "invitation",
      targetId: created.id,
      details: { replaceExisting: input.replaceExisting },
    });
    return { id: created.id, teamName: team.name, clubName: team.clubName };
  });

  const link = absoluteAppUrl(`/pozvanka/${rawToken}`);
  await sendTransactionalEmail({
    recipient: input.email,
    kind: "coach_invitation",
    subject: `Pozvání trenéra — ${invitation.teamName}`,
    text: `Byli jste pozváni jako trenér týmu ${invitation.teamName} v klubu ${invitation.clubName}. Jednorázový odkaz platí ${INVITATION_HOURS} hodin: ${link}`,
  });

  return { link, expiresAt };
}

export async function getInvitationPreview(rawToken: string) {
  const [invitation] = await getDatabase()
    .select({
      kind: invitations.kind,
      email: invitations.email,
      expiresAt: invitations.expiresAt,
      consumedAt: invitations.consumedAt,
      revokedAt: invitations.revokedAt,
      teamName: teams.name,
      clubName: clubs.name,
    })
    .from(invitations)
    .innerJoin(teams, eq(teams.id, invitations.teamId))
    .innerJoin(clubs, eq(clubs.id, invitations.clubId))
    .where(eq(invitations.tokenHash, hashOpaqueToken(rawToken)))
    .limit(1);

  return invitation ?? null;
}

export async function acceptCoachInvitation(
  user: { id: string; email: string },
  rawToken: string,
) {
  const database = getDatabase();
  const tokenHash = hashOpaqueToken(rawToken);

  return database.transaction(async (transaction) => {
    const rows = await transaction.execute<{
      id: string;
      kind: string;
      club_id: string;
      team_id: string;
      email: string;
      replace_existing_coach: boolean;
      created_by_user_id: string;
      expires_at: Date;
      consumed_at: Date | null;
      revoked_at: Date | null;
    }>(sql`
      select id, kind, club_id, team_id, email, replace_existing_coach,
             created_by_user_id,
             expires_at, consumed_at, revoked_at
      from invitations
      where token_hash = ${tokenHash}
      for update
    `);
    const invitation = rows[0];

    if (
      !invitation ||
      invitation.kind !== "coach" ||
      invitation.consumed_at ||
      invitation.revoked_at ||
      new Date(invitation.expires_at) <= new Date()
    ) {
      throw new InputError(
        "invalid_invitation",
        "Pozvánka je neplatná, použitá nebo vypršela.",
      );
    }

    if (invitation.email !== user.email) {
      throw new InputError(
        "email_mismatch",
        "Pozvánku lze přijmout pouze účtem se stejným e-mailem.",
      );
    }

    await transaction.execute(sql`
      select id from teams where id = ${invitation.team_id} for update
    `);

    const [activeCoach] = await transaction
      .select({ id: teamCoaches.id, userId: teamCoaches.userId })
      .from(teamCoaches)
      .where(
        and(
          eq(teamCoaches.teamId, invitation.team_id),
          isNull(teamCoaches.endedAt),
        ),
      )
      .limit(1);

    if (activeCoach && !invitation.replace_existing_coach) {
      throw new InputError("coach_exists", "Tým už má aktivního trenéra.");
    }

    if (activeCoach) {
      await transaction
        .update(teamCoaches)
        .set({ endedAt: new Date() })
        .where(eq(teamCoaches.id, activeCoach.id));
    }

    await transaction.insert(teamCoaches).values({
      teamId: invitation.team_id,
      userId: user.id,
      invitedByUserId: invitation.created_by_user_id,
    });
    await transaction
      .update(invitations)
      .set({ consumedAt: new Date(), consumedByUserId: user.id })
      .where(eq(invitations.id, invitation.id));
    await transaction.insert(auditEvents).values({
      actorUserId: user.id,
      clubId: invitation.club_id,
      teamId: invitation.team_id,
      eventType: activeCoach ? "coach.replaced" : "coach.accepted",
      targetType: "user",
      targetId: user.id,
      details: { previousCoachEnded: Boolean(activeCoach) },
    });
    await transaction
      .insert(userPreferences)
      .values({ userId: user.id, activeTeamId: invitation.team_id })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { activeTeamId: invitation.team_id, updatedAt: new Date() },
      });

    return { teamId: invitation.team_id };
  });
}

export async function setActiveCoachTeam(userId: string, teamId: string) {
  const [allowed] = await getDatabase()
    .select({ id: teamCoaches.id })
    .from(teamCoaches)
    .innerJoin(teams, eq(teams.id, teamCoaches.teamId))
    .where(
      and(
        eq(teamCoaches.userId, userId),
        eq(teamCoaches.teamId, teamId),
        isNull(teamCoaches.endedAt),
        isNull(teams.archivedAt),
      ),
    )
    .limit(1);

  if (!allowed) {
    notFound();
  }

  await getDatabase()
    .insert(userPreferences)
    .values({ userId, activeTeamId: teamId })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { activeTeamId: teamId, updatedAt: new Date() },
    });
}
