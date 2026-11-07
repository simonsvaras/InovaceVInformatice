ALTER TABLE "invitations" ADD COLUMN "idempotency_key" uuid;
--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_request_email_idx"
ON "invitations" USING btree ("team_id", "kind", "idempotency_key", "email")
WHERE "idempotency_key" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_kind_reference_anonymous_idx"
ON "notification_deliveries" USING btree ("kind", "reference_id")
WHERE "user_id" is null and "reference_id" is not null;
--> statement-breakpoint
INSERT INTO "app_metadata" ("key", "value", "created_at", "updated_at")
VALUES ('schema_version', 'INVITE-0026', now(), now())
ON CONFLICT ("key") DO UPDATE
SET "value"=excluded."value", "updated_at"=now();
