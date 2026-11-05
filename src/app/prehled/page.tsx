import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import { switchCoachTeamAction } from "@/app/actions/clubs";
import { Message } from "@/components/message";
import { requireUser } from "@/modules/auth/service";
import {
  getUserContexts,
  getUserTeamOverview,
} from "@/modules/clubs/service";
import { getGuardianMemberships } from "@/modules/memberships/service";
import { getGuardianReceivables } from "@/modules/assessments/service";
import { formatCzk } from "@/modules/payments/qr";
import { debtStatusLabel } from "@/modules/payments/status";

function GettingStartedPanel({
  isAdditional,
}: {
  isAdditional: boolean;
}) {
  return (
    <article className="dashboard-start">
      <div className="dashboard-start-heading">
        <h2>
          {isAdditional ? "Přidat další klub nebo tým" : "Jak chcete začít?"}
        </h2>
        <p>
          Vyberte cestu podle své role v klubu. Další nastavení vás provede krok
          za krokem.
        </p>
      </div>

      <div className="dashboard-start-body">
        <div className="dashboard-start-options">
          <Link className="dashboard-start-option" href="/kluby/novy">
            <span className="dashboard-start-copy">
              <strong>Založit klub</strong>
              <span>Pro správce, který nastavuje klub a první tým.</span>
            </span>
            <span className="dashboard-start-action">Začít nastavení</span>
          </Link>

          <Link className="dashboard-start-option" href="/vstup">
            <span className="dashboard-start-copy">
              <strong>Vstoupit do týmu</strong>
              <span>Pro rodiče, členy a trenéry s týmovým kódem.</span>
            </span>
            <span className="dashboard-start-action">Použít kód</span>
          </Link>
        </div>

        <p className="dashboard-invite-note">
          Máte e-mailovou pozvánku? Otevřete odkaz přímo z e-mailu.
        </p>
      </div>
    </article>
  );
}

type TeamOverview = Awaited<ReturnType<typeof getUserTeamOverview>>[number];

function teamRoles(team: TeamOverview) {
  const roles: string[] = [];

  if (team.isClubAdmin) roles.push("Vlastník klubu");
  if (team.isCoach) roles.push("Trenér");
  if (team.isSelfMember) roles.push("Člen");
  if (team.isGuardian) roles.push("Rodič člena");

  return roles;
}

