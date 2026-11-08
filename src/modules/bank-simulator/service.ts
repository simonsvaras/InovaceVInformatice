import { sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  auditEvents,
  bankIntegrations,
  bankTransactionEvidenceLinks,
  bankTransactions,
  notificationDeliveries,
  paymentAllocations,
  paymentEvents,
} from "@/db/schema";
import { todayInPrague } from "@/lib/dates";
import { InputError } from "@/lib/validation";
import {
  failRecordedDelivery,
  sendRecordedTransactionalEmail,
} from "@/modules/notifications/email";
import { requireClubAdminAccess, requireTeamManagementAccess } from "@/modules/authorization/service";
import type { PaymentScope } from "@/modules/payments/service";
import { buildFioPaymentEmail } from "@/modules/fio/email";

import { buildSimulatedPaymentEmail } from "./email";

type Database = ReturnType<typeof getDatabase>;
type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type Delivery = {
  deliveryId: string;
  allocationId: string;
  guardianUserId: string;
  guardianEmail: string;
  athleteName: string;
  assessmentTitle: string;
  clubName: string;
  teamName: string | null;
  amountHalere: number;
  sourceTransactionId: string;
  recordedOrigin: "user" | "public_qr" | "fio_sync";
  source: "simulated" | "fio";
};

const retryableDelivery = sql`(
  nd.status in ('pending', 'failed')
  or (nd.status='sending' and (nd.attempt_started_at is null or nd.attempt_started_at < now() - interval '5 minutes'))
)`;

async function sendDeliveries(deliveries: Delivery[]) {
  await Promise.all(deliveries.map(async (delivery) => {
    try {
      await sendRecordedTransactionalEmail(delivery.deliveryId, {
        userId: delivery.guardianUserId,
        recipient: delivery.guardianEmail,
        kind: delivery.source === "fio" ? "fio_payment_recorded" : "simulated_payment_recorded",
        referenceId: delivery.allocationId,
        ...(delivery.source === "fio"
          ? buildFioPaymentEmail(delivery)
          : buildSimulatedPaymentEmail({
              ...delivery,
              recordedOrigin: delivery.recordedOrigin === "public_qr" ? "public_qr" : "user",
            })),
      });
    } catch {
      await failRecordedDelivery(delivery.deliveryId, "message_build_failed");
    }
  }));
}

async function retryableDeliveries(bankTransactionId: string) {
  return getDatabase().execute<Delivery>(sql`
    select nd.id as "deliveryId", pa.id as "allocationId",
           u.id as "guardianUserId", u.email as "guardianEmail",
           ath.full_name as "athleteName",
           a.title as "assessmentTitle", c.name as "clubName", t.name as "teamName",
           pa.amount_halere as "amountHalere", bt.source_transaction_id as "sourceTransactionId",
           pe.recorded_origin as "recordedOrigin", bt.source
      from payment_events pe
      join payment_allocations pa on pa.payment_event_id=pe.id
      join notification_deliveries nd
        on nd.kind in ('simulated_payment_recorded', 'fio_payment_recorded') and nd.reference_id=pa.id
      join receivables r on r.id=pa.receivable_id
      join assessments a on a.id=r.assessment_id
      join clubs c on c.id=a.club_id
      join athletes ath on ath.id=r.athlete_id
      join athlete_guardians ag on ag.athlete_id=ath.id
      join users u on u.id=ag.user_id
      left join teams t on t.id=r.origin_team_id
      join bank_transactions bt on bt.id=pe.bank_transaction_id
     where pe.bank_transaction_id=${bankTransactionId} and ${retryableDelivery}
     order by pa.created_at
  `);
}

async function createDelivery(
  transaction: DbTransaction,
  input: {
    allocationId: string;
    guardianUserId: string;
    guardianEmail: string;
    athleteName: string;
    assessmentTitle: string;
    clubName: string;
    teamName: string | null;
    amountHalere: number;
    sourceTransactionId: string;
    recordedOrigin: "user" | "public_qr" | "fio_sync";
    source: "simulated" | "fio";
  },
): Promise<Delivery> {
  const [delivery] = await transaction
    .insert(notificationDeliveries)
    .values({
      userId: input.guardianUserId,
      recipientEmail: input.guardianEmail,
      kind: input.source === "fio" ? "fio_payment_recorded" : "simulated_payment_recorded",
      referenceId: input.allocationId,
      status: "pending",
    })
    .returning({ id: notificationDeliveries.id });
  return { deliveryId: delivery.id, ...input };
}

async function scopeIdentity(userId: string, scope: PaymentScope) {
  if (scope.teamId) {
    const team = await requireTeamManagementAccess(userId, scope.teamId);
    return { clubId: team.clubId, teamId: team.id, name: team.name };
  }
  const club = await requireClubAdminAccess(userId, scope.clubId!);
  return { clubId: club.id, teamId: null, name: club.name };
}

async function accountOwnerCandidates(transaction: DbTransaction, bankAccountId: string) {
  const rows = await transaction.execute<{ team_id: string | null }>(sql`
    select distinct candidate.team_id
      from (
        select t.id as team_id from teams t where t.bank_account_id=${bankAccountId}
        union all
        select r.origin_team_id from receivables r where r.bank_account_id=${bankAccountId}
        union all
        select ae.team_id from audit_events ae
         where ae.event_type='team.bank_account_changed' and ae.target_id=${bankAccountId}
      ) candidate
  `);
  return rows.map((row) => row.team_id);
}

