import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  auditEvents,
  bankAccounts,
  bankTransactions,
  fioIntegrations,
  fioSyncRequests,
  fioTokenCallLeases,
  fioVerificationAttempts,
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
import { domesticAccountToIban } from "@/modules/payments/qr";
import type { PaymentScope } from "@/modules/payments/service";

import { FioApiError, type FioMovement, type FioPeriod, readFioPeriod } from "./client";
import { decryptFioToken, encryptFioToken, fioTokenFingerprint } from "./crypto";
import { buildFioPaymentEmail } from "./email";

type Database = ReturnType<typeof getDatabase>;
type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type LockedScope = {
  clubId: string;
  teamId: string | null;
  isAdmin: boolean;
};

type FioDelivery = {
  deliveryId: string;
  guardianUserId: string;
  guardianEmail: string;
  athleteName: string;
  assessmentTitle: string;
  clubName: string;
  teamName: string | null;
  amountHalere: number;
};

const fioErrorCodes = new Set([
  "cooldown",
  "fio_cooldown",
  "invalid_token",
  "history_locked",
  "unavailable",
  "invalid_response",
  "fio_account_mismatch",
]);

function readableFioError(error: unknown) {
  if (error instanceof FioApiError || error instanceof InputError) {
    return { code: error.code, message: error.message };
  }
  if (
    typeof error === "object" && error !== null &&
    "code" in error && typeof error.code === "string" && fioErrorCodes.has(error.code) &&
    "message" in error && typeof error.message === "string"
  ) {
    return { code: error.code, message: error.message };
  }
  return null;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function timestampMs(value: Date | string | null | undefined) {
  if (!value) return null;
  const milliseconds = new Date(value).getTime();
  return Number.isNaN(milliseconds) ? null : milliseconds;
}

function normalizeAccountId(value: string) {
  return value
    .replace(/\s/g, "")
    .split("-")
    .map((part) => part.replace(/^0+(?=\d)/, ""))
    .join("-");
}

function localAccountId(accountNumber: string) {
  return normalizeAccountId(accountNumber.split("/")[0] ?? "");
}

function localAccountBaseId(accountNumber: string) {
  return normalizeAccountId((accountNumber.split("/")[0] ?? "").split("-").at(-1) ?? "");
}

function validateFioToken(token: string) {
  const normalized = token.trim();
  if (!/^[A-Za-z0-9]{64}$/.test(normalized)) {
    throw new InputError("invalid_fio_token", "Fio token musí být 64znakový řetězec z internetového bankovnictví.");
  }
  return normalized;
}

async function lockScope(
  transaction: DbTransaction,
  actorUserId: string,
  scope: PaymentScope,
): Promise<LockedScope> {
  if (scope.teamId) {
    const rows = await transaction.execute<{
      club_id: string;
      is_admin: boolean;
      is_coach: boolean;
    }>(sql`
      select t.club_id,
             exists(select 1 from club_admins ca where ca.club_id=t.club_id and ca.user_id=${actorUserId}) as is_admin,
             exists(select 1 from team_coaches tc where tc.team_id=t.id and tc.user_id=${actorUserId} and tc.ended_at is null) as is_coach
        from teams t where t.id=${scope.teamId} and t.archived_at is null
       for update of t
    `);
    const row = rows[0];
    if (!row || (!row.is_admin && !row.is_coach)) {
      throw new InputError("access_denied", "K nastavení bankovního účtu týmu nemáte oprávnění.");
    }
    return { clubId: row.club_id, teamId: scope.teamId, isAdmin: row.is_admin };
  }
  const rows = await transaction.execute<{ allowed: boolean }>(sql`
    select exists(select 1 from club_admins ca where ca.club_id=c.id and ca.user_id=${actorUserId}) as allowed
      from clubs c where c.id=${scope.clubId!} for update of c
  `);
  if (!rows[0]?.allowed) {
    throw new InputError("access_denied", "Synchronizaci sdíleného účtu spravuje pouze správce klubu.");
  }
  return { clubId: scope.clubId!, teamId: null, isAdmin: true };
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

async function lockAccountForConfiguration(
  transaction: DbTransaction,
  actorUserId: string,
  scopeInput: PaymentScope,
  bankAccountId: string,
) {
  const scope = await lockScope(transaction, actorUserId, scopeInput);
  const rows = await transaction.execute<{
    id: string;
    club_id: string;
    account_number: string;
    is_default: boolean;
    feed_exclusive_team_id: string | null;
    allowed_in_scope: boolean;
  }>(sql`
    select ba.id, ba.club_id, ba.account_number, ba.is_default, ba.feed_exclusive_team_id,
           ${scope.teamId
             ? sql`(
                 ba.id=coalesce((select current_team.bank_account_id from teams current_team where current_team.id=${scope.teamId}), (select d.id from bank_accounts d where d.club_id=t.club_id and d.is_default=true))
                 or (
                   ba.feed_exclusive_team_id=${scope.teamId}
                   and exists(select 1 from receivables historical where historical.bank_account_id=ba.id and historical.origin_team_id=${scope.teamId})
                 )
               )`
             : sql`ba.club_id=${scope.clubId}`} as allowed_in_scope
      from bank_accounts ba
      ${scope.teamId ? sql`cross join teams t` : sql``}
     where ba.id=${bankAccountId} ${scope.teamId ? sql`and t.id=${scope.teamId}` : sql``}
     for update of ba
  `);
  const account = rows[0];
  if (!account?.allowed_in_scope || account.club_id !== scope.clubId) {
    throw new InputError("access_denied", "Účet nepatří do oprávněného rozsahu.");
  }
  if (!account.account_number.endsWith("/2010")) {
    throw new InputError("not_fio_account", "Automatickou synchronizaci lze v tomto milníku aktivovat jen pro účet Fio banky s kódem 2010.");
  }
  let exclusiveTeamId = account.feed_exclusive_team_id;
  if (!exclusiveTeamId) {
    const candidates = await accountOwnerCandidates(transaction, account.id);
    exclusiveTeamId = !account.is_default && candidates.length === 1 && candidates[0]
      ? candidates[0]
      : null;
    if (exclusiveTeamId) {
      await transaction.execute(sql`
        update bank_accounts set feed_exclusive_team_id=${exclusiveTeamId} where id=${account.id}
      `);
      await transaction.execute(sql`
        update bank_integrations set exclusive_team_id=${exclusiveTeamId}
         where bank_account_id=${account.id} and exclusive_team_id is null
      `);
    }
  }
  if (!scope.isAdmin && (!scope.teamId || exclusiveTeamId !== scope.teamId)) {
    throw new InputError(
      "shared_account",
      "Tento účet není výhradním účtem týmu; synchronizaci smí spravovat jen správce klubu.",
    );
  }
  return { scope, account: { ...account, feed_exclusive_team_id: exclusiveTeamId } };
}

async function reserveTokenCall(fingerprint: string) {
  const leaseOwner = randomUUID();
  await getDatabase().transaction(async (transaction) => {
    await transaction.insert(fioTokenCallLeases).values({ tokenFingerprint: fingerprint })
      .onConflictDoNothing();
    const rows = await transaction.execute<{
      token_busy: boolean;
    }>(sql`
      select (lease_until is not null and lease_until > now())
          or (next_allowed_at is not null and next_allowed_at > now()) as token_busy
        from fio_token_call_leases
       where token_fingerprint=${fingerprint} for update
    `);
    const row = rows[0];
    if (row?.token_busy) {
      throw new InputError("fio_cooldown", "Stejný Fio token lze použít nejvýše jednou za 30 sekund. Zkuste to za chvíli.");
    }
    await transaction.execute(sql`
      update fio_token_call_leases
         set lease_owner=${leaseOwner}, lease_until=now() + interval '30 seconds',
             next_allowed_at=now() + interval '30 seconds', updated_at=now()
       where token_fingerprint=${fingerprint}
    `);
  });
  return leaseOwner;
}

async function releaseTokenCall(fingerprint: string, leaseOwner: string) {
  await getDatabase().execute(sql`
    update fio_token_call_leases set lease_owner=null, lease_until=null, updated_at=now()
     where token_fingerprint=${fingerprint} and lease_owner=${leaseOwner}
  `);
}

function verifyAccountIdentity(accountNumber: string, period: FioPeriod) {
  const expectedIban = domesticAccountToIban(accountNumber);
  const responseAccountId = normalizeAccountId(period.accountId);
  if (
    period.bankId !== "2010" ||
    period.currency !== "CZK" ||
    period.iban !== expectedIban ||
    ![localAccountId(accountNumber), localAccountBaseId(accountNumber)].includes(responseAccountId)
  ) {
    throw new InputError(
      "fio_account_mismatch",
      "Token zpřístupňuje jiný účet nebo jinou měnu. Použijte token pro zobrazený CZK účet Fio banky.",
    );
  }
}

async function markVerificationFailed(input: {
  attemptId?: string;
  actorUserId: string;
  clubId: string;
  teamId: string | null;
  bankAccountId: string;
  code: string;
}) {
  await getDatabase().transaction(async (transaction) => {
    if (input.attemptId) {
      await transaction.execute(sql`
        update fio_verification_attempts set status='failed', completed_at=now()
         where id=${input.attemptId} and status='pending'
      `);
    }
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: input.clubId,
      teamId: input.teamId,
      eventType: "fio_integration.verification_failed",
      targetType: "bank_account",
      targetId: input.bankAccountId,
      details: { errorCode: input.code },
    });
  });
}

