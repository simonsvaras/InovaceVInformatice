import { and, eq, isNull, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  auditEvents,
  invitations,
  joinRequests,
  memberships,
  notificationDeliveries,
  teamJoinCodes,
  teams,
} from "@/db/schema";
import { InputError } from "@/lib/validation";
import {
  requireClubAdminAccess,
  requireTeamManagementAccess,
} from "@/modules/authorization/service";
import {
  buildMembershipChangeEmail,
  type MembershipChangeEmailData,
} from "@/modules/memberships/email";
import {
  assertLockedTeamAccess,
  lockedTeamAccessQuery,
  type LockedTeamAccess,
} from "@/modules/memberships/service";
import {
  failRecordedDelivery,
  sendRecordedTransactionalEmail,
} from "@/modules/notifications/email";

type Database = ReturnType<typeof getDatabase>;
type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type OpenDebts = { count: number; halere: number };

type PendingNotice = {
  deliveryId: string;
  userId: string;
  email: string;
  referenceId: string;
  data: MembershipChangeEmailData;
};

const openDebtSelect = sql`
  select r.athlete_id,
         count(*)::int as open_count,
         coalesce(sum(r.amount_halere - alloc.allocated_halere), 0)::int as open_halere
  from receivables r
  cross join lateral (
    select coalesce(sum(pa.amount_halere), 0)::int as allocated_halere
    from payment_allocations pa where pa.receivable_id=r.id
  ) alloc
  where r.cancelled_at is null
    and r.amount_halere > alloc.allocated_halere
`;

async function loadOpenDebts(
  executor: Pick<Database, "execute">,
  teamId: string,
  athleteId?: string,
) {
  const rows = await executor.execute<{
    athlete_id: string;
    open_count: number;
    open_halere: number;
  }>(sql`
    ${openDebtSelect}
      and r.origin_team_id=${teamId}
      ${athleteId ? sql`and r.athlete_id=${athleteId}` : sql``}
    group by r.athlete_id
  `);
  return new Map<string, OpenDebts>(
    rows.map((row) => [row.athlete_id, { count: row.open_count, halere: row.open_halere }]),
  );
}

export async function getTeamOpenDebtSummary(userId: string, teamId: string) {
  await requireTeamManagementAccess(userId, teamId);
  return loadOpenDebts(getDatabase(), teamId);
}

export async function getAthleteOpenDebtsInTeam(
  userId: string,
  teamId: string,
  athleteIds: string[],
) {
  const rows = await getDatabase().execute<{
    athlete_id: string;
    open_count: number;
    open_halere: number;
  }>(sql`
    ${openDebtSelect}
      and r.origin_team_id=${teamId}
      and exists(
        select 1 from athlete_guardians ag
        where ag.athlete_id=r.athlete_id and ag.user_id=${userId}
      )
    group by r.athlete_id
  `);
  const wanted = new Set(athleteIds);
  return new Map<string, OpenDebts>(
    rows
      .filter((row) => wanted.has(row.athlete_id))
      .map((row) => [row.athlete_id, { count: row.open_count, halere: row.open_halere }]),
  );
}

async function createNotice(
  transaction: DbTransaction,
  input: {
    membershipId: string;
    athleteId: string;
    kind: "removed" | "moved";
    data: Omit<MembershipChangeEmailData, "kind">;
  },
): Promise<PendingNotice | null> {
  const [guardian] = await transaction.execute<{ user_id: string; email: string }>(sql`
    select u.id as user_id, u.email
    from athlete_guardians ag
    join users u on u.id=ag.user_id
    where ag.athlete_id=${input.athleteId}
    order by ag.created_at
    limit 1
  `);
  if (!guardian) return null;
  const kind = input.kind === "removed" ? "membership_removed" : "membership_moved";
  const [delivery] = await transaction
    .insert(notificationDeliveries)
    .values({
      userId: guardian.user_id,
      recipientEmail: guardian.email,
      kind,
      referenceId: input.membershipId,
      status: "pending",
    })
    .returning({ id: notificationDeliveries.id });
  return {
    deliveryId: delivery.id,
    userId: guardian.user_id,
    email: guardian.email,
    referenceId: input.membershipId,
    data: { ...input.data, kind: input.kind },
  };
}

