import { sql } from "drizzle-orm";
import {
  index,
  integer,
  bigint,
  boolean,
  check,
  date,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const appMetadata = pgTable("app_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("password_reset_user_id_idx").on(table.userId)],
);

export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: varchar("key", { length: 64 }).primaryKey(),
  attempts: integer("attempts").notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
    kind: varchar("kind", { length: 40 }).notNull(),
    referenceId: uuid("reference_id"),
    status: varchar("status", { length: 20 }).notNull(),
    providerId: text("provider_id"),
    errorCode: varchar("error_code", { length: 80 }),
    attemptStartedAt: timestamp("attempt_started_at", { withTimezone: true }),
    attemptToken: uuid("attempt_token"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    index("notification_user_id_idx").on(table.userId),
    uniqueIndex("notification_kind_reference_idx").on(
      table.kind,
      table.referenceId,
    ),
  ],
);

export const clubs = pgTable("clubs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 160 }).notNull(),
  ico: varchar("ico", { length: 8 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const clubAdmins = pgTable(
  "club_admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("club_admins_one_admin_per_club_idx").on(table.clubId),
    uniqueIndex("club_admins_club_user_idx").on(table.clubId, table.userId),
    index("club_admins_user_id_idx").on(table.userId),
  ],
);

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "restrict" }),
    accountNumber: varchar("account_number", { length: 32 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("bank_accounts_number_idx").on(table.accountNumber),
    index("bank_accounts_club_id_idx").on(table.clubId),
    uniqueIndex("bank_accounts_default_per_club_idx")
      .on(table.clubId)
      .where(sql`${table.isDefault} = true`),
  ],
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 160 }).notNull(),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "restrict",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("teams_club_name_idx").on(table.clubId, table.name),
    index("teams_club_id_idx").on(table.clubId),
  ],
);

export const bankIntegrations = pgTable(
  "bank_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "restrict" }),
    exclusiveTeamId: uuid("exclusive_team_id").references(() => teams.id, {
      onDelete: "restrict",
    }),
    provider: varchar("provider", { length: 20 }).notNull().default("demo"),
    enabled: boolean("enabled").notNull().default(true),
    configuredByUserId: uuid("configured_by_user_id")
      .references(() => users.id, { onDelete: "restrict" }),
    configurationSource: varchar("configuration_source", { length: 20 })
      .notNull()
      .default("user"),
    lastProcessedAt: timestamp("last_processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("bank_integrations_account_idx").on(table.bankAccountId),
    index("bank_integrations_exclusive_team_idx").on(table.exclusiveTeamId),
    check("bank_integrations_provider_demo", sql`${table.provider} = 'demo'`),
    check(
      "bank_integrations_configuration_source_valid",
      sql`${table.configurationSource} in ('user', 'public_qr')`,
    ),
  ],
);

export const teamCoaches = pgTable(
  "team_coaches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("team_coaches_one_active_per_team_idx")
      .on(table.teamId)
      .where(sql`${table.endedAt} is null`),
    index("team_coaches_active_user_idx").on(table.userId, table.endedAt),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: varchar("kind", { length: 20 }).notNull(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "restrict" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    email: varchar("email", { length: 320 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    replaceExistingCoach: boolean("replace_existing_coach")
      .notNull()
      .default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    consumedByUserId: uuid("consumed_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("invitations_team_id_idx").on(table.teamId),
    index("invitations_email_idx").on(table.email),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    clubId: uuid("club_id").references(() => clubs.id, {
      onDelete: "restrict",
    }),
    teamId: uuid("team_id").references(() => teams.id, {
      onDelete: "restrict",
    }),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    targetType: varchar("target_type", { length: 40 }).notNull(),
    targetId: uuid("target_id"),
    details: jsonb("details").$type<Record<string, string | boolean | number>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_events_club_created_idx").on(table.clubId, table.createdAt),
    index("audit_events_team_created_idx").on(table.teamId, table.createdAt),
  ],
);

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  activeTeamId: uuid("active_team_id").references(() => teams.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const athletes = pgTable(
  "athletes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    firstName: varchar("first_name", { length: 80 }),
    lastName: varchar("last_name", { length: 80 }),
    birthYear: integer("birth_year"),
    creationKey: uuid("creation_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("athletes_creation_key_idx")
      .on(table.creationKey)
      .where(sql`${table.creationKey} is not null`),
  ],
);

export const athleteGuardians = pgTable(
  "athlete_guardians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    relationship: varchar("relationship", { length: 10 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("athlete_guardians_one_guardian_idx").on(table.athleteId),
    uniqueIndex("athlete_guardians_athlete_user_idx").on(
      table.athleteId,
      table.userId,
    ),
    index("athlete_guardians_user_id_idx").on(table.userId),
    uniqueIndex("athlete_guardians_one_self_per_user_idx")
      .on(table.userId)
      .where(sql`${table.relationship} = 'self'`),
    check(
      "athlete_guardians_relationship_valid",
      sql`${table.relationship} is null or ${table.relationship} in ('self', 'child')`,
    ),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "restrict" }),
    source: varchar("source", { length: 20 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("memberships_one_active_team_athlete_idx")
      .on(table.teamId, table.athleteId)
      .where(sql`${table.endedAt} is null`),
    index("memberships_athlete_id_idx").on(table.athleteId),
  ],
);

export const teamJoinCodes = pgTable(
  "team_join_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    codeHash: varchar("code_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("team_join_codes_one_active_per_team_idx")
      .on(table.teamId)
      .where(sql`${table.revokedAt} is null`),
    index("team_join_codes_team_id_idx").on(table.teamId),
  ],
);

export const joinRequests = pgTable(
  "join_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "restrict" }),
    guardianUserId: uuid("guardian_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    joinCodeId: uuid("join_code_id")
      .notNull()
      .references(() => teamJoinCodes.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("join_requests_one_pending_team_athlete_idx")
      .on(table.teamId, table.athleteId)
      .where(sql`${table.status} = 'pending'`),
    index("join_requests_team_status_idx").on(table.teamId, table.status),
    index("join_requests_guardian_idx").on(table.guardianUserId),
  ],
);

export const variableSymbolSequences = pgTable("variable_symbol_sequences", {
  bankAccountId: uuid("bank_account_id")
    .primaryKey()
    .references(() => bankAccounts.id, { onDelete: "restrict" }),
  nextValue: bigint("next_value", { mode: "number" }).notNull(),
});

export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "restrict" }),
    teamId: uuid("team_id").references(() => teams.id, {
      onDelete: "restrict",
    }),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 160 }).notNull(),
    amountHalere: integer("amount_halere").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    paymentMessage: varchar("payment_message", { length: 60 }).notNull(),
    idempotencyKey: uuid("idempotency_key").notNull().unique(),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("assessments_club_created_idx").on(table.clubId, table.createdAt),
    index("assessments_team_created_idx").on(table.teamId, table.createdAt),
    check("assessments_amount_positive", sql`${table.amountHalere} > 0`),
  ],
);

