-- 0022 byla nasazena. Veřejné odkazy se pouze zneplatní; jejich historie,
-- simulated pohyby, alokace, delivery a audit zůstávají beze změny.
UPDATE "public_payment_links" SET "revoked_at"=now() WHERE "revoked_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "feed_exclusive_team_id" uuid;
--> statement-breakpoint
UPDATE "bank_accounts" ba SET "feed_exclusive_team_id"=bi."exclusive_team_id"
FROM "bank_integrations" bi WHERE bi."bank_account_id"=ba."id" AND bi."exclusive_team_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_feed_exclusive_team_id_teams_id_fk" FOREIGN KEY ("feed_exclusive_team_id") REFERENCES "teams"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "fio_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bank_account_id" uuid NOT NULL,
  "status" varchar(30) DEFAULT 'active' NOT NULL,
  "token_ciphertext" text,
  "token_iv" varchar(24),
  "token_auth_tag" varchar(32),
  "token_fingerprint" varchar(64),
  "token_key_version" integer DEFAULT 1 NOT NULL,
  "configured_by_user_id" uuid NOT NULL,
  "activated_at" timestamp with time zone NOT NULL,
  "initial_import_completed_at" timestamp with time zone,
  "last_attempt_at" timestamp with time zone,
  "last_success_at" timestamp with time zone,
  "last_new_movement_at" timestamp with time zone,
  "last_successful_period_to" date,
  "next_allowed_at" timestamp with time zone,
  "lease_owner" uuid,
  "lease_until" timestamp with time zone,
  "last_error_code" varchar(80),
  "last_error_message" varchar(300),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fio_integrations_status_valid" CHECK ("status" in ('active','disabled','requires_token','intervention')),
  CONSTRAINT "fio_integrations_token_state_valid" CHECK (
    ("status"='disabled' AND "token_ciphertext" IS NULL AND "token_iv" IS NULL AND "token_auth_tag" IS NULL AND "token_fingerprint" IS NULL)
    OR ("status"<>'disabled' AND "token_ciphertext" IS NOT NULL AND "token_iv" IS NOT NULL AND "token_auth_tag" IS NOT NULL AND "token_fingerprint" IS NOT NULL)
  )
);
--> statement-breakpoint
ALTER TABLE "fio_integrations" ADD CONSTRAINT "fio_integrations_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fio_integrations" ADD CONSTRAINT "fio_integrations_configured_by_user_id_users_id_fk" FOREIGN KEY ("configured_by_user_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "fio_integrations_account_idx" ON "fio_integrations" ("bank_account_id");
--> statement-breakpoint
CREATE INDEX "fio_integrations_due_idx" ON "fio_integrations" ("status","next_allowed_at");
--> statement-breakpoint
CREATE TABLE "fio_token_call_leases" (
  "token_fingerprint" varchar(64) PRIMARY KEY NOT NULL,
  "next_allowed_at" timestamp with time zone,
  "lease_owner" uuid,
  "lease_until" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fio_verification_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bank_account_id" uuid NOT NULL,
  "requested_by_user_id" uuid NOT NULL,
  "token_fingerprint" varchar(64) NOT NULL,
  "purpose" varchar(20) NOT NULL,
  "expected_integration_updated_at" timestamp with time zone,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fio_verification_attempts_purpose_valid" CHECK ("purpose" in ('activate','replace')),
  CONSTRAINT "fio_verification_attempts_status_valid" CHECK ("status" in ('pending','completed','failed','expired'))
);
--> statement-breakpoint
ALTER TABLE "fio_verification_attempts" ADD CONSTRAINT "fio_verification_attempts_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fio_verification_attempts" ADD CONSTRAINT "fio_verification_attempts_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "fio_verification_attempts_account_idx" ON "fio_verification_attempts" ("bank_account_id","created_at");
--> statement-breakpoint
CREATE TABLE "fio_sync_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "integration_id" uuid NOT NULL,
  "requested_by_user_id" uuid NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "error_code" varchar(80),
  CONSTRAINT "fio_sync_requests_status_valid" CHECK ("status" in ('pending','processing','completed','failed'))
);
--> statement-breakpoint
ALTER TABLE "fio_sync_requests" ADD CONSTRAINT "fio_sync_requests_integration_id_fio_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "fio_integrations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fio_sync_requests" ADD CONSTRAINT "fio_sync_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "fio_sync_requests_one_open_idx" ON "fio_sync_requests" ("integration_id") WHERE "status" in ('pending','processing');
--> statement-breakpoint
CREATE INDEX "fio_sync_requests_status_idx" ON "fio_sync_requests" ("status","requested_at");
--> statement-breakpoint
ALTER TABLE "bank_transactions" ALTER COLUMN "integration_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "fio_integration_id" uuid;
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "currency" varchar(3) DEFAULT 'CZK' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "counter_account" varchar(64);
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "counter_bank_code" varchar(10);
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "counterparty_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "recipient_message" varchar(255);
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "transaction_type" varchar(255);
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "initial_import" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "related_transaction_id" uuid;
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_fio_integration_id_fio_integrations_id_fk" FOREIGN KEY ("fio_integration_id") REFERENCES "fio_integrations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_related_transaction_id_bank_transactions_id_fk" FOREIGN KEY ("related_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bank_transactions" DROP CONSTRAINT "bank_transactions_source_simulated";
--> statement-breakpoint
ALTER TABLE "bank_transactions" DROP CONSTRAINT "bank_transactions_amount_positive";
--> statement-breakpoint
ALTER TABLE "bank_transactions" DROP CONSTRAINT "bank_transactions_ingestion_origin_valid";
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_source_valid" CHECK ("source" in ('simulated','fio'));
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_integration_source_valid" CHECK (("source"='simulated' AND "integration_id" IS NOT NULL AND "fio_integration_id" IS NULL) OR ("source"='fio' AND "integration_id" IS NULL AND "fio_integration_id" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_ingestion_origin_valid" CHECK ("ingestion_origin" in ('user','public_qr','fio_sync'));
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_amount_nonzero" CHECK ("amount_halere"<>0);
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_currency_valid" CHECK ("currency" ~ '^[A-Z]{3}$');
--> statement-breakpoint
DROP INDEX "bank_transactions_account_source_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "bank_transactions_account_source_idx" ON "bank_transactions" ("bank_account_id","source","source_transaction_id");
--> statement-breakpoint
CREATE INDEX "bank_transactions_fio_integration_idx" ON "bank_transactions" ("fio_integration_id","received_at");
--> statement-breakpoint
ALTER TABLE "payment_events" DROP CONSTRAINT "payment_events_recorded_origin_valid";
--> statement-breakpoint
ALTER TABLE "payment_events" DROP CONSTRAINT "payment_events_kind_valid";
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_recorded_origin_valid" CHECK ("recorded_origin" in ('user','public_qr','fio_sync'));
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_kind_valid" CHECK ("kind" in ('manual_claim','cash','correction','simulated','fio'));
--> statement-breakpoint
DROP INDEX "notification_kind_reference_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_kind_reference_idx" ON "notification_deliveries" ("kind","reference_id","user_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_bank_transaction_origin_change() RETURNS trigger AS $$
BEGIN
  IF NEW.integration_id IS DISTINCT FROM OLD.integration_id OR NEW.fio_integration_id IS DISTINCT FROM OLD.fio_integration_id
    OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.source_transaction_id IS DISTINCT FROM OLD.source_transaction_id OR NEW.amount_halere IS DISTINCT FROM OLD.amount_halere
    OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.variable_symbol IS DISTINCT FROM OLD.variable_symbol
    OR NEW.counter_account IS DISTINCT FROM OLD.counter_account OR NEW.counter_bank_code IS DISTINCT FROM OLD.counter_bank_code
    OR NEW.counterparty_name IS DISTINCT FROM OLD.counterparty_name OR NEW.recipient_message IS DISTINCT FROM OLD.recipient_message
    OR NEW.transaction_type IS DISTINCT FROM OLD.transaction_type OR NEW.initial_import IS DISTINCT FROM OLD.initial_import
    OR NEW.related_transaction_id IS DISTINCT FROM OLD.related_transaction_id OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
    OR NEW.received_at IS DISTINCT FROM OLD.received_at OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.ingestion_origin IS DISTINCT FROM OLD.ingestion_origin THEN RAISE EXCEPTION 'bank transaction origin is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_payment_event_bank_source() RETURNS trigger AS $$
DECLARE movement_source varchar(20);
BEGIN
  IF NEW.bank_transaction_id IS NOT NULL THEN
    SELECT source INTO movement_source FROM bank_transactions WHERE id=NEW.bank_transaction_id;
    IF NEW.kind='fio' AND movement_source<>'fio' THEN RAISE EXCEPTION 'fio payment event requires fio bank transaction'; END IF;
    IF NEW.kind='simulated' AND movement_source<>'simulated' THEN RAISE EXCEPTION 'simulated payment event requires simulated bank transaction'; END IF;
  ELSIF NEW.kind IN ('fio','simulated') THEN
    RAISE EXCEPTION 'bank payment event requires bank transaction';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER payment_events_bank_source_guard BEFORE INSERT OR UPDATE ON "payment_events" FOR EACH ROW EXECUTE FUNCTION enforce_payment_event_bank_source();
