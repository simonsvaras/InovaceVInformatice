import { createHmac } from "node:crypto";

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PostgresJsTransaction } from "drizzle-orm/postgres-js";
import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import * as schema from "@/db/schema";
import {
  athleteGuardians,
  athletes,
  auditEvents,
  clubs,
  invitations,
  joinRequests,
  memberships,
  teamCoaches,
  teamJoinCodes,
  teams,
  users,
} from "@/db/schema";
import {
  createHumanCode,
  hashOpaqueToken,
} from "@/lib/tokens";
import { InputError, normalizeEmail } from "@/lib/validation";
import {
  requireClubAdminAccess,
  requireTeamManagementAccess,
  requireTeamPageAccess,
} from "@/modules/authorization/service";
import {
  absoluteAppUrl,
  sendTransactionalEmail,
} from "@/modules/notifications/email";
import { consumeRateLimit } from "@/modules/security/rate-limit";

const MEMBER_INVITATION_HOURS = 48;
const JOIN_CODE_DAYS = 30;

type AthleteInput =
  | {
      kind: "self";
      claimAthleteId?: string;
      creationKey: string;
    }
  | {
      kind: "child";
      athleteId?: string;
      fullName?: string;
      birthYear?: number;
      creationKey: string;
    };

type MembershipTransaction = PostgresJsTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type LockedTeamAccess = {
  club_id: string;
  team_name: string;
  club_name: string;
  is_admin: boolean;
  is_coach: boolean;
};

export function lockedTeamAccessQuery(actorUserId: string, teamId: string) {
  return sql<LockedTeamAccess>`
    select t.club_id,
           t.name as team_name,
           c.name as club_name,
           exists (
             select 1 from club_admins ca
             where ca.club_id = t.club_id and ca.user_id = ${actorUserId}
           ) as is_admin,
           exists (
             select 1 from team_coaches tc
             where tc.team_id = t.id
               and tc.user_id = ${actorUserId}
               and tc.ended_at is null
           ) as is_coach
    from teams t
    join clubs c on c.id = t.club_id
    where t.id = ${teamId} and t.archived_at is null
    for update of t
  `;
}

export function assertLockedTeamAccess(access: LockedTeamAccess | undefined) {
  if (!access || (!access.is_admin && !access.is_coach)) {
    throw new InputError("access_denied", "K této týmové akci nemáte oprávnění.");
  }
  return access;
}

function memberInvitationToken(input: {
  email: string;
  idempotencyKey: string;
  teamId: string;
}) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be configured.");
  return createHmac("sha256", secret)
    .update(`member-invitation:${input.teamId}:${input.idempotencyKey}:${input.email}`)
    .digest("base64url");
}

export function parseInvitationEmails(value: string): string[] {
  const rawEmails = value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const emails = [...new Set(rawEmails.map(normalizeEmail))];

  if (emails.length === 0) {
    throw new InputError("missing_emails", "Zadejte alespoň jeden e-mail.");
  }

  if (emails.length > 50) {
    throw new InputError(
      "too_many_emails",
      "V jedné dávce lze vytvořit nejvýše 50 pozvánek.",
    );
  }

  return emails;
}

