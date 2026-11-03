import { sql } from "drizzle-orm";
import {
  index,
  integer,
  boolean,
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
    status: varchar("status", { length: 20 }).notNull(),
    providerId: text("provider_id"),
    errorCode: varchar("error_code", { length: 80 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [index("notification_user_id_idx").on(table.userId)],
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
    verificationMode: varchar("verification_mode", { length: 20 })
      .notNull()
      .default("manual"),
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

export const athletes = pgTable("athletes", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: varchar("first_name", { length: 80 }).notNull(),
  lastName: varchar("last_name", { length: 80 }).notNull(),
  birthYear: integer("birth_year").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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