async function sendNotice(notice: PendingNotice | null) {
  if (!notice) return;
  try {
    await sendRecordedTransactionalEmail(notice.deliveryId, {
      userId: notice.userId,
      recipient: notice.email,
      kind: notice.data.kind === "removed" ? "membership_removed" : "membership_moved",
      referenceId: notice.referenceId,
      ...buildMembershipChangeEmail(notice.data),
    });
  } catch {
    await failRecordedDelivery(notice.deliveryId, "message_build_failed");
  }
}

type ActiveMembership = {
  id: string;
  athlete_name: string;
  club_id: string;
  club_name: string;
  team_name: string;
};

async function lockActiveMembership(
  transaction: DbTransaction,
  teamId: string,
  athleteId: string,
) {
  const [membership] = await transaction.execute<ActiveMembership>(sql`
    select m.id, ath.full_name as athlete_name, c.id as club_id, c.name as club_name, t.name as team_name
    from memberships m
    join athletes ath on ath.id=m.athlete_id
    join teams t on t.id=m.team_id
    join clubs c on c.id=t.club_id
    where m.team_id=${teamId} and m.athlete_id=${athleteId} and m.ended_at is null
    for update of m
  `);
  if (!membership) {
    throw new InputError("not_member", "Sportovec už není aktivním členem týmu.");
  }
  return membership;
}

export async function leaveTeam(input: {
  actorUserId: string;
  teamId: string;
  athleteId: string;
}) {
  return getDatabase().transaction(async (transaction) => {
    const [owned] = await transaction.execute<{ allowed: boolean }>(sql`
      select exists(
        select 1 from athlete_guardians ag
        where ag.athlete_id=${input.athleteId} and ag.user_id=${input.actorUserId}
      ) as allowed
    `);
    if (!owned?.allowed) {
      throw new InputError("access_denied", "Tohoto sportovce nespravuje váš účet.");
    }
    const membership = await lockActiveMembership(transaction, input.teamId, input.athleteId);
    const openDebts = (await loadOpenDebts(transaction, input.teamId, input.athleteId)).get(input.athleteId)
      ?? { count: 0, halere: 0 };
    await transaction
      .update(memberships)
      .set({ endedAt: new Date(), endedReason: "left" })
      .where(eq(memberships.id, membership.id));
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: membership.club_id,
      teamId: input.teamId,
      eventType: "membership.left",
      targetType: "membership",
      targetId: membership.id,
      details: { openDebtCount: openDebts.count, openDebtHalere: openDebts.halere },
    });
    return { athleteName: membership.athlete_name, openDebts };
  });
}

export async function removeMember(input: {
  actorUserId: string;
  teamId: string;
  athleteId: string;
}) {
  await requireTeamManagementAccess(input.actorUserId, input.teamId);
  const result = await getDatabase().transaction(async (transaction) => {
    const [access] = await transaction.execute<LockedTeamAccess>(
      lockedTeamAccessQuery(input.actorUserId, input.teamId),
    );
    const team = assertLockedTeamAccess(access);
    const membership = await lockActiveMembership(transaction, input.teamId, input.athleteId);
    const openDebts = (await loadOpenDebts(transaction, input.teamId, input.athleteId)).get(input.athleteId)
      ?? { count: 0, halere: 0 };
    await transaction
      .update(memberships)
      .set({ endedAt: new Date(), endedReason: "removed" })
      .where(eq(memberships.id, membership.id));
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: team.club_id,
      teamId: input.teamId,
      eventType: "membership.removed",
      targetType: "membership",
      targetId: membership.id,
      details: { openDebtCount: openDebts.count, openDebtHalere: openDebts.halere },
    });
    const notice = await createNotice(transaction, {
      membershipId: membership.id,
      athleteId: input.athleteId,
      kind: "removed",
      data: {
        athleteName: membership.athlete_name,
        clubName: membership.club_name,
        teamName: membership.team_name,
        openDebtCount: openDebts.count,
        openDebtHalere: openDebts.halere,
      },
    });
    return { notice, athleteName: membership.athlete_name, openDebts };
  });
  await sendNotice(result.notice);
  return { athleteName: result.athleteName, openDebts: result.openDebts };
}