export async function createMemberInvitations(input: {
  actorUserId: string;
  teamId: string;
  emails: string[];
  idempotencyKey: string;
}) {
  await requireTeamManagementAccess(input.actorUserId, input.teamId);
  const database = getDatabase();
  const expiresAt = new Date(Date.now() + MEMBER_INVITATION_HOURS * 3_600_000);
  const prepared = input.emails.map((email) => ({
    email,
    rawToken: memberInvitationToken({
      email,
      idempotencyKey: input.idempotencyKey,
      teamId: input.teamId,
    }),
  }));
  let links: Array<{ email: string; link: string }>;
  try {
    links = prepared.map((item) => ({
      email: item.email,
      link: absoluteAppUrl(`/pozvanka/${item.rawToken}`),
    }));
  } catch {
    throw new InputError(
      "public_url_misconfigured",
      "Odkaz pozvánky nelze vytvořit. Zkontrolujte nastavení veřejné adresy aplikace.",
    );
  }
  await consumeRateLimit("member_invitation", input.actorUserId, 10, 15);

  const teamContext = await database.transaction(async (transaction) => {
    const [locked] = await transaction.execute<LockedTeamAccess>(
      lockedTeamAccessQuery(input.actorUserId, input.teamId),
    );
    const context = assertLockedTeamAccess(locked);

    const existingBatch = await transaction
      .select({
        id: invitations.id,
        email: invitations.email,
        consumedAt: invitations.consumedAt,
        revokedAt: invitations.revokedAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.teamId, input.teamId),
          eq(invitations.kind, "member"),
          eq(invitations.idempotencyKey, input.idempotencyKey),
        ),
      );
    if (existingBatch.length) {
      const expectedEmails = [...input.emails].sort();
      const existingEmails = existingBatch.map((item) => item.email).sort();
      if (
        expectedEmails.length !== existingEmails.length ||
        expectedEmails.some((email, index) => email !== existingEmails[index])
      ) {
        throw new InputError(
          "idempotency_conflict",
          "Tento formulář už byl použit s jinými adresami.",
        );
      }
      if (existingBatch.some((item) => item.consumedAt || item.revokedAt)) {
        throw new InputError(
          "invitation_closed",
          "Tento požadavek už byl zpracován a pozvánka není aktivní.",
        );
      }
      const idsByEmail = new Map(existingBatch.map((item) => [item.email, item.id]));
      return {
        teamName: context.team_name,
        clubName: context.club_name,
        invitationIds: links.map((item) => idsByEmail.get(item.email)!),
      };
    }

    const invitationIds: string[] = [];
    for (const item of prepared) {
      await transaction
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(invitations.teamId, input.teamId),
            eq(invitations.kind, "member"),
            eq(invitations.email, item.email),
            isNull(invitations.consumedAt),
            isNull(invitations.revokedAt),
          ),
        );
      const [created] = await transaction
        .insert(invitations)
        .values({
          kind: "member",
          clubId: context.club_id,
          teamId: input.teamId,
          email: item.email,
          tokenHash: hashOpaqueToken(item.rawToken),
          idempotencyKey: input.idempotencyKey,
          expiresAt,
          createdByUserId: input.actorUserId,
        })
        .returning({ id: invitations.id });
      invitationIds.push(created.id);
      await transaction.insert(auditEvents).values({
        actorUserId: input.actorUserId,
        clubId: context.club_id,
        teamId: input.teamId,
        eventType: "member.invited",
        targetType: "invitation",
        targetId: created.id,
      });
    }

    return {
      teamName: context.team_name,
      clubName: context.club_name,
      invitationIds,
    };
  });

  const deliveries = await Promise.all(
    links.map(async (item, index) => {
      try {
        return await sendTransactionalEmail({
          recipient: item.email,
          kind: "member_invitation",
          referenceId: teamContext.invitationIds[index],
          subject: `Pozvání do týmu — ${teamContext.teamName}`,
          text: `Byli jste pozváni ke vstupu do týmu ${teamContext.teamName} v klubu ${teamContext.clubName}. Jednorázový odkaz platí ${MEMBER_INVITATION_HOURS} hodin: ${item.link}`,
        });
      } catch {
        return { delivered: false as const, reason: "delivery_failed" };
      }
    }),
  );

  return {
    links,
    expiresAt,
    failedEmails: links
      .filter((_item, index) => !deliveries[index]?.delivered)
      .map((item) => item.email),
  };
}

