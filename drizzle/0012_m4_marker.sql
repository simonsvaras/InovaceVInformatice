UPDATE "app_metadata"
SET "value" = 'M4-0012', "updated_at" = now()
WHERE "key" = 'schema_version';
