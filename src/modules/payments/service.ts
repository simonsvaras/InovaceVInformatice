import { createHash } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  auditEvents,
  notificationDeliveries,
  paymentAllocations,
  paymentClaims,
  paymentEvents,
  reminderBatches,
  reminderRecipients,
} from "@/db/schema";
import { todayInPrague } from "@/lib/dates";
import { InputError } from "@/lib/validation";
import { requireClubAdminAccess, requireTeamManagementAccess } from "@/modules/authorization/service";
import {
  failRecordedDelivery,
  sendRecordedTransactionalEmail,
} from "@/modules/notifications/email";
import { buildPaymentReminderEmail } from "@/modules/payments/reminder-email";
import { deriveDebtState } from "@/modules/payments/status";

export type PaymentScope =
  | { teamId: string; clubId?: never }
  | { clubId: string; teamId?: never };

type Database = ReturnType<typeof getDatabase>;
type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type LockedScope = { clubId: string; teamId: string | null };

class MovementLockChanged extends Error {}

function isUniqueViolation(error: unknown) {
  return Boolean(
    typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505",
  );
}

function scopeFingerprint(scope: PaymentScope) {
  return createHash("sha256")
    .update(JSON.stringify(scope.teamId ? { teamId: scope.teamId } : { clubId: scope.clubId }))
    .digest("hex");
}

export async function lockManagerScope(
  transaction: DbTransaction,
  actorUserId: string,
  scope: PaymentScope,
): Promise<LockedScope> {
  if (scope.teamId) {
    const rows = await transaction.execute<{
      club_id: string;
      team_id: string;
      allowed: boolean;
    }>(sql`
      select t.club_id, t.id as team_id,
             (exists(select 1 from club_admins ca where ca.club_id=t.club_id and ca.user_id=${actorUserId})
              or (t.archived_at is null and exists(select 1 from team_coaches tc where tc.team_id=t.id and tc.user_id=${actorUserId} and tc.ended_at is null))) as allowed
      from teams t
      where t.id=${scope.teamId}
      for update of t
    `);
    const row = rows[0];
    if (!row?.allowed) {
      throw new InputError("access_denied", "K finančním operacím tohoto týmu nemáte oprávnění.");
    }
    return { clubId: row.club_id, teamId: row.team_id };
  }

  const rows = await transaction.execute<{
    club_id: string;
    allowed: boolean;
  }>(sql`
    select c.id as club_id,
           exists(select 1 from club_admins ca where ca.club_id=c.id and ca.user_id=${actorUserId}) as allowed
    from clubs c
    where c.id=${scope.clubId}
    for update of c
  `);
  const row = rows[0];
  if (!row?.allowed) {
    throw new InputError("access_denied", "Klubové finanční operace může provést jen správce klubu.");
  }
  return { clubId: row.club_id, teamId: null };
}

export function assertDebtInScope(
  row: { club_id: string; assessment_team_id: string | null; origin_team_id: string | null },
  scope: LockedScope,
) {
  const allowed = scope.teamId
    ? row.club_id === scope.clubId &&
      row.assessment_team_id === scope.teamId &&
      row.origin_team_id === scope.teamId
    : row.club_id === scope.clubId;
  if (!allowed) {
    throw new InputError("access_denied", "Dluh nepatří do oprávněného rozsahu.");
  }
}

async function loadAllocatedHalere(
  transaction: DbTransaction,
  receivableIds: string[],
) {
  const uniqueIds = [...new Set(receivableIds)];
  if (!uniqueIds.length) return new Map<string, number>();
  const identifiers = sql.join(uniqueIds.map((id) => sql`${id}::uuid`), sql`, `);
  const rows = await transaction.execute<{
    receivable_id: string;
    allocated_halere: number;
  }>(sql`
    select r.id as receivable_id,
           coalesce(sum(pa.amount_halere), 0)::int as allocated_halere
    from receivables r
    left join payment_allocations pa on pa.receivable_id=r.id
    where r.id in (${identifiers})
    group by r.id
    order by r.id
  `);
  return new Map(rows.map((row) => [row.receivable_id, row.allocated_halere]));
}

function requireAllocatedHalere(
  allocations: Map<string, number>,
  receivableId: string,
) {
  const amount = allocations.get(receivableId);
  if (amount === undefined) {
    throw new InputError("invalid_debt", "Dluh nebyl nalezen.");
  }
  return amount;
}