export async function generateTeamJoinCode(actorUserId: string, teamId: string) {
  await requireTeamManagementAccess(actorUserId, teamId);
  await consumeRateLimit("join_code_rotation", actorUserId, 5, 15);
  const rawCode = createHumanCode();
  const expiresAt = new Date(Date.now() + JOIN_CODE_DAYS * 86_400_000);

  await getDatabase().transaction(async (transaction) => {
    const [locked] = await transaction.execute<LockedTeamAccess>(
      lockedTeamAccessQuery(actorUserId, teamId),
    );
    const team = assertLockedTeamAccess(locked);
    await transaction
      .update(teamJoinCodes)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(teamJoinCodes.teamId, teamId),
          isNull(teamJoinCodes.revokedAt),
        ),
      );
    const [created] = await transaction
      .insert(teamJoinCodes)
      .values({
        teamId,
        codeHash: hashOpaqueToken(rawCode),
        expiresAt,
        createdByUserId: actorUserId,
      })
      .returning({ id: teamJoinCodes.id });
    await transaction.insert(auditEvents).values({
      actorUserId,
      clubId: team.club_id,
      teamId,
      eventType: "join_code.rotated",
      targetType: "join_code",
      targetId: created.id,
    });
  });

  return { code: rawCode, expiresAt };
}

export async function getOwnAthletes(userId: string) {
  return getDatabase()
    .select({
      id: athletes.id,
      fullName: athletes.fullName,
      birthYear: athletes.birthYear,
      relationship: athleteGuardians.relationship,
    })
    .from(athleteGuardians)
    .innerJoin(athletes, eq(athletes.id, athleteGuardians.athleteId))
    .where(eq(athleteGuardians.userId, userId))
    .orderBy(athletes.fullName);
}

export async function getGuardianMemberships(userId: string) {
  return getDatabase()
    .select({
      athleteId: athletes.id,
      fullName: athletes.fullName,
      birthYear: athletes.birthYear,
      relationship: athleteGuardians.relationship,
      teamId: teams.id,
      teamName: teams.name,
      clubName: clubs.name,
      coachName: users.displayName,
      coachEmail: users.email,
    })
    .from(athleteGuardians)
    .innerJoin(athletes, eq(athletes.id, athleteGuardians.athleteId))
    .leftJoin(
      memberships,
      and(
        eq(memberships.athleteId, athletes.id),
        isNull(memberships.endedAt),
      ),
    )
    .leftJoin(teams, eq(teams.id, memberships.teamId))
    .leftJoin(clubs, eq(clubs.id, teams.clubId))
    .leftJoin(
      teamCoaches,
      and(eq(teamCoaches.teamId, teams.id), isNull(teamCoaches.endedAt)),
    )
    .leftJoin(users, eq(users.id, teamCoaches.userId))
    .where(eq(athleteGuardians.userId, userId))
    .orderBy(athletes.fullName, teams.name);
}

export async function getMemberTeamDashboard(userId: string, teamId: string) {
  const access = await requireTeamPageAccess(userId, teamId);
  if (!access.hasMembership) {
    notFound();
  }

  const database = getDatabase();
  const [teamRows, roster, managedMembers] = await Promise.all([
    database
      .select({
        id: teams.id,
        name: teams.name,
        clubId: clubs.id,
        clubName: clubs.name,
        coachName: users.displayName,
        coachEmail: users.email,
      })
      .from(teams)
      .innerJoin(clubs, eq(clubs.id, teams.clubId))
      .leftJoin(
        teamCoaches,
        and(eq(teamCoaches.teamId, teams.id), isNull(teamCoaches.endedAt)),
      )
      .leftJoin(users, eq(users.id, teamCoaches.userId))
      .where(eq(teams.id, teamId))
      .limit(1),
    database
      .selectDistinct({
        athleteId: athletes.id,
        fullName: athletes.fullName,
      })
      .from(memberships)
      .innerJoin(athletes, eq(athletes.id, memberships.athleteId))
      .where(
        and(eq(memberships.teamId, teamId), isNull(memberships.endedAt)),
      )
      .orderBy(athletes.fullName),
    database
      .select({
        athleteId: athletes.id,
        fullName: athletes.fullName,
        relationship: athleteGuardians.relationship,
      })
      .from(memberships)
      .innerJoin(athletes, eq(athletes.id, memberships.athleteId))
      .innerJoin(
        athleteGuardians,
        and(
          eq(athleteGuardians.athleteId, athletes.id),
          eq(athleteGuardians.userId, userId),
        ),
      )
      .where(
        and(eq(memberships.teamId, teamId), isNull(memberships.endedAt)),
      )
      .orderBy(athletes.fullName),
  ]);

  const [team] = teamRows;
  if (!team) notFound();

  return { ...team, roster, managedMembers };
}

