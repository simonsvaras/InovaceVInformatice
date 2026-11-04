CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_event_id" uuid NOT NULL,
	"receivable_id" uuid NOT NULL,
	"amount_halere" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocations_amount_nonzero" CHECK ("payment_allocations"."amount_halere" <> 0)
);
--> statement-breakpoint
CREATE TABLE "payment_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receivable_id" uuid NOT NULL,
	"guardian_user_id" uuid NOT NULL,
	"amount_halere" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"rejection_reason" varchar(300),
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_claims_amount_positive" CHECK ("payment_claims"."amount_halere" > 0),
	CONSTRAINT "payment_claims_status_valid" CHECK ("payment_claims"."status" in ('pending', 'withdrawn', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"team_id" uuid,
	"kind" varchar(30) NOT NULL,
	"amount_halere" integer NOT NULL,
	"occurred_on" date NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"source_claim_id" uuid,
	"idempotency_key" uuid,
	"reverses_event_id" uuid,
	"correction_reason" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payment_events_reverses_event_id_unique" UNIQUE("reverses_event_id"),
	CONSTRAINT "payment_events_amount_positive" CHECK ("payment_events"."amount_halere" > 0),
	CONSTRAINT "payment_events_kind_valid" CHECK ("payment_events"."kind" in ('manual_claim', 'cash', 'correction'))
);
--> statement-breakpoint
CREATE TABLE "reminder_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"team_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_batches_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "reminder_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"receivable_id" uuid NOT NULL,
	"guardian_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_event_id_payment_events_id_fk" FOREIGN KEY ("payment_event_id") REFERENCES "public"."payment_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_guardian_user_id_users_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_source_claim_id_payment_claims_id_fk" FOREIGN KEY ("source_claim_id") REFERENCES "public"."payment_claims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_batches" ADD CONSTRAINT "reminder_batches_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_batches" ADD CONSTRAINT "reminder_batches_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_batches" ADD CONSTRAINT "reminder_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_recipients" ADD CONSTRAINT "reminder_recipients_batch_id_reminder_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."reminder_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_recipients" ADD CONSTRAINT "reminder_recipients_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_recipients" ADD CONSTRAINT "reminder_recipients_guardian_user_id_users_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_allocations_event_receivable_idx" ON "payment_allocations" USING btree ("payment_event_id","receivable_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_receivable_idx" ON "payment_allocations" USING btree ("receivable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_claims_one_pending_receivable_idx" ON "payment_claims" USING btree ("receivable_id") WHERE "payment_claims"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "payment_claims_guardian_status_idx" ON "payment_claims" USING btree ("guardian_user_id","status");--> statement-breakpoint
CREATE INDEX "payment_claims_receivable_idx" ON "payment_claims" USING btree ("receivable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_source_claim_idx" ON "payment_events" USING btree ("source_claim_id");--> statement-breakpoint
CREATE INDEX "payment_events_club_created_idx" ON "payment_events" USING btree ("club_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_events_team_created_idx" ON "payment_events" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX "reminder_batches_scope_idx" ON "reminder_batches" USING btree ("club_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_recipients_batch_receivable_idx" ON "reminder_recipients" USING btree ("batch_id","receivable_id");--> statement-breakpoint
CREATE INDEX "reminder_recipients_receivable_idx" ON "reminder_recipients" USING btree ("receivable_id");