export async function authorizeManagerRead(userId: string, scope: PaymentScope) {
  if ("teamId" in scope) {
    const team = await requireTeamManagementAccess(userId, scope.teamId!);
    return { clubId: team.clubId, teamId: team.id, name: team.name };
  }
  const club = await requireClubAdminAccess(userId, scope.clubId!);
  return { clubId: club.id, teamId: null, name: club.name };
}

export async function reportManualPayment(input: {
  actorUserId: string;
  receivableId: string;
  amountHalere: number;
}) {
  try {
    return await getDatabase().transaction(async (transaction) => {
      const rows = await transaction.execute<{
        id: string;
        club_id: string;
        team_id: string | null;
        amount_halere: number;
        allocated_halere: number;
        allowed: boolean;
        cancelled_at: Date | null;
      }>(sql`
        select r.id, a.club_id, a.team_id, r.amount_halere, r.cancelled_at,
               coalesce((select sum(pa.amount_halere) from payment_allocations pa where pa.receivable_id=r.id), 0)::int as allocated_halere,
               exists(select 1 from athlete_guardians ag where ag.athlete_id=r.athlete_id and ag.user_id=${input.actorUserId}) as allowed
        from receivables r
        join assessments a on a.id=r.assessment_id
        where r.id=${input.receivableId}
        for update of r
      `);
      const debt = rows[0];
      if (!debt?.allowed) {
        throw new InputError("access_denied", "Tento dluh nepatří vašemu účtu.");
      }
      if (debt.cancelled_at) {
        throw new InputError("cancelled", "Dluh byl zrušen, nelze k němu nahlásit platbu.");
      }
      if (debt.allocated_halere >= debt.amount_halere) {
        throw new InputError("already_paid", "Dluh je už podle evidence uhrazen.");
      }

      const [claim] = await transaction
        .insert(paymentClaims)
        .values({
          receivableId: debt.id,
          guardianUserId: input.actorUserId,
          amountHalere: input.amountHalere,
        })
        .returning({ id: paymentClaims.id });
      await transaction.insert(auditEvents).values({
        actorUserId: input.actorUserId,
        clubId: debt.club_id,
        teamId: debt.team_id,
        eventType: "payment_claim.reported",
        targetType: "payment_claim",
        targetId: claim.id,
        details: { amountHalere: input.amountHalere },
      });
      return claim;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new InputError("claim_pending", "U tohoto dluhu už jedno hlášení čeká na vyřízení.");
    }
    throw error;
  }
}

export async function withdrawManualPayment(input: {
  actorUserId: string;
  claimId: string;
}) {
  await getDatabase().transaction(async (transaction) => {
    const rows = await transaction.execute<{
      id: string;
      status: string;
      club_id: string;
      team_id: string | null;
      allowed: boolean;
    }>(sql`
      select pc.id, pc.status, a.club_id, a.team_id,
             (pc.guardian_user_id=${input.actorUserId}) as allowed
      from payment_claims pc
      join receivables r on r.id=pc.receivable_id
      join assessments a on a.id=r.assessment_id
      where pc.id=${input.claimId}
      for update of pc
    `);
    const claim = rows[0];
    if (!claim?.allowed) {
      throw new InputError("access_denied", "Toto hlášení nepatří vašemu účtu.");
    }
    if (claim.status !== "pending") {
      throw new InputError("claim_closed", "Vyřízené hlášení už nelze odvolat.");
    }
    await transaction
      .update(paymentClaims)
      .set({ status: "withdrawn", withdrawnAt: new Date() })
      .where(eq(paymentClaims.id, claim.id));
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: claim.club_id,
      teamId: claim.team_id,
      eventType: "payment_claim.withdrawn",
      targetType: "payment_claim",
      targetId: claim.id,
    });
  });
}

