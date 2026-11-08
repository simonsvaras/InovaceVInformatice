ALTER TABLE "bank_integrations" ALTER COLUMN "configured_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_integrations" ADD COLUMN "configuration_source" varchar(20) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_transactions" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "ingestion_origin" varchar(20) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_events" ALTER COLUMN "recorded_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "recorded_origin" varchar(20) DEFAULT 'user' NOT NULL;--> statement-breakpoint
CREATE TABLE "public_payment_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"receivable_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"issued_by_user_id" uuid,
	"bank_transaction_id" uuid,
	"revoked_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_payment_links_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
ALTER TABLE "public_payment_links" ADD CONSTRAINT "public_payment_links_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_payment_links" ADD CONSTRAINT "public_payment_links_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_payment_links" ADD CONSTRAINT "public_payment_links_bank_transaction_id_bank_transactions_id_fk" FOREIGN KEY ("bank_transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "public_payment_links_active_receivable_idx" ON "public_payment_links" USING btree ("receivable_id") WHERE "public_payment_links"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "public_payment_links_receivable_idx" ON "public_payment_links" USING btree ("receivable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "public_payment_links_transaction_idx" ON "public_payment_links" USING btree ("bank_transaction_id") WHERE "public_payment_links"."bank_transaction_id" is not null;--> statement-breakpoint
ALTER TABLE "bank_integrations" ADD CONSTRAINT "bank_integrations_configuration_source_valid" CHECK ("bank_integrations"."configuration_source" in ('user', 'public_qr'));--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_ingestion_origin_valid" CHECK ("bank_transactions"."ingestion_origin" in ('user', 'public_qr'));--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_recorded_origin_valid" CHECK ("payment_events"."recorded_origin" in ('user', 'public_qr'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_bank_transaction_origin_change() RETURNS trigger AS $$
BEGIN
	IF NEW.integration_id IS DISTINCT FROM OLD.integration_id
		OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
		OR NEW.source IS DISTINCT FROM OLD.source
		OR NEW.source_transaction_id IS DISTINCT FROM OLD.source_transaction_id
		OR NEW.amount_halere IS DISTINCT FROM OLD.amount_halere
		OR NEW.variable_symbol IS DISTINCT FROM OLD.variable_symbol
		OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
		OR NEW.received_at IS DISTINCT FROM OLD.received_at
		OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
		OR NEW.ingestion_origin IS DISTINCT FROM OLD.ingestion_origin THEN
		RAISE EXCEPTION 'bank transaction origin is immutable';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE FUNCTION prevent_payment_event_origin_change() RETURNS trigger AS $$
BEGIN
	IF NEW.kind IS DISTINCT FROM OLD.kind
		OR NEW.recorded_by_user_id IS DISTINCT FROM OLD.recorded_by_user_id
		OR NEW.recorded_origin IS DISTINCT FROM OLD.recorded_origin
		OR NEW.source_claim_id IS DISTINCT FROM OLD.source_claim_id
		OR NEW.bank_transaction_id IS DISTINCT FROM OLD.bank_transaction_id THEN
		RAISE EXCEPTION 'payment event origin is immutable';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER payment_events_immutable_origin
BEFORE UPDATE ON payment_events
FOR EACH ROW EXECUTE FUNCTION prevent_payment_event_origin_change();
--> statement-breakpoint
CREATE FUNCTION prevent_public_payment_link_identity_change() RETURNS trigger AS $$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id
		OR NEW.receivable_id IS DISTINCT FROM OLD.receivable_id
		OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
		OR NEW.issued_by_user_id IS DISTINCT FROM OLD.issued_by_user_id
		OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'public payment link identity is immutable';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER public_payment_links_immutable_identity
BEFORE UPDATE ON public_payment_links
FOR EACH ROW EXECUTE FUNCTION prevent_public_payment_link_identity_change();
