INSERT INTO "app_metadata" ("key", "value", "updated_at")
VALUES ('schema_version', 'M4-0016', now())
ON CONFLICT ("key") DO UPDATE
SET "value" = EXCLUDED."value", "updated_at" = now();
