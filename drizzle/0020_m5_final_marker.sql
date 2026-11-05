INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', 'M5-0020', now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