async function importInitialMovements(
  transaction: DbTransaction,
  input: {
    integrationId: string;
    bankAccountId: string;
    clubId: string;
    movements: FioMovement[];
  },
) {
  let createdCount = 0;
  for (const movement of input.movements) {
    const [created] = await transaction.insert(bankTransactions).values({
      integrationId: null,
      fioIntegrationId: input.integrationId,
      bankAccountId: input.bankAccountId,
      source: "fio",
      sourceTransactionId: movement.sourceTransactionId,
      amountHalere: movement.amountHalere,
      currency: movement.currency,
      variableSymbol: movement.variableSymbol,
      counterAccount: movement.counterAccount,
      counterBankCode: movement.counterBankCode,
      counterpartyName: movement.counterpartyName,
      recipientMessage: movement.recipientMessage,
      transactionType: movement.transactionType,
      occurredAt: movement.occurredAt,
      createdByUserId: null,
      ingestionOrigin: "fio_sync",
      initialImport: true,
      status: "unmatched",
      reasonCode: "initial_import_review",
    }).onConflictDoNothing().returning({ id: bankTransactions.id });
    if (!created) continue;
    createdCount += 1;
    await transaction.insert(auditEvents).values({
      actorUserId: null,
      clubId: input.clubId,
      eventType: "bank_transaction.fio_received",
      targetType: "bank_transaction",
      targetId: created.id,
      details: { source: "fio", initialImport: true },
    });
  }
  return createdCount;
}