export async function transferMember(input: {
  actorUserId: string;
  teamId: string;
  targetTeamId: string;
  athleteId: string;
}) {
  if (input.teamId === input.targetTeamId) {
    throw new InputError("same_team", "Vyberte jiný cílový tým.");
  }
  const source = await requireTeamManagementAccess(input.actorUserId, input.teamId);
  await requireClubAdminAccess(input.actorUserId, source.clubId);
  const result = await getDatabase().transaction(async (transaction) => {
    // Pevné pořadí zámků podle ID týmu brání deadlocku při souběžných přesunech.
    const lockOrder = [input.teamId, input.targetTeamId].sort();
    const locked = new Map<string, { club_id: string; name: string; archived: boolean }>();
    for (const teamId of lockOrder) {
      const [row] = await transaction.execute<{ club_id: string; name: string; archived: boolean }>(sql`
        select t.club_id, t.name, (t.archived_at is not null) as archived
        from teams t where t.id=${teamId} for update of t
      `);
      if (row) locked.set(teamId, row);
    }
    const from = locked.get(input.teamId);
    const to = locked.get(input.targetTeamId);
    if (!from || !to || from.club_id !== source.clubId || to.club_id !== source.clubId) {
      throw new InputError("invalid_target", "Cílový tým musí patřit do stejného klubu.");
    }
    if (from.archived || to.archived) {
      throw new InputError("archived_team", "Archivovaný tým nelze použít pro přesun.");
    }
    const membership = await lockActiveMembership(transaction, input.teamId, input.athleteId);
    const [alreadyThere] = await transaction
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(
        eq(memberships.teamId, input.targetTeamId),
        eq(memberships.athleteId, input.athleteId),
        isNull(memberships.endedAt),
      ))
      .limit(1);
    if (alreadyThere) {
      throw new InputError("already_member", "Sportovec je už členem cílového týmu.");
    }
    const openDebts = (await loadOpenDebts(transaction, input.teamId, input.athleteId)).get(input.athleteId)
      ?? { count: 0, halere: 0 };
    const now = new Date();
    await transaction
      .update(memberships)
      .set({ endedAt: now, endedReason: "moved" })
      .where(eq(memberships.id, membership.id));
    const [created] = await transaction
      .insert(memberships)
      .values({
        teamId: input.targetTeamId,
        athleteId: input.athleteId,
        source: "transfer",
        startedAt: now,
      })
      .returning({ id: memberships.id });
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: source.clubId,
      teamId: input.teamId,
      eventType: "membership.moved",
      targetType: "membership",
      targetId: created.id,
      details: {
        fromMembershipId: membership.id,
        targetTeamId: input.targetTeamId,
        openDebtCount: openDebts.count,
        openDebtHalere: openDebts.halere,
      },
    });
    const notice = await createNotice(transaction, {
      membershipId: membership.id,
      athleteId: input.athleteId,
      kind: "moved",
      data: {
        athleteName: membership.athlete_name,
        clubName: membership.club_name,
        teamName: membership.team_name,
        targetTeamName: to.name,
        openDebtCount: openDebts.count,
        openDebtHalere: openDebts.halere,
      },
    });
    return { notice, athleteName: membership.athlete_name, targetTeamName: to.name, openDebts };
  });
  await sendNotice(result.notice);
  return {
    athleteName: result.athleteName,
    targetTeamName: result.targetTeamName,
    openDebts: result.openDebts,
  };
}

