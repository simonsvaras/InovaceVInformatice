import { ListFilter } from "lucide-react";
import { notFound } from "next/navigation";

import { ManagementHeader } from "@/components/management-header";
import { ExportMenu } from "@/components/export-menu";
import { IconLabel } from "@/components/icon-label";
import { Message } from "@/components/message";
import { InputError, validateUuid } from "@/lib/validation";
import { requireUser } from "@/modules/auth/service";
import { formatCzk } from "@/modules/payments/qr";
import {
  getPaymentRegister,
  parseRegisterFilters,
  registerMethods,
  registerStates,
  type RegisterFilters,
} from "@/modules/payments/reports";
import type { PaymentScope } from "@/modules/payments/service";
import {
  paymentConfirmedByLabel,
  paymentMethodLabel,
} from "@/modules/payments/status";

const stateLabels: Record<(typeof registerStates)[number], string> = {
  all: "Všechny záznamy",
  valid: "Pouze platné",
  corrected: "Opravené a protizápisy",
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Europe/Prague",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export default async function PaymentRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    teamId?: string;
    clubId?: string;
    from?: string;
    to?: string;
    method?: string;
    state?: string;
  }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  if ((!query.teamId && !query.clubId) || (query.teamId && query.clubId)) notFound();

  let scope: PaymentScope;
  try {
    scope = query.teamId
      ? { teamId: validateUuid(query.teamId) }
      : { clubId: validateUuid(query.clubId!) };
  } catch {
    notFound();
  }

  let filters: RegisterFilters = { from: null, to: null, method: null, state: "all" };
  let filterError: string | undefined;
  try {
    filters = parseRegisterFilters(query);
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    filterError = error.message;
  }

  const register = await getPaymentRegister(user.id, scope, filters);
  const scopeQuery = scope.teamId
    ? `teamId=${encodeURIComponent(scope.teamId)}`
    : `clubId=${encodeURIComponent(scope.clubId!)}`;
  const filterQuery = new URLSearchParams();
  if (filters.from) filterQuery.set("from", filters.from);
  if (filters.to) filterQuery.set("to", filters.to);
  if (filters.method) filterQuery.set("method", filters.method);
  if (filters.state !== "all") filterQuery.set("state", filters.state);
  const exportHref = (format: "csv" | "xlsx") =>
    `/platby/export?${scopeQuery}${filterQuery.size ? `&${filterQuery}` : ""}&format=${format}`;

  return (
    <main className="dashboard-shell dashboard-home finance-admin-page">
      <ManagementHeader active="payments" scope={scope} user={user} />
      <section className="content-stack finance-admin-content">
        <header className="finance-admin-hero">
          <div className="finance-admin-hero-main">
            <div>
              <p className="finance-admin-role">
                {scope.teamId ? "Platby týmu" : "Platby klubu"}
              </p>
              <h1>Příchozí platby</h1>
              <p>
                {register.name}. Úhrady evidované v aplikaci; demo pohyby a ruční
                potvrzení nejsou bankovně ověřené převody.
              </p>
            </div>
            <ExportMenu csvHref={exportHref("csv")} xlsxHref={exportHref("xlsx")} />
          </div>

          <dl className="finance-overview payments-overview" aria-label="Souhrn plateb">
            <div>
              <dt>Součet za výběr</dt>
              <dd>{formatCzk(register.summary.totalHalere)}</dd>
            </div>
            <div>
              <dt>Počet záznamů</dt>
              <dd>{register.rows.length}</dd>
            </div>
            <div className="payments-overview-methods">
              <dt>Podle způsobu</dt>
              <dd>
                {register.summary.byMethod.length
                  ? register.summary.byMethod
                      .map((item) => `${paymentMethodLabel(item.method)}: ${formatCzk(item.totalHalere)}`)
                      .join(" · ")
                  : "—"}
              </dd>
            </div>
          </dl>
        </header>
        <Message error={filterError} />

        <form className="payments-filter" method="get">
          <input name={scope.teamId ? "teamId" : "clubId"} type="hidden" value={scope.teamId ?? scope.clubId} />
          <label>
            Od
            <input defaultValue={filters.from ?? ""} name="from" type="date" />
          </label>
          <label>
            Do
            <input defaultValue={filters.to ?? ""} name="to" type="date" />
          </label>
          <label>
            Způsob
            <select defaultValue={filters.method ?? ""} name="method">
              <option value="">Všechny způsoby</option>
              {registerMethods.map((method) => (
                <option key={method} value={method}>{paymentMethodLabel(method)}</option>
              ))}
            </select>
          </label>
          <label>
            Stav záznamu
            <select defaultValue={filters.state} name="state">
              {registerStates.map((state) => (
                <option key={state} value={state}>{stateLabels[state]}</option>
              ))}
            </select>
          </label>
          <button type="submit"><IconLabel icon={ListFilter}>Filtrovat</IconLabel></button>
        </form>

        <section className="payments-register" aria-labelledby="register-title">
          <header className="finance-assessments-header">
            <div>
              <h2 id="register-title">Úhrady</h2>
              <p>Nejnovější datum úhrady nahoře. Opravy jsou samostatné záporné záznamy.</p>
            </div>
            <span>{register.rows.length}</span>
          </header>
          {register.rows.length ? (
            <div className="payments-register-list">
              {register.rows.map((row) => (
                <article className="payments-register-row" key={row.allocation_id}>
                  <span>{formatDate(row.occurred_on)}</span>
                  <div>
                    <strong>{row.athlete_name} · {row.assessment_title}</strong>
                    <small>
                      {row.team_name ?? "Celý klub"} · {paymentMethodLabel(row.kind)} · VS {row.variable_symbol}
                    </small>
                    <small>{paymentConfirmedByLabel(row.kind, row.actor_name)}</small>
                    {row.corrected ? <small className="is-correction">Opraveno protizápisem</small> : null}
                    {row.correction_reason ? <small>Důvod opravy: {row.correction_reason}</small> : null}
                  </div>
                  <strong className={row.amount_halere < 0 ? "is-correction" : ""}>
                    {formatCzk(row.amount_halere)}
                  </strong>
                </article>
              ))}
            </div>
          ) : (
            <div className="finance-empty-state">
              <strong>Pro zvolený výběr nejsou žádné úhrady.</strong>
              <span>Zkuste upravit období, způsob nebo stav záznamu.</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
