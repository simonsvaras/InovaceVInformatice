import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { auditEvents, teams } from "@/db/schema";
import { todayInPrague } from "@/lib/dates";
import { buildCsv } from "@/lib/csv";
import { InputError, validateDueDate } from "@/lib/validation";
import { requireClubAdminAccess } from "@/modules/authorization/service";
import {
  authorizeManagerRead,
  type PaymentScope,
} from "@/modules/payments/service";
import { paymentMethodLabel } from "@/modules/payments/status";

export const registerMethods = ["manual_claim", "cash", "simulated", "correction"] as const;
export const registerStates = ["all", "valid", "corrected"] as const;

export type RegisterFilters = {
  from: string | null;
  to: string | null;
  method: (typeof registerMethods)[number] | null;
  state: (typeof registerStates)[number];
};

export function parseRegisterFilters(query: {
  from?: string;
  to?: string;
  method?: string;
  state?: string;
}): RegisterFilters {
  const from = query.from ? validateDueDate(query.from) : null;
  const to = query.to ? validateDueDate(query.to) : null;
  if (from && to && from > to) {
    throw new InputError("invalid_period", "Začátek období nesmí být po jeho konci.");
  }
  const method = query.method || null;
  if (method && !registerMethods.includes(method as (typeof registerMethods)[number])) {
    throw new InputError("invalid_method", "Neznámý způsob úhrady.");
  }
  const state = query.state || "all";
  if (!registerStates.includes(state as (typeof registerStates)[number])) {
    throw new InputError("invalid_state", "Neznámý stav záznamu.");
  }
  return {
    from,
    to,
    method: method as RegisterFilters["method"],
    state: state as RegisterFilters["state"],
  };
}

type RegisterRow = {
  allocation_id: string;
  event_id: string;
  kind: string;
  occurred_on: string;
  amount_halere: number;
  athlete_name: string;
  assessment_title: string;
  team_name: string | null;
  variable_symbol: string;
  account_number: string;
  actor_name: string;
  correction_reason: string | null;
  corrected: boolean;
  source_transaction_id: string | null;
};

async function loadRegister(
  scope: { clubId: string; teamId: string | null },
  filters: RegisterFilters,
) {
  const conditions = [
    scope.teamId
      ? sql`a.team_id=${scope.teamId} and r.origin_team_id=${scope.teamId}`
      : sql`a.club_id=${scope.clubId}`,
  ];
  if (filters.from) conditions.push(sql`pe.occurred_on >= ${filters.from}::date`);
  if (filters.to) conditions.push(sql`pe.occurred_on <= ${filters.to}::date`);
  if (filters.method) conditions.push(sql`pe.kind = ${filters.method}`);
  if (filters.state === "valid") {
    conditions.push(sql`pe.kind <> 'correction' and not exists(select 1 from payment_events c where c.reverses_event_id=pe.id)`);
  } else if (filters.state === "corrected") {
    conditions.push(sql`(pe.kind = 'correction' or exists(select 1 from payment_events c where c.reverses_event_id=pe.id))`);
  }
  const rows = await getDatabase().execute<RegisterRow>(sql`
    select pa.id as allocation_id, pe.id as event_id, pe.kind, pe.occurred_on::text,
           pa.amount_halere, ath.full_name as athlete_name, a.title as assessment_title,
           t.name as team_name, r.variable_symbol, ba.account_number,
           actor.display_name as actor_name, pe.correction_reason,
           (pe.kind <> 'correction' and exists(select 1 from payment_events c where c.reverses_event_id=pe.id)) as corrected,
           bt.source_transaction_id
    from payment_allocations pa
    join payment_events pe on pe.id=pa.payment_event_id
    join receivables r on r.id=pa.receivable_id
    join assessments a on a.id=r.assessment_id
    join athletes ath on ath.id=r.athlete_id
    join bank_accounts ba on ba.id=r.bank_account_id
    join users actor on actor.id=pe.recorded_by_user_id
    left join teams t on t.id=r.origin_team_id
    left join bank_transactions bt on bt.id=pe.bank_transaction_id
    where ${sql.join(conditions, sql` and `)}
    order by pe.occurred_on desc, pe.created_at desc, ath.full_name
  `);
  return rows;
}

function summarize(rows: RegisterRow[]) {
  const byMethod = new Map<string, { count: number; totalHalere: number }>();
  for (const row of rows) {
    const current = byMethod.get(row.kind) ?? { count: 0, totalHalere: 0 };
    current.count += 1;
    current.totalHalere += row.amount_halere;
    byMethod.set(row.kind, current);
  }
  return {
    totalHalere: rows.reduce((sum, row) => sum + row.amount_halere, 0),
    byMethod: registerMethods
      .filter((method) => byMethod.has(method))
      .map((method) => ({ method, ...byMethod.get(method)! })),
  };
}

function filterDetails(filters: RegisterFilters) {
  return {
    from: filters.from ?? "",
    to: filters.to ?? "",
    method: filters.method ?? "",
    state: filters.state,
  };
}

export async function getPaymentRegister(
  userId: string,
  requestedScope: PaymentScope,
  filters: RegisterFilters,
) {
  const scope = await authorizeManagerRead(userId, requestedScope);
  const rows = await loadRegister(scope, filters);
  await getDatabase().insert(auditEvents).values({
    actorUserId: userId,
    clubId: scope.clubId,
    teamId: scope.teamId,
    eventType: "payments.register_viewed",
    targetType: scope.teamId ? "team" : "club",
    targetId: scope.teamId ?? scope.clubId,
    details: { ...filterDetails(filters), rows: rows.length },
  });
  return { ...scope, rows, summary: summarize(rows) };
}

