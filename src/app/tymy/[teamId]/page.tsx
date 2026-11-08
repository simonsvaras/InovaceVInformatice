import { randomUUID } from "node:crypto";

import Link from "next/link";

import { setTeamBankAccountAction } from "@/app/actions/assessments";
import {
  leaveTeamAction,
  removeMemberAction,
  reviewJoinRequestAction,
  revokeInvitationAction,
  transferMemberAction,
} from "@/app/actions/memberships";
import { AppHeader } from "@/components/app-header";
import { JoinCodeForm } from "@/components/join-code-form";
import { MemberInviteForm } from "@/components/member-invite-form";
import { Message } from "@/components/message";
import { getGuardianTeamFinance } from "@/modules/assessments/service";
import { requireUser } from "@/modules/auth/service";
import { requireTeamPageAccess } from "@/modules/authorization/service";
import {
  getAthleteOpenDebtsInTeam,
  getTeamOpenDebtSummary,
  getTransferTargets,
} from "@/modules/memberships/lifecycle";
import {
  getMemberTeamDashboard,
  getTeamMembershipDashboard,
} from "@/modules/memberships/service";
import { formatCzk } from "@/modules/payments/qr";
import { getManagerFinanceDashboard } from "@/modules/payments/service";
import {
  debtStatusLabel,
  paymentConfirmedByLabel,
  paymentMethodLabel,
} from "@/modules/payments/status";

type Query = { success?: string; error?: string; view?: string };
type ManagerTeam = Awaited<ReturnType<typeof getTeamMembershipDashboard>>;
type ManagerFinance = Awaited<ReturnType<typeof getManagerFinanceDashboard>>;
type MemberTeam = Awaited<ReturnType<typeof getMemberTeamDashboard>>;
type MemberFinance = Awaited<ReturnType<typeof getGuardianTeamFinance>>;
type MemberOpenDebts = Awaited<ReturnType<typeof getTeamOpenDebtSummary>>;
type TransferTargets = Awaited<ReturnType<typeof getTransferTargets>>;

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