export async function verifyAndActivateFio(input: {
  actorUserId: string;
  scope: PaymentScope;
  bankAccountId: string;
  token: string;
}) {
  const token = validateFioToken(input.token);
  const fingerprint = fioTokenFingerprint(token);
  const encrypted = encryptFioToken(token);
  const started = await getDatabase().transaction(async (transaction) => {
    const { scope, account } = await lockAccountForConfiguration(
      transaction,
      input.actorUserId,
      input.scope,
      input.bankAccountId,
    );
    const existingRows = await transaction.execute<{
      id: string;
      updated_at: Date;
    }>(sql`
      select id, updated_at from fio_integrations where bank_account_id=${account.id} for update
    `);
    const existing = existingRows[0];
    const [attempt] = await transaction.insert(fioVerificationAttempts).values({
      bankAccountId: account.id,
      requestedByUserId: input.actorUserId,
      tokenFingerprint: fingerprint,
      purpose: existing ? "replace" : "activate",
      expectedIntegrationUpdatedAt: existing?.updated_at ?? null,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    }).returning({ id: fioVerificationAttempts.id });
    return {
      attemptId: attempt.id,
      scope,
      account,
      purpose: existing ? "replace" as const : "activate" as const,
      expectedUpdatedAt: existing?.updated_at ?? null,
    };
  });

  let tokenLease: string | undefined;
  let period: FioPeriod;
  const dateTo = todayInPrague();
  const dateFrom = addDays(dateTo, -6);
  try {
    tokenLease = await reserveTokenCall(fingerprint);
    period = await readFioPeriod(token, dateFrom, dateTo);
    verifyAccountIdentity(started.account.account_number, period);
  } catch (error) {
    const readable = readableFioError(error);
    const code = readable?.code ?? "fio_verification_failed";
    await markVerificationFailed({
      attemptId: started.attemptId,
      actorUserId: input.actorUserId,
      clubId: started.scope.clubId,
      teamId: started.scope.teamId,
      bankAccountId: input.bankAccountId,
      code,
    });
    if (readable) throw new InputError(readable.code, readable.message);
    throw new InputError("fio_verification_failed", "Spojení s Fio se nepodařilo bezpečně ověřit.");
  } finally {
    if (tokenLease) await releaseTokenCall(fingerprint, tokenLease);
  }

  return getDatabase().transaction(async (transaction) => {
    const { scope, account } = await lockAccountForConfiguration(
      transaction,
      input.actorUserId,
      input.scope,
      input.bankAccountId,
    );
    const attempts = await transaction.execute<{
      status: string;
      expires_at: Date;
      purpose: string;
      expected_integration_updated_at: Date | null;
    }>(sql`
      select status, expires_at, purpose, expected_integration_updated_at
        from fio_verification_attempts where id=${started.attemptId} for update
    `);
    const attempt = attempts[0];
    if (!attempt || attempt.status !== "pending" || (timestampMs(attempt.expires_at) ?? 0) < Date.now()) {
      throw new InputError("stale_verification", "Ověření vypršelo. Zopakujte aktivaci.");
    }
    const existingRows = await transaction.execute<{ id: string; updated_at: Date }>(sql`
      select id, updated_at from fio_integrations where bank_account_id=${account.id} for update
    `);
    const existing = existingRows[0];
    if (
      (started.purpose === "activate" && existing) ||
      (started.purpose === "replace" && (
        !existing || timestampMs(existing.updated_at) !== timestampMs(started.expectedUpdatedAt)
      ))
    ) {
      throw new InputError("stale_verification", "Nastavení účtu mezitím změnil jiný požadavek. Ověření zopakujte.");
    }
    let integrationId: string;
    const now = new Date();
    if (existing) {
      await transaction.update(fioIntegrations).set({
        status: "active",
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenFingerprint: encrypted.fingerprint,
        tokenKeyVersion: encrypted.keyVersion,
        configuredByUserId: input.actorUserId,
        activatedAt: now,
        initialImportCompletedAt: now,
        lastAttemptAt: now,
        lastSuccessAt: now,
        lastSuccessfulPeriodTo: dateTo,
        nextAllowedAt: new Date(now.getTime() + 30_000),
        lastErrorCode: null,
        lastErrorMessage: null,
        leaseOwner: null,
        leaseUntil: null,
        updatedAt: now,
      }).where(eq(fioIntegrations.id, existing.id));
      integrationId = existing.id;
    } else {
      const [created] = await transaction.insert(fioIntegrations).values({
        bankAccountId: account.id,
        status: "active",
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenFingerprint: encrypted.fingerprint,
        tokenKeyVersion: encrypted.keyVersion,
        configuredByUserId: input.actorUserId,
        activatedAt: now,
        initialImportCompletedAt: now,
        lastAttemptAt: now,
        lastSuccessAt: now,
        lastSuccessfulPeriodTo: dateTo,
        nextAllowedAt: new Date(now.getTime() + 30_000),
      }).returning({ id: fioIntegrations.id });
      integrationId = created.id;
    }
    const createdCount = await importInitialMovements(transaction, {
      integrationId,
      bankAccountId: account.id,
      clubId: scope.clubId,
      movements: period.movements,
    });
    await transaction.execute(sql`
      update fio_integrations
         set last_new_movement_at=case when ${createdCount} > 0 then now() else last_new_movement_at end
       where id=${integrationId}
    `);
    await transaction.execute(sql`
      update fio_verification_attempts set status='completed', completed_at=now()
       where id=${started.attemptId}
    `);
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: scope.clubId,
      teamId: scope.teamId,
      eventType: existing ? "fio_integration.token_replaced" : "fio_integration.activated",
      targetType: "fio_integration",
      targetId: integrationId,
      details: { bankAccountId: account.id, initialReviewMovements: createdCount },
    });
    return { integrationId, replaced: Boolean(existing), initialReviewMovements: createdCount };
  });
}