function recordSource(row: RegisterRow) {
  if (row.kind === "simulated") {
    return `DEMO simulace, ID pohybu ${row.source_transaction_id ?? "-"}; nejde o bankovně ověřený převod`;
  }
  if (row.kind === "cash") return "Hotovost zapsaná v aplikaci";
  if (row.kind === "correction") return "Opravný protizápis";
  return "Hlášení rodiče potvrzené v aplikaci; bez ověření banky";
}

function recordState(row: RegisterRow) {
  if (row.kind === "correction") return "Oprava (protizápis)";
  return row.corrected ? "Opraveno protizápisem" : "Platný záznam";
}

export async function exportPaymentRegisterCsv(
  userId: string,
  requestedScope: PaymentScope,
  filters: RegisterFilters,
) {
  const scope = await authorizeManagerRead(userId, requestedScope);
  const rows = await loadRegister(scope, filters);
  await getDatabase().insert(auditEvents).values({
    actorUserId: userId,
    clubId: scope.clubId,
    teamId: scope.teamId,
    eventType: "payments.exported",
    targetType: scope.teamId ? "team" : "club",
    targetId: scope.teamId ?? scope.clubId,
    details: { ...filterDetails(filters), rows: rows.length, format: "csv" },
  });
  const csv = buildCsv(
    [
      "Datum úhrady",
      "Tým",
      "Sportovec",
      "Předpis",
      "Částka (Kč)",
      "Způsob",
      "Původ záznamu",
      "Zapsal / potvrdil",
      "Variabilní symbol",
      "Účet",
      "Stav záznamu",
      "Důvod opravy",
    ],
    rows.map((row) => [
      row.occurred_on,
      row.team_name ?? "Celý klub",
      row.athlete_name,
      row.assessment_title,
      { halere: row.amount_halere },
      paymentMethodLabel(row.kind),
      recordSource(row),
      row.kind === "simulated" ? "Demo simulace" : row.actor_name,
      row.variable_symbol,
      row.account_number,
      recordState(row),
      row.correction_reason,
    ]),
  );
  const scopeLabel = scope.teamId ? "tym" : "klub";
  return { csv, filename: `platby-${scopeLabel}-${todayInPrague()}.csv` };
}

export async function getClubTeamFinanceOverview(userId: string, clubId: string) {
  const club = await requireClubAdminAccess(userId, clubId);
  const database = getDatabase();
  const today = todayInPrague();
  const [teamRows, totals] = await Promise.all([
    database
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(and(eq(teams.clubId, clubId), isNull(teams.archivedAt)))
      .orderBy(asc(teams.name)),
    database.execute<{
      team_id: string | null;
      expected_halere: number;
      collected_halere: number;
      overdue_halere: number;
      overdue_count: number;
      debt_count: number;
    }>(sql`
      select r.origin_team_id as team_id,
             coalesce(sum(r.amount_halere), 0)::int as expected_halere,
             coalesce(sum(alloc.allocated_halere), 0)::int as collected_halere,
             coalesce(sum(case when a.due_date < ${today}::date then greatest(r.amount_halere - alloc.allocated_halere, 0) else 0 end), 0)::int as overdue_halere,
             count(*) filter (where a.due_date < ${today}::date and alloc.allocated_halere < r.amount_halere)::int as overdue_count,
             count(*)::int as debt_count
      from receivables r
      join assessments a on a.id=r.assessment_id
      cross join lateral (
        select coalesce(sum(pa.amount_halere), 0)::int as allocated_halere
        from payment_allocations pa where pa.receivable_id=r.id
      ) alloc
      where a.club_id=${clubId} and r.cancelled_at is null
      group by r.origin_team_id
    `),
  ]);
  const byTeam = new Map(totals.map((row) => [row.team_id, row]));
  const empty = {
    expected_halere: 0,
    collected_halere: 0,
    overdue_halere: 0,
    overdue_count: 0,
    debt_count: 0,
  };
  const mapRow = (row: typeof empty) => ({
    expectedHalere: row.expected_halere,
    collectedHalere: row.collected_halere,
    overdueHalere: row.overdue_halere,
    overdueCount: row.overdue_count,
    debtCount: row.debt_count,
  });
  await database.insert(auditEvents).values({
    actorUserId: userId,
    clubId: club.id,
    eventType: "club.finance_overview_viewed",
    targetType: "club",
    targetId: club.id,
  });
  const activeTeamIds = new Set(teamRows.map((team) => team.id));
  const archived = totals
    .filter((row) => row.team_id && !activeTeamIds.has(row.team_id))
    .reduce(
      (sum, row) => ({
        expected_halere: sum.expected_halere + row.expected_halere,
        collected_halere: sum.collected_halere + row.collected_halere,
        overdue_halere: sum.overdue_halere + row.overdue_halere,
        overdue_count: sum.overdue_count + row.overdue_count,
        debt_count: sum.debt_count + row.debt_count,
      }),
      empty,
    );
  return {
    teams: teamRows.map((team) => ({
      ...team,
      ...mapRow(byTeam.get(team.id) ?? empty),
    })),
    clubWide: mapRow(byTeam.get(null) ?? empty),
    archived: mapRow(archived),
  };
}
