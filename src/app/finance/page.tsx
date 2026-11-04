import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  recordCashPaymentAction,
  reversePaymentEventAction,
  reviewPaymentClaimsAction,
  sendBulkRemindersAction,
} from "@/app/actions/payments";
import { Message } from "@/components/message";
import { formatDateTimeInPrague, todayInPrague } from "@/lib/dates";
import { requireUser } from "@/modules/auth/service";
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
  const dashboard = await getManagerFinanceDashboard(user.id, scope);
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
                                  <summary>{event.kind === "cash" ? "Hotovost" : "Potvrzené hlášení"}: {formatCzk(event.amount_halere)}</summary>
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