export async function getBankIntegrationOverview(userId: string, requestedScope: PaymentScope) {
  const scope = await scopeIdentity(userId, requestedScope);
  const database = getDatabase();
  const adminRows = await database.execute<{ is_admin: boolean }>(sql`
    select exists(select 1 from club_admins ca where ca.club_id=${scope.clubId} and ca.user_id=${userId}) as is_admin
  `);
  const isAdmin = Boolean(adminRows[0]?.is_admin);
  const condition = scope.teamId
    ? sql`t.id=${scope.teamId} and (
        ba.id=coalesce(t.bank_account_id, (select d.id from bank_accounts d where d.club_id=t.club_id and d.is_default=true))
        or (
          ba.feed_exclusive_team_id=${scope.teamId}
          and exists(select 1 from receivables historical where historical.bank_account_id=ba.id and historical.origin_team_id=${scope.teamId})
        )
      )`
    : sql`ba.club_id=${scope.clubId}`;
  const accounts = await database.execute<{
    id: string;
    account_number: string;
    is_default: boolean;
    integration_id: string | null;
    enabled: boolean | null;
    exclusive_team_id: string | null;
    last_processed_at: Date | null;
    fio_integration_id: string | null;
    fio_status: string | null;
    fio_last_attempt_at: Date | null;
    fio_last_success_at: Date | null;
    fio_last_new_movement_at: Date | null;
    fio_last_error_code: string | null;
    fio_last_error_message: string | null;
  }>(sql`
    select ba.id, ba.account_number, ba.is_default, bi.id as integration_id,
           bi.enabled, ba.feed_exclusive_team_id as exclusive_team_id, bi.last_processed_at,
           fi.id as fio_integration_id, fi.status as fio_status,
           fi.last_attempt_at as fio_last_attempt_at, fi.last_success_at as fio_last_success_at,
           fi.last_new_movement_at as fio_last_new_movement_at,
           fi.last_error_code as fio_last_error_code, fi.last_error_message as fio_last_error_message
      from bank_accounts ba
      ${scope.teamId ? sql`join teams t on t.club_id=ba.club_id` : sql``}
      left join bank_integrations bi on bi.bank_account_id=ba.id
      left join fio_integrations fi on fi.bank_account_id=ba.id
     where ${condition}
     order by ba.is_default desc, ba.account_number
  `);
  return {
    ...scope,
    isAdmin,
    accounts: accounts.map((account) => ({
      ...account,
      canConfigure: isAdmin || (
        Boolean(scope.teamId) &&
        !account.is_default &&
        (!account.exclusive_team_id || account.exclusive_team_id === scope.teamId)
      ),
      canReadRaw: isAdmin || account.exclusive_team_id === scope.teamId,
    })),
  };
}

export async function activateDemoIntegration(input: {
  actorUserId: string;
  scope: PaymentScope;
  bankAccountId: string;
}) {
  return getDatabase().transaction(async (transaction) => {
    const scope = input.scope.teamId
      ? await lockTeamScope(transaction, input.actorUserId, input.scope.teamId)
      : await lockClubScope(transaction, input.actorUserId, input.scope.clubId!);
    const accounts = await transaction.execute<{
      id: string;
      club_id: string;
      is_default: boolean;
      allowed_in_scope: boolean;
    }>(sql`
      select ba.id, ba.club_id, ba.is_default,
             ${scope.teamId
               ? sql`ba.id=coalesce((select t.bank_account_id from teams t where t.id=${scope.teamId}), (select d.id from bank_accounts d where d.club_id=${scope.clubId} and d.is_default=true))`
               : sql`ba.club_id=${scope.clubId}`} as allowed_in_scope
        from bank_accounts ba where ba.id=${input.bankAccountId}
        for update of ba
    `);
    const account = accounts[0];
    if (!account?.allowed_in_scope || account.club_id !== scope.clubId) {
      throw new InputError("access_denied", "Účet nepatří do oprávněného rozsahu.");
    }
    const existing = await transaction.execute<{ id: string; exclusive_team_id: string | null }>(sql`
      select id, exclusive_team_id from bank_integrations
       where bank_account_id=${account.id} for update
    `);
    if (existing[0]) {
      if (!scope.isAdmin && existing[0].exclusive_team_id !== scope.teamId) {
        throw new InputError("access_denied", "Sdílenou bankovní integraci spravuje pouze správce klubu.");
      }
      return { integrationId: existing[0].id, created: false };
    }
    const candidates = await accountOwnerCandidates(transaction, account.id);
    const exclusiveTeamId = !account.is_default && candidates.length === 1 && candidates[0]
      ? candidates[0]
      : null;
    if (!scope.isAdmin && exclusiveTeamId !== scope.teamId) {
      throw new InputError("shared_account", "Tento účet není výhradním účtem týmu; demo pohyby smí spravovat jen správce klubu.");
    }
    const [created] = await transaction
      .insert(bankIntegrations)
      .values({
        bankAccountId: account.id,
        exclusiveTeamId,
        provider: "demo",
        enabled: true,
        configuredByUserId: input.actorUserId,
      })
      .returning({ id: bankIntegrations.id });
    if (exclusiveTeamId) {
      await transaction.execute(sql`
        update bank_accounts set feed_exclusive_team_id=${exclusiveTeamId} where id=${account.id}
      `);
    }
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: scope.clubId,
      teamId: exclusiveTeamId,
      eventType: "bank_integration.demo_enabled",
      targetType: "bank_integration",
      targetId: created.id,
      details: { bankAccountId: account.id, exclusive: Boolean(exclusiveTeamId) },
    });
    return { integrationId: created.id, created: true };
  });
}