async function lockFioIntegrationInScope(
  transaction: DbTransaction,
  actorUserId: string,
  scopeInput: PaymentScope,
  bankAccountId: string,
) {
  const locked = await lockAccountForConfiguration(transaction, actorUserId, scopeInput, bankAccountId);
  const rows = await transaction.execute<{
    id: string;
    status: string;
  }>(sql`
    select id, status from fio_integrations where bank_account_id=${bankAccountId} for update
  `);
  if (!rows[0]) throw new InputError("fio_not_configured", "Fio synchronizace pro tento účet není aktivovaná.");
  return { ...locked, integration: rows[0] };
}

export async function requestFioSync(input: {
  actorUserId: string;
  scope: PaymentScope;
  bankAccountId: string;
}) {
  return getDatabase().transaction(async (transaction) => {
    const { scope, integration } = await lockFioIntegrationInScope(
      transaction,
      input.actorUserId,
      input.scope,
      input.bankAccountId,
    );
    if (integration.status !== "active") {
      throw new InputError("fio_not_active", "Synchronizace není aktivní. Nejprve obnovte token nebo vyřešte stav spojení.");
    }
    const [created] = await transaction.insert(fioSyncRequests).values({
      integrationId: integration.id,
      requestedByUserId: input.actorUserId,
    }).onConflictDoNothing().returning({ id: fioSyncRequests.id });
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: scope.clubId,
      teamId: scope.teamId,
      eventType: "fio_sync.requested",
      targetType: "fio_integration",
      targetId: integration.id,
      details: { alreadyQueued: !created },
    });
    return { queued: Boolean(created) };
  });
}