function MemberTeamView({
  team,
  finance,
  query,
  user,
  canManage,
  ownOpenDebts,
}: {
  team: MemberTeam;
  finance: MemberFinance;
  query: Query;
  user: { displayName: string; email: string };
  canManage: boolean;
  ownOpenDebts: MemberOpenDebts;
}) {
  const openDebts = finance.debts.filter((debt) => debt.remainingHalere > 0);
  const ownAthletes = new Set(team.managedMembers.map((member) => member.athleteId));

  return (
    <main className="dashboard-shell dashboard-home member-team-page">
      <AppHeader
        backLink={{ href: "/prehled", label: "Přehled" }}
        context={{
          kind: "Tým",
          name: team.name,
          role: "Člen / rodič",
          href: `/tymy/${team.id}?view=member`,
        }}
        navigation={[
          { href: `/tymy/${team.id}?view=member`, label: "Přehled týmu", active: true },
          { href: "#team-payments-title", label: "Moje platby" },
          { href: "#team-history-title", label: "Historie" },
          ...(canManage
            ? [{ href: `/tymy/${team.id}`, label: "Správa týmu" }]
            : []),
        ]}
        user={user}
      />

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
            {team.managedMembers.map((member) => {
              const debts = ownOpenDebts.get(member.athleteId);
              return (
                <details className="member-team-leave" key={`leave-${member.athleteId}`}>
                  <summary>Odhlásit {member.fullName} z týmu</summary>
                  <form action={leaveTeamAction} className="form-stack compact-form">
                    <input name="teamId" type="hidden" value={team.id} />
                    <input name="athleteId" type="hidden" value={member.athleteId} />
                    <p>
                      {debts
                        ? `Nezaplacené předpisy zůstanou evidované u tohoto týmu: ${debts.count} (${formatCzk(debts.halere)}). Odhlášením se nezruší.`
                        : "U tohoto týmu nemáte žádný nezaplacený předpis. Historie plateb zůstane zachována."}
                      {" "}Nové předpisy tomuto členovi vznikat nebudou.
                    </p>
                    <label className="checkbox-label"><input name="confirm" required type="checkbox" value="yes" />Potvrzuji odhlášení</label>
                    <button className="button-secondary" type="submit">Odhlásit z týmu</button>
                  </form>
                </details>
              );
            })}
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
                <div className="member-team-history-row" key={event.allocationId}>
                  <span>{formatDate(event.occurredOn)}</span>
                  <div>
                    <strong>{event.assessmentTitle}</strong>
                    <small>{event.athleteName} · {paymentMethodLabel(event.kind)}</small>
                    <small>{paymentConfirmedByLabel(event.kind, event.recordedByName)}</small>
                    {event.corrected ? <small className="is-correction-note">Opraveno protizápisem</small> : null}
                    {event.correctionReason ? <small>Důvod opravy: {event.correctionReason}</small> : null}
                    {event.kind !== "correction" && !event.corrected ? (
                      <a className="member-team-history-download" href={`/potvrzeni/${event.allocationId}`}>
                        Stáhnout potvrzení evidence
                      </a>
                    ) : null}
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

function ManagerTeamView({
  team,
  finance,
  query,
  user,
  memberOpenDebts,
  transferTargets,
}: {
  team: ManagerTeam;
  finance: ManagerFinance;
  query: Query;
  user: { displayName: string; email: string };
  memberOpenDebts: MemberOpenDebts;
  transferTargets: TransferTargets;
}) {
  const playerMap = new Map<
    string,
    {
      membershipId: string;
      athleteId: string;
      fullName: string;
      birthYear: number | null;
      guardians: Array<{
        relationship: string | null;
        name: string;
        email: string;
      }>;
    }
  >();
  for (const member of team.roster) {
    const player = playerMap.get(member.membershipId) ?? {
      membershipId: member.membershipId,
      athleteId: member.athleteId,
      fullName: member.fullName,
      birthYear: member.birthYear,
      guardians: [],
    };
    player.guardians.push({
      relationship: member.relationship,
      name: member.guardianName,
      email: member.guardianEmail,
    });
    playerMap.set(member.membershipId, player);
  }
  const players = [...playerMap.values()];
  const openDebts = finance.debts
    .filter((debt) => debt.remainingHalere > 0)
    .sort((left, right) => left.due_date.localeCompare(right.due_date));
  const paymentProgress = finance.totals.expectedHalere > 0
    ? Math.min(
        100,
        Math.max(
          0,
          (finance.totals.collectedHalere / finance.totals.expectedHalere) * 100,
        ),
      )
    : 0;

  return (
    <main className="dashboard-shell dashboard-home team-admin-page">
      <AppHeader
        backLink={{ href: "/prehled", label: "Přehled" }}
        context={{
          kind: "Tým",
          name: team.name,
          role: team.accessRole === "admin" ? "Správce klubu" : "Trenér",
          href: `/tymy/${team.id}`,
        }}
        navigation={[
          { href: `/tymy/${team.id}`, label: "Přehled týmu", active: true },
          { href: `#manager-roster-title`, label: "Hráči" },
          { href: `/finance?teamId=${team.id}`, label: "Finance" },
          { href: "#team-tools-title", label: "Nastavení" },
        ]}
        primaryAction={{
          href: `/predpisy/novy?teamId=${team.id}`,
          label: "Nový předpis",
        }}
        user={user}
      />

      <section className="team-admin-content">
        <Message error={query.error} success={query.success} />

        <header className="team-admin-hero">
          <div className="team-admin-hero-main">
            <div>
              <p>{team.clubName}</p>
              <h1>{team.name}</h1>
              <span>{team.accessRole === "admin" ? "Správa klubu a týmu" : "Trenérský přehled"}</span>
            </div>
            <div className="team-admin-hero-actions">
              <Link href={`/predpisy/novy?teamId=${team.id}`}>Vytvořit předpis</Link>
              <Link href={`/finance?teamId=${team.id}`}>Otevřít finance</Link>
              <Link href={`/platby?teamId=${team.id}`}>Příchozí platby a export</Link>
            </div>
          </div>

          <dl className="team-admin-hero-stats">
            <div><dt>Hráči</dt><dd>{players.length}</dd></div>
            <div><dt>Čekající žádosti</dt><dd>{team.pendingRequests.length}</dd></div>
            <div><dt>Aktivní pozvánky</dt><dd>{team.pendingInvitations.length}</dd></div>
          </dl>
        </header>

        <section className="team-admin-finance" aria-labelledby="team-finance-title">
          <header className="team-admin-section-heading">
            <div>
              <h2 id="team-finance-title">Platby týmu</h2>
              <p>Aktuální stav všech týmových předpisů a evidovaných úhrad.</p>
            </div>
            <Link href={`/finance?teamId=${team.id}`}>Zobrazit celý přehled</Link>
          </header>

          <div className="team-admin-finance-summary">
            <div><span>Předepsáno</span><strong>{formatCzk(finance.totals.expectedHalere)}</strong></div>
            <div><span>Evidováno</span><strong>{formatCzk(finance.totals.collectedHalere)}</strong></div>
            <div><span>Zbývá</span><strong>{formatCzk(finance.totals.remainingHalere)}</strong></div>
            <div className="team-admin-finance-progress">
              <span>{Math.round(paymentProgress)} % uhrazeno</span>
              <span><span style={{ width: `${paymentProgress}%` }} /></span>
            </div>
          </div>

          {openDebts.length ? (
            <div className="team-admin-debt-list">
              {openDebts.slice(0, 5).map((debt) => (
                <div className="team-admin-debt" key={debt.id}>
                  <span className="team-admin-avatar" aria-hidden="true">{initials(debt.athlete_name)}</span>
                  <div>
                    <strong>{debt.athlete_name}</strong>
                    <span>{debt.assessment_title} · splatnost {formatDate(debt.due_date)}</span>
                  </div>
                  <span className={debt.status === "overdue" ? "status-overdue" : "status-open"}>
                    {debtStatusLabel(debt.status)}
                  </span>
                  <strong>{formatCzk(debt.remainingHalere)}</strong>
                </div>
              ))}
              {openDebts.length > 5 ? (
                <Link className="team-admin-more" href={`/finance?teamId=${team.id}`}>
                  Zobrazit dalších {openDebts.length - 5}
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="team-admin-empty"><strong>Žádné otevřené platby.</strong><span>Všechny vystavené předpisy jsou vyřízené.</span></div>
          )}
        </section>

        <div className="team-admin-workspace">
          <section className="team-admin-roster" aria-labelledby="manager-roster-title">
            <header className="team-admin-section-heading">
              <div>
                <h2 id="manager-roster-title">Soupiska</h2>
                <p>Hráči a kontakty účtů, které jejich členství spravují.</p>
              </div>
              <span>{players.length}</span>
            </header>

            {players.length ? (
              <div className="team-admin-player-grid">
                {players.map((player) => (
                  <article className="team-admin-player" key={player.membershipId}>
                    <span className="team-admin-player-avatar" aria-hidden="true">{initials(player.fullName)}</span>
                    <div className="team-admin-player-name">
                      <h3>{player.fullName}</h3>
                      <span>{player.birthYear ? `Ročník ${player.birthYear}` : "Rok narození neuveden"}</span>
                    </div>
                    <div className="team-admin-player-contact">
                      {player.guardians.map((guardian) => (
                        <div key={guardian.email}>
                          <span>{guardian.relationship === "child" ? "Účet rodiče" : guardian.relationship === "self" ? "Vlastní účet" : "Spravující účet"}</span>
                          <strong>{guardian.name}</strong>
                          <a href={`mailto:${guardian.email}`}>{guardian.email}</a>
                        </div>
                      ))}
                    </div>
                    <div className="team-admin-player-lifecycle">
                      <span>
                        {memberOpenDebts.get(player.athleteId)
                          ? `Nezaplacené předpisy: ${memberOpenDebts.get(player.athleteId)!.count} (${formatCzk(memberOpenDebts.get(player.athleteId)!.halere)})`
                          : "Bez nezaplacených předpisů"}
                      </span>
                      <details>
                        <summary>Vyřadit z týmu</summary>
                        <form action={removeMemberAction} className="form-stack compact-form">
                          <input name="teamId" type="hidden" value={team.id} />
                          <input name="athleteId" type="hidden" value={player.athleteId} />
                          <p>Nezaplacené předpisy zůstanou u tohoto týmu a historie plateb se nemění. Rodič dostane oznámení. Nové předpisy členovi vznikat nebudou.</p>
                          <label className="checkbox-label"><input name="confirm" required type="checkbox" value="yes" />Potvrzuji vyřazení</label>
                          <button className="button-secondary" type="submit">Vyřadit z týmu</button>
                        </form>
                      </details>
                      {transferTargets.length ? (
                        <details>
                          <summary>Přesunout do jiného týmu</summary>
                          <form action={transferMemberAction} className="form-stack compact-form">
                            <input name="teamId" type="hidden" value={team.id} />
                            <input name="athleteId" type="hidden" value={player.athleteId} />
                            <p>Původní dluhy a platby zůstanou u tohoto týmu. Nové předpisy dostane člen od cílového týmu. Rodič dostane oznámení.</p>
                            <label>Cílový tým
                              <select name="targetTeamId" required>
                                {transferTargets.map((target) => (
                                  <option key={target.id} value={target.id}>{target.name}</option>
                                ))}
                              </select>
                            </label>
                            <label className="checkbox-label"><input name="confirm" required type="checkbox" value="yes" />Potvrzuji přesun</label>
                            <button className="button-secondary" type="submit">Přesunout</button>
                          </form>
                        </details>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="team-admin-empty"><strong>Soupiska je zatím prázdná.</strong><span>Pozvěte první členy e-mailem nebo týmovým kódem.</span></div>
            )}
          </section>

          <aside className="team-admin-sidebar">
            {team.pendingRequests.length ? (
              <section className="team-admin-requests" aria-labelledby="team-requests-title">
                <header className="team-admin-section-heading">
                  <div>
                    <h2 id="team-requests-title">Žádosti o vstup</h2>
                    <p>Čekají na vaše rozhodnutí.</p>
                  </div>
                  <span>{team.pendingRequests.length}</span>
                </header>
                <div className="team-admin-request-list">
                  {team.pendingRequests.map((request) => (
                    <article className="team-admin-request" key={request.id}>
                      <div>
                        <span className="team-admin-avatar" aria-hidden="true">{initials(request.fullName)}</span>
                        <div><strong>{request.fullName}</strong><span>{request.guardianEmail}</span></div>
                      </div>
                      <form action={reviewJoinRequestAction}>
                        <input name="teamId" type="hidden" value={team.id} />
                        <input name="requestId" type="hidden" value={request.id} />
                        <button name="decision" type="submit" value="approved">Přijmout</button>
                        <button className="button-secondary" name="decision" type="submit" value="rejected">Zamítnout</button>
                      </form>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="team-admin-tools" aria-labelledby="team-tools-title">
              <header className="team-admin-section-heading">
                <div><h2 id="team-tools-title">Nastavení týmu</h2><p>Vstupní kód a účet pro nové předpisy.</p></div>
              </header>

              <details className="team-admin-tool">
                <summary><span>Týmový kód</span><small>Vstup se schválením</small></summary>
                <div><p>Kód vytvoří žádost, neposkytne přímý přístup k datům.</p><JoinCodeForm teamId={team.id} /></div>
              </details>

              <details className="team-admin-tool">
                <summary>
                  <span>Účet pro předpisy</span>
                  <small>{team.hasOwnAccount ? "Vlastní účet týmu" : "Výchozí účet klubu"}</small>
                </summary>
                <form action={setTeamBankAccountAction} className="team-admin-account-form">
                  <input name="teamId" type="hidden" value={team.id} />
                  <p>Aktuálně používaný účet: <strong>{team.accountNumber || "není nastaven"}</strong></p>
                  <label>Nový český účet<input name="accountNumber" placeholder="19-2000145399/0800" required /></label>
                  <button type="submit">Uložit účet týmu</button>
                </form>
              </details>
            </section>
          </aside>
        </div>
        <section className="team-admin-invite" aria-labelledby="team-invite-title">
          <header className="team-admin-section-heading">
            <div>
              <h2 id="team-invite-title">Přidat členy</h2>
              <p>Pošlete jednorázovou pozvánku rodičům nebo hráčům.</p>
            </div>
          </header>
          <div className={`team-admin-invite-layout${team.pendingInvitations.length ? " has-invitations" : ""}`}>
            <div className="team-admin-invite-body">
              <MemberInviteForm
                initialIdempotencyKey={randomUUID()}
                teamId={team.id}
              />
            </div>
            {team.pendingInvitations.length ? (
              <div className="team-admin-invitation-list">
                <strong>Aktivní pozvánky</strong>
                {team.pendingInvitations.map((invitation) => (
                  <form action={revokeInvitationAction} key={invitation.id}>
                    <input name="teamId" type="hidden" value={team.id} />
                    <input name="invitationId" type="hidden" value={invitation.id} />
                    <span>{invitation.email}</span>
                    <button type="submit">Zrušit</button>
                  </form>
                ))}
              </div>
            ) : null}
          </div>
        </section>
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
    const ownOpenDebts = await getAthleteOpenDebtsInTeam(
      user.id,
      teamId,
      team.managedMembers.map((member) => member.athleteId),
    );
    return (
      <MemberTeamView
        canManage={access.canManage}
        finance={finance}
        ownOpenDebts={ownOpenDebts}
        query={query}
        team={team}
        user={user}
      />
    );
  }

  const [team, finance, memberOpenDebts, transferTargets] = await Promise.all([
    getTeamMembershipDashboard(user.id, teamId),
    getManagerFinanceDashboard(user.id, { teamId }),
    getTeamOpenDebtSummary(user.id, teamId),
    getTransferTargets(user.id, teamId),
  ]);
  return (
    <ManagerTeamView
      finance={finance}
      memberOpenDebts={memberOpenDebts}
      query={query}
      team={team}
      transferTargets={transferTargets}
      user={user}
    />
  );
}
