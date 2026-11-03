import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import { clubAdmins, clubs, teamCoaches, teams } from "@/db/schema";

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