export async function getDemoSimulator(userId: string, receivableId: string) {
  const rows = await getDatabase().execute<{
    receivable_id: string;
    bank_account_id: string;
    account_number: string;
    variable_symbol: string;
    amount_halere: number;
    allocated_halere: number;
    title: string;
    athlete_name: string;
    enabled: boolean;
  }>(sql`
    select r.id as receivable_id, r.bank_account_id, ba.account_number,
           r.variable_symbol, r.amount_halere,
           coalesce((select sum(pa.amount_halere) from payment_allocations pa where pa.receivable_id=r.id), 0)::int as allocated_halere,
           a.title, ath.full_name as athlete_name,
           bi.enabled
      from receivables r
      join assessments a on a.id=r.assessment_id
      join athletes ath on ath.id=r.athlete_id
      join athlete_guardians ag on ag.athlete_id=ath.id and ag.user_id=${userId}
      join bank_accounts ba on ba.id=r.bank_account_id
      join bank_integrations bi on bi.bank_account_id=ba.id and bi.enabled=true
     where r.id=${receivableId} and r.cancelled_at is null
  `);
  const row = rows[0];
  if (!row) throw new InputError("access_denied", "Demo simulátor pro tento dluh není dostupný.");
  return { ...row, remainingHalere: Math.max(row.amount_halere - row.allocated_halere, 0) };
}

async function allocateAutomatically(
  transaction: DbTransaction,
  input: {
    actorUserId: string | null;
    recordedOrigin: "user" | "public_qr";
    restrictedReceivableId?: string;
    bankTransactionId: string;
    bankAccountId: string;
    sourceTransactionId: string;
    variableSymbol: string | null;
    amountHalere: number;
    occurredAt: Date;
  },
) {
  if (!input.variableSymbol) return { status: "unmatched", reasonCode: "invalid_vs", deliveries: [] as Delivery[] };
  const candidates = await transaction.execute<{
    id: string;
    club_id: string;
    assessment_team_id: string | null;
    origin_team_id: string | null;
    amount_halere: number;
    guardian_user_id: string;
    guardian_email: string;
    athlete_name: string;
    assessment_title: string;
    club_name: string;
    team_name: string | null;
    cancelled_at: Date | null;
  }>(sql`
    select r.id, a.club_id, a.team_id as assessment_team_id, r.origin_team_id,
           r.amount_halere, r.cancelled_at, u.id as guardian_user_id, u.email as guardian_email,
           ath.full_name as athlete_name,
           a.title as assessment_title, c.name as club_name, t.name as team_name
      from receivables r
      join assessments a on a.id=r.assessment_id
      join clubs c on c.id=a.club_id
      join athletes ath on ath.id=r.athlete_id
      join athlete_guardians ag on ag.athlete_id=ath.id
      join users u on u.id=ag.user_id
      left join teams t on t.id=r.origin_team_id
     where r.bank_account_id=${input.bankAccountId}
       and r.variable_symbol=${input.variableSymbol}
       and ${input.restrictedReceivableId
         ? sql`r.id=${input.restrictedReceivableId}`
         : sql`ag.user_id=${input.actorUserId}`}
  `);
  if (candidates.length !== 1) return { status: "unmatched", reasonCode: "unknown_vs", deliveries: [] as Delivery[] };
  const candidate = candidates[0];
  const [lockedDebt] = await transaction.execute<{ cancelled_at: Date | null }>(
    sql`select cancelled_at from receivables where id=${candidate.id} for update`,
  );
  if (lockedDebt?.cancelled_at) return { status: "unmatched", reasonCode: "cancelled", deliveries: [] as Delivery[] };
  const stateRows = await transaction.execute<{
    allocated_halere: number;
    pending_claim: boolean;
    active_manual_payment: boolean;
  }>(sql`
    select coalesce(sum(pa.amount_halere), 0)::int as allocated_halere,
           exists(select 1 from payment_claims pc where pc.receivable_id=${candidate.id} and pc.status='pending') as pending_claim,
           exists(
             select 1 from payment_events pe
             join payment_allocations manual_pa on manual_pa.payment_event_id=pe.id
             where manual_pa.receivable_id=${candidate.id} and pe.kind='manual_claim'
               and not exists(select 1 from payment_events correction where correction.reverses_event_id=pe.id)
           ) as active_manual_payment
      from payment_allocations pa where pa.receivable_id=${candidate.id}
  `);
  const state = stateRows[0];
  const remaining = candidate.amount_halere - (state?.allocated_halere ?? 0);
  if (remaining <= 0) return { status: "unmatched", reasonCode: "already_paid", deliveries: [] as Delivery[] };
  if (state?.pending_claim) return { status: "unmatched", reasonCode: "pending_claim", deliveries: [] as Delivery[] };
  if (state?.active_manual_payment) return { status: "unmatched", reasonCode: "possible_manual_duplicate", deliveries: [] as Delivery[] };
  if (remaining !== input.amountHalere) return { status: "unmatched", reasonCode: "amount_mismatch", deliveries: [] as Delivery[] };

  const [event] = await transaction.insert(paymentEvents).values({
    clubId: candidate.club_id,
    teamId: candidate.assessment_team_id,
    kind: "simulated",
    amountHalere: input.amountHalere,
    occurredOn: todayInPrague(input.occurredAt),
    recordedByUserId: input.actorUserId,
    recordedOrigin: input.recordedOrigin,
    bankTransactionId: input.bankTransactionId,
  }).returning({ id: paymentEvents.id });
  const [allocation] = await transaction.insert(paymentAllocations).values({
    paymentEventId: event.id,
    receivableId: candidate.id,
    amountHalere: input.amountHalere,
  }).returning({ id: paymentAllocations.id });
  await transaction.insert(auditEvents).values({
    actorUserId: input.actorUserId,
    clubId: candidate.club_id,
    teamId: candidate.assessment_team_id,
    eventType: "bank_transaction.auto_allocated",
    targetType: "bank_transaction",
    targetId: input.bankTransactionId,
    details: { paymentEventId: event.id, receivableId: candidate.id, amountHalere: input.amountHalere, source: "simulated", origin: input.recordedOrigin },
  });
  const delivery = await createDelivery(transaction, {
    source: "simulated",
    allocationId: allocation.id,
    guardianUserId: candidate.guardian_user_id,
    guardianEmail: candidate.guardian_email,
    athleteName: candidate.athlete_name,
    assessmentTitle: candidate.assessment_title,
    clubName: candidate.club_name,
    teamName: candidate.team_name,
    amountHalere: input.amountHalere,
    sourceTransactionId: input.sourceTransactionId,
    recordedOrigin: input.recordedOrigin,
  });
  return { status: "allocated", reasonCode: "auto_allocated", deliveries: [delivery] };
}

