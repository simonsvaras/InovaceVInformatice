import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  activateDemoIntegrationAction,
  allocateSimulatedTransactionAction,
  ignoreSimulatedTransactionAction,
  linkSimulatedTransactionAction,
  markSimulatedTransactionDifferentAction,
} from "@/app/actions/bank-simulator";
import {
  recordCashPaymentAction,
  reversePaymentEventAction,
  reviewPaymentClaimsAction,
  sendBulkRemindersAction,
} from "@/app/actions/payments";
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
    amount_mismatch: "částka neodpovídá zbývající částce",
    already_paid: "dluh už je podle evidence uhrazen",
    pending_claim: "čeká rodičovské hlášení",
    possible_manual_duplicate: "možná shoda s ručně evidovanou úhradou",
    reviewed_distinct: "oprávněná osoba potvrdila, že jde o další platbu",
    manager_allocated: "část pohybu byla ručně přiřazena",
    allocation_corrected: "původní demo přiřazení bylo opraveno protizápisem",
    linked_event_corrected: "spojená ruční událost byla opravena protizápisem",
  } as Record<string, string>)[code] ?? code;
}

function paymentEventLabel(kind: string) {
  if (kind === "cash") return "Hotovost";
  if (kind === "simulated") return "Demo pohyb (simulated)";
  return "Potvrzené hlášení";
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

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <Link className="brand-link" href="/prehled">Klubové platby</Link>
        <Link href={back}>Zpět</Link>
      </header>
      <section className="content-stack">
        <div>
          <p className="eyebrow">Finance</p>
          <h1>Kdo zaplatil</h1>
          <p>{dashboard.name} · upomínka není stav dluhu</p>
        </div>
        <Message error={query.error} success={query.success} />
        <section className="summary-grid">
          <article className="panel summary-card"><span>Předepsáno</span><strong>{formatCzk(dashboard.totals.expectedHalere)}</strong></article>
          <article className="panel summary-card"><span>Vybráno</span><strong>{formatCzk(dashboard.totals.collectedHalere)}</strong></article>
          <article className="panel summary-card"><span>Zbývá</span><strong>{formatCzk(dashboard.totals.remainingHalere)}</strong></article>
        </section>
        <article className="panel">
          <h2>Technická konfigurace demo banky</h2>
          <p>Konfigurace pouze přijímá simulované pohyby. Není režimem účtu a nevypíná rodičovské hlášení ani ruční evidenci. Skutečné Fio API ani token se nepoužívají.</p>
          <div className="list-stack">
            {bankDashboard.accounts.map((account) => (
              <div className="subcard" key={account.id}>
                <p><strong>{account.account_number}</strong>{account.is_default ? " · výchozí/sdílený účet" : account.exclusive_team_id ? " · výhradní týmový účet" : " · sdílený účet"}</p>
                <p>{account.integration_id ? "Demo synchronizace aktivní" : "Demo synchronizace není aktivní"}</p>
                <p>Poslední nově přijatý demo pohyb: {account.last_processed_at ? formatDateTimeInPrague(account.last_processed_at) : "zatím žádný"}</p>
                {!account.integration_id && account.canConfigure ? (
                  <form action={activateDemoIntegrationAction}>
                    <ScopeFields scope={scope} />
                    <input name="bankAccountId" type="hidden" value={account.id} />
                    <button className="button-secondary" type="submit">Aktivovat demo synchronizaci</button>
                  </form>
                ) : null}
                {!account.canReadRaw && account.integration_id ? <p>Syrové pohyby sdíleného účtu může zobrazit pouze správce klubu.</p> : null}
              </div>
            ))}
          </div>
        </article>
        {bankDashboard.accounts.some((account) => account.canReadRaw && account.integration_id) ? (
          <article className="panel">
            <h2>Fronta smíření demo pohybů ({bankDashboard.movements.length})</h2>
            <p>Všechny položky mají neměnný původ <code>simulated</code>. Nejsou bankovně ověřeným převodem. Spojení s ruční událostí nevytváří novou alokaci.</p>
            {bankDashboard.movements.length ? (
              <div className="list-stack">
                {bankDashboard.movements.map((movement) => {
                  const available = movement.amount_halere - movement.allocated_halere;
                  const debts = bankDashboard.debts.filter((debt) => debt.bank_account_id === movement.bank_account_id);
                  const manualEvents = bankDashboard.manualEvents.filter(
                    (event) => event.bank_account_id === movement.bank_account_id && event.amount_halere === movement.amount_halere,
                  );
                  return (
                    <div className="subcard" key={movement.id}>
                      <p><strong>DEMO {formatCzk(movement.amount_halere)}</strong> · účet {movement.account_number} · VS {movement.variable_symbol ?? "neuveden"}</p>
                      <p>Přijato {formatDateTimeInPrague(movement.received_at)} · důvod fronty: {reconciliationReason(movement.reason_code)}</p>
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
                    </div>
                  );
                })}
              </div>
            ) : <p>Žádné demo pohyby nečekají na rozhodnutí.</p>}
          </article>
        ) : null}
        <article className="panel">
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
        <article className="panel">
          <h2>K potvrzení ({dashboard.pendingClaims.length})</h2>
          <p>Hlášení rodiče není bankovně ověřený převod. Potvrzení pouze vytvoří auditovanou evidenci v aplikaci.</p>
          {dashboard.pendingClaims.length ? (
            <form action={reviewPaymentClaimsAction} className="form-stack">
              <ScopeFields scope={scope} />
              <div className="list-stack">
                {dashboard.pendingClaims.map((claim) => (
                  <label className="subcard checkbox-label" key={claim.id}>
                    <input name="claimId" type="checkbox" value={claim.id} />
                    <span><strong>{claim.athlete_name}</strong><br />{claim.assessment_title} · {formatCzk(claim.amount_halere)} · {claim.guardian_email}<br />Nahlášeno {formatDateTimeInPrague(claim.created_at)}</span>
                  </label>
                ))}
              </div>
              <label>Důvod zamítnutí<input maxLength={300} name="rejectionReason" placeholder="Povinný jen při zamítnutí" /></label>
              <div className="button-row">
                <button name="decision" type="submit" value="approved">Potvrdit vybrané</button>
                <button className="button-secondary" name="decision" type="submit" value="rejected">Zamítnout vybrané</button>
              </div>
            </form>
          ) : <p>Žádná hlášení nečekají.</p>}
        </article>
        <article className="panel">
          <h2>Neutrální hromadná upomínka</h2>
          <p>Automatický e-mail dostanou pouze aktuálně nezaplacené dluhy v tomto rozsahu. Odeslání nemění stav dluhu.</p>
          <form action={sendBulkRemindersAction}>
            <ScopeFields scope={scope} />
            <input name="idempotencyKey" type="hidden" value={randomUUID()} />
            <button type="submit">Připomenout všem nezaplaceným</button>
          </form>
        </article>
      </section>
    </main>
  );
}
