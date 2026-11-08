import { FileDown, QrCode } from "lucide-react";
import Link from "next/link";

import { switchCoachTeamAction } from "@/app/actions/clubs";
import { AppHeader } from "@/components/app-header";
import { Message } from "@/components/message";
import { IconLabel } from "@/components/icon-label";
import { requireUser } from "@/modules/auth/service";
import {
  getUserContexts,
  getUserTeamOverview,
} from "@/modules/clubs/service";
import { getGuardianMemberships } from "@/modules/memberships/service";
import {
  getGuardianPaymentHistory,
  getGuardianReceivables,
} from "@/modules/assessments/service";
import { formatCzk } from "@/modules/payments/qr";
import {
  debtStatusLabel,
  paymentConfirmedByLabel,
  paymentMethodLabel,
} from "@/modules/payments/status";

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

function teamCountLabel(count: number) {
  if (count === 1) return `${count} tým`;
  if (count >= 2 && count <= 4) return `${count} týmy`;
  return `${count} týmů`;
}

function activeTeamCountLabel(count: number) {
  if (count === 1) return `${count} aktivní tým`;
  if (count >= 2 && count <= 4) return `${count} aktivní týmy`;
  return `${count} aktivních týmů`;
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
  const isActive = team.isCoach && activeTeamId === team.teamId;

  return (
    <article className={`dashboard-team-tile has-actions${isActive ? " is-active" : ""}`}>
      <div className="dashboard-team-tile-top">
        <span className="dashboard-team-monogram" aria-hidden="true">
          {team.teamName.trim().charAt(0).toLocaleUpperCase("cs") || "T"}
        </span>
        <div className="dashboard-team-title">
          <div className="dashboard-team-title-heading">
            <h3>{team.teamName}</h3>
            {isActive ? <span className="dashboard-team-active">Aktivní tým</span> : null}
          </div>
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
        <Link className="dashboard-team-open" href={`/tymy/${team.teamId}`}>
          {canManage ? "Otevřít správu týmu" : "Zobrazit detail týmu"}
        </Link>
        {canManage && hasMembership ? (
          <Link className="dashboard-team-member-view" href={`/tymy/${team.teamId}?view=member`}>Členský pohled</Link>
        ) : null}
        {team.isCoach ? (
          <form action={switchCoachTeamAction}>
            <input name="teamId" type="hidden" value={team.teamId} />
            <button
              className="dashboard-team-switch"
              disabled={isActive}
              type="submit"
            >
              {isActive
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
  const [contexts, guardianMemberships, teamOverview, receivables, paymentHistory, query] = await Promise.all([
    getUserContexts(user.id),
    getGuardianMemberships(user.id),
    getUserTeamOverview(user.id),
    getGuardianReceivables(user.id),
    getGuardianPaymentHistory(user.id),
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
  const teamCount = [...clubs.values()].reduce(
    (total, club) => total + club.teams.length,
    0,
  );

  return (
    <main className="dashboard-shell dashboard-home">
      <AppHeader user={user} />

      <section className="content-stack dashboard-content">
        <Message error={query.error} success={query.success} />

        <section className="dashboard-welcome" aria-labelledby="dashboard-title">
          <div>
            <h1 id="dashboard-title">Vítejte, {user.displayName}.</h1>
            <p>{user.email}</p>
          </div>
          {clubs.size ? (
            <dl className="dashboard-welcome-summary" aria-label="Souhrn přehledu">
              <div>
                <dt>Kluby</dt>
                <dd>{clubs.size}</dd>
              </div>
              <div>
                <dt>Týmy</dt>
                <dd>{teamCount}</dd>
              </div>
            </dl>
          ) : null}
        </section>

        {!hasExistingSetup ? (
          <GettingStartedPanel isAdditional={false} />
        ) : null}

        {clubs.size ? (
          <section className="dashboard-clubs" aria-labelledby="my-clubs-title">
            <div className="dashboard-clubs-heading">
              <div>
                <h2 id="my-clubs-title">Moje kluby a týmy</h2>
                <p>Vyberte tým podle své role a pokračujte přímo do jeho přehledu.</p>
              </div>
              <span>
                {clubs.size} {clubs.size === 1 ? "klub" : clubs.size < 5 ? "kluby" : "klubů"} · {teamCountLabel(teamCount)}
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
                        <span className="dashboard-club-label">Klub</span>
                        <h3>{club.name}</h3>
                        <span className="dashboard-club-team-count">
                          {activeTeamCountLabel(club.teams.length)}
                        </span>
                      </div>
                    </div>
                    {club.isAdmin ? (
                      <Link className="dashboard-club-action" href={`/kluby/${club.id}`}>Otevřít klub</Link>
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
                    <Link className="button-link" href={`/dluhy/${debt.id}`}><IconLabel icon={QrCode}>Platební údaje a QR</IconLabel></Link>
                  </section>
                );
              })}
            </div>
          </article>
        ) : null}
        {paymentHistory.length ? (
          <article className="panel dashboard-section">
            <h2>Historie plateb</h2>
            <p>Úhrady evidované u vašich sportovců. Potvrzení dokládá pouze evidenci v aplikaci.</p>
            <div className="list-stack">
              {paymentHistory.map((event) => (
                <section className="subcard" key={event.allocationId}>
                  <strong>{event.assessmentTitle} · {formatCzk(event.amountHalere)}</strong>
                  <span>{event.athleteName} · {event.clubName} · {event.teamName ?? "celý klub"}</span>
                  <span>{event.occurredOn.split("-").reverse().join(". ")} · {paymentMethodLabel(event.kind)}</span>
                  <span>{paymentConfirmedByLabel(event.kind, event.recordedByName)}</span>
                  {event.corrected ? <span className="status-overdue">Opraveno protizápisem</span> : null}
                  {event.correctionReason ? <span>Důvod opravy: {event.correctionReason}</span> : null}
                  {event.kind !== "correction" && !event.corrected ? (
                    <a className="button-link button-secondary" href={`/potvrzeni/${event.allocationId}`}>
                      <IconLabel icon={FileDown}>Stáhnout potvrzení evidence</IconLabel>
                    </a>
                  ) : null}
                </section>
              ))}
            </div>
          </article>
        ) : null}
        {hasExistingSetup ? <GettingStartedPanel isAdditional /> : null}
      </section>
    </main>
  );
}
