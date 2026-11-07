import { createHash } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDatabase } from "@/db/client";
import {
  assessments,
  athleteGuardians,
  athletes,
  auditEvents,
  bankAccounts,
  clubs,
  memberships,
  notificationDeliveries,
  paymentAllocations,
  paymentClaims,
  paymentEvents,
  receivables,
  teams,
  users,
} from "@/db/schema";
import { InputError } from "@/lib/validation";
import {
  requireClubAdminAccess,
  requireTeamManagementAccess,
  requireTeamPageAccess,
} from "@/modules/authorization/service";
import { buildReceivableEmail } from "@/modules/assessments/email";
import {
  failRecordedDelivery,
  sendRecordedTransactionalEmail,
} from "@/modules/notifications/email";
import { deriveDebtState } from "@/modules/payments/status";

type AssessmentInput = {
  actorUserId: string;
  clubId: string;
  teamId: string | null;
  title: string;
  amountHalere: number;
  dueDate: string;
  paymentMessage: string;
  idempotencyKey: string;
  athleteIds: string[];
};

type EmailRecipient = {
  deliveryId: string;
  receivableId: string;
  guardianUserId: string;
  guardianEmail: string;
  athleteName: string;
  assessmentTitle: string;
  clubName: string;
  teamName: string | null;
  accountNumber: string;
  amountHalere: number;
  variableSymbol: string;
  paymentMessage: string;
  dueDate: string;
};

function fingerprint(input: AssessmentInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        clubId: input.clubId,
        teamId: input.teamId,
        title: input.title,
        amountHalere: input.amountHalere,
        dueDate: input.dueDate,
        paymentMessage: input.paymentMessage,
        athleteIds: [...new Set(input.athleteIds)].sort(),
      }),
    )
    .digest("hex");
}

