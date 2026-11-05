import { and, eq, isNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import {
  athleteGuardians,
  clubAdmins,
  clubs,
  memberships,
  teamCoaches,
  teams,
} from "@/db/schema";

export async function requireClubAdminAccess(userId: string, clubId: string) {
  const [club] = await getDatabase()
    .select({ id: clubs.id, name: clubs.name, ico: clubs.ico })
    .from(clubAdmins)
    .innerJoin(clubs, eq(clubs.id, clubAdmins.clubId))
    .where(and(eq(clubAdmins.userId, userId), eq(clubAdmins.clubId, clubId)))
    .limit(1);

  if (!club) {
    notFound();
  }

  return club;
}

export async function requireTeamManagementAccess(userId: string, teamId: string) {
  const [team] = await getDatabase()
    .select({
      id: teams.id,
      clubId: teams.clubId,
      name: teams.name,
      adminAccessId: clubAdmins.id,
      coachAccessId: teamCoaches.id,
    })
    .from(teams)
    .leftJoin(
      clubAdmins,
      and(eq(clubAdmins.clubId, teams.clubId), eq(clubAdmins.userId, userId)),
    )
    .leftJoin(
      teamCoaches,
      and(
        eq(teamCoaches.teamId, teams.id),
        eq(teamCoaches.userId, userId),
        isNull(teamCoaches.endedAt),
      ),
    )
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team || (!team.adminAccessId && !team.coachAccessId)) {
    notFound();
  }

  return {
    id: team.id,
    clubId: team.clubId,
    name: team.name,
    accessRole: team.adminAccessId ? ("admin" as const) : ("coach" as const),
  };
}

export async function requireTeamPageAccess(userId: string, teamId: string) {
  const [team] = await getDatabase()
    .select({
      id: teams.id,
      clubId: teams.clubId,
      name: teams.name,
      adminAccessId: clubAdmins.id,
      coachAccessId: teamCoaches.id,
      memberAccess: sql<boolean>`exists(
        select 1
        from ${memberships} member_access
        join ${athleteGuardians} guardian_access
          on guardian_access.athlete_id = member_access.athlete_id
        where member_access.team_id = ${teams.id}
          and member_access.ended_at is null
          and guardian_access.user_id = ${userId}
      )`,
    })
    .from(teams)
    .leftJoin(
      clubAdmins,
      and(eq(clubAdmins.clubId, teams.clubId), eq(clubAdmins.userId, userId)),
    )
    .leftJoin(
      teamCoaches,
      and(
        eq(teamCoaches.teamId, teams.id),
        eq(teamCoaches.userId, userId),
        isNull(teamCoaches.endedAt),
      ),
    )
    .where(eq(teams.id, teamId))
    .limit(1);

  if (
    !team ||
    (!team.adminAccessId && !team.coachAccessId && !team.memberAccess)
  ) {
    notFound();
  }

  return {
    id: team.id,
    clubId: team.clubId,
    name: team.name,
    canManage: Boolean(team.adminAccessId || team.coachAccessId),
    hasMembership: team.memberAccess,
    accessRole: team.adminAccessId
      ? ("admin" as const)
      : team.coachAccessId
        ? ("coach" as const)
        : ("member" as const),
  };
}
