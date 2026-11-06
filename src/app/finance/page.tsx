import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  allocateSimulatedTransactionAction,
  ignoreSimulatedTransactionAction,
  linkSimulatedTransactionAction,
  markSimulatedTransactionDifferentAction,
} from "@/app/actions/bank-simulator";
import { FioSyncAccount } from "@/app/finance/fio-sync-account";
import {
  recordCashPaymentAction,
  reversePaymentEventAction,
  reviewPaymentClaimsAction,
  sendBulkRemindersAction,
} from "@/app/actions/payments";
import { AppHeader } from "@/components/app-header";
import { Message } from "@/components/message";
import { formatDateTimeInPrague, todayInPrague } from "@/lib/dates";
import { requireUser } from "@/modules/auth/service";
import { getBankReconciliationDashboard } from "@/modules/bank-simulator/service";
import { formatCzk } from "@/modules/payments/qr";
import { getManagerFinanceDashboard, type PaymentScope } from "@/modules/payments/service";
import { debtStatusLabel } from "@/modules/payments/status";

function ScopeFields({ scope }: { scope: PaymentScope }) {
  return (
    <>
      <input name="teamId" type="hidden" value={scope.teamId ?? ""} />
      <input name="clubId" type="hidden" value={scope.clubId ?? ""} />
    </>
  );
}

function reconciliationReason(code: string) {
  return ({
    invalid_vs: "chybí platný VS",
    unknown_vs: "VS nepatří jednoznačně oprávněnému dluhu",
    ambiguous_vs: "VS odpovídá více dluhům",
    amount_mismatch: "částka neodpovídá zbývající částce",
    already_paid: "dluh už je podle evidence uhrazen",
    pending_claim: "čeká rodičovské hlášení",
    possible_manual_duplicate: "možná shoda s ručně evidovanou úhradou",
    reviewed_distinct: "oprávněná osoba potvrdila, že jde o další platbu",
    manager_allocated: "část pohybu byla ručně přiřazena",
    allocation_corrected: "původní demo přiřazení bylo opraveno protizápisem",
    linked_event_corrected: "spojená ruční událost byla opravena protizápisem",
    initial_import_review: "počáteční sedmidenní import čeká na kontrolu",
    negative_transaction: "záporný nebo opravný pohyb vyžaduje ruční kontrolu",
    negative_possible_reversal: "možné storno dříve přiřazeného pohybu",
    non_czk: "pohyb není v CZK",
  } as Record<string, string>)[code] ?? code;
}

function paymentEventLabel(kind: string) {
  if (kind === "cash") return "Hotovost";
  if (kind === "simulated") return "Demo pohyb (simulated)";
  if (kind === "fio") return "Pohyb načtený z Fio API";
  return "Potvrzené hlášení";
}

function formatDueDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Prague",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function isoTimestamp(value: Date | string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("cs"))
    .join("");
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{
    teamId?: string;
    clubId?: string;
    unpaid?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  if ((!query.teamId && !query.clubId) || (query.teamId && query.clubId)) notFound();
  const scope: PaymentScope = query.teamId
    ? { teamId: query.teamId }
    : { clubId: query.clubId! };
  const [dashboard, bankDashboard] = await Promise.all([
    getManagerFinanceDashboard(user.id, scope),
    getBankReconciliationDashboard(user.id, scope),
  ]);
  const onlyUnpaid = query.unpaid === "1";
  const visibleDebts = onlyUnpaid
    ? dashboard.debts.filter((debt) => debt.remainingHalere > 0)
    : dashboard.debts;
  const assessments = Array.from(
    new Map(
      visibleDebts.map((debt) => [
        debt.assessment_id,
        { id: debt.assessment_id, title: debt.assessment_title },
      ]),
    ).values(),
  );
  const athletes = Array.from(
    new Map(
      visibleDebts.map((debt) => [
        debt.athlete_id,
        { id: debt.athlete_id, name: debt.athlete_name },
      ]),
    ).values(),
  );
  const scopeQuery = "teamId" in scope
    ? `teamId=${encodeURIComponent(scope.teamId!)}`
    : `clubId=${encodeURIComponent(scope.clubId!)}`;
  const back = "teamId" in scope ? `/tymy/${scope.teamId!}` : `/kluby/${scope.clubId!}`;
  const today = todayInPrague();
  const assessmentMap = new Map<
    string,
    {
      id: string;
      title: string;
      dueDate: string;
      teamNames: Set<string>;
      amounts: Set<number>;
      expectedHalere: number;
      collectedHalere: number;
      settledCount: number;
      recipientCount: number;
    }
  >();

  for (const debt of dashboard.debts) {
    const current = assessmentMap.get(debt.assessment_id) ?? {
      id: debt.assessment_id,
      title: debt.assessment_title,
      dueDate: debt.due_date,
      teamNames: new Set<string>(),
      amounts: new Set<number>(),
      expectedHalere: 0,
      collectedHalere: 0,
      settledCount: 0,
      recipientCount: 0,
    };
    if (debt.team_name) current.teamNames.add(debt.team_name);
    current.amounts.add(debt.amount_halere);
    current.expectedHalere += debt.amount_halere;
    current.collectedHalere += debt.allocated_halere;
    current.recipientCount += 1;
    if (debt.remainingHalere <= 0) current.settledCount += 1;
    assessmentMap.set(debt.assessment_id, current);
  }

  const assessmentRows = Array.from(assessmentMap.values()).sort((left, right) =>
    left.dueDate.localeCompare(right.dueDate),
  );
  const collectionPercentage = dashboard.totals.expectedHalere > 0
    ? (dashboard.totals.collectedHalere / dashboard.totals.expectedHalere) * 100
    : 0;
  const collectionRate = Math.min(100, Math.max(0, collectionPercentage));

  return (
    <main className="dashboard-shell dashboard-home finance-admin-page">
      <AppHeader
        backLink={{ href: back, label: "Zpět" }}
        context={{
          kind: "teamId" in scope ? "Tým" : "Klub",
          name: dashboard.name,
          role: "Správa financí",
          href: back,
        }}
        navigation={[
          { href: back, label: "Přehled" },
          { href: `/finance?${scopeQuery}`, label: "Finance", active: true },
        ]}
        primaryAction={{
          href: `/predpisy/novy?${scopeQuery}`,
          label: "Nový předpis",
        }}
        user={user}
      />
      <section className="content-stack finance-admin-content">
        <header className="finance-admin-hero">
          <div className="finance-admin-hero-main">
            <div>
              <p className="finance-admin-role">
                {"teamId" in scope ? "Finance týmu" : "Finance klubu"}
              </p>
              <h1>{dashboard.name}</h1>
              <p>Předpisy, úhrady a otevřené finanční úkoly na jednom místě.</p>
            </div>
            <Link
              className="finance-admin-hero-action"
              href={`/predpisy/novy?${scopeQuery}`}
            >
              Vytvořit předpis
            </Link>
          </div>

          <dl className="finance-overview" aria-label="Souhrn financí">
            <div>
              <dt>Předepsáno</dt>
              <dd>{formatCzk(dashboard.totals.expectedHalere)}</dd>
            </div>
            <div>
              <dt>Evidováno</dt>
              <dd>{formatCzk(dashboard.totals.collectedHalere)}</dd>
            </div>
            <div>
              <dt>Zbývá</dt>
              <dd>{formatCzk(dashboard.totals.remainingHalere)}</dd>
            </div>
            <div className="finance-overview-progress">
              <dt>
                {Math.round(collectionPercentage)} % evidováno
                {collectionPercentage > 100 ? " · přeplatek" : ""}
              </dt>
              <dd aria-hidden="true"><span style={{ width: `${collectionRate}%` }} /></dd>
            </div>
          </dl>
        </header>
        <Message error={query.error} success={query.success} />

        <section className="finance-assessments" aria-labelledby="assessments-title">
          <header className="finance-assessments-header">
            <div>
              <h2 id="assessments-title">Předpisy</h2>
              <p>Otevřete předpis pro detail jednotlivých členů a plateb.</p>
            </div>
            <span>{assessmentRows.length}</span>
          </header>

          {assessmentRows.length ? (
            <div className="finance-assessment-list">
              <div className="finance-assessment-columns" aria-hidden="true">
                <span>Předpis</span>
                <span>Splatnost</span>
                <span>Na člena</span>
                <span>Evidováno</span>
                <span />
              </div>
              {assessmentRows.map((assessment) => {
                const progress = assessment.expectedHalere > 0
                  ? Math.min(
                      100,
                      Math.max(
                        0,
                        (assessment.collectedHalere / assessment.expectedHalere) * 100,
                      ),
                    )
                  : 0;
                const teamLabel = assessment.teamNames.size === 0
                  ? "Celý klub"
                  : assessment.teamNames.size === 1
                    ? Array.from(assessment.teamNames)[0]
                    : "Více týmů";
                const perMember = assessment.amounts.size === 1
                  ? formatCzk(Array.from(assessment.amounts)[0])
                  : "Různé částky";

                return (
                  <Link
                    className="finance-assessment-row"
                    href={`/predpisy/${assessment.id}`}
                    key={assessment.id}
                  >
                    <div className="finance-assessment-title">
                      <span>{teamLabel}</span>
                      <strong>{assessment.title}</strong>
                    </div>
                    <div className="finance-assessment-date">
                      <span>Splatnost</span>
                      <strong>{formatDueDate(assessment.dueDate)}</strong>
                    </div>
                    <div className="finance-assessment-amount">
                      <span>Na člena</span>
                      <strong>{perMember}</strong>
                    </div>
                    <div className="finance-assessment-progress">
                      <div>
                        <strong>
                          {formatCzk(assessment.collectedHalere)} / {formatCzk(assessment.expectedHalere)}
                        </strong>
                        <span>
                          {assessment.settledCount}/{assessment.recipientCount}
                        </span>
                      </div>
                      <span className="finance-progress-track">
                        <span style={{ width: `${progress}%` }} />
                      </span>
                    </div>
                    <span className="finance-assessment-open" aria-hidden="true">›</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="finance-empty-state">
              <strong>Zatím tu nejsou žádné předpisy.</strong>
              <span>Vytvořte první předpis pro klub nebo tým.</span>
            </div>
          )}
        </section>

        <section className="finance-workspace" aria-labelledby="finance-workspace-title">
          <header className="finance-advanced-heading">
            <div>
              <h2 id="finance-workspace-title">Finanční operace</h2>
              <p>Úkoly, které vyžadují rozhodnutí, a podpůrné nástroje pro správu plateb.</p>
            </div>
            <span>
              {dashboard.pendingClaims.length + bankDashboard.movements.length} k vyřízení
            </span>
          </header>

          <div className="finance-workspace-grid">
        <article className="panel finance-sync-settings">
          <header className="finance-sync-header">
            <div>
              <h2>Synchronizace účtu</h2>
              <p>
                Automatické načítání nových pohybů pro rychlejší párování plateb.
              </p>
            </div>
            <span>Fio API</span>
          </header>
          <div className="finance-sync-accounts">
            {bankDashboard.accounts.map((account) => (
              <FioSyncAccount
                account={{
                  id: account.id,
                  accountNumber: account.account_number,
                  isDefault: account.is_default,
                  exclusiveTeamId: account.exclusive_team_id,
                  canConfigure: account.canConfigure,
                  canReadRaw: account.canReadRaw,
                  fioIntegrationId: account.fio_integration_id,
                  fioStatus: account.fio_status,
                  lastAttemptAt: isoTimestamp(account.fio_last_attempt_at),
                  lastSuccessAt: isoTimestamp(account.fio_last_success_at),
                  lastNewMovementAt: isoTimestamp(account.fio_last_new_movement_at),
                  lastErrorCode: account.fio_last_error_code,
                  lastErrorMessage: account.fio_last_error_message,
                }}
                key={account.id}
                scope={scope}
              />
            ))}
          </div>
        </article>
        {bankDashboard.accounts.some((account) => account.canReadRaw && (account.integration_id || account.fio_integration_id)) ? (
          <article className="panel finance-reconciliation">
            <header className="finance-panel-heading">
              <span className="finance-panel-icon" aria-hidden="true">↔</span>
              <div>
                <h2>Bankovní pohyby k přiřazení</h2>
                <p>Počáteční, nejasné a opravné pohyby zůstávají zde, dokud je oprávněná osoba nevyřeší.</p>
              </div>
              <span className="finance-panel-count">{bankDashboard.movements.length}</span>
            </header>
            <p className="finance-panel-notice">Zdroj každého pohybu je uložen neměnně. Historické <code>simulated</code> záznamy se nikdy nevydávají za Fio.</p>
            {bankDashboard.movements.length ? (
              <div className="finance-reconciliation-list">
                {bankDashboard.movements.map((movement) => {
                  const available = movement.amount_halere - movement.allocated_halere;
                  const debts = bankDashboard.debts.filter((debt) => debt.bank_account_id === movement.bank_account_id);
                  const manualEvents = bankDashboard.manualEvents.filter(
                    (event) => event.bank_account_id === movement.bank_account_id && event.amount_halere === movement.amount_halere,
                  );
                  return (
                    <div className="finance-reconciliation-item" key={movement.id}>
                      <p><strong>{movement.source === "fio" ? "FIO" : "DEMO"} {formatCzk(movement.amount_halere)}</strong> · účet {movement.account_number} · VS {movement.variable_symbol ?? "neuveden"}</p>
                      <p>Přijato {formatDateTimeInPrague(movement.received_at)} · důvod fronty: {reconciliationReason(movement.reason_code)}</p>
                      <p>Zdroj: {movement.source === "fio" ? "Fio API" : movement.ingestion_origin === "public_qr" ? "historická veřejná simulace" : "demo simulátor"}{movement.initial_import ? " · počáteční import" : ""}</p>
                      {movement.source === "fio" && (movement.counterparty_name || movement.recipient_message || movement.transaction_type) ? (
                        <p>{movement.counterparty_name ?? "Neznámý plátce"}{movement.recipient_message ? ` · ${movement.recipient_message}` : ""}{movement.transaction_type ? ` · ${movement.transaction_type}` : ""}</p>
                      ) : null}
                      {movement.related_transaction_id ? <p className="fio-sync-error"><strong>Upozornění:</strong> pohyb může souviset s dříve přiřazenou úhradou. Aplikace původní alokaci automaticky nemění.</p> : null}
                      <p>Přiřazeno {formatCzk(movement.allocated_halere)}, volné {formatCzk(available)} · zdrojové ID <code>{movement.source_transaction_id}</code></p>
                      {movement.resolution_reason ? <p>Poslední rozhodnutí: {movement.resolution_reason}</p> : null}
                      {manualEvents.length && movement.allocated_halere === 0 ? (
                        <details>
                          <summary>Spojit s existující ruční úhradou bez nové alokace</summary>
                          <form action={linkSimulatedTransactionAction} className="form-stack compact-form">
                            <ScopeFields scope={scope} />
                            <input name="bankTransactionId" type="hidden" value={movement.id} />
                            <label>Ruční událost<select name="paymentEventId" required>
                              {manualEvents.map((event) => <option key={event.id} value={event.id}>{event.athlete_name} · {formatCzk(event.amount_halere)} · {formatDateTimeInPrague(event.created_at)}</option>)}
                            </select></label>
                            <label>Odůvodnění<input maxLength={300} name="reason" required /></label>
                            <button type="submit">Spojit bez alokace</button>
                          </form>
                        </details>
                      ) : null}
                      {available > 0 ? (
                        <>
                          <details>
                            <summary>Potvrdit, že jde o další platbu</summary>
                            <form action={markSimulatedTransactionDifferentAction} className="form-stack compact-form">
                              <ScopeFields scope={scope} />
                              <input name="bankTransactionId" type="hidden" value={movement.id} />
                              <label>Odůvodnění<input maxLength={300} name="reason" required /></label>
                              <button className="button-secondary" type="submit">Uložit rozhodnutí a ponechat k přiřazení</button>
                            </form>
                          </details>
                          <details>
                            <summary>Přiřadit nebo rozdělit volnou část</summary>
                            <form action={allocateSimulatedTransactionAction} className="form-stack compact-form">
                              <ScopeFields scope={scope} />
                              <input name="bankTransactionId" type="hidden" value={movement.id} />
                              <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                              <label>Dluh<select name="receivableId" required>
                                {debts.map((debt) => <option key={debt.id} value={debt.id}>{debt.athlete_name} · {debt.assessment_title}</option>)}
                              </select></label>
                              <label>Částka Kč<input defaultValue={(available / 100).toFixed(2)} max={(available / 100).toFixed(2)} min="0.01" name="amount" required step="0.01" type="number" /></label>
                              <label>Odůvodnění<input maxLength={300} name="reason" required /></label>
                              <label className="checkbox-label"><input name="confirmDistinctFromManual" type="checkbox" />Potvrzuji, že jde o jinou platbu než čekající hlášení nebo ručně evidovanou úhradu vybraného dluhu.</label>
                              <button type="submit">Přiřadit volnou část</button>
                            </form>
                          </details>
                          {movement.allocated_halere === 0 ? (
                            <details>
                              <summary>Uzavřít jako nesouvisející platbu</summary>
                              <form action={ignoreSimulatedTransactionAction} className="form-stack compact-form">
                                <ScopeFields scope={scope} />
                                <input name="bankTransactionId" type="hidden" value={movement.id} />
                                <label>Odůvodnění<input maxLength={300} name="reason" required /></label>
                                <button className="button-secondary" type="submit">Uzavřít bez alokace</button>
                              </form>
                            </details>
                          ) : null}
                        </>
                      ) : null}
                      {movement.amount_halere < 0 && movement.allocated_halere === 0 ? (
                        <details>
                          <summary>Uzavřít opravný pohyb po ručním posouzení</summary>
                          <form action={ignoreSimulatedTransactionAction} className="form-stack compact-form">
                            <ScopeFields scope={scope} />
                            <input name="bankTransactionId" type="hidden" value={movement.id} />
                            <label>Odůvodnění<input maxLength={300} name="reason" required /></label>
                            <button className="button-secondary" type="submit">Uložit rozhodnutí bez změny alokací</button>
                          </form>
                        </details>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="finance-operation-empty">
                <span aria-hidden="true">✓</span>
                <div><strong>Fronta je prázdná</strong><small>Žádný bankovní ani historický demo pohyb nečeká na rozhodnutí.</small></div>
              </div>
            )}
          </article>
        ) : null}
        <article className="panel finance-matrix-panel">
          <div className="section-heading">
            <div><h2>Člen × předpis</h2><p>Stav je odvozený z evidovaných platebních událostí a alokací.</p></div>
            <Link className="button-link button-secondary" href={`/finance?${scopeQuery}${onlyUnpaid ? "" : "&unpaid=1"}`}>
              {onlyUnpaid ? "Zobrazit všechny" : "Jen nezaplacené"}
            </Link>
          </div>
          {visibleDebts.length ? (
            <div className="table-scroll">
              <table className="finance-matrix">
                <thead><tr><th>Člen</th>{assessments.map((assessment) => <th key={assessment.id}>{assessment.title}</th>)}</tr></thead>
                <tbody>
                  {athletes.map((athlete) => (
                    <tr key={athlete.id}>
                      <th>{athlete.name}</th>
                      {assessments.map((assessment) => {
                        const debt = visibleDebts.find(
                          (item) => item.athlete_id === athlete.id && item.assessment_id === assessment.id,
                        );
                        if (!debt) return <td key={assessment.id}>—</td>;
                        return (
                          <td key={assessment.id}>
                            <div className="matrix-cell">
                              <strong>{debtStatusLabel(debt.status)}</strong>
                              <span>{formatCzk(debt.allocated_halere)} / {formatCzk(debt.amount_halere)}</span>
                              {debt.has_pending_claim ? <span>Čeká hlášení rodiče</span> : null}
                              {debt.last_reminder_at ? (
                                <span>
                                  {debt.last_reminder_status === "sent"
                                    ? "Upomínka odeslána"
                                    : debt.last_reminder_status === "failed"
                                      ? "Pokus o upomínku selhal"
                                      : "Upomínka čeká na odeslání"}
                                  {": "}
                                  {new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Prague" }).format(new Date(debt.last_reminder_at))}
                                </span>
                              ) : null}
                              <details>
                                <summary>Zapsat hotovost</summary>
                                <form action={recordCashPaymentAction} className="form-stack compact-form">
                                  <ScopeFields scope={scope} />
                                  <input name="receivableId" type="hidden" value={debt.id} />
                                  <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                                  <label>Částka Kč<input defaultValue={(debt.remainingHalere / 100).toFixed(2)} name="amount" required /></label>
                                  <label>Datum<input defaultValue={today} max={today} name="occurredOn" required type="date" /></label>
                                  <button type="submit">Zaplaceno hotově</button>
                                </form>
                              </details>
                              {debt.events.filter((event) => event.kind !== "correction").map((event) => (
                                <details key={event.id}>
                                  <summary>{paymentEventLabel(event.kind)}: {formatCzk(event.amount_halere)}</summary>
                                  <p>{event.occurred_on}{event.reversed ? " · opraveno protizápisem" : ""}</p>
                                  {!event.reversed ? (
                                    <form action={reversePaymentEventAction} className="form-stack compact-form">
                                      <ScopeFields scope={scope} />
                                      <input name="paymentEventId" type="hidden" value={event.id} />
                                      <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                                      <label>Důvod opravy<input maxLength={300} name="reason" required /></label>
                                      <button className="button-secondary" type="submit">Zapsat opravu</button>
                                    </form>
                                  ) : null}
                                </details>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p>V tomto filtru nejsou žádné dluhy.</p>}
        </article>
        <article className="panel finance-claims">
          <header className="finance-panel-heading">
            <span className="finance-panel-icon is-attention" aria-hidden="true">✓</span>
            <div>
              <h2>Platební hlášení</h2>
              <p>Hlášení členů, která čekají na vaše potvrzení nebo zamítnutí.</p>
            </div>
            <span className="finance-panel-count is-attention">{dashboard.pendingClaims.length}</span>
          </header>
          <p className="finance-panel-notice">Potvrzení vytvoří auditovanou evidenci v aplikaci, nikoli bankovně ověřený převod.</p>
          {dashboard.pendingClaims.length ? (
            <form action={reviewPaymentClaimsAction} className="finance-claim-form">
              <ScopeFields scope={scope} />
              <div className="finance-claim-list">
                {dashboard.pendingClaims.map((claim) => (
                  <label className="finance-claim-row" key={claim.id}>
                    <input name="claimId" type="checkbox" value={claim.id} />
                    <span className="finance-claim-avatar" aria-hidden="true">{initials(claim.athlete_name)}</span>
                    <span className="finance-claim-person">
                      <strong>{claim.athlete_name}</strong>
                      <small>{claim.guardian_email}</small>
                    </span>
                    <span className="finance-claim-assessment">
                      <strong>{claim.assessment_title}</strong>
                      <small>Nahlášeno {formatDateTimeInPrague(claim.created_at)}</small>
                    </span>
                    <strong className="finance-claim-amount">{formatCzk(claim.amount_halere)}</strong>
                  </label>
                ))}
              </div>
              <div className="finance-claim-actions">
                <label>Důvod zamítnutí<input maxLength={300} name="rejectionReason" placeholder="Doplňte pouze při zamítnutí" /></label>
                <div>
                <button name="decision" type="submit" value="approved">Potvrdit vybrané</button>
                <button className="button-secondary" name="decision" type="submit" value="rejected">Zamítnout vybrané</button>
                </div>
              </div>
            </form>
          ) : (
            <div className="finance-operation-empty">
              <span aria-hidden="true">✓</span>
              <div><strong>Všechna hlášení jsou vyřízená</strong><small>Nová hlášení členů se zobrazí na tomto místě.</small></div>
            </div>
          )}
        </article>
        <article className="panel finance-reminder">
          <header className="finance-panel-heading">
            <span className="finance-panel-icon" aria-hidden="true">✉</span>
            <div><h2>Připomenout nezaplacené</h2><p>Jedna neutrální zpráva všem aktuálně nezaplaceným členům.</p></div>
          </header>
          <form action={sendBulkRemindersAction}>
            <ScopeFields scope={scope} />
            <input name="idempotencyKey" type="hidden" value={randomUUID()} />
            <button type="submit">Odeslat hromadnou upomínku</button>
          </form>
          <small>Odeslání upomínky nemění stav dluhu ani nevytváří úhradu.</small>
        </article>
          </div>
        </section>
      </section>
    </main>
  );
}