export async function ingestSimulatedTransaction(input: {
  actorUserId: string;
  receivableId: string;
  sourceTransactionId: string;
  amountHalere: number;
  variableSymbol: string | null;
  occurredAt: Date;
}) {
  const result = await getDatabase().transaction(async (transaction) => {
    const sourceRows = await transaction.execute<{
      bank_account_id: string;
      integration_id: string;
      club_id: string;
      exclusive_team_id: string | null;
    }>(sql`
      select r.bank_account_id, bi.id as integration_id, ba.club_id, bi.exclusive_team_id
        from receivables r
        join athlete_guardians ag on ag.athlete_id=r.athlete_id and ag.user_id=${input.actorUserId}
        join bank_integrations bi on bi.bank_account_id=r.bank_account_id and bi.enabled=true
        join bank_accounts ba on ba.id=r.bank_account_id
       where r.id=${input.receivableId}
    `);
    const source = sourceRows[0];
    if (!source) throw new InputError("access_denied", "Demo pohyb pro tento dluh nelze přijmout.");
    const [created] = await transaction.insert(bankTransactions).values({
      integrationId: source.integration_id,
      bankAccountId: source.bank_account_id,
      source: "simulated",
      sourceTransactionId: input.sourceTransactionId,
      amountHalere: input.amountHalere,
      variableSymbol: input.variableSymbol,
      occurredAt: input.occurredAt,
      createdByUserId: input.actorUserId,
      status: "unmatched",
      reasonCode: "received",
    }).onConflictDoNothing().returning({ id: bankTransactions.id });
    if (!created) {
      const existing = await transaction.execute<{
        id: string;
        amount_halere: number;
        variable_symbol: string | null;
        created_by_user_id: string;
      }>(sql`
        select id, amount_halere, variable_symbol, created_by_user_id from bank_transactions
         where bank_account_id=${source.bank_account_id} and source_transaction_id=${input.sourceTransactionId}
      `);
      if (!existing[0]) throw new InputError("ingest_conflict", "Pohyb se nepodařilo bezpečně převzít.");
      if (existing[0].amount_halere !== input.amountHalere ||
          existing[0].variable_symbol !== input.variableSymbol ||
          existing[0].created_by_user_id !== input.actorUserId) {
        throw new InputError("idempotency_conflict", "Toto demo ID už bylo použito s jinými údaji.");
      }
      return { bankTransactionId: existing[0].id, created: false, autoAllocated: false, deliveries: [] as Delivery[] };
    }
    const allocation = await allocateAutomatically(transaction, {
      actorUserId: input.actorUserId,
      recordedOrigin: "user",
      bankTransactionId: created.id,
      bankAccountId: source.bank_account_id,
      sourceTransactionId: input.sourceTransactionId,
      variableSymbol: input.variableSymbol,
      amountHalere: input.amountHalere,
      occurredAt: input.occurredAt,
    });
    await transaction.execute(sql`
      update bank_transactions set status=${allocation.status}, reason_code=${allocation.reasonCode}
       where id=${created.id}
    `);
    await transaction.execute(sql`
      update bank_integrations set last_processed_at=now(), updated_at=now()
       where id=${source.integration_id}
    `);
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: source.club_id,
      teamId: source.exclusive_team_id,
      targetType: "bank_transaction",
      targetId: created.id,
      eventType: "bank_transaction.simulated_received",
      details: { source: "simulated", sourceTransactionId: input.sourceTransactionId, autoAllocated: allocation.status === "allocated" },
    });
    return { bankTransactionId: created.id, created: true, autoAllocated: allocation.status === "allocated", deliveries: allocation.deliveries };
  });
  const deliveries = result.created ? result.deliveries : await retryableDeliveries(result.bankTransactionId);
  await sendDeliveries(deliveries);
  return result;
}