export async function reviewPaymentClaims(input: {
  actorUserId: string;
  scope: PaymentScope;
  claimIds: string[];
  decision: "approved" | "rejected";
  rejectionReason?: string;
}) {
  const claimIds = [...new Set(input.claimIds)];
  if (!claimIds.length) {
    throw new InputError("empty_selection", "Vyberte alespoň jedno hlášení.");
  }

  return getDatabase().transaction(async (transaction) => {
    const scope = await lockManagerScope(transaction, input.actorUserId, input.scope);
    const identifiers = sql.join(claimIds.map((id) => sql`${id}::uuid`), sql`, `);
    const rows = await transaction.execute<{
      id: string;
      status: string;
      receivable_id: string;
      amount_halere: number;
      club_id: string;
      assessment_team_id: string | null;
      origin_team_id: string | null;
    }>(sql`
      select pc.id, pc.status, pc.receivable_id, pc.amount_halere,
             a.club_id, a.team_id as assessment_team_id, r.origin_team_id
      from payment_claims pc
      join receivables r on r.id=pc.receivable_id
      join assessments a on a.id=r.assessment_id
      where pc.id in (${identifiers})
      order by r.id, pc.id
      for update of pc, r
    `);
    if (rows.length !== claimIds.length) {
      throw new InputError("invalid_selection", "Výběr obsahuje neplatné hlášení.");
    }
    rows.forEach((row) => assertDebtInScope(row, scope));
    const allocationsBefore = input.decision === "approved"
      ? await loadAllocatedHalere(transaction, rows.map((row) => row.receivable_id))
      : new Map<string, number>();

    let processed = 0;
    for (const claim of rows) {
      if (claim.status !== "pending") continue;
      const now = new Date();
      if (input.decision === "rejected") {
        await transaction
          .update(paymentClaims)
          .set({
            status: "rejected",
            rejectionReason: input.rejectionReason,
            reviewedByUserId: input.actorUserId,
            reviewedAt: now,
          })
          .where(eq(paymentClaims.id, claim.id));
        await transaction.insert(auditEvents).values({
          actorUserId: input.actorUserId,
          clubId: claim.club_id,
          teamId: claim.assessment_team_id,
          eventType: "payment_claim.rejected",
          targetType: "payment_claim",
          targetId: claim.id,
          details: { reason: input.rejectionReason ?? "" },
        });
      } else {
        const allocatedBeforeHalere = requireAllocatedHalere(
          allocationsBefore,
          claim.receivable_id,
        );
        const [event] = await transaction
          .insert(paymentEvents)
          .values({
            clubId: claim.club_id,
            teamId: claim.assessment_team_id,
            kind: "manual_claim",
            amountHalere: claim.amount_halere,
            occurredOn: todayInPrague(),
            recordedByUserId: input.actorUserId,
            sourceClaimId: claim.id,
          })
          .returning({ id: paymentEvents.id });
        await transaction.insert(paymentAllocations).values({
          paymentEventId: event.id,
          receivableId: claim.receivable_id,
          amountHalere: claim.amount_halere,
        });
        await transaction
          .update(paymentClaims)
          .set({
            status: "approved",
            reviewedByUserId: input.actorUserId,
            reviewedAt: now,
          })
          .where(eq(paymentClaims.id, claim.id));
        await transaction.insert(auditEvents).values({
          actorUserId: input.actorUserId,
          clubId: claim.club_id,
          teamId: claim.assessment_team_id,
          eventType: "payment_claim.approved",
          targetType: "payment_event",
          targetId: event.id,
          details: {
            claimId: claim.id,
            amountHalere: claim.amount_halere,
            allocatedBeforeHalere,
          },
        });
      }
      processed += 1;
    }
    return { processed, skipped: rows.length - processed };
  });
}

async function existingIdempotentEvent(input: {
  key: string;
  actorUserId: string;
  kind: "cash" | "correction";
  amountHalere?: number;
  reversesEventId?: string;
  receivableId?: string;
  occurredOn?: string;
  correctionReason?: string;
}) {
  const [existing] = await getDatabase()
    .select({
      id: paymentEvents.id,
      actorUserId: paymentEvents.recordedByUserId,
      kind: paymentEvents.kind,
      amountHalere: paymentEvents.amountHalere,
      reversesEventId: paymentEvents.reversesEventId,
      receivableId: paymentAllocations.receivableId,
      occurredOn: paymentEvents.occurredOn,
      correctionReason: paymentEvents.correctionReason,
    })
    .from(paymentEvents)
    .innerJoin(
      paymentAllocations,
      eq(paymentAllocations.paymentEventId, paymentEvents.id),
    )
    .where(eq(paymentEvents.idempotencyKey, input.key))
    .limit(1);
  if (!existing) return null;
  if (
    existing.actorUserId !== input.actorUserId ||
    existing.kind !== input.kind ||
    (input.amountHalere !== undefined && existing.amountHalere !== input.amountHalere) ||
    (input.reversesEventId !== undefined && existing.reversesEventId !== input.reversesEventId) ||
    (input.receivableId !== undefined && existing.receivableId !== input.receivableId) ||
    (input.occurredOn !== undefined && existing.occurredOn !== input.occurredOn) ||
    (input.correctionReason !== undefined && existing.correctionReason !== input.correctionReason)
  ) {
    throw new InputError("idempotency_conflict", "Tento formulář už byl použit s jinými údaji.");
  }
  return existing.id;
}

