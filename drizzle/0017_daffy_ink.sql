CREATE TABLE "bank_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"exclusive_team_id" uuid,
	"provider" varchar(20) DEFAULT 'demo' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"configured_by_user_id" uuid NOT NULL,
	"last_processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_integrations_provider_demo" CHECK ("bank_integrations"."provider" = 'demo')
);
--> statement-breakpoint
CREATE TABLE "bank_transaction_evidence_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_transaction_id" uuid NOT NULL,
	"payment_event_id" uuid NOT NULL,
	"linked_by_user_id" uuid NOT NULL,
	"reason" varchar(300) NOT NULL,
	"invalidated_at" timestamp with time zone,
	"invalidated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"source" varchar(20) DEFAULT 'simulated' NOT NULL,
	"source_transaction_id" varchar(80) NOT NULL,
	"amount_halere" integer NOT NULL,
	"variable_symbol" varchar(10),
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"status" varchar(30) DEFAULT 'unmatched' NOT NULL,
	"reason_code" varchar(40) NOT NULL,
	"resolution_reason" varchar(300),
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "bank_transactions_source_simulated" CHECK ("bank_transactions"."source" = 'simulated'),
	CONSTRAINT "bank_transactions_amount_positive" CHECK ("bank_transactions"."amount_halere" > 0),
	CONSTRAINT "bank_transactions_vs_digits" CHECK ("bank_transactions"."variable_symbol" is null or "bank_transactions"."variable_symbol" ~ '^[0-9]{1,10}$'),
	CONSTRAINT "bank_transactions_status_valid" CHECK ("bank_transactions"."status" in ('unmatched', 'partially_allocated', 'allocated', 'linked', 'ignored'))
);
--> statement-breakpoint
ALTER TABLE "payment_events" DROP CONSTRAINT "payment_events_kind_valid";--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "bank_transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_integrations" ADD CONSTRAINT "bank_integrations_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_integrations" ADD CONSTRAINT "bank_integrations_exclusive_team_id_teams_id_fk" FOREIGN KEY ("exclusive_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_integrations" ADD CONSTRAINT "bank_integrations_configured_by_user_id_users_id_fk" FOREIGN KEY ("configured_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transaction_evidence_links" ADD CONSTRAINT "bank_transaction_evidence_links_bank_transaction_id_bank_transactions_id_fk" FOREIGN KEY ("bank_transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transaction_evidence_links" ADD CONSTRAINT "bank_transaction_evidence_links_payment_event_id_payment_events_id_fk" FOREIGN KEY ("payment_event_id") REFERENCES "public"."payment_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transaction_evidence_links" ADD CONSTRAINT "bank_transaction_evidence_links_linked_by_user_id_users_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transaction_evidence_links" ADD CONSTRAINT "bank_transaction_evidence_links_invalidated_by_user_id_users_id_fk" FOREIGN KEY ("invalidated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_integration_id_bank_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."bank_integrations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_integrations_account_idx" ON "bank_integrations" USING btree ("bank_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_integrations_exclusive_team_idx" ON "bank_integrations" USING btree ("exclusive_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_transaction_evidence_transaction_idx" ON "bank_transaction_evidence_links" USING btree ("bank_transaction_id") WHERE "bank_transaction_evidence_links"."invalidated_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_transaction_evidence_event_idx" ON "bank_transaction_evidence_links" USING btree ("payment_event_id") WHERE "bank_transaction_evidence_links"."invalidated_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_transactions_account_source_idx" ON "bank_transactions" USING btree ("bank_account_id","source_transaction_id");--> statement-breakpoint
CREATE INDEX "bank_transactions_integration_received_idx" ON "bank_transactions" USING btree ("integration_id","received_at");--> statement-breakpoint
CREATE INDEX "bank_transactions_status_idx" ON "bank_transactions" USING btree ("status","received_at");--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_bank_transaction_id_bank_transactions_id_fk" FOREIGN KEY ("bank_transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_kind_valid" CHECK ("payment_events"."kind" in ('manual_claim', 'cash', 'correction', 'simulated'));
--> statement-breakpoint
CREATE FUNCTION prevent_bank_transaction_origin_change() RETURNS trigger AS $$
BEGIN
	IF NEW.integration_id IS DISTINCT FROM OLD.integration_id
		OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
		OR NEW.source IS DISTINCT FROM OLD.source
		OR NEW.source_transaction_id IS DISTINCT FROM OLD.source_transaction_id
		OR NEW.amount_halere IS DISTINCT FROM OLD.amount_halere
		OR NEW.variable_symbol IS DISTINCT FROM OLD.variable_symbol
		OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
		OR NEW.received_at IS DISTINCT FROM OLD.received_at
		OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
		RAISE EXCEPTION 'bank transaction origin is immutable';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER bank_transactions_immutable_origin
BEFORE UPDATE ON bank_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_bank_transaction_origin_change();
