import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  auditEvents,
  bankIntegrations,
  publicPaymentLinks,
} from "@/db/schema";
import { InputError } from "@/lib/validation";

type Database = ReturnType<typeof getDatabase>;
export type PublicPaymentTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

const DEFAULT_PUBLIC_QR_BASE_URL =
  "https://rhinencephalic-offenselessly-serenity.ngrok-free.dev";

function tokenSecret() {
  const secret = process.env.PUBLIC_QR_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new InputError(
      "public_qr_not_configured",
      "Veřejná QR platba není nakonfigurovaná. Nastavte PUBLIC_QR_TOKEN_SECRET na alespoň 32 náhodných znaků.",
    );
  }
  return secret;
}

function publicQrBaseUrl() {
  const url = new URL(
    process.env.PUBLIC_QR_BASE_URL ?? DEFAULT_PUBLIC_QR_BASE_URL,
  );
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  ) {
    throw new Error("PUBLIC_QR_BASE_URL must be an absolute public HTTPS URL.");
  }
  return url;
}

function deriveRawToken(issueId: string) {
  return createHmac("sha256", tokenSecret())
    .update(`public-payment:${issueId}`)
    .digest("base64url");
}

function tokenHash(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function publicPaymentUrlForIssue(issueId: string) {
  const rawToken = deriveRawToken(issueId);
  return new URL(
    `/platba/${encodeURIComponent(issueId)}/${encodeURIComponent(rawToken)}`,
    publicQrBaseUrl(),
  ).toString();
}

export function verifyPublicPaymentToken(
  issueId: string,
  rawToken: string,
  storedHash: string,
) {
  if (!/^[0-9a-f-]{36}$/i.test(issueId) || !/^[A-Za-z0-9_-]{40,80}$/.test(rawToken)) {
    return false;
  }
  const expectedRawToken = deriveRawToken(issueId);
  const expectedHash = Buffer.from(tokenHash(expectedRawToken), "hex");
  const suppliedHash = Buffer.from(tokenHash(rawToken), "hex");
  const databaseHash = Buffer.from(storedHash, "hex");
  return (
    expectedHash.length === suppliedHash.length &&
    expectedHash.length === databaseHash.length &&
    timingSafeEqual(expectedHash, suppliedHash) &&
    timingSafeEqual(expectedHash, databaseHash)
  );
}

export async function issuePublicPaymentLinkInTransaction(
  transaction: PublicPaymentTransaction,
  input: { receivableId: string; issuedByUserId: string | null },
) {
  const debtRows = await transaction.execute<{
    id: string;
    bank_account_id: string;
    club_id: string;
    team_id: string | null;
    exclusive_team_id: string | null;
  }>(sql`
    select r.id, r.bank_account_id, a.club_id, a.team_id,
           case
             when a.team_id is not null
              and ba.is_default=false
              and not exists(
                select 1 from teams other_team
                 where other_team.bank_account_id=r.bank_account_id
                   and other_team.id<>a.team_id
              )
              and not exists(
                select 1 from receivables other_debt
                 where other_debt.bank_account_id=r.bank_account_id
                   and (other_debt.origin_team_id is null or other_debt.origin_team_id<>a.team_id)
              )
             then a.team_id
             else null
           end as exclusive_team_id
      from receivables r
      join assessments a on a.id=r.assessment_id
      join bank_accounts ba on ba.id=r.bank_account_id
     where r.id=${input.receivableId}
     for update of r
  `);
  const debt = debtRows[0];
  if (!debt) {
    throw new InputError("receivable_not_found", "Dluh nebyl nalezen.");
  }

  const [active] = await transaction
    .select({ id: publicPaymentLinks.id })
    .from(publicPaymentLinks)
    .where(
      and(
        eq(publicPaymentLinks.receivableId, debt.id),
        isNull(publicPaymentLinks.revokedAt),
      ),
    )
    .limit(1);
  if (active) {
    return { id: active.id, url: publicPaymentUrlForIssue(active.id), created: false };
  }

  const [createdIntegration] = await transaction
    .insert(bankIntegrations)
    .values({
      bankAccountId: debt.bank_account_id,
      exclusiveTeamId: debt.exclusive_team_id,
      provider: "demo",
      enabled: true,
      configuredByUserId: null,
      configurationSource: "public_qr",
    })
    .onConflictDoNothing({ target: bankIntegrations.bankAccountId })
    .returning({ id: bankIntegrations.id });
  if (createdIntegration) {
    await transaction.insert(auditEvents).values({
      actorUserId: null,
      clubId: debt.club_id,
      teamId: debt.exclusive_team_id,
      eventType: "bank_integration.public_qr_enabled",
      targetType: "bank_integration",
      targetId: createdIntegration.id,
      details: {
        source: "public_qr",
        bankAccountId: debt.bank_account_id,
        exclusive: Boolean(debt.exclusive_team_id),
      },
    });
  }

  const id = randomUUID();
  const rawToken = deriveRawToken(id);
  await transaction.insert(publicPaymentLinks).values({
    id,
    receivableId: debt.id,
    tokenHash: tokenHash(rawToken),
    issuedByUserId: input.issuedByUserId,
  });
  await transaction.insert(auditEvents).values({
    actorUserId: input.issuedByUserId,
    clubId: debt.club_id,
    teamId: debt.team_id,
    eventType: "public_payment_link.issued",
    targetType: "public_payment_link",
    targetId: id,
    details: { receivableId: debt.id },
  });
  return { id, url: publicPaymentUrlForIssue(id), created: true };
}

export async function getOrIssuePublicPaymentLink(
  receivableId: string,
  issuedByUserId: string,
) {
  return getDatabase().transaction((transaction) =>
    issuePublicPaymentLinkInTransaction(transaction, {
      receivableId,
      issuedByUserId,
    }),
  );
}

export async function rotatePublicPaymentLink(input: {
  actorUserId: string;
  receivableId: string;
}) {
  return getDatabase().transaction(async (transaction) => {
    const accessRows = await transaction.execute<{
      club_id: string;
      team_id: string | null;
      remaining_halere: number;
    }>(sql`
      select a.club_id, a.team_id,
             (r.amount_halere - coalesce((select sum(pa.amount_halere) from payment_allocations pa where pa.receivable_id=r.id), 0))::int as remaining_halere
        from receivables r
        join assessments a on a.id=r.assessment_id
        join athlete_guardians ag on ag.athlete_id=r.athlete_id
       where r.id=${input.receivableId} and ag.user_id=${input.actorUserId}
       for update of r
    `);
    const access = accessRows[0];
    if (!access) {
      throw new InputError("access_denied", "Odkaz k tomuto dluhu nemůžete změnit.");
    }
    if (access.remaining_halere <= 0) {
      throw new InputError("receivable_paid", "U uhrazeného dluhu nelze vydat nový platební odkaz.");
    }
    const activeRows = await transaction.execute<{ consumed_at: Date | null }>(sql`
      select consumed_at
        from public_payment_links
       where receivable_id=${input.receivableId} and revoked_at is null
       for update
    `);
    if (activeRows[0]?.consumed_at) {
      throw new InputError(
        "public_payment_link_consumed",
        "Použitý platební odkaz nelze znovu aktivovat ani nahradit dalším pokusem.",
      );
    }
    const revoked = await transaction
      .update(publicPaymentLinks)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(publicPaymentLinks.receivableId, input.receivableId),
          isNull(publicPaymentLinks.revokedAt),
        ),
      )
      .returning({ id: publicPaymentLinks.id });
    for (const link of revoked) {
      await transaction.insert(auditEvents).values({
        actorUserId: input.actorUserId,
        clubId: access.club_id,
        teamId: access.team_id,
        eventType: "public_payment_link.revoked",
        targetType: "public_payment_link",
        targetId: link.id,
        details: { receivableId: input.receivableId },
      });
    }
    return issuePublicPaymentLinkInTransaction(transaction, {
      receivableId: input.receivableId,
      issuedByUserId: input.actorUserId,
    });
  });
}

