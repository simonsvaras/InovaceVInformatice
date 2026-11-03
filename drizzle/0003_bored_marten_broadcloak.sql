CREATE TABLE "athlete_guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "athletes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" varchar(80) NOT NULL,
	"last_name" varchar(80) NOT NULL,
	"birth_year" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"guardian_user_id" uuid NOT NULL,
	"join_code_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"source" varchar(20) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "team_join_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_join_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "athlete_guardians" ADD CONSTRAINT "athlete_guardians_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_guardians" ADD CONSTRAINT "athlete_guardians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_guardian_user_id_users_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_join_code_id_team_join_codes_id_fk" FOREIGN KEY ("join_code_id") REFERENCES "public"."team_join_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_join_codes" ADD CONSTRAINT "team_join_codes_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_join_codes" ADD CONSTRAINT "team_join_codes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_guardians_one_guardian_idx" ON "athlete_guardians" USING btree ("athlete_id");--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_guardians_athlete_user_idx" ON "athlete_guardians" USING btree ("athlete_id","user_id");--> statement-breakpoint
CREATE INDEX "athlete_guardians_user_id_idx" ON "athlete_guardians" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "join_requests_one_pending_team_athlete_idx" ON "join_requests" USING btree ("team_id","athlete_id") WHERE "join_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "join_requests_team_status_idx" ON "join_requests" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "join_requests_guardian_idx" ON "join_requests" USING btree ("guardian_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_one_active_team_athlete_idx" ON "memberships" USING btree ("team_id","athlete_id") WHERE "memberships"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "memberships_athlete_id_idx" ON "memberships" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "team_join_codes_team_id_idx" ON "team_join_codes" USING btree ("team_id");