export async function disableFioIntegration(input: {
  actorUserId: string;
  scope: PaymentScope;
  bankAccountId: string;
}) {
  await getDatabase().transaction(async (transaction) => {
    const { scope, integration } = await lockFioIntegrationInScope(
      transaction,
      input.actorUserId,
      input.scope,
      input.bankAccountId,
    );
    await transaction.update(fioIntegrations).set({
      status: "disabled",
      tokenCiphertext: null,
      tokenIv: null,
      tokenAuthTag: null,
      tokenFingerprint: null,
      leaseOwner: null,
      leaseUntil: null,
      nextAllowedAt: null,
      updatedAt: new Date(),
    }).where(eq(fioIntegrations.id, integration.id));
    await transaction.update(fioSyncRequests).set({
      status: "failed",
      completedAt: new Date(),
      errorCode: "integration_disabled",
    }).where(and(
      eq(fioSyncRequests.integrationId, integration.id),
      inArray(fioSyncRequests.status, ["pending", "processing"]),
    ));
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: scope.clubId,
      teamId: scope.teamId,
      eventType: "fio_integration.disabled",
      targetType: "fio_integration",
      targetId: integration.id,
    });
  });
}

async function createFioDeliveries(
  transaction: DbTransaction,
  input: {
    allocationId: string;
    receivableId: string;
    athleteName: string;
    assessmentTitle: string;
    clubName: string;
    teamName: string | null;
    amountHalere: number;
  },
) {
  const guardians = await transaction.execute<{ user_id: string; email: string }>(sql`
    select distinct u.id as user_id, u.email
      from receivables r
      join athlete_guardians ag on ag.athlete_id=r.athlete_id
      join users u on u.id=ag.user_id
     where r.id=${input.receivableId}
     order by u.id
  `);
  const deliveries: FioDelivery[] = [];
  for (const guardian of guardians) {
    const [delivery] = await transaction.insert(notificationDeliveries).values({
      userId: guardian.user_id,
      recipientEmail: guardian.email,
      kind: "fio_payment_recorded",
      referenceId: input.allocationId,
      status: "pending",
    }).onConflictDoNothing().returning({ id: notificationDeliveries.id });
    if (delivery) {
      deliveries.push({
        deliveryId: delivery.id,
        guardianUserId: guardian.user_id,
        guardianEmail: guardian.email,
        athleteName: input.athleteName,
        assessmentTitle: input.assessmentTitle,
        clubName: input.clubName,
        teamName: input.teamName,
        amountHalere: input.amountHalere,
      });
    }
  }
  return deliveries;
}

async function autoAllocateFioMovement(
  transaction: DbTransaction,
  input: {
    bankTransactionId: string;
    bankAccountId: string;
    variableSymbol: string | null;
    amountHalere: number;
    occurredAt: Date;
  },
) {
  if (!input.variableSymbol) return { status: "unmatched", reasonCode: "invalid_vs", deliveries: [] as FioDelivery[] };
  const candidateIds = await transaction.execute<{ id: string }>(sql`
    select r.id from receivables r
     where r.bank_account_id=${input.bankAccountId} and r.variable_symbol=${input.variableSymbol}
     order by r.id
  `);
  if (candidateIds.length !== 1) {
    return { status: "unmatched", reasonCode: candidateIds.length ? "ambiguous_vs" : "unknown_vs", deliveries: [] as FioDelivery[] };
  }
  const candidates = await transaction.execute<{
    id: string;
    club_id: string;
    assessment_team_id: string | null;
    amount_halere: number;
    athlete_name: string;
    assessment_title: string;
    club_name: string;
    team_name: string | null;
  }>(sql`
    select r.id, a.club_id, a.team_id as assessment_team_id, r.amount_halere,
           ath.full_name as athlete_name, a.title as assessment_title,
           c.name as club_name, t.name as team_name
      from receivables r
      join assessments a on a.id=r.assessment_id
      join athletes ath on ath.id=r.athlete_id
      join clubs c on c.id=a.club_id
      left join teams t on t.id=r.origin_team_id
     where r.id=${candidateIds[0].id}
     for update of r
  `);
  const candidate = candidates[0];
  if (!candidate) return { status: "unmatched", reasonCode: "unknown_vs", deliveries: [] as FioDelivery[] };
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
  if (remaining <= 0) return { status: "unmatched", reasonCode: "already_paid", deliveries: [] as FioDelivery[] };
  if (state?.pending_claim) return { status: "unmatched", reasonCode: "pending_claim", deliveries: [] as FioDelivery[] };
  if (state?.active_manual_payment) return { status: "unmatched", reasonCode: "possible_manual_duplicate", deliveries: [] as FioDelivery[] };
  if (remaining !== input.amountHalere) return { status: "unmatched", reasonCode: "amount_mismatch", deliveries: [] as FioDelivery[] };

  const [event] = await transaction.insert(paymentEvents).values({
    clubId: candidate.club_id,
    teamId: candidate.assessment_team_id,
    kind: "fio",
    amountHalere: input.amountHalere,
    occurredOn: todayInPrague(input.occurredAt),
    recordedByUserId: null,
    recordedOrigin: "fio_sync",
    bankTransactionId: input.bankTransactionId,
  }).returning({ id: paymentEvents.id });
  const [allocation] = await transaction.insert(paymentAllocations).values({
    paymentEventId: event.id,
    receivableId: candidate.id,
    amountHalere: input.amountHalere,
  }).returning({ id: paymentAllocations.id });
  await transaction.insert(auditEvents).values({
    actorUserId: null,
    clubId: candidate.club_id,
    teamId: candidate.assessment_team_id,
    eventType: "bank_transaction.fio_auto_allocated",
    targetType: "bank_transaction",
    targetId: input.bankTransactionId,
    details: { paymentEventId: event.id, receivableId: candidate.id, amountHalere: input.amountHalere, source: "fio" },
  });
  const deliveries = await createFioDeliveries(transaction, {
    allocationId: allocation.id,
    receivableId: candidate.id,
    athleteName: candidate.athlete_name,
    assessmentTitle: candidate.assessment_title,
    clubName: candidate.club_name,
    teamName: candidate.team_name,
    amountHalere: input.amountHalere,
  });
  return { status: "allocated", reasonCode: "auto_allocated", deliveries };
}

