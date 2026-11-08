import { Ban, Banknote, Check, History, Undo2 } from "lucide-react";
import { randomUUID } from "node:crypto";

import { IconLabel } from "@/components/icon-label";
import Link from "next/link";

import {
  cancelReceivableAction,
  recordCashPaymentAction,
  reversePaymentEventAction,
} from "@/app/actions/payments";
import { formatCzk } from "@/modules/payments/qr";
import {
  debtStatusLabel,
  type DebtStatus,
} from "@/modules/payments/status";
import type { PaymentScope } from "@/modules/payments/service";

export type LedgerPaymentEvent = {
  id: string;
  kind: string;
  amountHalere: number;
  occurredOn: string;
  reversed: boolean;
};

export type LedgerAssessment = {
  id: string;
  title: string;
  dueDate: string;
  amountHalere: number;
  allocatedHalere: number;
  remainingHalere: number;
  overpaidHalere: number;
  status: DebtStatus;
  hasPendingClaim: boolean;
  lastReminderAt: Date | string | null;
  lastReminderStatus: string | null;
  cancelledAt: Date | string | null;
  cancellationReason: string | null;
  events: LedgerPaymentEvent[];
};

export type LedgerMember = {
  id: string;
  name: string;
  assessments: LedgerAssessment[];
};

function ScopeFields({ scope }: { scope: PaymentScope }) {
  return (
    <>
      <input name="teamId" type="hidden" value={scope.teamId ?? ""} />
      <input name="clubId" type="hidden" value={scope.clubId ?? ""} />
    </>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("cs"))
    .join("");
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Prague",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatTimestamp(value: Date | string) {
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Prague",
  }).format(new Date(value));
}

function paymentEventLabel(kind: string) {
  if (kind === "cash") return "Hotovost";
  if (kind === "simulated") return "Historický demo pohyb";
  if (kind === "fio") return "Pohyb načtený z Fio API";
  return "Potvrzené hlášení";
}

function reminderLabel(status: string | null) {
  if (status === "sent") return "Upomínka odeslána";
  if (status === "failed") return "Odeslání upomínky selhalo";
  return "Upomínka čeká na odeslání";
}