async function existingIdempotentAssessment(input: AssessmentInput, hash: string) {
  const [existing] = await getDatabase()
    .select({
      id: assessments.id,
      createdByUserId: assessments.createdByUserId,
      requestFingerprint: assessments.requestFingerprint,
    })
    .from(assessments)
    .where(eq(assessments.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (!existing) return null;
  if (
    existing.createdByUserId !== input.actorUserId ||
    existing.requestFingerprint !== hash
  ) {
    throw new InputError(
      "idempotency_conflict",
      "Tento formulář už byl použit s jinými údaji.",
    );
  }
  return existing.id;
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505",
  );
}

async function sendAssessmentEmails(recipients: EmailRecipient[]) {
  await Promise.all(
    recipients.map(async (recipient) => {
      try {
        const message = await buildReceivableEmail(recipient);
        await sendRecordedTransactionalEmail(recipient.deliveryId, {
          userId: recipient.guardianUserId,
          recipient: recipient.guardianEmail,
          kind: "receivable_created",
          referenceId: recipient.receivableId,
          ...message,
        });
      } catch {
        await failRecordedDelivery(recipient.deliveryId, "message_build_failed");
      }
    }),
  );
}

export async function createAssessment(input: AssessmentInput) {
  const requestFingerprint = fingerprint(input);
  const existingBefore = await existingIdempotentAssessment(
    input,
    requestFingerprint,
  );
  if (existingBefore) return { assessmentId: existingBefore, created: false };

  const database = getDatabase();
  let result:
    | { assessmentId: string; created: true; recipients: EmailRecipient[] }
    | undefined;

  try {
    result = await database.transaction(async (transaction) => {
      let scope: {
        clubId: string;
        clubName: string;
        teamName: string | null;
        bankAccountId: string;
        accountNumber: string;
      };

      if (input.teamId) {
        const rows = await transaction.execute<{
          club_id: string;
          club_name: string;
          team_name: string;
          bank_account_id: string;
          account_number: string;
          allowed: boolean;
        }>(sql`
          select t.club_id, c.name as club_name, t.name as team_name,
                 coalesce(t.bank_account_id, ba.id) as bank_account_id,
                 coalesce(tba.account_number, ba.account_number) as account_number,
                 (
                   exists(select 1 from club_admins ca where ca.club_id = t.club_id and ca.user_id = ${input.actorUserId})
                   or exists(select 1 from team_coaches tc where tc.team_id = t.id and tc.user_id = ${input.actorUserId} and tc.ended_at is null)
                 ) as allowed
          from teams t
          join clubs c on c.id = t.club_id
          join bank_accounts ba on ba.club_id = t.club_id and ba.is_default = true
          left join bank_accounts tba on tba.id = t.bank_account_id and tba.club_id = t.club_id
          where t.id = ${input.teamId} and t.club_id = ${input.clubId} and t.archived_at is null
          for update of t
        `);
        const row = rows[0];
        if (!row || !row.allowed) {
          throw new InputError("access_denied", "K vytvoření týmového předpisu nemáte oprávnění.");
        }
        scope = {
          clubId: row.club_id,
          clubName: row.club_name,
          teamName: row.team_name,
          bankAccountId: row.bank_account_id,
          accountNumber: row.account_number,
        };
      } else {
        const rows = await transaction.execute<{
          club_id: string;
          club_name: string;
          bank_account_id: string;
          account_number: string;
          allowed: boolean;
        }>(sql`
          select c.id as club_id, c.name as club_name,
                 ba.id as bank_account_id, ba.account_number,
                 exists(select 1 from club_admins ca where ca.club_id = c.id and ca.user_id = ${input.actorUserId}) as allowed
          from clubs c
          join bank_accounts ba on ba.club_id = c.id and ba.is_default = true
          where c.id = ${input.clubId}
          for update of c
        `);
        const row = rows[0];
        if (!row || !row.allowed) {
          throw new InputError("access_denied", "Celoklubový předpis může vytvořit jen správce klubu.");
        }
        scope = {
          clubId: row.club_id,
          clubName: row.club_name,
          teamName: null,
          bankAccountId: row.bank_account_id,
          accountNumber: row.account_number,
        };
      }

      const selectedIds = [...new Set(input.athleteIds)];
      let recipientRows: Array<{
        athleteId: string;
        fullName: string;
        guardianUserId: string;
        guardianEmail: string;
      }>;

      if (input.teamId) {
        const conditions = [
          eq(memberships.teamId, input.teamId),
          isNull(memberships.endedAt),
        ];
        if (selectedIds.length) {
          conditions.push(inArray(memberships.athleteId, selectedIds));
        }
        recipientRows = await transaction
          .selectDistinct({
            athleteId: athletes.id,
            fullName: athletes.fullName,
            guardianUserId: users.id,
            guardianEmail: users.email,
          })
          .from(memberships)
          .innerJoin(athletes, eq(athletes.id, memberships.athleteId))
          .innerJoin(athleteGuardians, eq(athleteGuardians.athleteId, athletes.id))
          .innerJoin(users, eq(users.id, athleteGuardians.userId))
          .where(and(...conditions))
          .orderBy(asc(athletes.fullName));
        if (selectedIds.length && recipientRows.length !== selectedIds.length) {
          throw new InputError("invalid_recipients", "Výběr obsahuje sportovce mimo tento tým.");
        }
      } else {
        recipientRows = await transaction
          .selectDistinct({
            athleteId: athletes.id,
            fullName: athletes.fullName,
            guardianUserId: users.id,
            guardianEmail: users.email,
          })
          .from(memberships)
          .innerJoin(teams, eq(teams.id, memberships.teamId))
          .innerJoin(athletes, eq(athletes.id, memberships.athleteId))
          .innerJoin(athleteGuardians, eq(athleteGuardians.athleteId, athletes.id))
          .innerJoin(users, eq(users.id, athleteGuardians.userId))
          .where(
            and(
              eq(teams.clubId, input.clubId),
              isNull(teams.archivedAt),
              isNull(memberships.endedAt),
            ),
          )
          .orderBy(asc(athletes.fullName));
      }

      if (!recipientRows.length) {
        throw new InputError("no_recipients", "Pro předpis není vybraný žádný aktivní sportovec.");
      }

      const [assessment] = await transaction
        .insert(assessments)
        .values({
          clubId: scope.clubId,
          teamId: input.teamId,
          bankAccountId: scope.bankAccountId,
          createdByUserId: input.actorUserId,
          title: input.title,
          amountHalere: input.amountHalere,
          dueDate: input.dueDate,
          paymentMessage: input.paymentMessage,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
        })
        .returning({ id: assessments.id });

      const emailRecipients: EmailRecipient[] = [];
      for (const recipient of recipientRows) {
        const sequenceRows = await transaction.execute<{ allocated: string }>(sql`
          insert into variable_symbol_sequences (bank_account_id, next_value)
          values (${scope.bankAccountId}, 1000000002)
          on conflict (bank_account_id)
          do update set next_value = variable_symbol_sequences.next_value + 1
          returning (next_value - 1)::text as allocated
        `);
        const variableSymbol = sequenceRows[0]?.allocated;
        if (!variableSymbol || Number(variableSymbol) > 9_999_999_999) {
          throw new Error("Variable symbol sequence is exhausted.");
        }
        const [receivable] = await transaction
          .insert(receivables)
          .values({
            assessmentId: assessment.id,
            athleteId: recipient.athleteId,
            originTeamId: input.teamId,
            bankAccountId: scope.bankAccountId,
            amountHalere: input.amountHalere,
            variableSymbol,
          })
          .returning({ id: receivables.id });
        const [delivery] = await transaction
          .insert(notificationDeliveries)
          .values({
            userId: recipient.guardianUserId,
            recipientEmail: recipient.guardianEmail,
            kind: "receivable_created",
            referenceId: receivable.id,
            status: "pending",
          })
          .returning({ id: notificationDeliveries.id });
        emailRecipients.push({
          deliveryId: delivery.id,
          receivableId: receivable.id,
          guardianUserId: recipient.guardianUserId,
          guardianEmail: recipient.guardianEmail,
          athleteName: recipient.fullName,
          assessmentTitle: input.title,
          clubName: scope.clubName,
          teamName: scope.teamName,
          accountNumber: scope.accountNumber,
          amountHalere: input.amountHalere,
          variableSymbol,
          paymentMessage: input.paymentMessage,
          dueDate: input.dueDate,
        });
      }

      await transaction.insert(auditEvents).values({
        actorUserId: input.actorUserId,
        clubId: input.clubId,
        teamId: input.teamId,
        eventType: "assessment.created",
        targetType: "assessment",
        targetId: assessment.id,
        details: {
          recipientCount: recipientRows.length,
          amountHalere: input.amountHalere,
          scope: input.teamId ? "team" : "club",
        },
      });

      return { assessmentId: assessment.id, created: true as const, recipients: emailRecipients };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existingAfter = await existingIdempotentAssessment(
        input,
        requestFingerprint,
      );
      if (existingAfter) return { assessmentId: existingAfter, created: false };
    }
    throw error;
  }

  await sendAssessmentEmails(result.recipients);
  return { assessmentId: result.assessmentId, created: true };
}

export async function getTeamAssessmentForm(userId: string, teamId: string) {
  const team = await requireTeamManagementAccess(userId, teamId);
  const [teamAccount] = await getDatabase()
    .select({ bankAccountId: teams.bankAccountId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  const [account, roster] = await Promise.all([
    getDatabase()
      .select({ accountNumber: bankAccounts.accountNumber })
      .from(bankAccounts)
      .where(
        teamAccount?.bankAccountId
          ? and(
              eq(bankAccounts.id, teamAccount.bankAccountId),
              eq(bankAccounts.clubId, team.clubId),
            )
          : and(
              eq(bankAccounts.clubId, team.clubId),
              eq(bankAccounts.isDefault, true),
            ),
      )
      .limit(1),
    getDatabase()
      .selectDistinct({
        id: athletes.id,
        fullName: athletes.fullName,
        birthYear: athletes.birthYear,
      })
      .from(memberships)
      .innerJoin(athletes, eq(athletes.id, memberships.athleteId))
      .where(and(eq(memberships.teamId, teamId), isNull(memberships.endedAt)))
      .orderBy(athletes.fullName),
  ]);
  return { ...team, accountNumber: account[0]?.accountNumber ?? "", athletes: roster };
}

export async function getClubAssessmentForm(userId: string, clubId: string) {
  const club = await requireClubAdminAccess(userId, clubId);
  const [account] = await getDatabase()
    .select({ accountNumber: bankAccounts.accountNumber })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.clubId, clubId), eq(bankAccounts.isDefault, true)))
    .limit(1);
  const roster = await getDatabase()
    .selectDistinct({
      id: athletes.id,
      fullName: athletes.fullName,
      birthYear: athletes.birthYear,
    })
    .from(memberships)
    .innerJoin(teams, eq(teams.id, memberships.teamId))
    .innerJoin(athletes, eq(athletes.id, memberships.athleteId))
    .where(
      and(
        eq(teams.clubId, clubId),
        isNull(teams.archivedAt),
        isNull(memberships.endedAt),
      ),
    )
    .orderBy(athletes.fullName);
  return { ...club, accountNumber: account?.accountNumber ?? "", athletes: roster };
}

export async function setTeamBankAccount(input: {
  actorUserId: string;
  teamId: string;
  accountNumber: string;
}) {
  await requireTeamManagementAccess(input.actorUserId, input.teamId);
  await getDatabase().transaction(async (transaction) => {
    const rows = await transaction.execute<{
      club_id: string;
      allowed: boolean;
    }>(sql`
      select t.club_id,
             (exists(select 1 from club_admins ca where ca.club_id=t.club_id and ca.user_id=${input.actorUserId})
              or exists(select 1 from team_coaches tc where tc.team_id=t.id and tc.user_id=${input.actorUserId} and tc.ended_at is null)) as allowed
      from teams t where t.id=${input.teamId} and t.archived_at is null
      for update of t
    `);
    const team = rows[0];
    if (!team?.allowed) {
      throw new InputError("access_denied", "K nastavení účtu týmu nemáte oprávnění.");
    }
    const existingRows = await transaction.execute<{ id: string; club_id: string }>(sql`
      select id, club_id from bank_accounts
       where account_number=${input.accountNumber}
       for update
    `);
    const existing = existingRows[0];
    if (existing && existing.club_id !== team.club_id) {
      throw new InputError("account_in_use", "Tento účet už používá jiný klub.");
    }
    let accountId = existing?.id;
    if (!accountId) {
      const [created] = await transaction
        .insert(bankAccounts)
        .values({
          clubId: team.club_id,
          accountNumber: input.accountNumber,
          isDefault: false,
        })
        .returning({ id: bankAccounts.id });
      accountId = created.id;
    }
    const integrationOwners = await transaction.execute<{ feed_exclusive_team_id: string | null }>(sql`
      select feed_exclusive_team_id from bank_accounts
       where id=${accountId} for update
    `);
    if (
      integrationOwners[0]?.feed_exclusive_team_id &&
      integrationOwners[0].feed_exclusive_team_id !== input.teamId
    ) {
      throw new InputError(
        "exclusive_account_in_use",
        "Účet je trvale označen jako výhradní pro jiný tým a nelze jej znovu přiřadit.",
      );
    }
    await transaction
      .update(teams)
      .set({ bankAccountId: accountId })
      .where(eq(teams.id, input.teamId));
    await transaction.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      clubId: team.club_id,
      teamId: input.teamId,
      eventType: "team.bank_account_changed",
      targetType: "bank_account",
      targetId: accountId,
    });
  });
}