type LockedManagerScope = { clubId: string; teamId: string | null; isAdmin: boolean };

async function lockTeamScope(transaction: DbTransaction, actorUserId: string, teamId: string): Promise<LockedManagerScope> {
  const rows = await transaction.execute<{ club_id: string; is_admin: boolean; is_coach: boolean }>(sql`
    select t.club_id,
           exists(select 1 from club_admins ca where ca.club_id=t.club_id and ca.user_id=${actorUserId}) as is_admin,
           exists(select 1 from team_coaches tc where tc.team_id=t.id and tc.user_id=${actorUserId} and tc.ended_at is null) as is_coach
      from teams t where t.id=${teamId} and t.archived_at is null for update of t
  `);
  const row = rows[0];
  if (!row || (!row.is_admin && !row.is_coach)) throw new InputError("access_denied", "K financím týmu nemáte oprávnění.");
  return { clubId: row.club_id, teamId, isAdmin: row.is_admin };
}

async function lockClubScope(transaction: DbTransaction, actorUserId: string, clubId: string): Promise<LockedManagerScope> {
  const rows = await transaction.execute<{ allowed: boolean }>(sql`
    select exists(select 1 from club_admins ca where ca.club_id=c.id and ca.user_id=${actorUserId}) as allowed
      from clubs c where c.id=${clubId} for update of c
  `);
  if (!rows[0]?.allowed) throw new InputError("access_denied", "Klubové bankovní pohyby může spravovat jen správce klubu.");
  return { clubId, teamId: null, isAdmin: true };
}

async function lockMovementInScope(
  transaction: DbTransaction,
  actorUserId: string,
  scopeInput: PaymentScope,
  bankTransactionId: string,
) {
  const scope = scopeInput.teamId
    ? await lockTeamScope(transaction, actorUserId, scopeInput.teamId)
    : await lockClubScope(transaction, actorUserId, scopeInput.clubId!);
  const rows = await transaction.execute<{
    id: string;
    bank_account_id: string;
    club_id: string;
    exclusive_team_id: string | null;
    amount_halere: number;
    source_transaction_id: string;
    status: string;
    reason_code: string;
    resolution_reason: string | null;
    ingestion_origin: string;
    occurred_at: Date;
    source: "simulated" | "fio";
    currency: string;
  }>(sql`
    select bt.id, bt.bank_account_id, ba.club_id, ba.feed_exclusive_team_id as exclusive_team_id,
           bt.amount_halere, bt.source_transaction_id, bt.status, bt.reason_code, bt.resolution_reason,
           bt.occurred_at, bt.source, bt.currency
      from bank_transactions bt
      join bank_accounts ba on ba.id=bt.bank_account_id
     where bt.id=${bankTransactionId}
     for update of bt
  `);
  const movement = rows[0];
  const allowed = movement && movement.club_id === scope.clubId && (
    scope.isAdmin || (scope.teamId && movement.exclusive_team_id === scope.teamId)
  );
  if (!allowed) throw new InputError("access_denied", "Pohyb nepatří do oprávněného rozsahu.");
  return { scope, movement };
}

async function movementAllocatedHalere(transaction: DbTransaction, bankTransactionId: string) {
  const rows = await transaction.execute<{ amount: number }>(sql`
    select coalesce(sum(pa.amount_halere), 0)::int as amount
      from payment_events pe
      join payment_allocations pa on pa.payment_event_id=pe.id
     where pe.bank_transaction_id=${bankTransactionId}
  `);
  return rows[0]?.amount ?? 0;
}

export async function markSimulatedTransactionDifferent(input: {
  actorUserId: string;
  scope: PaymentScope;
  bankTransactionId: string;
  reason: string;
}) {
  await getDatabase().transaction(async (transaction) => {
    const { scope, movement } = await lockMovementInScope(transaction, input.actorUserId, input.scope, input.bankTransactionId);
    if (movement.status === "linked" || movement.status === "ignored") throw new InputError("already_resolved", "Pohyb už byl uzavřen.");
    const allocatedHalere = await movementAllocatedHalere(transaction, movement.id);
    if (allocatedHalere >= movement.amount_halere) {
      throw new InputError("already_allocated", "Pohyb už nemá žádnou volnou část k rozhodnutí.");
    }
    await transaction.execute(sql`
      update bank_transactions
         set resolution_reason=${input.reason}, resolved_by_user_id=${input.actorUserId}, resolved_at=now(),
             reason_code='reviewed_distinct'
       where id=${movement.id}
    `);
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: scope.clubId,
      teamId: scope.teamId,
      eventType: "bank_transaction.marked_distinct",
      targetType: "bank_transaction",
      targetId: movement.id,
      details: { reason: input.reason, source: movement.source },
    });
  });
}