async function possibleReversedMovement(
  transaction: DbTransaction,
  bankAccountId: string,
  movement: FioMovement,
) {
  const rows = await transaction.execute<{ id: string }>(sql`
    select bt.id from bank_transactions bt
     where bt.bank_account_id=${bankAccountId} and bt.source='fio'
       and bt.amount_halere=${Math.abs(movement.amountHalere)}
       and bt.variable_symbol is not distinct from ${movement.variableSymbol}
       and bt.occurred_at <= ${movement.occurredAt}
       and exists(select 1 from payment_events pe where pe.bank_transaction_id=bt.id)
     order by bt.occurred_at desc limit 2
  `);
  return rows.length === 1 ? rows[0].id : null;
}

async function importLivePeriod(
  transaction: DbTransaction,
  input: {
    integrationId: string;
    bankAccountId: string;
    clubId: string;
    period: FioPeriod;
  },
) {
  let createdCount = 0;
  const deliveries: FioDelivery[] = [];
  for (const movement of input.period.movements) {
    const relatedTransactionId = movement.amountHalere < 0
      ? await possibleReversedMovement(transaction, input.bankAccountId, movement)
      : null;
    let reasonCode = movement.amountHalere < 0
      ? relatedTransactionId ? "negative_possible_reversal" : "negative_transaction"
      : movement.currency !== "CZK" ? "non_czk" : "received";
    const [created] = await transaction.insert(bankTransactions).values({
      integrationId: null,
      fioIntegrationId: input.integrationId,
      bankAccountId: input.bankAccountId,
      source: "fio",
      sourceTransactionId: movement.sourceTransactionId,
      amountHalere: movement.amountHalere,
      currency: movement.currency,
      variableSymbol: movement.variableSymbol,
      counterAccount: movement.counterAccount,
      counterBankCode: movement.counterBankCode,
      counterpartyName: movement.counterpartyName,
      recipientMessage: movement.recipientMessage,
      transactionType: movement.transactionType,
      occurredAt: movement.occurredAt,
      createdByUserId: null,
      ingestionOrigin: "fio_sync",
      initialImport: false,
      relatedTransactionId,
      status: "unmatched",
      reasonCode,
    }).onConflictDoNothing().returning({ id: bankTransactions.id });
    if (!created) continue;
    createdCount += 1;
    if (movement.amountHalere > 0 && movement.currency === "CZK") {
      const allocation = await autoAllocateFioMovement(transaction, {
        bankTransactionId: created.id,
        bankAccountId: input.bankAccountId,
        variableSymbol: movement.variableSymbol,
        amountHalere: movement.amountHalere,
        occurredAt: movement.occurredAt,
      });
      reasonCode = allocation.reasonCode;
      deliveries.push(...allocation.deliveries);
      await transaction.execute(sql`
        update bank_transactions set status=${allocation.status}, reason_code=${allocation.reasonCode}
         where id=${created.id}
      `);
    }
    await transaction.insert(auditEvents).values({
      actorUserId: null,
      clubId: input.clubId,
      eventType: "bank_transaction.fio_received",
      targetType: "bank_transaction",
      targetId: created.id,
      details: { source: "fio", initialImport: false, reasonCode, possibleReversal: Boolean(relatedTransactionId) },
    });
  }
  return { createdCount, deliveries };
}