export async function recordCashPayment(input: {
  actorUserId: string;
  scope: PaymentScope;
  receivableId: string;
  amountHalere: number;
  occurredOn: string;
  idempotencyKey: string;
}) {
  const existing = await existingIdempotentEvent({
    key: input.idempotencyKey,
    actorUserId: input.actorUserId,
    kind: "cash",
    amountHalere: input.amountHalere,
    receivableId: input.receivableId,
    occurredOn: input.occurredOn,
  });
  if (existing) return { eventId: existing, created: false };

  try {
    const eventId = await getDatabase().transaction(async (transaction) => {
      const scope = await lockManagerScope(transaction, input.actorUserId, input.scope);
      const rows = await transaction.execute<{
        id: string;
        club_id: string;
        assessment_team_id: string | null;
        origin_team_id: string | null;
        cancelled_at: Date | null;
      }>(sql`
        select r.id, a.club_id, a.team_id as assessment_team_id, r.origin_team_id, r.cancelled_at
        from receivables r
        join assessments a on a.id=r.assessment_id
        where r.id=${input.receivableId}
        for update of r
      `);
      const debt = rows[0];
      if (!debt) throw new InputError("invalid_debt", "Dluh nebyl nalezen.");
      assertDebtInScope(debt, scope);
      if (debt.cancelled_at) {
        throw new InputError("cancelled", "Dluh byl zrušen, nelze k němu zapsat platbu.");
      }
      const allocatedBeforeHalere = requireAllocatedHalere(
        await loadAllocatedHalere(transaction, [debt.id]),
        debt.id,
      );

      const [event] = await transaction
        .insert(paymentEvents)
        .values({
          clubId: debt.club_id,
          teamId: debt.assessment_team_id,
          kind: "cash",
          amountHalere: input.amountHalere,
          occurredOn: input.occurredOn,
          recordedByUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
        })
        .returning({ id: paymentEvents.id });
      await transaction.insert(paymentAllocations).values({
        paymentEventId: event.id,
        receivableId: debt.id,
        amountHalere: input.amountHalere,
      });
      await transaction.insert(auditEvents).values({
        actorUserId: input.actorUserId,
        clubId: debt.club_id,
        teamId: debt.assessment_team_id,
        eventType: "payment.cash_recorded",
        targetType: "payment_event",
        targetId: event.id,
        details: {
          amountHalere: input.amountHalere,
          occurredOn: input.occurredOn,
          allocatedBeforeHalere,
        },
      });
      return event.id;
    });
    return { eventId, created: true };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const eventId = await existingIdempotentEvent({
        key: input.idempotencyKey,
        actorUserId: input.actorUserId,
        kind: "cash",
        amountHalere: input.amountHalere,
        receivableId: input.receivableId,
        occurredOn: input.occurredOn,
      });
      if (eventId) return { eventId, created: false };
    }
    throw error;
  }
}