export async function linkSimulatedTransactionToManualEvent(input: {
  actorUserId: string;
  scope: PaymentScope;
  bankTransactionId: string;
  paymentEventId: string;
  reason: string;
}) {
  await getDatabase().transaction(async (transaction) => {
    const { scope, movement } = await lockMovementInScope(transaction, input.actorUserId, input.scope, input.bankTransactionId);
    if (movement.amount_halere <= 0) {
      throw new InputError("negative_movement", "Záporný nebo opravný bankovní pohyb nelze spojit s úhradou.");
    }
    const hasAllocations = await transaction.execute<{ exists: boolean }>(sql`
      select exists(select 1 from payment_events pe where pe.bank_transaction_id=${movement.id}) as exists
    `);
    if (hasAllocations[0]?.exists) throw new InputError("already_allocated", "Pohyb už má finanční historii a nelze jej spojit bez opravy.");
    await transaction.execute(sql`select id from payment_events where id=${input.paymentEventId} for update`);
    const events = await transaction.execute<{
      id: string;
      club_id: string;
      kind: string;
      amount_halere: number;
      account_count: number;
      account_id: string | null;
      corrected: boolean;
      team_scope_allowed: boolean;
    }>(sql`
      select pe.id, pe.club_id, pe.kind, pe.amount_halere,
             count(distinct r.bank_account_id)::int as account_count,
             min(r.bank_account_id::text)::uuid as account_id,
             exists(select 1 from payment_events correction where correction.reverses_event_id=pe.id) as corrected,
             bool_and(a.team_id=${scope.teamId} and r.origin_team_id=${scope.teamId}) as team_scope_allowed
        from payment_events pe
        join payment_allocations pa on pa.payment_event_id=pe.id
        join receivables r on r.id=pa.receivable_id
        join assessments a on a.id=r.assessment_id
       where pe.id=${input.paymentEventId}
       group by pe.id
    `);
    const event = events[0];
    if (!event || event.kind !== "manual_claim" || event.corrected || event.club_id !== scope.clubId ||
        event.amount_halere !== movement.amount_halere || event.account_count !== 1 || event.account_id !== movement.bank_account_id) {
      throw new InputError("invalid_evidence", "Pohyb lze spojit jen s odpovídající neopravovanou ručně potvrzenou úhradou na stejném účtu.");
    }
    if (!scope.isAdmin && !event.team_scope_allowed) {
      throw new InputError("access_denied", "Ruční úhrada nepatří do oprávněného týmového rozsahu.");
    }
    await transaction.insert(bankTransactionEvidenceLinks).values({
      bankTransactionId: movement.id,
      paymentEventId: event.id,
      linkedByUserId: input.actorUserId,
      reason: input.reason,
    });
    await transaction.execute(sql`
      update bank_transactions set status='linked', reason_code='linked_manual_event',
             resolution_reason=${input.reason}, resolved_by_user_id=${input.actorUserId}, resolved_at=now()
       where id=${movement.id}
    `);
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: scope.clubId,
      teamId: scope.teamId,
      eventType: "bank_transaction.linked_to_manual_event",
      targetType: "bank_transaction",
      targetId: movement.id,
      details: { paymentEventId: event.id, reason: input.reason, source: movement.source },
    });
  });
}

