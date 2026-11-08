ALTER TABLE "memberships" ADD COLUMN "ended_reason" varchar(20);--> statement-breakpoint
ALTER TABLE "receivables" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receivables" ADD COLUMN "cancelled_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "receivables" ADD COLUMN "cancellation_reason" varchar(300);--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_ended_reason_valid" CHECK ("memberships"."ended_reason" is null or "memberships"."ended_reason" in ('left', 'removed', 'moved', 'archived'));--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_cancellation_complete" CHECK (("receivables"."cancelled_at" is null and "receivables"."cancelled_by_user_id" is null and "receivables"."cancellation_reason" is null)
        or ("receivables"."cancelled_at" is not null and "receivables"."cancelled_by_user_id" is not null and "receivables"."cancellation_reason" is not null));