async function resolveOwnedAthlete(
  transaction: MembershipTransaction,
  input: {
    userId: string;
    clubId: string;
    teamId: string;
    athlete: AthleteInput;
  },
) {
  const userRows = await transaction.execute<{ display_name: string }>(sql`
    select display_name
    from users
    where id = ${input.userId}
    for update
  `);
  const user = userRows[0];
  if (!user) {
    throw new InputError("account_not_found", "Přihlášený účet už neexistuje.");
  }

  if (input.athlete.kind === "self") {
    const selfRows = await transaction.execute<{ athlete_id: string }>(sql`
      select athlete_id
      from athlete_guardians
      where user_id = ${input.userId} and relationship = 'self'
      for update
    `);
    if (selfRows[0]) {
      return selfRows[0].athlete_id;
    }

    if (input.athlete.claimAthleteId) {
      const legacyRows = await transaction.execute<{ athlete_id: string }>(sql`
        select athlete_id
        from athlete_guardians
        where athlete_id = ${input.athlete.claimAthleteId}
          and user_id = ${input.userId}
          and relationship is null
        for update
      `);
      const legacy = legacyRows[0];
      if (!legacy) {
        throw new InputError(
          "legacy_profile_not_owned",
          "Jako svůj lze označit pouze dosud nezařazený profil spravovaný vaším účtem.",
        );
      }
      await transaction
        .update(athleteGuardians)
        .set({ relationship: "self" })
        .where(
          and(
            eq(athleteGuardians.athleteId, legacy.athlete_id),
            eq(athleteGuardians.userId, input.userId),
            isNull(athleteGuardians.relationship),
          ),
        );
      await transaction.insert(auditEvents).values({
        actorUserId: input.userId,
        clubId: input.clubId,
        teamId: input.teamId,
        eventType: "athlete.legacy_claimed_as_self",
        targetType: "athlete",
        targetId: legacy.athlete_id,
      });
      return legacy.athlete_id;
    }

    const [created] = await transaction
      .insert(athletes)
      .values({
        fullName: user.display_name,
        birthYear: null,
      })
      .returning({ id: athletes.id });
    await transaction.insert(athleteGuardians).values({
      athleteId: created.id,
      userId: input.userId,
      relationship: "self",
    });
    await transaction.insert(auditEvents).values({
      actorUserId: input.userId,
      clubId: input.clubId,
      teamId: input.teamId,
      eventType: "athlete.self_created",
      targetType: "athlete",
      targetId: created.id,
    });
    return created.id;
  }

  if (input.athlete.athleteId) {
    const ownedRows = await transaction.execute<{
      athlete_id: string;
      relationship: string | null;
    }>(sql`
      select athlete_id, relationship
      from athlete_guardians
      where athlete_id = ${input.athlete.athleteId}
        and user_id = ${input.userId}
      for update
    `);
    const owned = ownedRows[0];
    if (!owned || owned.relationship === "self") {
      throw new InputError(
        "athlete_not_owned",
        "Jako dítě lze vybrat pouze vlastní profil dítěte spravovaný vaším účtem.",
      );
    }
    if (owned.relationship === null) {
      await transaction
        .update(athleteGuardians)
        .set({ relationship: "child" })
        .where(
          and(
            eq(athleteGuardians.athleteId, owned.athlete_id),
            eq(athleteGuardians.userId, input.userId),
            isNull(athleteGuardians.relationship),
          ),
        );
      await transaction.insert(auditEvents).values({
        actorUserId: input.userId,
        clubId: input.clubId,
        teamId: input.teamId,
        eventType: "athlete.legacy_classified_as_child",
        targetType: "athlete",
        targetId: owned.athlete_id,
      });
    }
    return owned.athlete_id;
  }

  if (!input.athlete.fullName) {
    throw new InputError("athlete_incomplete", "Doplňte celé jméno dítěte.");
  }

  const existingRows = await transaction.execute<{ athlete_id: string }>(sql`
    select ag.athlete_id
    from athletes a
    join athlete_guardians ag on ag.athlete_id = a.id
    where a.creation_key = ${input.athlete.creationKey}
      and ag.user_id = ${input.userId}
      and ag.relationship = 'child'
    for update of ag
  `);
  if (existingRows[0]) {
    return existingRows[0].athlete_id;
  }

  const [created] = await transaction
    .insert(athletes)
    .values({
      fullName: input.athlete.fullName,
      birthYear: input.athlete.birthYear ?? null,
      creationKey: input.athlete.creationKey,
    })
    .returning({ id: athletes.id });
  await transaction.insert(athleteGuardians).values({
    athleteId: created.id,
    userId: input.userId,
    relationship: "child",
  });
  await transaction.insert(auditEvents).values({
    actorUserId: input.userId,
    clubId: input.clubId,
    teamId: input.teamId,
    eventType: "athlete.child_created",
    targetType: "athlete",
    targetId: created.id,
  });
  return created.id;
}