function AssessmentCard({
  assessment,
  scope,
  today,
}: {
  assessment: LedgerAssessment;
  scope: PaymentScope;
  today: string;
}) {
  const progress = assessment.amountHalere > 0
    ? Math.min(100, Math.max(0, (assessment.allocatedHalere / assessment.amountHalere) * 100))
    : 0;
  const events = assessment.events.filter((event) => event.kind !== "correction");

  return (
    <article className="member-ledger-assessment">
      <header className="member-ledger-assessment-header">
        <div>
          <h4>{assessment.title}</h4>
          <span>Splatnost {formatDate(assessment.dueDate)}</span>
        </div>
        <span className={`member-ledger-status is-${assessment.status}`}>
          {debtStatusLabel(assessment.status)}
        </span>
      </header>

      <div className="member-ledger-amounts">
        <div>
          <span>Evidováno</span>
          <strong>{formatCzk(assessment.allocatedHalere)}</strong>
        </div>
        <div>
          <span>Předepsáno</span>
          <strong>{formatCzk(assessment.amountHalere)}</strong>
        </div>
        <div>
          <span>{assessment.overpaidHalere > 0 ? "Přeplatek" : "Zbývá"}</span>
          <strong>
            {formatCzk(
              assessment.overpaidHalere > 0
                ? assessment.overpaidHalere
                : assessment.remainingHalere,
            )}
          </strong>
        </div>
      </div>

      <div
        aria-label={`${Math.round(progress)} % evidováno`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(progress)}
        className="member-ledger-progress"
        role="progressbar"
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      {assessment.hasPendingClaim || assessment.lastReminderAt ? (
        <div className="member-ledger-notices">
          {assessment.hasPendingClaim ? <span className="is-pending">Čeká hlášení člena</span> : null}
          {assessment.lastReminderAt ? (
            <span>
              {reminderLabel(assessment.lastReminderStatus)} {formatTimestamp(assessment.lastReminderAt)}
            </span>
          ) : null}
        </div>
      ) : null}

      {assessment.cancelledAt ? (
        <div className="member-ledger-notices">
          <span>Dluh byl zrušen. Důvod: {assessment.cancellationReason}</span>
        </div>
      ) : null}

      {assessment.cancelledAt ? null : (
      <div className="member-ledger-tools">
        <details className="member-ledger-tool">
          <summary><IconLabel icon={Banknote} size={15}>Zapsat hotovost</IconLabel></summary>
          <form action={recordCashPaymentAction} className="member-ledger-form">
            <ScopeFields scope={scope} />
            <input name="receivableId" type="hidden" value={assessment.id} />
            <input name="idempotencyKey" type="hidden" value={randomUUID()} />
            <label>
              Částka v Kč
              <input
                defaultValue={(assessment.remainingHalere / 100).toFixed(2)}
                name="amount"
                required
              />
            </label>
            <label>
              Datum
              <input defaultValue={today} max={today} name="occurredOn" required type="date" />
            </label>
            <button type="submit"><IconLabel icon={Check} size={15}>Uložit hotovost</IconLabel></button>
          </form>
        </details>

        {assessment.allocatedHalere === 0 && !assessment.hasPendingClaim ? (
          <details className="member-ledger-tool">
            <summary><IconLabel icon={Ban} size={15}>Zrušit dluh</IconLabel></summary>
            <form action={cancelReceivableAction} className="member-ledger-form">
              <ScopeFields scope={scope} />
              <input name="receivableId" type="hidden" value={assessment.id} />
              <p>Dluh se nesmaže, jen přestane být očekávaný. Historie a audit zůstanou.</p>
              <label>
                Důvod zrušení
                <input maxLength={300} name="reason" required />
              </label>
              <label className="checkbox-label">
                <input name="confirm" required type="checkbox" value="yes" />
                Potvrzuji zrušení dluhu
              </label>
              <button className="button-secondary" type="submit"><IconLabel icon={Ban} size={15}>Zrušit dluh</IconLabel></button>
            </form>
          </details>
        ) : null}

        <details className="member-ledger-tool">
          <summary><IconLabel icon={History} size={15}>Historie evidence</IconLabel> <span>{events.length}</span></summary>
          {events.length ? (
            <div className="member-ledger-event-list">
              {events.map((event) => (
                <div className="member-ledger-event" key={event.id}>
                  <div>
                    <strong>{paymentEventLabel(event.kind)}</strong>
                    <span>{formatDate(event.occurredOn)}{event.reversed ? " · opraveno protizápisem" : ""}</span>
                  </div>
                  <strong className={event.amountHalere < 0 ? "is-correction" : ""}>
                    {formatCzk(event.amountHalere)}
                  </strong>
                  {!event.reversed ? (
                    <details>
                      <summary><IconLabel icon={Undo2} size={14}>Zapsat opravu</IconLabel></summary>
                      <form action={reversePaymentEventAction} className="member-ledger-form">
                        <ScopeFields scope={scope} />
                        <input name="paymentEventId" type="hidden" value={event.id} />
                        <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                        <label>
                          Důvod opravy
                          <input maxLength={300} name="reason" required />
                        </label>
                        <button className="button-secondary" type="submit">Uložit opravu</button>
                      </form>
                    </details>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="member-ledger-tool-empty">Zatím není evidovaná žádná úhrada.</p>
          )}
        </details>
      </div>
      )}
    </article>
  );
}

export function MemberAssessmentLedger({
  members,
  onlyUnpaid,
  scope,
  scopeQuery,
  today,
}: {
  members: LedgerMember[];
  onlyUnpaid: boolean;
  scope: PaymentScope;
  scopeQuery: string;
  today: string;
}) {
  const visibleMembers = members
    .map((member) => ({
      member,
      visibleAssessments: onlyUnpaid
        ? member.assessments.filter((assessment) => assessment.remainingHalere > 0)
        : member.assessments,
    }))
    .filter(({ visibleAssessments }) => visibleAssessments.length > 0);

  return (
    <section className="panel finance-matrix-panel member-ledger" aria-labelledby="member-ledger-title">
      <header className="member-ledger-header">
        <div>
          <h2 id="member-ledger-title">Přehled členů a předpisů</h2>
          <p>Každý člen má vlastní souhrn předpisů, evidence a dostupných akcí.</p>
        </div>
        <Link
          className={`member-ledger-filter${onlyUnpaid ? " is-active" : ""}`}
          href={`/finance?${scopeQuery}${onlyUnpaid ? "" : "&unpaid=1"}`}
        >
          {onlyUnpaid ? "Zobrazit všechny" : "Jen nezaplacené"}
        </Link>
      </header>

      {visibleMembers.length ? (
        <div className="member-ledger-list">
          {visibleMembers.map(({ member, visibleAssessments }) => {
            const openCount = member.assessments.filter(
              (assessment) => assessment.remainingHalere > 0,
            ).length;
            const remaining = member.assessments.reduce(
              (sum, assessment) => sum + assessment.remainingHalere,
              0,
            );

            return (
              <details className="member-ledger-member" key={member.id}>
                <summary className="member-ledger-member-summary">
                  <div className="member-ledger-person">
                    <span aria-hidden="true">{initials(member.name)}</span>
                    <div>
                      <h3>{member.name}</h3>
                      <p>{openCount ? "Vyžaduje kontrolu evidence" : "Všechny předpisy jsou vyřízené"}</p>
                    </div>
                  </div>
                  <dl className="member-ledger-row-facts">
                    <div><dt>Celkem předpisů</dt><dd>{member.assessments.length}</dd></div>
                    <div><dt>K vyřízení</dt><dd className={openCount ? "is-open" : ""}>{openCount}</dd></div>
                    <div><dt>Zbývá evidovat</dt><dd>{formatCzk(remaining)}</dd></div>
                  </dl>
                  <span className="member-ledger-toggle">
                    <span className="show-label">Zobrazit předpisy</span>
                    <span className="hide-label">Skrýt předpisy</span>
                  </span>
                </summary>
                <div className="member-ledger-assessment-grid">
                  {visibleAssessments.map((assessment) => (
                    <AssessmentCard
                      assessment={assessment}
                      key={assessment.id}
                      scope={scope}
                      today={today}
                    />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <div className="member-ledger-empty">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>{onlyUnpaid ? "Žádný nezaplacený předpis" : "Zatím nejsou žádné předpisy"}</strong>
            <p>{onlyUnpaid ? "Všechny zobrazené povinnosti jsou podle evidence vyřízené." : "Po vytvoření předpisu se členové zobrazí zde."}</p>
          </div>
        </div>
      )}
    </section>
  );
}
