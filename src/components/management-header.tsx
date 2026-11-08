import { AppHeader } from "@/components/app-header";
import {
  requireClubAdminAccess,
  requireTeamManagementAccess,
} from "@/modules/authorization/service";

export type ManagementScope =
  | { teamId: string; clubId?: never }
  | { clubId: string; teamId?: never };

export type ManagementTab = "overview" | "roster" | "settings" | "finance" | "payments";

type HeaderUser = { id: string; displayName: string; email: string };

/**
 * Jednotná hlavička správy týmu a klubu. Záložky jsou na všech stránkách stejné,
 * mění se jen aktivní, takže uživatel při přechodu mezi hráči, financemi
 * a platbami o navigaci nepřichází.
 */
export async function ManagementHeader({
  user,
  scope,
  active,
  showPrimaryAction = true,
}: {
  user: HeaderUser;
  scope: ManagementScope;
  active?: ManagementTab;
  showPrimaryAction?: boolean;
}) {
  const teamId = scope.teamId;
  const clubId = scope.clubId as string;
  const query = teamId
    ? `teamId=${encodeURIComponent(teamId)}`
    : `clubId=${encodeURIComponent(clubId)}`;

  let context: { kind: string; name: string; role: string; href: string };
  let home: string;
  if (teamId) {
    const team = await requireTeamManagementAccess(user.id, teamId);
    home = `/tymy/${team.id}`;
    context = {
      kind: "Tým",
      name: team.name,
      role: team.accessRole === "admin" ? "Správce klubu" : "Trenér",
      href: home,
    };
  } else {
    const club = await requireClubAdminAccess(user.id, clubId);
    home = `/kluby/${club.id}`;
    context = { kind: "Klub", name: club.name, role: "Správce klubu", href: home };
  }

  const items = teamId
    ? [
        { key: "overview", href: home, label: "Přehled týmu" },
        { key: "roster", href: `${home}#manager-roster-title`, label: "Hráči" },
        { key: "settings", href: `${home}#team-tools-title`, label: "Nastavení" },
        { key: "finance", href: `/finance?${query}`, label: "Finance" },
        { key: "payments", href: `/platby?${query}`, label: "Příchozí platby" },
      ]
    : [
        { key: "overview", href: home, label: "Přehled klubu" },
        { key: "roster", href: `${home}#teams-title`, label: "Týmy" },
        { key: "finance", href: `/finance?${query}`, label: "Finance" },
        { key: "payments", href: `/platby?${query}`, label: "Příchozí platby" },
      ];

  return (
    <AppHeader
      backLink={{ href: "/prehled", label: "Přehled" }}
      context={context}
      navigation={items.map((item) => ({
        href: item.href,
        label: item.label,
        active: item.key === active,
      }))}
      primaryAction={
        showPrimaryAction
          ? { href: `/predpisy/novy?${query}`, label: "Nový předpis" }
          : undefined
      }
      user={user}
    />
  );
}
