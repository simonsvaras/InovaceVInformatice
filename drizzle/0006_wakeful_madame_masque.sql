CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"team_id" uuid,
	"bank_account_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"amount_halere" integer NOT NULL,
	"due_date" date NOT NULL,
	"payment_message" varchar(60) NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessments_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "receivables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"origin_team_id" uuid,
	"bank_account_id" uuid NOT NULL,
	"amount_halere" integer NOT NULL,
	"variable_symbol" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variable_symbol_sequences" (
	"bank_account_id" uuid PRIMARY KEY NOT NULL,
	"next_value" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "reference_id" uuid;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "bank_account_id" uuid;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_origin_team_id_teams_id_fk" FOREIGN KEY ("origin_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_symbol_sequences" ADD CONSTRAINT "variable_symbol_sequences_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessments_club_created_idx" ON "assessments" USING btree ("club_id","created_at");--> statement-breakpoint
CREATE INDEX "assessments_team_created_idx" ON "assessments" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "receivables_assessment_athlete_idx" ON "receivables" USING btree ("assessment_id","athlete_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receivables_account_vs_idx" ON "receivables" USING btree ("bank_account_id","variable_symbol");--> statement-breakpoint
CREATE INDEX "receivables_athlete_idx" ON "receivables" USING btree ("athlete_id");--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_kind_reference_idx" ON "notification_deliveries" USING btree ("kind","reference_id");