export async function getGuardianReceivables(userId: string) {
  const rows = await getDatabase()
    .select({
      id: receivables.id,
      athleteId: athletes.id,
      athleteName: athletes.fullName,
      title: assessments.title,
      amountHalere: receivables.amountHalere,
      dueDate: assessments.dueDate,
      clubName: clubs.name,
      teamName: teams.name,
      allocatedHalere: sql<number>`coalesce((select sum(${paymentAllocations.amountHalere}) from ${paymentAllocations} where ${paymentAllocations.receivableId}=${receivables.id}), 0)::int`,
      pendingClaimId: sql<string | null>`(select ${paymentClaims.id} from ${paymentClaims} where ${paymentClaims.receivableId}=${receivables.id} and ${paymentClaims.status}='pending' limit 1)`,
    })
    .from(receivables)
    .innerJoin(assessments, eq(assessments.id, receivables.assessmentId))
    .innerJoin(athletes, eq(athletes.id, receivables.athleteId))
    .innerJoin(athleteGuardians, eq(athleteGuardians.athleteId, athletes.id))
    .innerJoin(clubs, eq(clubs.id, assessments.clubId))
    .leftJoin(teams, eq(teams.id, receivables.originTeamId))
    .where(eq(athleteGuardians.userId, userId))
    .orderBy(asc(assessments.dueDate), desc(receivables.createdAt));
  return rows.map((row) => ({
    ...row,
    ...deriveDebtState({
      amountHalere: row.amountHalere,
      allocatedHalere: row.allocatedHalere,
      dueDate: row.dueDate,
      hasPendingClaim: Boolean(row.pendingClaimId),
    }),
  }));
}