export async function reversePaymentEvent(input: {
  actorUserId: string;
  scope: PaymentScope;
  paymentEventId: string;
  reason: string;
  idempotencyKey: string;
}, lockRetry = 0) {
  const existing = await existingIdempotentEvent({
    key: input.idempotencyKey,
    actorUserId: input.actorUserId,
    kind: "correction",
    reversesEventId: input.paymentEventId,
    correctionReason: input.reason,
  });
  if (existing) return { eventId: existing, created: false };

  try {
    const eventId = await getDatabase().transaction(async (transaction) => {
      const scope = await lockManagerScope(transaction, input.actorUserId, input.scope);
      const movementRows = await transaction.execute<{ bank_transaction_id: string | null }>(sql`
        select coalesce(
                 pe.bank_transaction_id,
                 (select bel.bank_transaction_id from bank_transaction_evidence_links bel
                   where bel.payment_event_id=pe.id and bel.invalidated_at is null limit 1)
               ) as bank_transaction_id
          from payment_events pe where pe.id=${input.paymentEventId}
      `);
      if (movementRows[0]?.bank_transaction_id) {
        await transaction.execute(sql`
          select id from bank_transactions where id=${movementRows[0].bank_transaction_id} for update
        `);
      }
      const rows = await transaction.execute<{
        event_id: string;
        kind: string;
        amount_halere: number;
        allocation_halere: number;
        receivable_id: string;
        club_id: string;
        assessment_team_id: string | null;
        origin_team_id: string | null;
        already_reversed: boolean;
        bank_transaction_id: string | null;
        linked_bank_transaction_id: string | null;
      }>(sql`
        select pe.id as event_id, pe.kind, pe.amount_halere,
               pa.amount_halere as allocation_halere, pa.receivable_id,
               a.club_id, a.team_id as assessment_team_id, r.origin_team_id,
               exists(select 1 from payment_events correction where correction.reverses_event_id=pe.id) as already_reversed,
               pe.bank_transaction_id,
               (select bel.bank_transaction_id from bank_transaction_evidence_links bel
                 where bel.payment_event_id=pe.id and bel.invalidated_at is null limit 1) as linked_bank_transaction_id
        from payment_events pe
        join payment_allocations pa on pa.payment_event_id=pe.id
        join receivables r on r.id=pa.receivable_id
        join assessments a on a.id=r.assessment_id
        where pe.id=${input.paymentEventId}
        for update of pe, pa, r
      `);
      const original = rows[0];
      if (!original) throw new InputError("invalid_event", "Platební záznam nebyl nalezen.");
      const lockedMovementId = movementRows[0]?.bank_transaction_id ?? null;
      const discoveredMovementId = original.bank_transaction_id ?? original.linked_bank_transaction_id;
      if (discoveredMovementId && discoveredMovementId !== lockedMovementId) {
        throw new MovementLockChanged();
      }
      assertDebtInScope(original, scope);
      if (original.kind === "correction" || original.already_reversed) {
        throw new InputError("already_reversed", "Tento záznam už byl opraven.");
      }
      const allocatedBeforeHalere = requireAllocatedHalere(
        await loadAllocatedHalere(transaction, [original.receivable_id]),
        original.receivable_id,
      );

      const [correction] = await transaction
        .insert(paymentEvents)
        .values({
          clubId: original.club_id,
          teamId: original.assessment_team_id,
          kind: "correction",
          amountHalere: Math.abs(original.allocation_halere),
          occurredOn: todayInPrague(),
          recordedByUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
          reversesEventId: original.event_id,
          correctionReason: input.reason,
          bankTransactionId: original.bank_transaction_id,
        })
        .returning({ id: paymentEvents.id });
      await transaction.insert(paymentAllocations).values({
        paymentEventId: correction.id,
        receivableId: original.receivable_id,
        amountHalere: -original.allocation_halere,
      });
      if (original.linked_bank_transaction_id) {
        await transaction.execute(sql`
          update bank_transaction_evidence_links
             set invalidated_at=now(), invalidated_by_user_id=${input.actorUserId}
           where payment_event_id=${original.event_id} and invalidated_at is null
        `);
        await transaction.execute(sql`
          update bank_transactions
             set status='unmatched', reason_code='linked_event_corrected',
                 resolution_reason=${input.reason}, resolved_by_user_id=${input.actorUserId}, resolved_at=now()
           where id=${original.linked_bank_transaction_id}
        `);
      } else if (original.bank_transaction_id) {
        const movementRowsAfter = await transaction.execute<{ amount_halere: number; allocated_halere: number }>(sql`
          select bt.amount_halere,
                 coalesce((select sum(pa.amount_halere) from payment_events pe
                           join payment_allocations pa on pa.payment_event_id=pe.id
                          where pe.bank_transaction_id=bt.id), 0)::int as allocated_halere
            from bank_transactions bt where bt.id=${original.bank_transaction_id}
        `);
        const movement = movementRowsAfter[0];
        await transaction.execute(sql`
          update bank_transactions
             set status=${movement.allocated_halere === 0 ? "unmatched" : "partially_allocated"},
                 reason_code='allocation_corrected', resolution_reason=${input.reason},
                 resolved_by_user_id=${input.actorUserId}, resolved_at=now()
           where id=${original.bank_transaction_id}
        `);
      }
      await transaction.insert(auditEvents).values({
        actorUserId: input.actorUserId,
        clubId: original.club_id,
        teamId: original.assessment_team_id,
        eventType: "payment.corrected",
        targetType: "payment_event",
        targetId: correction.id,
        details: {
          reversesEventId: original.event_id,
          amountHalere: original.allocation_halere,
          allocatedBeforeHalere,
          reason: input.reason,
          bankTransactionId: original.bank_transaction_id ?? original.linked_bank_transaction_id ?? "",
        },
      });
      return correction.id;
    });
    return { eventId, created: true };
  } catch (error) {
    if (error instanceof MovementLockChanged) {
      if (lockRetry < 1) return reversePaymentEvent(input, lockRetry + 1);
      throw new InputError("concurrent_change", "Finanční vazba se souběžně změnila. Obnovte stránku a akci zopakujte.");
    }
    if (isUniqueViolation(error)) {
      const eventId = await existingIdempotentEvent({
        key: input.idempotencyKey,
        actorUserId: input.actorUserId,
        kind: "correction",
        reversesEventId: input.paymentEventId,
        correctionReason: input.reason,
      });
      if (eventId) return { eventId, created: false };
    }
    throw error;
  }
}