export async function allocateSimulatedTransaction(input: {
  actorUserId: string;
  scope: PaymentScope;
  bankTransactionId: string;
  receivableId: string;
  amountHalere: number;
  idempotencyKey: string;
  reason: string;
  confirmDistinctFromManual: boolean;
}) {
  const result = await getDatabase().transaction(async (transaction) => {
    const { scope, movement } = await lockMovementInScope(transaction, input.actorUserId, input.scope, input.bankTransactionId);
    if (movement.amount_halere <= 0 || movement.currency !== "CZK") {
      throw new InputError("movement_not_allocatable", "Přiřadit lze jen kladný zaúčtovaný pohyb v CZK.");
    }
    const existingRows = await transaction.execute<{
      id: string;
      recorded_by_user_id: string;
      bank_transaction_id: string | null;
      receivable_id: string;
      amount_halere: number;
    }>(sql`
      select pe.id, pe.recorded_by_user_id, pe.bank_transaction_id,
             pa.receivable_id, pa.amount_halere
        from payment_events pe join payment_allocations pa on pa.payment_event_id=pe.id
       where pe.idempotency_key=${input.idempotencyKey}
    `);
    const existing = existingRows[0];
    if (existing) {
      if (existing.recorded_by_user_id !== input.actorUserId ||
          existing.bank_transaction_id !== movement.id ||
          existing.receivable_id !== input.receivableId ||
          existing.amount_halere !== input.amountHalere) {
        throw new InputError("idempotency_conflict", "Tento formulář už byl použit s jinými údaji.");
      }
      return { eventId: existing.id, delivery: null };
    }
    if (movement.status === "linked" || movement.status === "ignored") throw new InputError("already_resolved", "Pohyb už byl uzavřen.");
    const links = await transaction.execute<{ exists: boolean }>(sql`
      select exists(select 1 from bank_transaction_evidence_links where bank_transaction_id=${movement.id} and invalidated_at is null) as exists
    `);
    if (links[0]?.exists) throw new InputError("already_linked", "Spojený pohyb nelze znovu alokovat.");
    if (["pending_claim", "possible_manual_duplicate"].includes(movement.reason_code) && !movement.resolution_reason) {
      throw new InputError("decision_required", "Nejprve s odůvodněním potvrďte, že jde o jinou platbu.");
    }
    const debts = await transaction.execute<{
      id: string;
      club_id: string;
      assessment_team_id: string | null;
      origin_team_id: string | null;
      bank_account_id: string;
      guardian_user_id: string;
      guardian_email: string;
      athlete_name: string;
      assessment_title: string;
      club_name: string;
      team_name: string | null;
      cancelled_at: Date | null;
    }>(sql`
      select r.id, a.club_id, a.team_id as assessment_team_id, r.origin_team_id, r.bank_account_id,
             r.cancelled_at, u.id as guardian_user_id, u.email as guardian_email,
             ath.full_name as athlete_name,
             a.title as assessment_title, c.name as club_name, t.name as team_name
        from receivables r
        join assessments a on a.id=r.assessment_id
        join clubs c on c.id=a.club_id
        join athletes ath on ath.id=r.athlete_id
        join athlete_guardians ag on ag.athlete_id=ath.id
        join users u on u.id=ag.user_id
        left join teams t on t.id=r.origin_team_id
       where r.id=${input.receivableId}
       for update of r
    `);
    const debt = debts[0];
    const debtAllowed = debt && debt.club_id === scope.clubId && debt.bank_account_id === movement.bank_account_id && (
      scope.isAdmin || (scope.teamId && debt.assessment_team_id === scope.teamId && debt.origin_team_id === scope.teamId)
    );
    if (!debtAllowed) throw new InputError("access_denied", "Dluh nepatří do oprávněného rozsahu a účtu.");
    if (debt.cancelled_at) throw new InputError("cancelled", "Dluh byl zrušen, nelze k němu přiřadit pohyb.");
    const manualEvidence = await transaction.execute<{ pending_claim: boolean; active_manual_payment: boolean }>(sql`
      select exists(
               select 1 from payment_claims pc
                where pc.receivable_id=${debt.id} and pc.status='pending'
             ) as pending_claim,
             exists(
               select 1 from payment_events pe
               join payment_allocations pa on pa.payment_event_id=pe.id
                where pa.receivable_id=${debt.id} and pe.kind='manual_claim'
                  and not exists(select 1 from payment_events correction where correction.reverses_event_id=pe.id)
             ) as active_manual_payment
    `);
    if (
      (manualEvidence[0]?.pending_claim || manualEvidence[0]?.active_manual_payment) &&
      !input.confirmDistinctFromManual
    ) {
      throw new InputError(
        "distinct_payment_confirmation_required",
        "U vybraného dluhu existuje hlášení nebo ručně evidovaná úhrada. Výslovně potvrďte, že jde o jinou platbu.",
      );
    }
    const debtState = await transaction.execute<{ allocated: number }>(sql`
      select coalesce(sum(pa.amount_halere), 0)::int as allocated
        from payment_allocations pa where pa.receivable_id=${debt.id}
    `);
    const movementBefore = await movementAllocatedHalere(transaction, movement.id);
    const available = movement.amount_halere - movementBefore;
    if (input.amountHalere > available) throw new InputError("amount_exceeds_movement", "Lze přiřadit jen dosud nealokovanou část pohybu.");
    const [event] = await transaction.insert(paymentEvents).values({
      clubId: debt.club_id,
      teamId: debt.assessment_team_id,
      kind: movement.source,
      amountHalere: input.amountHalere,
      occurredOn: todayInPrague(movement.occurred_at),
      recordedByUserId: input.actorUserId,
      recordedOrigin: movement.source === "fio" ? "fio_sync" : "user",
      bankTransactionId: movement.id,
      idempotencyKey: input.idempotencyKey,
      correctionReason: input.reason,
    }).returning({ id: paymentEvents.id });
    const [allocation] = await transaction.insert(paymentAllocations).values({
      paymentEventId: event.id,
      receivableId: debt.id,
      amountHalere: input.amountHalere,
    }).returning({ id: paymentAllocations.id });
    const movementAfter = movementBefore + input.amountHalere;
    await transaction.execute(sql`
      update bank_transactions
         set status=${movementAfter === movement.amount_halere ? "allocated" : "partially_allocated"},
             reason_code='manager_allocated', resolution_reason=${input.reason},
             resolved_by_user_id=${input.actorUserId}, resolved_at=now()
       where id=${movement.id}
    `);
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: scope.clubId,
      teamId: scope.teamId,
      eventType: "bank_transaction.manually_allocated",
      targetType: "bank_transaction",
      targetId: movement.id,
      details: {
        paymentEventId: event.id,
        receivableId: debt.id,
        amountHalere: input.amountHalere,
        debtAllocatedBeforeHalere: debtState[0]?.allocated ?? 0,
        movementAllocatedBeforeHalere: movementBefore,
        reason: input.reason,
        distinctFromManualConfirmed: Boolean(
          input.confirmDistinctFromManual &&
          (manualEvidence[0]?.pending_claim || manualEvidence[0]?.active_manual_payment),
        ),
        source: movement.source,
      },
    });
    const delivery = await createDelivery(transaction, {
      source: movement.source,
      allocationId: allocation.id,
      guardianUserId: debt.guardian_user_id,
      guardianEmail: debt.guardian_email,
      athleteName: debt.athlete_name,
      assessmentTitle: debt.assessment_title,
      clubName: debt.club_name,
      teamName: debt.team_name,
      amountHalere: input.amountHalere,
      sourceTransactionId: movement.source_transaction_id,
      recordedOrigin: movement.source === "fio" ? "fio_sync" : "user",
    });
    return { eventId: event.id, delivery };
  });
  if (result.delivery) await sendDeliveries([result.delivery]);
  else await sendDeliveries(await retryableDeliveries(input.bankTransactionId));
  return result;
}