export async function getGuardianTeamFinance(userId: string, teamId: string) {
  const access = await requireTeamPageAccess(userId, teamId);
  if (!access.hasMembership) {
    notFound();
  }

  const database = getDatabase();
  const [debtRows, history] = await Promise.all([
    database
      .select({
        id: receivables.id,
        athleteId: athletes.id,
        athleteName: athletes.fullName,
        title: assessments.title,
        amountHalere: receivables.amountHalere,
        dueDate: assessments.dueDate,
        allocatedHalere: sql<number>`coalesce((select sum(${paymentAllocations.amountHalere}) from ${paymentAllocations} where ${paymentAllocations.receivableId}=${receivables.id}), 0)::int`,
        pendingClaimId: sql<string | null>`(select ${paymentClaims.id} from ${paymentClaims} where ${paymentClaims.receivableId}=${receivables.id} and ${paymentClaims.status}='pending' limit 1)`,
      })
      .from(receivables)
      .innerJoin(assessments, eq(assessments.id, receivables.assessmentId))
      .innerJoin(athletes, eq(athletes.id, receivables.athleteId))
      .innerJoin(
        athleteGuardians,
        and(
          eq(athleteGuardians.athleteId, athletes.id),
          eq(athleteGuardians.userId, userId),
        ),
      )
      .where(eq(receivables.originTeamId, teamId))
      .orderBy(asc(assessments.dueDate), desc(receivables.createdAt)),
    database
      .select({
        eventId: paymentEvents.id,
        athleteName: athletes.fullName,
        assessmentTitle: assessments.title,
        kind: paymentEvents.kind,
        amountHalere: paymentAllocations.amountHalere,
        occurredOn: paymentEvents.occurredOn,
      })
      .from(paymentAllocations)
      .innerJoin(
        paymentEvents,
        eq(paymentEvents.id, paymentAllocations.paymentEventId),
      )
      .innerJoin(
        receivables,
        eq(receivables.id, paymentAllocations.receivableId),
      )
      .innerJoin(assessments, eq(assessments.id, receivables.assessmentId))
      .innerJoin(athletes, eq(athletes.id, receivables.athleteId))
      .innerJoin(
        athleteGuardians,
        and(
          eq(athleteGuardians.athleteId, athletes.id),
          eq(athleteGuardians.userId, userId),
        ),
      )
      .where(eq(receivables.originTeamId, teamId))
      .orderBy(desc(paymentEvents.occurredOn), desc(paymentEvents.createdAt)),
  ]);

  return {
    debts: debtRows.map((row) => ({
      ...row,
      ...deriveDebtState({
        amountHalere: row.amountHalere,
        allocatedHalere: row.allocatedHalere,
        dueDate: row.dueDate,
        hasPendingClaim: Boolean(row.pendingClaimId),
      }),
    })),
    history,
  };
}

