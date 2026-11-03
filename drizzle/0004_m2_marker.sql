UPDATE "app_metadata"
SET "value" = 'M2-0005', "updated_at" = now()
WHERE "key" = 'schema_version';
