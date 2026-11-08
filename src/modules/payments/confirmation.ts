import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { formatDateTimeInPrague } from "@/lib/dates";
import { InputError, validateUuid } from "@/lib/validation";
import { formatCzk } from "@/modules/payments/qr";
import {
  paymentConfirmedByLabel,
  paymentMethodLabel,
} from "@/modules/payments/status";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

type ConfirmationRow = {
  allocation_id: string;
  kind: string;
  amount_halere: number;
  occurred_on: string;
  created_at: Date;
  actor_name: string | null;
  athlete_name: string;
  assessment_title: string;
  club_id: string;
  club_name: string;
  team_id: string | null;
  team_name: string | null;
  variable_symbol: string;
  account_number: string;
  source_transaction_id: string | null;
  corrected: boolean;
};

export async function getPaymentConfirmation(userId: string, allocationId: string) {
  try {
    validateUuid(allocationId, "Identifikátor úhrady");
  } catch (error) {
    if (error instanceof InputError) notFound();
    throw error;
  }
  const [row] = await getDatabase().execute<ConfirmationRow>(sql`
    select pa.id as allocation_id, pe.kind, pa.amount_halere, pe.occurred_on::text,
           pe.created_at, actor.display_name as actor_name, ath.full_name as athlete_name,
           a.title as assessment_title, c.id as club_id, c.name as club_name,
           t.id as team_id, t.name as team_name, r.variable_symbol, ba.account_number,
           bt.source_transaction_id,
           exists(select 1 from payment_events correction where correction.reverses_event_id=pe.id) as corrected
    from payment_allocations pa
    join payment_events pe on pe.id=pa.payment_event_id
    join receivables r on r.id=pa.receivable_id
    join assessments a on a.id=r.assessment_id
    join athletes ath on ath.id=r.athlete_id
    join athlete_guardians ag on ag.athlete_id=ath.id and ag.user_id=${userId}
    join bank_accounts ba on ba.id=r.bank_account_id
    join clubs c on c.id=a.club_id
    left join users actor on actor.id=pe.recorded_by_user_id
    left join teams t on t.id=r.origin_team_id
    left join bank_transactions bt on bt.id=pe.bank_transaction_id
    where pa.id=${allocationId}
  `);
  if (!row) notFound();
  if (row.kind === "correction" || row.amount_halere <= 0) {
    throw new InputError("not_confirmable", "Oprava evidence není úhrada, ke které se vydává potvrzení.");
  }
  if (row.corrected) {
    throw new InputError("corrected", "Tento záznam byl opraven protizápisem, potvrzení nelze vydat.");
  }
  await getDatabase().insert(auditEvents).values({
    actorUserId: userId,
    clubId: row.club_id,
    teamId: row.team_id,
    eventType: "payment.confirmation_downloaded",
    targetType: "payment_allocation",
    targetId: row.allocation_id,
  });
  return row;
}

export function buildPaymentConfirmationHtml(row: ConfirmationRow) {
  const isDemo = row.kind === "simulated";
  const scope = row.team_name ? `${row.club_name} · ${row.team_name}` : `${row.club_name} · Celý klub`;
  const lines: [string, string][] = [
    ["Sportovec", row.athlete_name],
    ["Předpis", row.assessment_title],
    ["Klub / tým", scope],
    ["Částka", formatCzk(row.amount_halere)],
    ["Datum úhrady v evidenci", row.occurred_on.split("-").reverse().join(". ")],
    ["Způsob", paymentMethodLabel(row.kind)],
    ["Zaevidoval(a)", paymentConfirmedByLabel(row.kind, row.actor_name)],
    ["Variabilní symbol", row.variable_symbol],
    ["Cílový účet", row.account_number],
  ];
  if ((isDemo || row.kind === "fio") && row.source_transaction_id) {
    lines.push([isDemo ? "ID demo pohybu" : "ID bankovního pohybu", row.source_transaction_id]);
  }
  lines.push(["Číslo záznamu", row.allocation_id]);
  const rows = lines
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  const warning = isDemo
    ? "DEMO – simulovaná platba v aplikaci. Nejde o bankovně ověřený převod ani o spojení s Fio."
    : "Toto potvrzení dokládá pouze evidenci v aplikaci Klubio. Není to bankovní výpis ani daňový doklad.";
  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Potvrzení evidence úhrady</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#152033;margin:2rem auto;max-width:42rem;padding:0 1rem}
h1{font-size:1.4rem;margin:0 0 .25rem}
p.muted{color:#526078;margin:0 0 1.5rem}
p.warning{border:1px solid #f1c46b;background:#fff8e6;border-radius:.5rem;padding:.75rem 1rem}
table{border-collapse:collapse;width:100%}
th,td{border-bottom:1px solid #dce4ef;padding:.6rem .5rem;text-align:left;vertical-align:top}
th{width:40%;color:#526078;font-weight:600}
</style>
</head>
<body>
<h1>Potvrzení evidence úhrady</h1>
<p class="muted">Vystaveno ${escapeHtml(formatDateTimeInPrague(new Date()))}</p>
<p class="warning">${escapeHtml(warning)}</p>
<table>${rows}</table>
</body>
</html>
`;
}