export async function getGuardianReceivable(userId: string, receivableId: string) {
  const [row] = await getDatabase()
    .select({
      id: receivables.id,
      athleteName: athletes.fullName,
      title: assessments.title,
      amountHalere: receivables.amountHalere,
      dueDate: assessments.dueDate,
      paymentMessage: assessments.paymentMessage,
      variableSymbol: receivables.variableSymbol,
      accountNumber: bankAccounts.accountNumber,
      clubName: clubs.name,
      teamName: teams.name,
      clubId: assessments.clubId,
      teamId: assessments.teamId,
      allocatedHalere: sql<number>`coalesce((select sum(${paymentAllocations.amountHalere}) from ${paymentAllocations} where ${paymentAllocations.receivableId}=${receivables.id}), 0)::int`,
      pendingClaimId: sql<string | null>`(select ${paymentClaims.id} from ${paymentClaims} where ${paymentClaims.receivableId}=${receivables.id} and ${paymentClaims.status}='pending' limit 1)`,
      pendingClaimAmountHalere: sql<number | null>`(select ${paymentClaims.amountHalere} from ${paymentClaims} where ${paymentClaims.receivableId}=${receivables.id} and ${paymentClaims.status}='pending' limit 1)`,
      demoIntegrationEnabled: sql<boolean>`exists(select 1 from bank_integrations bi where bi.bank_account_id=${receivables.bankAccountId} and bi.enabled=true)`,
      fioIntegrationEnabled: sql<boolean>`exists(select 1 from fio_integrations fi where fi.bank_account_id=${receivables.bankAccountId} and fi.status='active')`,
      hasSimulatedPayment: sql<boolean>`exists(
        select 1 from payment_events pe
        join payment_allocations pa on pa.payment_event_id=pe.id
        where pa.receivable_id=${receivables.id} and pe.kind='simulated'
          and not exists(select 1 from payment_events correction where correction.reverses_event_id=pe.id)
      )`,
      hasFioPayment: sql<boolean>`exists(
        select 1 from payment_events pe
        join payment_allocations pa on pa.payment_event_id=pe.id
        where pa.receivable_id=${receivables.id} and pe.kind='fio'
          and not exists(select 1 from payment_events correction where correction.reverses_event_id=pe.id)
      )`,
    })
    .from(receivables)
    .innerJoin(assessments, eq(assessments.id, receivables.assessmentId))
    .innerJoin(athletes, eq(athletes.id, receivables.athleteId))
    .innerJoin(athleteGuardians, eq(athleteGuardians.athleteId, athletes.id))
    .innerJoin(bankAccounts, eq(bankAccounts.id, receivables.bankAccountId))
    .innerJoin(clubs, eq(clubs.id, assessments.clubId))
    .leftJoin(teams, eq(teams.id, receivables.originTeamId))
    .where(
      and(
        eq(receivables.id, receivableId),
        eq(athleteGuardians.userId, userId),
      ),
    )
    .limit(1);
  if (!row) notFound();
  await getDatabase().insert(auditEvents).values({
    actorUserId: userId,
    clubId: row.clubId,
    teamId: row.teamId,
    eventType: "receivable.payment_details_viewed",
    targetType: "receivable",
    targetId: row.id,
  });
  const debtState = deriveDebtState({
    amountHalere: row.amountHalere,
    allocatedHalere: row.allocatedHalere,
    dueDate: row.dueDate,
    hasPendingClaim: Boolean(row.pendingClaimId),
  });
  return {
    ...row,
    ...debtState,
  };
}