async function sendFioDeliveries(deliveries: FioDelivery[]) {
  for (const delivery of deliveries) {
    try {
      await sendRecordedTransactionalEmail(delivery.deliveryId, {
        userId: delivery.guardianUserId,
        recipient: delivery.guardianEmail,
        kind: "fio_payment_recorded",
        referenceId: undefined,
        ...buildFioPaymentEmail(delivery),
      });
    } catch {
      await failRecordedDelivery(delivery.deliveryId, "message_build_failed");
    }
  }
}

type ClaimedIntegration = {
  id: string;
  bankAccountId: string;
  clubId: string;
  tokenCiphertext: string;
  tokenIv: string;
  tokenAuthTag: string;
  tokenKeyVersion: number;
  tokenFingerprint: string;
  lastSuccessfulPeriodTo: string | null;
  leaseOwner: string;
  requestId: string | null;
};

async function claimDueIntegration(): Promise<ClaimedIntegration | null> {
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(sql`
      update fio_sync_requests fsr
         set status='pending', started_at=null
       where fsr.status='processing'
         and exists(
           select 1 from fio_integrations fi
            where fi.id=fsr.integration_id
              and (fi.lease_until is null or fi.lease_until < now())
         )
    `);
    await transaction.execute(sql`
      update fio_integrations fi
         set status='intervention', last_error_code='history_gap',
             last_error_message='Poslední úspěšná kontrola je starší než dostupná 90denní historie. Je nutný zásah správce.',
             updated_at=now()
       where fi.status='active' and fi.last_successful_period_to is not null
         and fi.last_successful_period_to < (current_date - interval '88 days')::date
    `);
    const rows = await transaction.execute<{
      id: string;
      bank_account_id: string;
      club_id: string;
      token_ciphertext: string;
      token_iv: string;
      token_auth_tag: string;
      token_key_version: number;
      token_fingerprint: string;
      last_successful_period_to: string | null;
      request_id: string | null;
    }>(sql`
      select fi.id, fi.bank_account_id, ba.club_id, fi.token_ciphertext,
             fi.token_iv, fi.token_auth_tag, fi.token_key_version,
             fi.token_fingerprint, fi.last_successful_period_to,
             (select fsr.id from fio_sync_requests fsr where fsr.integration_id=fi.id and fsr.status='pending' order by fsr.requested_at limit 1) as request_id
        from fio_integrations fi
        join bank_accounts ba on ba.id=fi.bank_account_id
       where fi.status='active'
         and (fi.lease_until is null or fi.lease_until < now())
         and (fi.next_allowed_at is null or fi.next_allowed_at <= now())
         and (
           exists(select 1 from fio_sync_requests fsr where fsr.integration_id=fi.id and fsr.status='pending')
           or fi.last_attempt_at is null or fi.last_attempt_at < now() - interval '5 minutes'
         )
       order by exists(select 1 from fio_sync_requests fsr where fsr.integration_id=fi.id and fsr.status='pending') desc,
                fi.last_attempt_at nulls first
       for update of fi skip locked
       limit 1
    `);
    const row = rows[0];
    if (!row) return null;
    const leaseOwner = randomUUID();
    await transaction.execute(sql`
      update fio_integrations set lease_owner=${leaseOwner}, lease_until=now() + interval '2 minutes',
             last_attempt_at=now(), next_allowed_at=now() + interval '30 seconds', updated_at=now()
       where id=${row.id}
    `);
    if (row.request_id) {
      await transaction.execute(sql`
        update fio_sync_requests set status='processing', started_at=now()
         where id=${row.request_id} and status='pending'
      `);
    }
    return {
      id: row.id,
      bankAccountId: row.bank_account_id,
      clubId: row.club_id,
      tokenCiphertext: row.token_ciphertext,
      tokenIv: row.token_iv,
      tokenAuthTag: row.token_auth_tag,
      tokenKeyVersion: row.token_key_version,
      tokenFingerprint: row.token_fingerprint,
      lastSuccessfulPeriodTo: row.last_successful_period_to,
      leaseOwner,
      requestId: row.request_id,
    };
  });
}