export async function acceptMemberInvitation(input: {
  user: { id: string; email: string };
  rawToken: string;
  athlete: AthleteInput;
}) {
  const database = getDatabase();
  const tokenHash = hashOpaqueToken(input.rawToken);

  return database.transaction(async (transaction) => {
    const rows = await transaction.execute<{
      id: string;
      kind: string;
      club_id: string;
      team_id: string;
      email: string;
      expires_at: Date;
      consumed_at: Date | null;
      revoked_at: Date | null;
    }>(sql`
      select id, kind, club_id, team_id, email, expires_at, consumed_at, revoked_at
      from invitations
      where token_hash = ${tokenHash}
      for update
    `);
    const invitation = rows[0];

    if (
      !invitation ||
      invitation.kind !== "member" ||
      invitation.consumed_at ||
      invitation.revoked_at ||
      new Date(invitation.expires_at) <= new Date()
    ) {
      throw new InputError(
        "invalid_invitation",
        "Pozvánka je neplatná, použitá nebo vypršela.",
      );
    }

    if (invitation.email !== input.user.email) {
      throw new InputError(
        "email_mismatch",
        "Pozvánku lze použít pouze účtem se stejným e-mailem.",
      );
    }

    const athleteId = await resolveOwnedAthlete(transaction, {
      userId: input.user.id,
      clubId: invitation.club_id,
      teamId: invitation.team_id,
      athlete: input.athlete,
    });

    const [existing] = await transaction
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.teamId, invitation.team_id),
          eq(memberships.athleteId, athleteId),
          isNull(memberships.endedAt),
        ),
      )
      .limit(1);
    if (existing) {
      throw new InputError("already_member", "Sportovec už je členem týmu.");
    }

    const [membership] = await transaction
      .insert(memberships)
      .values({ teamId: invitation.team_id, athleteId, source: "email_invitation" })
      .returning({ id: memberships.id });
    await transaction
      .update(invitations)
      .set({ consumedAt: new Date(), consumedByUserId: input.user.id })
      .where(eq(invitations.id, invitation.id));
    await transaction.insert(auditEvents).values({
      actorUserId: input.user.id,
      clubId: invitation.club_id,
      teamId: invitation.team_id,
      eventType: "membership.activated_by_email",
      targetType: "membership",
      targetId: membership.id,
    });

    return { teamId: invitation.team_id, athleteId };
  });
}

