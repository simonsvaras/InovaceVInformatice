CREATE OR REPLACE FUNCTION enforce_payment_event_bank_source() RETURNS trigger AS $$
DECLARE movement_source varchar(20);
BEGIN
  IF NEW.bank_transaction_id IS NOT NULL THEN
    SELECT source INTO movement_source FROM bank_transactions WHERE id=NEW.bank_transaction_id;
    IF movement_source IS NULL THEN
      RAISE EXCEPTION 'payment event bank transaction does not exist';
    END IF;
    IF NEW.kind <> 'correction' AND NEW.kind <> movement_source THEN
      RAISE EXCEPTION 'payment event kind must match bank transaction source';
    END IF;
  ELSIF NEW.kind IN ('fio','simulated') THEN
    RAISE EXCEPTION 'bank payment event requires bank transaction';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
INSERT INTO "app_metadata" ("key", "value", "created_at", "updated_at")
VALUES ('schema_version', 'FIO-0025', now(), now())
ON CONFLICT ("key") DO UPDATE
SET "value"=excluded."value", "updated_at"=now();