function TeamTile({
  team,
  activeTeamId,
}: {
  team: TeamOverview;
  activeTeamId: string | null;
}) {
  const canManage = team.isClubAdmin || team.isCoach;
  const hasMembership = team.isSelfMember || team.isGuardian;
  const roles = teamRoles(team);

  return (
    <article className="dashboard-team-tile has-actions">
      <div className="dashboard-team-tile-top">
        <span className="dashboard-team-monogram" aria-hidden="true">
          {team.teamName.trim().charAt(0).toLocaleUpperCase("cs") || "T"}
        </span>
        <div className="dashboard-team-title">
          <h3>{team.teamName}</h3>
          <div className="dashboard-team-roles" aria-label="Vztah k týmu">
            {roles.map((role) => (
              <span key={role}>{role}</span>
            ))}
          </div>
        </div>
      </div>

      <dl className="dashboard-team-facts">
        <div>
          <dt>Členové</dt>
          <dd>{team.memberCount}</dd>
        </div>
        <div>
          <dt>Trenér</dt>
          <dd>{team.coachName ?? "Zatím nepřiřazen"}</dd>
        </div>
      </dl>

      <div className="dashboard-team-actions">
        <Link href={`/tymy/${team.teamId}`}>
          {canManage ? "Otevřít správu týmu" : "Zobrazit detail týmu"}
        </Link>
        {canManage && hasMembership ? (
          <Link href={`/tymy/${team.teamId}?view=member`}>Členský pohled</Link>
        ) : null}
        {team.isCoach ? (
          <form action={switchCoachTeamAction}>
            <input name="teamId" type="hidden" value={team.teamId} />
            <button
              className="dashboard-team-switch"
              disabled={activeTeamId === team.teamId}
              type="submit"
            >
              {activeTeamId === team.teamId
                ? "Aktivní tým"
                : "Nastavit jako aktivní"}
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const user = await requireUser();
  const [contexts, guardianMemberships, teamOverview, receivables, query] = await Promise.all([
    getUserContexts(user.id),
    getGuardianMemberships(user.id),
    getUserTeamOverview(user.id),
    getGuardianReceivables(user.id),
    searchParams,
  ]);
  const hasExistingSetup =
    contexts.adminClubs.length > 0 ||
    contexts.coachedTeams.length > 0 ||
    guardianMemberships.length > 0;
  const clubs = new Map<
    string,
    { id: string; name: string; isAdmin: boolean; teams: TeamOverview[] }
  >();

  for (const club of contexts.adminClubs) {
    clubs.set(club.id, {
      id: club.id,
      name: club.name,
      isAdmin: true,
      teams: [],
    });
  }

  for (const team of teamOverview) {
    const club = clubs.get(team.clubId) ?? {
      id: team.clubId,
      name: team.clubName,
      isAdmin: team.isClubAdmin,
      teams: [],
    };
    club.teams.push(team);
    club.isAdmin ||= team.isClubAdmin;
    clubs.set(team.clubId, club);
  }

  return (
    <main className="dashboard-shell dashboard-home">
      <header className="dashboard-topbar">
        <Link
          className="dashboard-brand"
          href="/prehled"
          aria-label="Klubio – přehled"
        >
          <span className="dashboard-brand-mark" aria-hidden="true">
            K
          </span>
          <span>Klubio</span>
        </Link>

        <div className="dashboard-account">
          <span>{user.email}</span>
          <form action={logoutAction}>
            <button className="dashboard-logout" type="submit">
              Odhlásit se
            </button>
          </form>
        </div>
      </header>

      <section className="content-stack dashboard-content">
        <Message error={query.error} success={query.success} />

        <section className="dashboard-welcome" aria-labelledby="dashboard-title">
          <h1 id="dashboard-title">Vítejte, {user.displayName}.</h1>
          <p>{user.email}</p>
        </section>

        {!hasExistingSetup ? (
          <GettingStartedPanel isAdditional={false} />
        ) : null}

        {clubs.size ? (
          <section className="dashboard-clubs" aria-labelledby="my-clubs-title">
            <div className="dashboard-clubs-heading">
              <div>
                <h2 id="my-clubs-title">Moje kluby</h2>
                <p>Všechny týmy, ve kterých máte roli nebo spravujete člena.</p>
              </div>
              <span>
                {clubs.size} {clubs.size === 1 ? "klub" : clubs.size < 5 ? "kluby" : "klubů"}
              </span>
            </div>

            <div className="dashboard-club-list">
              {[...clubs.values()].map((club) => (
                <article className="dashboard-club" key={club.id}>
                  <header className="dashboard-club-header">
                    <div className="dashboard-club-identity">
                      <span className="dashboard-club-mark" aria-hidden="true">
                        {club.name.trim().charAt(0).toLocaleUpperCase("cs") || "K"}
                      </span>
                      <div>
                        <span>{club.teams.length} {club.teams.length === 1 ? "tým" : club.teams.length < 5 ? "týmy" : "týmů"}</span>
                        <h3>{club.name}</h3>
                      </div>
                    </div>
                    {club.isAdmin ? (
                      <Link href={`/kluby/${club.id}`}>Správa klubu</Link>
                    ) : null}
                  </header>

                  {club.teams.length ? (
                    <div className="dashboard-team-grid">
                      {club.teams.map((team) => (
                        <TeamTile
                          activeTeamId={contexts.activeTeamId}
                          key={team.teamId}
                          team={team}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="dashboard-club-empty">Klub zatím nemá aktivní tým.</p>
                  )}
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {receivables.length ? (
          <article className="panel dashboard-section">
            <h2>Dluhy a platební údaje</h2>
            <p>Seřazeno podle nejbližší splatnosti. Platíte přímo na účet klubu nebo týmu.</p>
            <div className="card-grid">
              {receivables.map((debt) => {
                return (
                  <section className="subcard" key={debt.id}>
                    <strong>{debt.title}</strong>
                    <span>{debt.athleteName}</span>
                    <span>{debt.clubName} · {debt.teamName ?? "celý klub"}</span>
                    <span>{formatCzk(debt.amountHalere)} · evidováno {formatCzk(debt.allocatedHalere)} · zbývá {formatCzk(debt.remainingHalere)}</span>
                    <span className={debt.status === "overdue" ? "status-overdue" : "status-open"}>{debtStatusLabel(debt.status)}</span>
                    <Link className="button-link" href={`/dluhy/${debt.id}`}>Platební údaje a QR</Link>
                  </section>
                );
              })}
            </div>
          </article>
        ) : null}
        {hasExistingSetup ? <GettingStartedPanel isAdditional /> : null}
      </section>
    </main>
  );
}