export async function getArchiveImpact(userId: string, clubId: string) {
  await requireClubAdminAccess(userId, clubId);
  const rows = await getDatabase().execute<{
    team_id: string;
    member_count: number;
    open_count: number;
    open_halere: number;
  }>(sql`
    select t.id as team_id,
           (select count(*) from memberships m where m.team_id=t.id and m.ended_at is null)::int as member_count,
           coalesce(debt.open_count, 0)::int as open_count,
           coalesce(debt.open_halere, 0)::int as open_halere
    from teams t
    left join lateral (
      select count(*)::int as open_count,
             sum(r.amount_halere - alloc.allocated_halere)::int as open_halere
      from receivables r
      cross join lateral (
        select coalesce(sum(pa.amount_halere), 0)::int as allocated_halere
        from payment_allocations pa where pa.receivable_id=r.id
      ) alloc
      where r.origin_team_id=t.id and r.cancelled_at is null
        and r.amount_halere > alloc.allocated_halere
    ) debt on true
    where t.club_id=${clubId} and t.archived_at is null
  `);
  return new Map(rows.map((row) => [row.team_id, {
    memberCount: row.member_count,
    openCount: row.open_count,
    openHalere: row.open_halere,
  }]));
}

export async function archiveTeam(input: {
  actorUserId: string;
  clubId: string;
  teamId: string;
}) {
  await requireClubAdminAccess(input.actorUserId, input.clubId);
  return getDatabase().transaction(async (transaction) => {
    const [team] = await transaction.execute<{ id: string; name: string; archived: boolean }>(sql`
      select t.id, t.name, (t.archived_at is not null) as archived
      from teams t
      where t.id=${input.teamId} and t.club_id=${input.clubId}
      for update of t
    `);
    if (!team) throw new InputError("access_denied", "Tým nepatří do tohoto klubu.");
    if (team.archived) throw new InputError("already_archived", "Tým je už archivovaný.");
    const openDebts = [...(await loadOpenDebts(transaction, input.teamId)).values()].reduce(
      (sum, debt) => ({ count: sum.count + debt.count, halere: sum.halere + debt.halere }),
      { count: 0, halere: 0 },
    );
    const now = new Date();
    const ended = await transaction
      .update(memberships)
      .set({ endedAt: now, endedReason: "archived" })
      .where(and(eq(memberships.teamId, input.teamId), isNull(memberships.endedAt)))
      .returning({ id: memberships.id });
    await transaction
      .update(joinRequests)
      .set({ status: "rejected", reviewedByUserId: input.actorUserId, reviewedAt: now })
      .where(and(eq(joinRequests.teamId, input.teamId), eq(joinRequests.status, "pending")));
    await transaction
      .update(teamJoinCodes)
      .set({ revokedAt: now })
      .where(and(eq(teamJoinCodes.teamId, input.teamId), isNull(teamJoinCodes.revokedAt)));
    await transaction
      .update(invitations)
      .set({ revokedAt: now })
      .where(and(
        eq(invitations.teamId, input.teamId),
        isNull(invitations.consumedAt),
        isNull(invitations.revokedAt),
      ));
    await transaction.update(teams).set({ archivedAt: now }).where(eq(teams.id, input.teamId));
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: input.clubId,
      teamId: input.teamId,
      eventType: "team.archived",
      targetType: "team",
      targetId: input.teamId,
      details: {
        endedMemberships: ended.length,
        openDebtCount: openDebts.count,
        openDebtHalere: openDebts.halere,
      },
    });
    return { name: team.name, endedMemberships: ended.length, openDebts };
  });
}

export async function getTransferTargets(userId: string, teamId: string) {
  const team = await requireTeamManagementAccess(userId, teamId);
  if (team.accessRole !== "admin") return [];
  return getDatabase()
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(and(eq(teams.clubId, team.clubId), isNull(teams.archivedAt), sql`${teams.id} <> ${teamId}`))
    .orderBy(teams.name);
}

export async function getArchivedTeams(userId: string, clubId: string) {
  await requireClubAdminAccess(userId, clubId);
  return getDatabase()
    .select({ id: teams.id, name: teams.name, archivedAt: teams.archivedAt })
    .from(teams)
    .where(and(eq(teams.clubId, clubId), sql`${teams.archivedAt} is not null`))
    .orderBy(teams.name);
}
