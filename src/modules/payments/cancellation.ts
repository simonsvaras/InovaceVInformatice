import { eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { auditEvents, receivables } from "@/db/schema";
import { InputError } from "@/lib/validation";
import {
  assertDebtInScope,
  lockManagerScope,
} from "@/modules/payments/service";

type DebtScopeRow = {
  club_id: string;
  assessment_team_id: string | null;
  origin_team_id: string | null;
};

/**
 * Zruší neuhrazený dluh bez smazání historie. Týmový dluh smí zrušit trenér týmu
 * nebo správce klubu, celoklubový pouze správce (D-12).
 */
export async function cancelReceivable(input: {
  actorUserId: string;
  receivableId: string;
  reason: string;
}) {
  const [located] = await getDatabase().execute<DebtScopeRow>(sql`
    select a.club_id, a.team_id as assessment_team_id, r.origin_team_id
    from receivables r
    join assessments a on a.id=r.assessment_id
    where r.id=${input.receivableId}
  `);
  if (!located) throw new InputError("invalid_debt", "Dluh nebyl nalezen.");

  return getDatabase().transaction(async (transaction) => {
    // Nejprve rozsah (tým či klub), potom řádek dluhu: stejné pořadí zámků jako M4.
    const scope = await lockManagerScope(
      transaction,
      input.actorUserId,
      located.origin_team_id
        ? { teamId: located.origin_team_id }
        : { clubId: located.club_id },
    );
    const [debt] = await transaction.execute<DebtScopeRow & {
      amount_halere: number;
      cancelled_at: Date | null;
      allocated_halere: number;
      has_pending_claim: boolean;
    }>(sql`
      select a.club_id, a.team_id as assessment_team_id, r.origin_team_id,
             r.amount_halere, r.cancelled_at,
             coalesce((select sum(pa.amount_halere) from payment_allocations pa where pa.receivable_id=r.id), 0)::int as allocated_halere,
             exists(select 1 from payment_claims pc where pc.receivable_id=r.id and pc.status='pending') as has_pending_claim
      from receivables r
      join assessments a on a.id=r.assessment_id
      where r.id=${input.receivableId}
      for update of r
    `);
    if (!debt) throw new InputError("invalid_debt", "Dluh nebyl nalezen.");
    assertDebtInScope(debt, scope);
    if (debt.cancelled_at) {
      throw new InputError("already_cancelled", "Dluh už byl zrušen.");
    }
    if (debt.allocated_halere !== 0) {
      throw new InputError(
        "has_payments",
        "Dluh s evidovanou úhradou nelze zrušit. Nejprve opravte úhradu protizápisem.",
      );
    }
    if (debt.has_pending_claim) {
      throw new InputError(
        "claim_pending",
        "U dluhu čeká hlášení rodiče. Nejdřív je potvrďte nebo zamítněte.",
      );
    }
    await transaction
      .update(receivables)
      .set({
        cancelledAt: new Date(),
        cancelledByUserId: input.actorUserId,
        cancellationReason: input.reason,
      })
      .where(eq(receivables.id, input.receivableId));
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: debt.club_id,
      teamId: debt.origin_team_id,
      eventType: "receivable.cancelled",
      targetType: "receivable",
      targetId: input.receivableId,
      details: { amountHalere: debt.amount_halere, reason: input.reason },
    });
    return { amountHalere: debt.amount_halere };
  });
}
