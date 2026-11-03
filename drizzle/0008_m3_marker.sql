UPDATE "app_metadata"
SET "value" = 'M3-0008', "updated_at" = now()
WHERE "key" = 'schema_version';