async function recordSyncFailure(claim: ClaimedIntegration, error: unknown) {
  const readable = readableFioError(error);
  const code = readable?.code ?? "sync_failed";
  const message = readable
    ? readable.message.slice(0, 300)
    : "Synchronizace se nepodařila. Zkuste ji později znovu.";
  const status = code === "invalid_token" ? "requires_token" : code === "history_locked" ? "intervention" : "active";
  await getDatabase().transaction(async (transaction) => {
    const owned = await transaction.execute<{ owned: boolean }>(sql`
      select true as owned from fio_integrations
       where id=${claim.id} and lease_owner=${claim.leaseOwner}
       for update
    `);
    if (!owned[0]?.owned) return;
    await transaction.execute(sql`
      update fio_integrations set status=${status}, last_error_code=${code},
             last_error_message=${message}, lease_owner=null, lease_until=null, updated_at=now()
       where id=${claim.id} and lease_owner=${claim.leaseOwner}
    `);
    if (claim.requestId) {
      await transaction.execute(sql`
        update fio_sync_requests set status='failed', completed_at=now(), error_code=${code}
         where id=${claim.requestId} and status='processing'
      `);
    }
    await transaction.insert(auditEvents).values({
      actorUserId: null,
      clubId: claim.clubId,
      eventType: "fio_sync.failed",
      targetType: "fio_integration",
      targetId: claim.id,
      details: { errorCode: code },
    });
  });
}

async function processClaim(claim: ClaimedIntegration) {
  let tokenLease: string | undefined;
  try {
    tokenLease = await reserveTokenCall(claim.tokenFingerprint);
    const token = decryptFioToken({
      ciphertext: claim.tokenCiphertext,
      iv: claim.tokenIv,
      authTag: claim.tokenAuthTag,
      keyVersion: claim.tokenKeyVersion,
    });
    const dateTo = todayInPrague();
    const dateFrom = claim.lastSuccessfulPeriodTo
      ? addDays(claim.lastSuccessfulPeriodTo, -2)
      : addDays(dateTo, -2);
    const period = await readFioPeriod(token, dateFrom, dateTo);
    const accountRows = await getDatabase().select({ accountNumber: bankAccounts.accountNumber })
      .from(bankAccounts).where(eq(bankAccounts.id, claim.bankAccountId)).limit(1);
    if (!accountRows[0]) throw new InputError("account_missing", "Bankovní účet už není dostupný.");
    verifyAccountIdentity(accountRows[0].accountNumber, period);
    const result = await getDatabase().transaction(async (transaction) => {
      const locked = await transaction.execute<{ active: boolean }>(sql`
        select status='active' and lease_owner=${claim.leaseOwner} as active
          from fio_integrations where id=${claim.id} for update
      `);
      if (!locked[0]?.active) throw new InputError("lease_lost", "Synchronizační lease už není platný.");
      const imported = await importLivePeriod(transaction, {
        integrationId: claim.id,
        bankAccountId: claim.bankAccountId,
        clubId: claim.clubId,
        period,
      });
      await transaction.execute(sql`
        update fio_integrations
           set last_success_at=now(), last_successful_period_to=${dateTo},
               last_new_movement_at=case when ${imported.createdCount} > 0 then now() else last_new_movement_at end,
               last_error_code=null, last_error_message=null,
               lease_owner=null, lease_until=null, updated_at=now()
         where id=${claim.id} and lease_owner=${claim.leaseOwner}
      `);
      if (claim.requestId) {
        await transaction.execute(sql`
          update fio_sync_requests set status='completed', completed_at=now(), error_code=null
           where id=${claim.requestId} and status='processing'
        `);
      }
      await transaction.insert(auditEvents).values({
        actorUserId: null,
        clubId: claim.clubId,
        eventType: "fio_sync.completed",
        targetType: "fio_integration",
        targetId: claim.id,
        details: { dateFrom, dateTo, newMovements: imported.createdCount },
      });
      return imported;
    });
    await sendFioDeliveries(result.deliveries);
    return { processed: true, newMovements: result.createdCount };
  } catch (error) {
    await recordSyncFailure(claim, error);
    return { processed: false, newMovements: 0 };
  } finally {
    if (tokenLease) await releaseTokenCall(claim.tokenFingerprint, tokenLease);
  }
}

export async function processDueFioIntegrations(maxIntegrations = 20) {
  let processed = 0;
  let failed = 0;
  let newMovements = 0;
  for (let index = 0; index < maxIntegrations; index += 1) {
    const claim = await claimDueIntegration();
    if (!claim) break;
    const result = await processClaim(claim);
    processed += 1;
    if (!result.processed) failed += 1;
    newMovements += result.newMovements;
  }
  return { processed, failed, newMovements };
}
