import { randomUUID } from "node:crypto";

import Link from "next/link";

import {
  retryReceivableDeliveryAction,
  sendAssessmentReminderAction,
} from "@/app/actions/assessments";
import { ManagementHeader } from "@/components/management-header";
import { Message } from "@/components/message";
import { requireUser } from "@/modules/auth/service";
import { getAssessmentManagerView } from "@/modules/assessments/service";
import { formatCzk } from "@/modules/payments/qr";

function formatDueDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Prague",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function deliveryPresentation(status: string | null) {
  if (status === "sent") {
    return { label: "Doručeno", className: "assessment-delivery-sent" };
  }
  if (status === "sending") {
    return { label: "Odesílá se", className: "assessment-delivery-pending" };
  }
  if (status === "failed") {
    return { label: "Doručení selhalo", className: "assessment-delivery-failed" };
  }
  return { label: "Čeká na odeslání", className: "assessment-delivery-pending" };
}

function formatReminderDate(value: Date | string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Prague",
  }).format(new Date(value));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toLocaleUpperCase("cs"))
    .join("");
}

export default async function AssessmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ assessmentId: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { assessmentId } = await params;
  const [assessment, query] = await Promise.all([
    getAssessmentManagerView(user.id, assessmentId),
    searchParams,
  ]);
  const financeHref = assessment.teamId
    ? `/finance?teamId=${assessment.teamId}`
    : `/finance?clubId=${assessment.clubId}`;
  const deliveredCount = assessment.debts.filter(
    (debt) => debt.deliveryStatus === "sent",
  ).length;
  const paidCount = assessment.debts.filter(
    (debt) => debt.allocatedHalere >= assessment.amountHalere,
  ).length;
  const unpaidCount = assessment.debts.length - paidCount;
  const paidRate = assessment.debts.length
    ? Math.round((paidCount / assessment.debts.length) * 100)
    : 0;
  const activeDebtCount = assessment.debts.filter((debt) => !debt.cancelledAt).length;
  const totalExpectedHalere = assessment.amountHalere * activeDebtCount;

  return (
    <main className="dashboard-shell dashboard-home assessment-detail-page">
      <ManagementHeader
        active="finance"
        scope={assessment.teamId ? { teamId: assessment.teamId } : { clubId: assessment.clubId }}
        user={user}
      />

      <section className="assessment-detail-content">
        <Message error={query.error} success={query.success} />

        <Link className="assessment-back-link" href={financeHref}>
          <span aria-hidden="true">‹</span> Všechny předpisy
        </Link>

        <header className="assessment-hero">
          <div className="assessment-hero-copy">
            <div className="assessment-hero-meta">
              <span>{assessment.teamName ?? "Celý klub"}</span>
              <span>Splatnost {formatDueDate(assessment.dueDate)}</span>
            </div>
            <h1>{assessment.title}</h1>
            <p>
              {formatCzk(assessment.amountHalere)} na člena · {assessment.debts.length}{" "}
              {assessment.debts.length === 1 ? "adresát" : "adresátů"}
            </p>
          </div>

          <Link className="assessment-hero-action" href={financeHref}>
            Spravovat úhrady
          </Link>
        </header>

        <section className="assessment-summary" aria-label="Souhrn předpisu">
          <article>
            <span>Celkem očekáváno</span>
            <strong>{formatCzk(totalExpectedHalere)}</strong>
            <small>
              {activeDebtCount} × {formatCzk(assessment.amountHalere)}
            </small>
          </article>
          <article>
            <span>Adresáti</span>
            <strong>{assessment.debts.length}</strong>
            <small>samostatných dluhů</small>
          </article>
          <article>
            <span>Platební údaje doručeny</span>
            <strong>{deliveredCount}</strong>
            <small>z {assessment.debts.length} adresátů</small>
          </article>
          <article>
            <div className="assessment-rate-heading">
              <span>Zaplaceno / nezaplaceno</span>
              <strong>{paidRate} %</strong>
            </div>
            <span className="assessment-rate-track assessment-payment-rate-track">
              <span className="is-paid" style={{ width: `${paidRate}%` }} />
              <span className="is-unpaid" style={{ width: `${100 - paidRate}%` }} />
            </span>
            <span className="assessment-payment-legend">
              <span><i className="is-paid" /> {paidCount} zaplaceno</span>
              <span><i className="is-unpaid" /> {unpaidCount} nezaplaceno</span>
            </span>
          </article>
        </section>

        <details className="assessment-payment-details">
          <summary>Platební údaje předpisu</summary>
          <dl>
            <div><dt>Cílový účet</dt><dd>{assessment.accountNumber}</dd></div>
            <div><dt>Zpráva</dt><dd>{assessment.paymentMessage}</dd></div>
          </dl>
        </details>

        <section className="assessment-members" aria-labelledby="members-title">
          <header className="assessment-members-header">
            <div>
              <h2 id="members-title">Adresáti předpisu</h2>
              <p>Stav úhrady, doručení platebních údajů a poslední upozornění.</p>
            </div>
            <span>{assessment.debts.length}</span>
          </header>

          <div className="assessment-member-columns" aria-hidden="true">
            <span>Člen</span>
            <span>Platební údaje</span>
            <span>Doručení</span>
            <span>Status platby</span>
            <span>Datum posledního upozornění</span>
            <span>Částka</span>
            <span>Akce</span>
          </div>

          <div className="assessment-member-list">
            {assessment.debts.map((debt) => {
              const delivery = deliveryPresentation(debt.deliveryStatus);
              const isPaid = debt.allocatedHalere >= assessment.amountHalere;
              return (
                <article className="assessment-member-row" key={debt.id}>
                  <div className="assessment-member-person">
                    <span className="assessment-member-avatar" aria-hidden="true">
                      {initials(debt.athleteName)}
                    </span>
                    <span>
                      <strong>{debt.athleteName}</strong>
                      <small>{debt.guardianEmail}</small>
                    </span>
                  </div>
                  <div className="assessment-member-payment">
                    <span>Variabilní symbol</span>
                    <strong>{debt.variableSymbol}</strong>
                  </div>
                  <div className="assessment-member-delivery">
                    {debt.cancelledAt ? (
                      <>
                        <span className="finance-cancelled-badge">Zrušeno</span>
                        <small>{debt.cancellationReason}</small>
                      </>
                    ) : (
                      <>
                        <span className={delivery.className}>{delivery.label}</span>
                        {debt.deliveryError ? <small>{debt.deliveryError}</small> : null}
                      </>
                    )}
                  </div>
                  <div className="assessment-member-status">
                    {debt.cancelledAt ? (
                      <span className="finance-cancelled-badge">Zrušeno</span>
                    ) : (
                      <span className={isPaid ? "is-paid" : "is-unpaid"}>
                        {isPaid ? "Zaplaceno" : "Nezaplaceno"}
                      </span>
                    )}
                  </div>
                  <time
                    className="assessment-member-reminder"
                    dateTime={debt.lastReminderAt ? new Date(debt.lastReminderAt).toISOString() : undefined}
                  >
                    {formatReminderDate(debt.lastReminderAt)}
                  </time>
                  <strong className="assessment-member-amount">
                    {debt.cancelledAt ? "—" : formatCzk(assessment.amountHalere)}
                  </strong>
                  <div className="assessment-member-action">
                    {!isPaid && !debt.cancelledAt ? (
                      <form action={sendAssessmentReminderAction}>
                        <input name="assessmentId" type="hidden" value={assessment.id} />
                        <input name="receivableId" type="hidden" value={debt.id} />
                        <input
                          name={assessment.teamId ? "teamId" : "clubId"}
                          type="hidden"
                          value={assessment.teamId ?? assessment.clubId}
                        />
                        <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                        <button className="button-secondary" type="submit">
                          Odeslat oznámení
                        </button>
                      </form>
                    ) : null}
                    {!debt.cancelledAt && debt.deliveryStatus !== "sent" ? (
                      <form action={retryReceivableDeliveryAction}>
                        <input name="assessmentId" type="hidden" value={assessment.id} />
                        <input name="receivableId" type="hidden" value={debt.id} />
                        <button className="button-secondary" type="submit">
                          Zkusit znovu
                        </button>
                      </form>
                    ) : isPaid || debt.cancelledAt ? (
                      <span aria-label="Bez dostupné akce">—</span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