export const receivables = pgTable(
  "receivables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "restrict" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "restrict" }),
    originTeamId: uuid("origin_team_id").references(() => teams.id, {
      onDelete: "restrict",
    }),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "restrict" }),
    amountHalere: integer("amount_halere").notNull(),
    variableSymbol: varchar("variable_symbol", { length: 10 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("receivables_assessment_athlete_idx").on(
      table.assessmentId,
      table.athleteId,
    ),
    uniqueIndex("receivables_account_vs_idx").on(
      table.bankAccountId,
      table.variableSymbol,
    ),
    index("receivables_athlete_idx").on(table.athleteId),
    check("receivables_amount_positive", sql`${table.amountHalere} > 0`),
    check(
      "receivables_vs_digits",
      sql`${table.variableSymbol} ~ '^[0-9]{1,10}$'`,
    ),
  ],
);

export const paymentClaims = pgTable(
  "payment_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receivableId: uuid("receivable_id")
      .notNull()
      .references(() => receivables.id, { onDelete: "restrict" }),
    guardianUserId: uuid("guardian_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amountHalere: integer("amount_halere").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    rejectionReason: varchar("rejection_reason", { length: 300 }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("payment_claims_one_pending_receivable_idx")
      .on(table.receivableId)
      .where(sql`${table.status} = 'pending'`),
    index("payment_claims_guardian_status_idx").on(
      table.guardianUserId,
      table.status,
    ),
    index("payment_claims_receivable_idx").on(table.receivableId),
    check("payment_claims_amount_positive", sql`${table.amountHalere} > 0`),
    check(
      "payment_claims_status_valid",
      sql`${table.status} in ('pending', 'withdrawn', 'approved', 'rejected')`,
    ),
  ],
);

export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => bankIntegrations.id, { onDelete: "restrict" }),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "restrict" }),
    source: varchar("source", { length: 20 }).notNull().default("simulated"),
    sourceTransactionId: varchar("source_transaction_id", { length: 80 }).notNull(),
    amountHalere: integer("amount_halere").notNull(),
    variableSymbol: varchar("variable_symbol", { length: 10 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdByUserId: uuid("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" }),
    ingestionOrigin: varchar("ingestion_origin", { length: 20 })
      .notNull()
      .default("user"),
    status: varchar("status", { length: 30 }).notNull().default("unmatched"),
    reasonCode: varchar("reason_code", { length: 40 }).notNull(),
    resolutionReason: varchar("resolution_reason", { length: 300 }),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("bank_transactions_account_source_idx").on(
      table.bankAccountId,
      table.sourceTransactionId,
    ),
    index("bank_transactions_integration_received_idx").on(
      table.integrationId,
      table.receivedAt,
    ),
    index("bank_transactions_status_idx").on(table.status, table.receivedAt),
    check("bank_transactions_source_simulated", sql`${table.source} = 'simulated'`),
    check(
      "bank_transactions_ingestion_origin_valid",
      sql`${table.ingestionOrigin} in ('user', 'public_qr')`,
    ),
    check("bank_transactions_amount_positive", sql`${table.amountHalere} > 0`),
    check(
      "bank_transactions_vs_digits",
      sql`${table.variableSymbol} is null or ${table.variableSymbol} ~ '^[0-9]{1,10}$'`,
    ),
    check(
      "bank_transactions_status_valid",
      sql`${table.status} in ('unmatched', 'partially_allocated', 'allocated', 'linked', 'ignored')`,
    ),
  ],
);