export async function getManagerFinanceDashboard(
  userId: string,
  requestedScope: PaymentScope,
) {
  const scope = await authorizeManagerRead(userId, requestedScope);
  const condition = scope.teamId
    ? sql`a.team_id=${scope.teamId} and r.origin_team_id=${scope.teamId}`
    : sql`a.club_id=${scope.clubId}`;
  const database = getDatabase();
  const debts = await database.execute<{
    id: string;
    assessment_id: string;
    assessment_title: string;
    due_date: string;
    athlete_id: string;
    athlete_name: string;
    amount_halere: number;
    allocated_halere: number;
    has_pending_claim: boolean;
    last_reminder_at: Date | null;
    last_reminder_status: string | null;
    team_name: string | null;
    cancelled_at: Date | null;
    cancellation_reason: string | null;
  }>(sql`
    select r.id, a.id as assessment_id, a.title as assessment_title, a.due_date::text,
           ath.id as athlete_id, ath.full_name as athlete_name,
           r.amount_halere,
           coalesce((select sum(pa.amount_halere) from payment_allocations pa where pa.receivable_id=r.id), 0)::int as allocated_halere,
           exists(select 1 from payment_claims pc where pc.receivable_id=r.id and pc.status='pending') as has_pending_claim,
           (select max(rr.created_at) from reminder_recipients rr where rr.receivable_id=r.id) as last_reminder_at,
           (select nd.status
              from reminder_recipients rr
              join notification_deliveries nd on nd.kind='payment_reminder' and nd.reference_id=rr.id
             where rr.receivable_id=r.id
             order by rr.created_at desc
             limit 1) as last_reminder_status,
           t.name as team_name, r.cancelled_at, r.cancellation_reason
    from receivables r
    join assessments a on a.id=r.assessment_id
    join athletes ath on ath.id=r.athlete_id
    left join teams t on t.id=r.origin_team_id
    where ${condition}
    order by ath.last_name, ath.first_name, a.due_date, a.created_at
  `);
  const pendingClaims = await database.execute<{
    id: string;
    receivable_id: string;
    athlete_name: string;
    assessment_title: string;
    amount_halere: number;
    created_at: Date;
    guardian_email: string;
    team_name: string | null;
  }>(sql`
    select pc.id, pc.receivable_id,
           ath.full_name as athlete_name,
           a.title as assessment_title, pc.amount_halere, pc.created_at,
           u.email as guardian_email, t.name as team_name
    from payment_claims pc
    join receivables r on r.id=pc.receivable_id
    join assessments a on a.id=r.assessment_id
    join athletes ath on ath.id=r.athlete_id
    join users u on u.id=pc.guardian_user_id
    left join teams t on t.id=r.origin_team_id
    where pc.status='pending' and ${condition}
    order by pc.created_at
  `);
  const events = await database.execute<{
    id: string;
    receivable_id: string;
    kind: string;
    amount_halere: number;
    occurred_on: string;
    correction_reason: string | null;
    reversed: boolean;
  }>(sql`
    select pe.id, pa.receivable_id, pe.kind, pa.amount_halere,
           pe.occurred_on::text, pe.correction_reason,
           exists(select 1 from payment_events correction where correction.reverses_event_id=pe.id) as reversed
    from payment_events pe
    join payment_allocations pa on pa.payment_event_id=pe.id
    join receivables r on r.id=pa.receivable_id
    join assessments a on a.id=r.assessment_id
    where ${condition}
    order by pe.created_at desc
  `);

  const today = todayInPrague();
  const derivedDebts = debts.map((debt) => ({
    ...debt,
    ...deriveDebtState({
      amountHalere: debt.amount_halere,
      allocatedHalere: debt.allocated_halere,
      dueDate: debt.due_date,
      hasPendingClaim: debt.has_pending_claim,
      cancelled: Boolean(debt.cancelled_at),
      today,
    }),
    events: events.filter((event) => event.receivable_id === debt.id),
  }));
  await database.insert(auditEvents).values({
    actorUserId: userId,
    clubId: scope.clubId,
    teamId: scope.teamId,
    eventType: "finance.dashboard_viewed",
    targetType: scope.teamId ? "team" : "club",
    targetId: scope.teamId ?? scope.clubId,
  });
  return {
    ...scope,
    debts: derivedDebts,
    pendingClaims,
    totals: {
      expectedHalere: derivedDebts.reduce((sum, debt) => sum + (debt.cancelled_at ? 0 : debt.amount_halere), 0),
      collectedHalere: derivedDebts.reduce((sum, debt) => sum + (debt.cancelled_at ? 0 : debt.allocated_halere), 0),
      remainingHalere: derivedDebts.reduce((sum, debt) => sum + debt.remainingHalere, 0),
    },
  };
}