export async function ignoreSimulatedTransaction(input: {
  actorUserId: string;
  scope: PaymentScope;
  bankTransactionId: string;
  reason: string;
}) {
  await getDatabase().transaction(async (transaction) => {
    const { scope, movement } = await lockMovementInScope(transaction, input.actorUserId, input.scope, input.bankTransactionId);
    const allocated = await movementAllocatedHalere(transaction, movement.id);
    if (allocated !== 0 || movement.status === "linked") throw new InputError("financial_history_exists", "Pohyb s finanční vazbou nelze označit jako jinou platbu.");
    await transaction.execute(sql`
      update bank_transactions set status='ignored', reason_code='different_payment',
             resolution_reason=${input.reason}, resolved_by_user_id=${input.actorUserId}, resolved_at=now()
       where id=${movement.id}
    `);
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: scope.clubId,
      teamId: scope.teamId,
      eventType: "bank_transaction.ignored",
      targetType: "bank_transaction",
      targetId: movement.id,
      details: { reason: input.reason, source: movement.source },
    });
  });
}

export async function getBankReconciliationDashboard(userId: string, requestedScope: PaymentScope) {
  const overview = await getBankIntegrationOverview(userId, requestedScope);
  const readable = overview.accounts.filter((account) =>
    account.canReadRaw && (account.integration_id || account.fio_integration_id),
  );
  const accountIds = readable.map((account) => account.id);
  if (!accountIds.length) return { ...overview, movements: [], debts: [], manualEvents: [] };
  const identifiers = sql.join(accountIds.map((id) => sql`${id}::uuid`), sql`, `);
  const movementRows = await getDatabase().execute<{
    id: string;
    bank_account_id: string;
    account_number: string;
    amount_halere: number;
    allocated_halere: number;
    variable_symbol: string | null;
    source_transaction_id: string;
    occurred_at: Date;
    received_at: Date;
    status: string;
    reason_code: string;
    resolution_reason: string | null;
    ingestion_origin: string;
    source: "simulated" | "fio";
    currency: string;
    initial_import: boolean;
    counterparty_name: string | null;
    recipient_message: string | null;
    transaction_type: string | null;
    related_transaction_id: string | null;
  }>(sql`
    select bt.id, bt.bank_account_id, ba.account_number, bt.amount_halere,
           coalesce((select sum(pa.amount_halere) from payment_events pe join payment_allocations pa on pa.payment_event_id=pe.id where pe.bank_transaction_id=bt.id), 0)::int as allocated_halere,
           bt.variable_symbol, bt.source_transaction_id, bt.occurred_at, bt.received_at,
           bt.status, bt.reason_code, bt.resolution_reason, bt.ingestion_origin,
           bt.source, bt.currency, bt.initial_import, bt.counterparty_name,
           bt.recipient_message, bt.transaction_type, bt.related_transaction_id
      from bank_transactions bt join bank_accounts ba on ba.id=bt.bank_account_id
     where bt.bank_account_id in (${identifiers})
       and bt.status in ('unmatched', 'partially_allocated')
     order by bt.received_at
  `);
  const condition = overview.teamId
    ? sql`a.team_id=${overview.teamId} and r.origin_team_id=${overview.teamId}`
    : sql`a.club_id=${overview.clubId}`;
  const debts = await getDatabase().execute<{
    id: string;
    bank_account_id: string;
    athlete_name: string;
    assessment_title: string;
    amount_halere: number;
    allocated_halere: number;
  }>(sql`
    select r.id, r.bank_account_id, ath.full_name as athlete_name,
           a.title as assessment_title, r.amount_halere,
           coalesce((select sum(pa.amount_halere) from payment_allocations pa where pa.receivable_id=r.id), 0)::int as allocated_halere
      from receivables r join assessments a on a.id=r.assessment_id join athletes ath on ath.id=r.athlete_id
     where ${condition} and r.cancelled_at is null and r.bank_account_id in (${identifiers})
      order by ath.full_name, a.created_at
  `);
  const manualEvents = await getDatabase().execute<{
    id: string;
    bank_account_id: string;
    athlete_name: string;
    amount_halere: number;
    created_at: Date;
  }>(sql`
    select pe.id, r.bank_account_id, ath.full_name as athlete_name,
           pe.amount_halere, pe.created_at
      from payment_events pe
      join payment_allocations pa on pa.payment_event_id=pe.id
      join receivables r on r.id=pa.receivable_id
      join assessments a on a.id=r.assessment_id
      join athletes ath on ath.id=r.athlete_id
     where pe.kind='manual_claim' and ${condition} and r.bank_account_id in (${identifiers})
       and not exists(select 1 from payment_events correction where correction.reverses_event_id=pe.id)
       and not exists(select 1 from bank_transaction_evidence_links bel where bel.payment_event_id=pe.id and bel.invalidated_at is null)
     order by pe.created_at desc
  `);
  await getDatabase().insert(auditEvents).values({
    actorUserId: userId,
    clubId: overview.clubId,
    teamId: overview.teamId,
    eventType: "bank_reconciliation.viewed",
    targetType: overview.teamId ? "team" : "club",
    targetId: overview.teamId ?? overview.clubId,
  });
  return { ...overview, movements: movementRows, debts, manualEvents };
}
