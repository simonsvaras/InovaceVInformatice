import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
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
  createOpaqueToken,
  hashOpaqueToken,
} from "@/lib/tokens";
import { InputError, normalizeEmail } from "@/lib/validation";
import {
  requireClubAdminAccess,
  requireTeamManagementAccess,
} from "@/modules/authorization/service";
import {
  absoluteAppUrl,
  sendTransactionalEmail,
} from "@/modules/notifications/email";
import { consumeRateLimit } from "@/modules/security/rate-limit";

const MEMBER_INVITATION_HOURS = 48;
const JOIN_CODE_DAYS = 30;

type AthleteInput = {
  athleteId?: string;
  firstName?: string;
  lastName?: string;
  birthYear?: number;
};

type LockedTeamAccess = {
  club_id: string;
  team_name: string;
  club_name: string;
  is_admin: boolean;
  is_coach: boolean;
};

function lockedTeamAccessQuery(actorUserId: string, teamId: string) {
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

function assertLockedTeamAccess(access: LockedTeamAccess | undefined) {
  if (!access || (!access.is_admin && !access.is_coach)) {
    throw new InputError("access_denied", "K této týmové akci nemáte oprávnění.");
  }
  return access;
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
}) {
  await requireTeamManagementAccess(input.actorUserId, input.teamId);
  await consumeRateLimit("member_invitation", input.actorUserId, 10, 15);
  const database = getDatabase();
  const expiresAt = new Date(Date.now() + MEMBER_INVITATION_HOURS * 3_600_000);
  const prepared = input.emails.map((email) => ({
    email,
    rawToken: createOpaqueToken(),
  }));

  const teamContext = await database.transaction(async (transaction) => {
    const [locked] = await transaction.execute<LockedTeamAccess>(
      lockedTeamAccessQuery(input.actorUserId, input.teamId),
    );
    const context = assertLockedTeamAccess(locked);

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
          expiresAt,
          createdByUserId: input.actorUserId,
        })
        .returning({ id: invitations.id });
      await transaction.insert(auditEvents).values({
        actorUserId: input.actorUserId,
        clubId: context.club_id,
        teamId: input.teamId,
        eventType: "member.invited",
        targetType: "invitation",
        targetId: created.id,
      });
    }

    return { teamName: context.team_name, clubName: context.club_name };
  });

  const links = prepared.map((item) => ({
    email: item.email,
    link: absoluteAppUrl(`/pozvanka/${item.rawToken}`),
  }));

  await Promise.all(
    links.map((item) =>
      sendTransactionalEmail({
        recipient: item.email,
        kind: "member_invitation",
        subject: `Pozvání do týmu — ${teamContext.teamName}`,
        text: `Byli jste pozváni ke vstupu do týmu ${teamContext.teamName} v klubu ${teamContext.clubName}. Jednorázový odkaz platí ${MEMBER_INVITATION_HOURS} hodin: ${item.link}`,
      }),
    ),
  );

  return { links, expiresAt };
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
      firstName: athletes.firstName,
      lastName: athletes.lastName,
      birthYear: athletes.birthYear,
    })
    .from(athleteGuardians)
    .innerJoin(athletes, eq(athletes.id, athleteGuardians.athleteId))
    .where(eq(athleteGuardians.userId, userId))
    .orderBy(athletes.lastName, athletes.firstName);
}

export async function getGuardianMemberships(userId: string) {
  return getDatabase()
    .select({
      athleteId: athletes.id,
      firstName: athletes.firstName,
      lastName: athletes.lastName,
      birthYear: athletes.birthYear,
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
    .orderBy(athletes.lastName, athletes.firstName, teams.name);
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

    let athleteId = input.athlete.athleteId;

    if (athleteId) {
      const [owned] = await transaction
        .select({ id: athleteGuardians.id })
        .from(athleteGuardians)
        .where(
          and(
            eq(athleteGuardians.athleteId, athleteId),
            eq(athleteGuardians.userId, input.user.id),
          ),
        )
        .limit(1);
      if (!owned) {
        throw new InputError(
          "athlete_not_owned",
          "Lze vybrat pouze sportovce spravovaného vaším účtem.",
        );
      }
    } else {
      if (
        !input.athlete.firstName ||
        !input.athlete.lastName ||
        !input.athlete.birthYear
      ) {
        throw new InputError("athlete_incomplete", "Doplňte údaje sportovce.");
      }
      const [created] = await transaction
        .insert(athletes)
        .values({
          firstName: input.athlete.firstName,
          lastName: input.athlete.lastName,
          birthYear: input.athlete.birthYear,
        })
        .returning({ id: athletes.id });
      athleteId = created.id;
      await transaction
        .insert(athleteGuardians)
        .values({ athleteId, userId: input.user.id });
    }

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

    let athleteId = input.athlete.athleteId;

    if (athleteId) {
      const [owned] = await transaction
        .select({ id: athleteGuardians.id })
        .from(athleteGuardians)
        .where(
          and(
            eq(athleteGuardians.athleteId, athleteId),
            eq(athleteGuardians.userId, input.userId),
          ),
        )
        .limit(1);
      if (!owned) {
        throw new InputError(
          "athlete_not_owned",
          "Kód nikdy nepřiřadí existujícího sportovce cizímu účtu.",
        );
      }
    } else {
      if (
        !input.athlete.firstName ||
        !input.athlete.lastName ||
        !input.athlete.birthYear
      ) {
        throw new InputError("athlete_incomplete", "Doplňte údaje sportovce.");
      }
      const [created] = await transaction
        .insert(athletes)
        .values({
          firstName: input.athlete.firstName,
          lastName: input.athlete.lastName,
          birthYear: input.athlete.birthYear,
        })
        .returning({ id: athletes.id });
      athleteId = created.id;
      await transaction
        .insert(athleteGuardians)
        .values({ athleteId, userId: input.userId });
    }

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
  const [roster, pendingRequests, pendingInvitations] = await Promise.all([
    database
      .select({
        membershipId: memberships.id,
        athleteId: athletes.id,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        birthYear: athletes.birthYear,
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
      .orderBy(athletes.lastName, athletes.firstName),
    database
      .select({
        id: joinRequests.id,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        birthYear: athletes.birthYear,
        guardianName: users.displayName,
        guardianEmail: users.email,
        createdAt: joinRequests.createdAt,
      })
      .from(joinRequests)
      .innerJoin(athletes, eq(athletes.id, joinRequests.athleteId))
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

  return { ...team, roster, pendingRequests, pendingInvitations };
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