export async function getAssessmentManagerView(userId: string, assessmentId: string) {
  const [assessment] = await getDatabase()
    .select({
      id: assessments.id,
      clubId: assessments.clubId,
      teamId: assessments.teamId,
      title: assessments.title,
      amountHalere: assessments.amountHalere,
      dueDate: assessments.dueDate,
      paymentMessage: assessments.paymentMessage,
      accountNumber: bankAccounts.accountNumber,
      clubName: clubs.name,
      teamName: teams.name,
      createdAt: assessments.createdAt,
    })
    .from(assessments)
    .innerJoin(clubs, eq(clubs.id, assessments.clubId))
    .innerJoin(bankAccounts, eq(bankAccounts.id, assessments.bankAccountId))
    .leftJoin(teams, eq(teams.id, assessments.teamId))
    .where(eq(assessments.id, assessmentId))
    .limit(1);
  if (!assessment) notFound();
  if (assessment.teamId) {
    await requireTeamManagementAccess(userId, assessment.teamId);
  } else {
    await requireClubAdminAccess(userId, assessment.clubId);
  }
  await getDatabase().insert(auditEvents).values({
    actorUserId: userId,
    clubId: assessment.clubId,
    teamId: assessment.teamId,
    eventType: "assessment.financial_details_viewed",
    targetType: "assessment",
    targetId: assessment.id,
  });
  const debts = await getDatabase()
    .select({
      id: receivables.id,
      athleteName: athletes.fullName,
      variableSymbol: receivables.variableSymbol,
      guardianEmail: users.email,
      deliveryStatus: notificationDeliveries.status,
      deliveryError: notificationDeliveries.errorCode,
      allocatedHalere: sql<number>`coalesce(
        (select sum(${paymentAllocations.amountHalere})
           from ${paymentAllocations}
          where ${paymentAllocations.receivableId}=${receivables.id}),
        0
      )::int`,
      lastReminderAt: sql<Date | string | null>`(
        select max(delivery.sent_at)
          from reminder_recipients reminder
          join notification_deliveries delivery
            on delivery.kind='payment_reminder'
           and delivery.reference_id=reminder.id
         where reminder.receivable_id=${receivables.id}
           and delivery.status='sent'
      )`,
    })
    .from(receivables)
    .innerJoin(athletes, eq(athletes.id, receivables.athleteId))
    .innerJoin(athleteGuardians, eq(athleteGuardians.athleteId, athletes.id))
    .innerJoin(users, eq(users.id, athleteGuardians.userId))
    .leftJoin(
      notificationDeliveries,
      and(
        eq(notificationDeliveries.referenceId, receivables.id),
        eq(notificationDeliveries.kind, "receivable_created"),
      ),
    )
    .where(eq(receivables.assessmentId, assessmentId))
    .orderBy(athletes.fullName);
  return { ...assessment, debts };
}