export async function getPublicPaymentView(issueId: string, rawToken: string) {
  const rows = await getDatabase().execute<{
    id: string;
    token_hash: string;
    revoked_at: Date | null;
    consumed_at: Date | null;
    bank_transaction_id: string | null;
    account_number: string;
    amount_halere: number;
    allocated_halere: number;
    variable_symbol: string;
    payment_message: string;
    movement_status: string | null;
    movement_reason: string | null;
    movement_amount_halere: number | null;
  }>(sql`
    select ppl.id, ppl.token_hash, ppl.revoked_at, ppl.consumed_at,
           ppl.bank_transaction_id, ba.account_number, r.amount_halere,
           coalesce((select sum(pa.amount_halere) from payment_allocations pa where pa.receivable_id=r.id), 0)::int as allocated_halere,
           r.variable_symbol, a.payment_message,
           bt.status as movement_status, bt.reason_code as movement_reason,
           bt.amount_halere as movement_amount_halere
      from public_payment_links ppl
      join receivables r on r.id=ppl.receivable_id
      join assessments a on a.id=r.assessment_id
      join bank_accounts ba on ba.id=r.bank_account_id
      left join bank_transactions bt on bt.id=ppl.bank_transaction_id
     where ppl.id=${issueId}
  `);
  const row = rows[0];
  if (
    !row ||
    row.revoked_at ||
    !verifyPublicPaymentToken(issueId, rawToken, row.token_hash)
  ) {
    throw new InputError(
      "invalid_public_payment_link",
      "Platební odkaz je neplatný nebo byl zrušen.",
    );
  }
  return {
    issueId: row.id,
    accountNumber: row.account_number,
    amountHalere: row.amount_halere,
    allocatedHalere: row.allocated_halere,
    remainingHalere: Math.max(row.amount_halere - row.allocated_halere, 0),
    variableSymbol: row.variable_symbol,
    paymentMessage: row.payment_message,
    consumedAt: row.consumed_at,
    bankTransactionId: row.bank_transaction_id,
    movementStatus: row.movement_status,
    movementReason: row.movement_reason,
    movementAmountHalere: row.movement_amount_halere,
  };
}