type ReminderRecipient = {
  deliveryId: string;
  reminderRecipientId: string;
  guardianUserId: string;
  guardianEmail: string;
  receivableId: string;
  athleteName: string;
  assessmentTitle: string;
  clubName: string;
  teamName: string | null;
  remainingHalere: number;
  dueDate: string;
};

async function sendReminders(recipients: ReminderRecipient[]) {
  await Promise.all(
    recipients.map(async (recipient) => {
      try {
        const message = buildPaymentReminderEmail(recipient);
        await sendRecordedTransactionalEmail(recipient.deliveryId, {
          userId: recipient.guardianUserId,
          recipient: recipient.guardianEmail,
          kind: "payment_reminder",
          referenceId: recipient.reminderRecipientId,
          ...message,
        });
      } catch {
        await failRecordedDelivery(recipient.deliveryId, "message_build_failed");
      }
    }),
  );
}

async function existingReminderBatch(input: {
  actorUserId: string;
  idempotencyKey: string;
  fingerprint: string;
}) {
  const [existing] = await getDatabase()
    .select({
      id: reminderBatches.id,
      actorUserId: reminderBatches.createdByUserId,
      fingerprint: reminderBatches.requestFingerprint,
    })
    .from(reminderBatches)
    .where(eq(reminderBatches.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (!existing) return null;
  if (existing.actorUserId !== input.actorUserId || existing.fingerprint !== input.fingerprint) {
    throw new InputError("idempotency_conflict", "Tento formulář už byl použit s jiným rozsahem.");
  }
  return existing.id;
}

async function loadRetryableReminderRecipients(batchId: string) {
  return getDatabase().execute<ReminderRecipient>(sql`
    select nd.id as "deliveryId", rr.id as "reminderRecipientId",
           u.id as "guardianUserId", u.email as "guardianEmail",
           r.id as "receivableId",
           ath.full_name as "athleteName",
           a.title as "assessmentTitle", c.name as "clubName", t.name as "teamName",
           greatest(r.amount_halere - coalesce((select sum(pa.amount_halere) from payment_allocations pa where pa.receivable_id=r.id), 0), 0)::int as "remainingHalere",
           a.due_date::text as "dueDate"
      from reminder_recipients rr
      join notification_deliveries nd
        on nd.kind='payment_reminder' and nd.reference_id=rr.id
      join receivables r on r.id=rr.receivable_id
      join assessments a on a.id=r.assessment_id
      join clubs c on c.id=a.club_id
      join athletes ath on ath.id=r.athlete_id
      join users u on u.id=rr.guardian_user_id
      left join teams t on t.id=r.origin_team_id
     where rr.batch_id=${batchId}
       and (
         nd.status in ('pending', 'failed')
         or (
           nd.status='sending'
           and (nd.attempt_started_at is null or nd.attempt_started_at < now() - interval '5 minutes')
         )
       )
       and r.cancelled_at is null
       and r.amount_halere - coalesce((select sum(pa.amount_halere) from payment_allocations pa where pa.receivable_id=r.id), 0) > 0
     order by rr.created_at
  `);
}

export async function sendBulkReminders(input: {
  actorUserId: string;
  scope: PaymentScope;
  idempotencyKey: string;
}) {
  const fingerprint = scopeFingerprint(input.scope);
  await authorizeManagerRead(input.actorUserId, input.scope);
  const existing = await existingReminderBatch({
    actorUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
    fingerprint,
  });
  if (existing) {
    const recipients = await loadRetryableReminderRecipients(existing);
    await sendReminders(recipients);
    return {
      batchId: existing,
      created: false,
      recipientCount: recipients.length,
    };
  }

  let result: { batchId: string; recipients: ReminderRecipient[] } | undefined;
  try {
    result = await getDatabase().transaction(async (transaction) => {
      const scope = await lockManagerScope(transaction, input.actorUserId, input.scope);
      const condition = scope.teamId
        ? sql`a.team_id=${scope.teamId} and r.origin_team_id=${scope.teamId}`
        : sql`a.club_id=${scope.clubId}`;
      const [batch] = await transaction
        .insert(reminderBatches)
        .values({
          clubId: scope.clubId,
          teamId: scope.teamId,
          createdByUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: fingerprint,
        })
        .returning({ id: reminderBatches.id });
      const debtRows = await transaction.execute<{
        receivable_id: string;
        guardian_user_id: string;
        guardian_email: string;
        athlete_name: string;
        assessment_title: string;
        club_name: string;
        team_name: string | null;
        remaining_halere: number;
        due_date: string;
      }>(sql`
        select r.id as receivable_id, u.id as guardian_user_id, u.email as guardian_email,
               ath.full_name as athlete_name,
               a.title as assessment_title, c.name as club_name, t.name as team_name,
               (r.amount_halere - coalesce((select sum(pa.amount_halere) from payment_allocations pa where pa.receivable_id=r.id), 0))::int as remaining_halere,
               a.due_date::text
        from receivables r
        join assessments a on a.id=r.assessment_id
        join clubs c on c.id=a.club_id
        join athletes ath on ath.id=r.athlete_id
        join athlete_guardians ag on ag.athlete_id=ath.id
        join users u on u.id=ag.user_id
        left join teams t on t.id=r.origin_team_id
        where ${condition}
          and r.cancelled_at is null
          and r.amount_halere - coalesce((select sum(pa.amount_halere) from payment_allocations pa where pa.receivable_id=r.id), 0) > 0
        order by u.email, a.due_date
      `);
      if (!debtRows.length) {
        throw new InputError("nothing_to_remind", "V tomto rozsahu není žádný nezaplacený dluh.");
      }
      const recipients: ReminderRecipient[] = [];
      for (const debt of debtRows) {
        const [reminder] = await transaction
          .insert(reminderRecipients)
          .values({
            batchId: batch.id,
            receivableId: debt.receivable_id,
            guardianUserId: debt.guardian_user_id,
          })
          .returning({ id: reminderRecipients.id });
        const [delivery] = await transaction
          .insert(notificationDeliveries)
          .values({
            userId: debt.guardian_user_id,
            recipientEmail: debt.guardian_email,
            kind: "payment_reminder",
            referenceId: reminder.id,
            status: "pending",
          })
          .returning({ id: notificationDeliveries.id });
        recipients.push({
          deliveryId: delivery.id,
          reminderRecipientId: reminder.id,
          guardianUserId: debt.guardian_user_id,
          guardianEmail: debt.guardian_email,
          receivableId: debt.receivable_id,
          athleteName: debt.athlete_name,
          assessmentTitle: debt.assessment_title,
          clubName: debt.club_name,
          teamName: debt.team_name,
          remainingHalere: debt.remaining_halere,
          dueDate: debt.due_date,
        });
      }
      await transaction.insert(auditEvents).values({
        actorUserId: input.actorUserId,
        clubId: scope.clubId,
        teamId: scope.teamId,
        eventType: "payment_reminder.batch_created",
        targetType: "reminder_batch",
        targetId: batch.id,
        details: { recipientCount: recipients.length },
      });
      return { batchId: batch.id, recipients };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const batchId = await existingReminderBatch({
        actorUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
        fingerprint,
      });
      if (batchId) {
        const recipients = await loadRetryableReminderRecipients(batchId);
        await sendReminders(recipients);
        return {
          batchId,
          created: false,
          recipientCount: recipients.length,
        };
      }
    }
    throw error;
  }

  await sendReminders(result.recipients);
  return {
    batchId: result.batchId,
    created: true,
    recipientCount: result.recipients.length,
  };
}
