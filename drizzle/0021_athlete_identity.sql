ALTER TABLE "athletes" ADD COLUMN "full_name" varchar(160);--> statement-breakpoint
UPDATE "athletes"
SET "full_name" = trim(concat_ws(' ', "first_name", "last_name"));--> statement-breakpoint
ALTER TABLE "athletes" ALTER COLUMN "full_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "athletes" ALTER COLUMN "first_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "athletes" ALTER COLUMN "last_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "athletes" ALTER COLUMN "birth_year" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "athletes" ADD COLUMN "creation_key" uuid;--> statement-breakpoint
ALTER TABLE "athlete_guardians" ADD COLUMN "relationship" varchar(10);--> statement-breakpoint
CREATE UNIQUE INDEX "athletes_creation_key_idx" ON "athletes" USING btree ("creation_key") WHERE "athletes"."creation_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_guardians_one_self_per_user_idx" ON "athlete_guardians" USING btree ("user_id") WHERE "athlete_guardians"."relationship" = 'self';--> statement-breakpoint
ALTER TABLE "athlete_guardians" ADD CONSTRAINT "athlete_guardians_relationship_valid" CHECK ("athlete_guardians"."relationship" is null or "athlete_guardians"."relationship" in ('self', 'child'));
