import Link from "next/link";

import { setTeamBankAccountAction } from "@/app/actions/assessments";
import {
  reviewJoinRequestAction,
  revokeInvitationAction,
} from "@/app/actions/memberships";
import { JoinCodeForm } from "@/components/join-code-form";
import { MemberInviteForm } from "@/components/member-invite-form";
import { Message } from "@/components/message";
import { getGuardianTeamFinance } from "@/modules/assessments/service";
import { requireUser } from "@/modules/auth/service";
import { requireTeamPageAccess } from "@/modules/authorization/service";
import {
  getMemberTeamDashboard,
  getTeamMembershipDashboard,
} from "@/modules/memberships/service";
import { formatCzk } from "@/modules/payments/qr";
import { debtStatusLabel } from "@/modules/payments/status";

type Query = { success?: string; error?: string; view?: string };
type ManagerTeam = Awaited<ReturnType<typeof getTeamMembershipDashboard>>;
type MemberTeam = Awaited<ReturnType<typeof getMemberTeamDashboard>>;
type MemberFinance = Awaited<ReturnType<typeof getGuardianTeamFinance>>;

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Prague",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("cs"))
    .join("");
}

function paymentKindLabel(kind: string) {
  switch (kind) {
    case "manual_claim":
      return "Ručně potvrzená úhrada";
    case "cash":
      return "Hotovost";
    case "simulated":
      return "Demo pohyb";
    case "correction":
      return "Oprava evidence";
    default:
      return "Evidovaná úhrada";
  }
}