export async function requestJoinByCode(input: {
  userId: string;
  normalizedCode: string;
  athlete: AthleteInput;
}) {
  const database = getDatabase();
  const codeHash = hashOpaqueToken(input.normalizedCode);

  return database.transaction(async (transaction) => {
    const codeRows = await transaction.execute<{
      id: string;
      team_id: string;
      club_id: string;
    }>(sql`
      select jc.id, jc.team_id, t.club_id
      from team_join_codes jc
      join teams t on t.id = jc.team_id
      where jc.code_hash = ${codeHash}
        and jc.revoked_at is null
        and jc.expires_at > now()
        and t.archived_at is null
      for share of t
    `);
    const code = codeRows[0];

    if (!code) {
      throw new InputError("invalid_join_code", "Týmový kód je neplatný nebo vypršel.");
    }

    const athleteId = await resolveOwnedAthlete(transaction, {
      userId: input.userId,
      clubId: code.club_id,
      teamId: code.team_id,
      athlete: input.athlete,
    });

    const [member] = await transaction
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.teamId, code.team_id),
          eq(memberships.athleteId, athleteId),
          isNull(memberships.endedAt),
        ),
      )
      .limit(1);
    if (member) {
      throw new InputError("already_member", "Sportovec už je členem týmu.");
    }

    const [pending] = await transaction
      .select({ id: joinRequests.id })
      .from(joinRequests)
      .where(
        and(
          eq(joinRequests.teamId, code.team_id),
          eq(joinRequests.athleteId, athleteId),
          eq(joinRequests.status, "pending"),
        ),
      )
      .limit(1);
    if (pending) {
      throw new InputError("request_pending", "Žádost už čeká na schválení.");
    }

    const [request] = await transaction
      .insert(joinRequests)
      .values({
        teamId: code.team_id,
        athleteId,
        guardianUserId: input.userId,
        joinCodeId: code.id,
      })
      .returning({ id: joinRequests.id });
    await transaction.insert(auditEvents).values({
      actorUserId: input.userId,
      clubId: code.club_id,
      teamId: code.team_id,
      eventType: "join_request.created",
      targetType: "join_request",
      targetId: request.id,
    });

    return { requestId: request.id };
  });
}

export async function getTeamMembershipDashboard(userId: string, teamId: string) {
  const team = await requireTeamManagementAccess(userId, teamId);
  const database = getDatabase();
  const [teamMetaRows, roster, pendingRequests, pendingInvitations] = await Promise.all([
    database
      .select({
        clubName: clubs.name,
        accountNumber: sql<string | null>`coalesce(
          (select account_number from bank_accounts where id = ${teams.bankAccountId}),
          (select account_number from bank_accounts where club_id = ${teams.clubId} and is_default = true limit 1)
        )`,
        hasOwnAccount: sql<boolean>`${teams.bankAccountId} is not null`,
      })
      .from(teams)
      .innerJoin(clubs, eq(clubs.id, teams.clubId))
      .where(eq(teams.id, teamId))
      .limit(1),
    database
      .select({
        membershipId: memberships.id,
        athleteId: athletes.id,
        fullName: athletes.fullName,
        birthYear: athletes.birthYear,
        relationship: athleteGuardians.relationship,
        guardianName: users.displayName,
        guardianEmail: users.email,
      })
      .from(memberships)
      .innerJoin(athletes, eq(athletes.id, memberships.athleteId))
      .innerJoin(
        athleteGuardians,
        eq(athleteGuardians.athleteId, athletes.id),
      )
      .innerJoin(users, eq(users.id, athleteGuardians.userId))
      .where(
        and(eq(memberships.teamId, teamId), isNull(memberships.endedAt)),
      )
      .orderBy(athletes.fullName),
    database
      .select({
        id: joinRequests.id,
        fullName: athletes.fullName,
        birthYear: athletes.birthYear,
        relationship: athleteGuardians.relationship,
        guardianName: users.displayName,
        guardianEmail: users.email,
        createdAt: joinRequests.createdAt,
      })
      .from(joinRequests)
      .innerJoin(athletes, eq(athletes.id, joinRequests.athleteId))
      .innerJoin(
        athleteGuardians,
        and(
          eq(athleteGuardians.athleteId, athletes.id),
          eq(athleteGuardians.userId, joinRequests.guardianUserId),
        ),
      )
      .innerJoin(users, eq(users.id, joinRequests.guardianUserId))
      .where(
        and(eq(joinRequests.teamId, teamId), eq(joinRequests.status, "pending")),
      )
      .orderBy(joinRequests.createdAt),
    database
      .select({
        id: invitations.id,
        kind: invitations.kind,
        email: invitations.email,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.teamId, teamId),
          isNull(invitations.consumedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
          team.accessRole === "coach"
            ? eq(invitations.kind, "member")
            : undefined,
        ),
      )
      .orderBy(invitations.createdAt),
  ]);

  const [teamMeta] = teamMetaRows;
  return {
    ...team,
    clubName: teamMeta?.clubName ?? "",
    accountNumber: teamMeta?.accountNumber ?? "",
    hasOwnAccount: teamMeta?.hasOwnAccount ?? false,
    roster,
    pendingRequests,
    pendingInvitations,
  };
}

