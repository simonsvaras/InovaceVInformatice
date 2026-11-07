INSERT INTO "app_metadata" ("key", "value", "created_at", "updated_at")
VALUES ('schema_version', 'INVITE-0027', now(), now())
ON CONFLICT ("key") DO UPDATE
SET "value"=excluded."value", "updated_at"=now();
