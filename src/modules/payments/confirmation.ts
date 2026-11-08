import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { formatDateTimeInPrague } from "@/lib/dates";
import { buildPdf, type PdfRow } from "@/lib/pdf";
import { InputError, validateUuid } from "@/lib/validation";
import { formatCzk } from "@/modules/payments/qr";
import {
  paymentConfirmedByLabel,
  paymentMethodLabel,
} from "@/modules/payments/status";

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

export function buildPaymentConfirmationPdf(row: ConfirmationRow) {
  const isDemo = row.kind === "simulated";
  const scope = row.team_name ? `${row.club_name} · ${row.team_name}` : `${row.club_name} · Celý klub`;
  const rows: PdfRow[] = [
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
    rows.push([isDemo ? "ID demo pohybu" : "ID bankovního pohybu", row.source_transaction_id]);
  }
  rows.push(["Číslo záznamu", row.allocation_id]);
  return buildPdf({
    title: "Potvrzení evidence úhrady",
    subtitle: `Vystaveno ${formatDateTimeInPrague(new Date())}`,
    warning: isDemo
      ? "DEMO – simulovaná platba v aplikaci. Nejde o bankovně ověřený převod ani o spojení s Fio."
      : "Toto potvrzení dokládá pouze evidenci v aplikaci Klubio. Není to bankovní výpis ani daňový doklad.",
    rows,
    footer: "Dokument vygenerovala aplikace Klubio.",
  });
}