export async function retryReceivableDelivery(input: {
  actorUserId: string;
  assessmentId: string;
  receivableId: string;
}) {
  const assessment = await getAssessmentManagerView(
    input.actorUserId,
    input.assessmentId,
  );
  const [recipient] = await getDatabase()
    .select({
      deliveryId: notificationDeliveries.id,
      receivableId: receivables.id,
      guardianUserId: users.id,
      guardianEmail: users.email,
      athleteName: athletes.fullName,
      assessmentTitle: assessments.title,
      clubName: clubs.name,
      teamName: teams.name,
      accountNumber: bankAccounts.accountNumber,
      amountHalere: sql<number>`greatest(
        ${receivables.amountHalere} - coalesce(
          (select sum(retry_allocation.amount_halere)
             from payment_allocations retry_allocation
            where retry_allocation.receivable_id=${receivables.id}),
          0
        ),
        0
      )::int`,
      variableSymbol: receivables.variableSymbol,
      paymentMessage: assessments.paymentMessage,
      dueDate: assessments.dueDate,
    })
    .from(receivables)
    .innerJoin(assessments, eq(assessments.id, receivables.assessmentId))
    .innerJoin(athletes, eq(athletes.id, receivables.athleteId))
    .innerJoin(athleteGuardians, eq(athleteGuardians.athleteId, athletes.id))
    .innerJoin(users, eq(users.id, athleteGuardians.userId))
    .innerJoin(clubs, eq(clubs.id, assessments.clubId))
    .innerJoin(bankAccounts, eq(bankAccounts.id, receivables.bankAccountId))
    .leftJoin(teams, eq(teams.id, receivables.originTeamId))
    .innerJoin(
      notificationDeliveries,
      and(
        eq(notificationDeliveries.referenceId, receivables.id),
        eq(notificationDeliveries.kind, "receivable_created"),
      ),
    )
    .where(
      and(
        eq(receivables.id, input.receivableId),
        eq(receivables.assessmentId, assessment.id),
      ),
    )
    .limit(1);
  if (!recipient) notFound();
  if (recipient.amountHalere <= 0) {
    throw new InputError(
      "receivable_already_paid",
      "Dluh už nemá kladný zůstatek; nový platební QR se neposílá.",
    );
  }
  await getDatabase().insert(auditEvents).values({
    actorUserId: input.actorUserId,
    clubId: assessment.clubId,
    teamId: assessment.teamId,
    eventType: "notification.retry_requested",
    targetType: "receivable",
    targetId: recipient.receivableId,
  });
  await sendAssessmentEmails([recipient]);
}