export const publicPaymentLinks = pgTable(
  "public_payment_links",
  {
    id: uuid("id").primaryKey(),
    receivableId: uuid("receivable_id")
      .notNull()
      .references(() => receivables.id, { onDelete: "restrict" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    issuedByUserId: uuid("issued_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    bankTransactionId: uuid("bank_transaction_id").references(
      () => bankTransactions.id,
      { onDelete: "restrict" },
    ),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("public_payment_links_active_receivable_idx")
      .on(table.receivableId)
      .where(sql`${table.revokedAt} is null`),
    index("public_payment_links_receivable_idx").on(table.receivableId),
    uniqueIndex("public_payment_links_transaction_idx")
      .on(table.bankTransactionId)
      .where(sql`${table.bankTransactionId} is not null`),
  ],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "restrict" }),
    teamId: uuid("team_id").references(() => teams.id, {
      onDelete: "restrict",
    }),
    kind: varchar("kind", { length: 30 }).notNull(),
    amountHalere: integer("amount_halere").notNull(),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    recordedByUserId: uuid("recorded_by_user_id")
      .references(() => users.id, { onDelete: "restrict" }),
    recordedOrigin: varchar("recorded_origin", { length: 20 })
      .notNull()
      .default("user"),
    sourceClaimId: uuid("source_claim_id").references(() => paymentClaims.id, {
      onDelete: "restrict",
    }),
    bankTransactionId: uuid("bank_transaction_id").references(
      () => bankTransactions.id,
      { onDelete: "restrict" },
    ),
    idempotencyKey: uuid("idempotency_key").unique(),
    reversesEventId: uuid("reverses_event_id").unique(),
    correctionReason: varchar("correction_reason", { length: 300 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("payment_events_source_claim_idx").on(table.sourceClaimId),
    index("payment_events_club_created_idx").on(table.clubId, table.createdAt),
    index("payment_events_team_created_idx").on(table.teamId, table.createdAt),
    check("payment_events_amount_positive", sql`${table.amountHalere} > 0`),
    check(
      "payment_events_recorded_origin_valid",
      sql`${table.recordedOrigin} in ('user', 'public_qr')`,
    ),
    check(
      "payment_events_kind_valid",
      sql`${table.kind} in ('manual_claim', 'cash', 'correction', 'simulated')`,
    ),
  ],
);

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentEventId: uuid("payment_event_id")
      .notNull()
      .references(() => paymentEvents.id, { onDelete: "restrict" }),
    receivableId: uuid("receivable_id")
      .notNull()
      .references(() => receivables.id, { onDelete: "restrict" }),
    amountHalere: integer("amount_halere").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("payment_allocations_event_receivable_idx").on(
      table.paymentEventId,
      table.receivableId,
    ),
    index("payment_allocations_receivable_idx").on(table.receivableId),
    check("payment_allocations_amount_nonzero", sql`${table.amountHalere} <> 0`),
  ],
);

export const bankTransactionEvidenceLinks = pgTable(
  "bank_transaction_evidence_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bankTransactionId: uuid("bank_transaction_id")
      .notNull()
      .references(() => bankTransactions.id, { onDelete: "restrict" }),
    paymentEventId: uuid("payment_event_id")
      .notNull()
      .references(() => paymentEvents.id, { onDelete: "restrict" }),
    linkedByUserId: uuid("linked_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reason: varchar("reason", { length: 300 }).notNull(),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    invalidatedByUserId: uuid("invalidated_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("bank_transaction_evidence_transaction_idx")
      .on(table.bankTransactionId)
      .where(sql`${table.invalidatedAt} is null`),
    uniqueIndex("bank_transaction_evidence_event_idx")
      .on(table.paymentEventId)
      .where(sql`${table.invalidatedAt} is null`),
  ],
);

export const reminderBatches = pgTable(
  "reminder_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "restrict" }),
    teamId: uuid("team_id").references(() => teams.id, {
      onDelete: "restrict",
    }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    idempotencyKey: uuid("idempotency_key").notNull().unique(),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("reminder_batches_scope_idx").on(table.clubId, table.teamId)],
);

export const reminderRecipients = pgTable(
  "reminder_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => reminderBatches.id, { onDelete: "restrict" }),
    receivableId: uuid("receivable_id")
      .notNull()
      .references(() => receivables.id, { onDelete: "restrict" }),
    guardianUserId: uuid("guardian_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("reminder_recipients_batch_debt_guardian_idx").on(
      table.batchId,
      table.receivableId,
      table.guardianUserId,
    ),
    index("reminder_recipients_receivable_idx").on(table.receivableId),
  ],
);