function MemberTeamView({
  team,
  finance,
  query,
}: {
  team: MemberTeam;
  finance: MemberFinance;
  query: Query;
}) {
  const openDebts = finance.debts.filter((debt) => debt.remainingHalere > 0);
  const ownAthletes = new Set(team.managedMembers.map((member) => member.athleteId));

  return (
    <main className="dashboard-shell dashboard-home member-team-page">
      <header className="dashboard-topbar">
        <Link className="dashboard-brand" href="/prehled" aria-label="Klubio – přehled">
          <span className="dashboard-brand-mark" aria-hidden="true">K</span>
          <span>Klubio</span>
        </Link>
        <Link className="club-topbar-link" href="/prehled">Zpět na přehled</Link>
      </header>

      <section className="member-team-content">
        <Message error={query.error} success={query.success} />

        <header className="member-team-hero">
          <div className="member-team-hero-copy">
            <p>{team.clubName}</p>
            <h1>{team.name}</h1>
            <div className="member-team-coach">
              <span>Trenér</span>
              <strong>{team.coachName ?? "Zatím nepřiřazen"}</strong>
              {team.coachEmail ? <a href={`mailto:${team.coachEmail}`}>{team.coachEmail}</a> : null}
            </div>
          </div>
          <dl className="member-team-summary">
            <div>
              <dt>Členové týmu</dt>
              <dd>{team.roster.length}</dd>
            </div>
            <div>
              <dt>Vaše profily</dt>
              <dd>{team.managedMembers.length}</dd>
            </div>
            <div>
              <dt>K úhradě</dt>
              <dd>{formatCzk(openDebts.reduce((sum, debt) => sum + debt.remainingHalere, 0))}</dd>
            </div>
          </dl>
        </header>

        <div className="member-team-grid">
          <section className="member-team-payments" aria-labelledby="team-payments-title">
            <header className="member-team-section-heading">
              <div>
                <h2 id="team-payments-title">Platby k vyřízení</h2>
                <p>Předpisy se platí přímo na účet klubu nebo týmu.</p>
              </div>
              <span>{openDebts.length}</span>
            </header>

            {openDebts.length ? (
              <div className="member-team-payment-list">
                {openDebts.map((debt) => (
                  <article className="member-team-payment" key={debt.id}>
                    <div>
                      <span>{debt.athleteName}</span>
                      <h3>{debt.title}</h3>
                      <p>Splatnost {formatDate(debt.dueDate)}</p>
                    </div>
                    <div className="member-team-payment-amount">
                      <span className={debt.status === "overdue" ? "status-overdue" : "status-open"}>
                        {debtStatusLabel(debt.status)}
                      </span>
                      <strong>{formatCzk(debt.remainingHalere)}</strong>
                      {debt.allocatedHalere > 0 ? <small>Z původních {formatCzk(debt.amountHalere)}</small> : null}
                    </div>
                    <Link href={`/dluhy/${debt.id}`}>Platební údaje</Link>
                  </article>
                ))}
              </div>
            ) : (
              <div className="member-team-empty">
                <strong>V tomto týmu nemáte žádnou platbu k vyřízení.</strong>
                <span>Nové předpisy se objeví na tomto místě.</span>
              </div>
            )}
          </section>

          <aside className="member-team-roster" aria-labelledby="team-roster-title">
            <header className="member-team-section-heading">
              <div>
                <h2 id="team-roster-title">Členové týmu</h2>
                <p>Kontaktní údaje ostatních členů zůstávají skryté.</p>
              </div>
            </header>
            <ul>
              {team.roster.map((member) => (
                <li key={member.athleteId}>
                  <span aria-hidden="true">{initials(member.fullName)}</span>
                  <strong>{member.fullName}</strong>
                  {ownAthletes.has(member.athleteId) ? <small>Váš profil</small> : null}
                </li>
              ))}
            </ul>
          </aside>
        </div>

        <section className="member-team-history" aria-labelledby="team-history-title">
          <header className="member-team-section-heading">
            <div>
              <h2 id="team-history-title">Historie plateb</h2>
              <p>Evidence plateb a případných oprav pro vaše profily v tomto týmu.</p>
            </div>
          </header>

          {finance.history.length ? (
            <div className="member-team-history-list">
              {finance.history.map((event) => (
                <div className="member-team-history-row" key={`${event.eventId}-${event.athleteName}-${event.assessmentTitle}`}>
                  <span>{formatDate(event.occurredOn)}</span>
                  <div>
                    <strong>{event.assessmentTitle}</strong>
                    <small>{event.athleteName} · {paymentKindLabel(event.kind)}</small>
                  </div>
                  <strong className={event.amountHalere < 0 ? "is-correction" : ""}>
                    {formatCzk(event.amountHalere)}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="member-team-empty">
              <strong>Historie je zatím prázdná.</strong>
              <span>Po zaevidování úhrady se objeví zde.</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function ManagerTeamView({ team, query }: { team: ManagerTeam; query: Query }) {
  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <Link className="brand-link" href="/prehled">Klubio</Link>
        <Link href="/prehled">Přehled</Link>
      </header>
      <section className="content-stack">
        <div><p className="eyebrow">Správa týmu</p><h1>{team.name}</h1></div>
        <Message error={query.error} success={query.success} />
        <article className="panel">
          <h2>Předpisy a účet týmu</h2>
          <p>Týmový účet je volitelný. Není-li nastaven, předpis použije výchozí účet klubu.</p>
          <div className="button-row">
            <Link className="button-link" href={`/predpisy/novy?teamId=${team.id}`}>Nový týmový předpis</Link>
            <Link className="button-link button-secondary" href={`/finance?teamId=${team.id}`}>Platby a hlášení</Link>
          </div>
          <form action={setTeamBankAccountAction} className="form-stack inline-form">
            <input name="teamId" type="hidden" value={team.id} />
            <label>Český účet týmu<input name="accountNumber" placeholder="19-2000145399/0800" required /></label>
            <button className="button-secondary" type="submit">Uložit týmový účet</button>
          </form>
        </article>
        <article className="panel">
          <h2>Členové a žádosti</h2>
          {team.pendingRequests.length ? (
            <div className="list-stack">
              {team.pendingRequests.map((request) => (
                <section className="subcard" key={request.id}>
                  <strong>{request.fullName}{request.birthYear ? ` (${request.birthYear})` : ""}</strong>
                  <span>{request.relationship === "child" ? "Účet rodiče" : request.relationship === "self" ? "Vlastní účet" : "Spravující účet"}: {request.guardianName} · {request.guardianEmail}</span>
                  <form action={reviewJoinRequestAction} className="button-row">
                    <input name="teamId" type="hidden" value={team.id} />
                    <input name="requestId" type="hidden" value={request.id} />
                    <button name="decision" type="submit" value="approved">Schválit</button>
                    <button className="button-secondary" name="decision" type="submit" value="rejected">Zamítnout</button>
                  </form>
                </section>
              ))}
            </div>
          ) : <p>Žádná žádost nečeká na schválení.</p>}
        </article>
        <article className="panel">
          <h2>Aktivní členové</h2>
          {team.roster.length ? (
            <div className="list-stack">
              {team.roster.map((member) => (
                <section className="subcard" key={member.membershipId}>
                  <strong>{member.fullName}{member.birthYear ? ` (${member.birthYear})` : ""}</strong>
                  <span>{member.relationship === "child" ? "Účet rodiče" : member.relationship === "self" ? "Vlastní účet" : "Spravující účet"}: {member.guardianName} · {member.guardianEmail}</span>
                </section>
              ))}
            </div>
          ) : <p>Tým zatím nemá aktivní členy.</p>}
        </article>
        <article className="panel">
          <h2>E-mailové pozvánky</h2>
          <p>Každý odkaz je jednorázový, platí 48 hodin a funguje jen s pozvaným e-mailem.</p>
          <MemberInviteForm teamId={team.id} />
          {team.pendingInvitations.length ? (
            <div className="list-stack spaced-section">
              <h3>Aktivní pozvánky</h3>
              {team.pendingInvitations.map((invitation) => (
                <form action={revokeInvitationAction} className="subcard" key={invitation.id}>
                  <input name="teamId" type="hidden" value={team.id} />
                  <input name="invitationId" type="hidden" value={invitation.id} />
                  <span>{invitation.kind === "coach" ? "Trenér" : "Člen"}: {invitation.email}</span>
                  <button className="button-secondary" type="submit">Zrušit pozvánku</button>
                </form>
              ))}
            </div>
          ) : null}
        </article>
        <article className="panel">
          <h2>Sdílený týmový kód</h2>
          <p>Kód neposkytne přístup k datům. Vytvoří pouze žádost, kterou musí trenér nebo správce schválit.</p>
          <JoinCodeForm teamId={team.id} />
        </article>
      </section>
    </main>
  );
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<Query>;
}) {
  const user = await requireUser();
  const { teamId } = await params;
  const query = await searchParams;
  const access = await requireTeamPageAccess(user.id, teamId);

  if (access.hasMembership && (!access.canManage || query.view === "member")) {
    const [team, finance] = await Promise.all([
      getMemberTeamDashboard(user.id, teamId),
      getGuardianTeamFinance(user.id, teamId),
    ]);
    return <MemberTeamView finance={finance} query={query} team={team} />;
  }

  const team = await getTeamMembershipDashboard(user.id, teamId);
  return <ManagerTeamView query={query} team={team} />;
}