export async function revokeInvitation(input: {
  actorUserId: string;
  teamId: string;
  invitationId: string;
}) {
  const team = await requireTeamManagementAccess(input.actorUserId, input.teamId);
  const database = getDatabase();
  const [invitation] = await database
    .select({ id: invitations.id, kind: invitations.kind })
    .from(invitations)
    .where(
      and(
        eq(invitations.id, input.invitationId),
        eq(invitations.teamId, input.teamId),
        isNull(invitations.consumedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .limit(1);

  if (!invitation) {
    throw new InputError("invitation_closed", "Pozvánka už není aktivní.");
  }

  if (invitation.kind === "coach") {
    await requireClubAdminAccess(input.actorUserId, team.clubId);
  }

  await database.transaction(async (transaction) => {
    const [locked] = await transaction.execute<LockedTeamAccess>(
      lockedTeamAccessQuery(input.actorUserId, input.teamId),
    );
    const access = assertLockedTeamAccess(locked);
    if (invitation.kind === "coach" && !access.is_admin) {
      throw new InputError("access_denied", "Trenérskou pozvánku může zrušit jen správce klubu.");
    }
    const [revoked] = await transaction
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.id, input.invitationId),
          isNull(invitations.consumedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .returning({ id: invitations.id });
    if (!revoked) {
      throw new InputError("invitation_closed", "Pozvánka už není aktivní.");
    }
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: access.club_id,
      teamId: input.teamId,
      eventType: `${invitation.kind}_invitation.revoked`,
      targetType: "invitation",
      targetId: input.invitationId,
    });
  });
}

export async function reviewJoinRequest(input: {
  actorUserId: string;
  teamId: string;
  requestId: string;
  decision: "approved" | "rejected";
}) {
  await requireTeamManagementAccess(input.actorUserId, input.teamId);

  await getDatabase().transaction(async (transaction) => {
    const [locked] = await transaction.execute<LockedTeamAccess>(
      lockedTeamAccessQuery(input.actorUserId, input.teamId),
    );
    const team = assertLockedTeamAccess(locked);
    const rows = await transaction.execute<{
      id: string;
      athlete_id: string;
      status: string;
    }>(sql`
      select id, athlete_id, status
      from join_requests
      where id = ${input.requestId} and team_id = ${input.teamId}
      for update
    `);
    const request = rows[0];

    if (!request || request.status !== "pending") {
      throw new InputError(
        "request_closed",
        "Žádost už byla vyřízena nebo neexistuje.",
      );
    }

    let membershipId: string | undefined;
    if (input.decision === "approved") {
      const [existing] = await transaction
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.teamId, input.teamId),
            eq(memberships.athleteId, request.athlete_id),
            isNull(memberships.endedAt),
          ),
        )
        .limit(1);
      if (existing) {
        throw new InputError("already_member", "Sportovec už je členem týmu.");
      }
      const [created] = await transaction
        .insert(memberships)
        .values({
          teamId: input.teamId,
          athleteId: request.athlete_id,
          source: "join_code",
        })
        .returning({ id: memberships.id });
      membershipId = created.id;
    }

    await transaction
      .update(joinRequests)
      .set({
        status: input.decision,
        reviewedByUserId: input.actorUserId,
        reviewedAt: new Date(),
      })
      .where(eq(joinRequests.id, request.id));
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: team.club_id,
      teamId: input.teamId,
      eventType: `join_request.${input.decision}`,
      targetType: membershipId ? "membership" : "join_request",
      targetId: membershipId ?? request.id,
    });
  });
}
