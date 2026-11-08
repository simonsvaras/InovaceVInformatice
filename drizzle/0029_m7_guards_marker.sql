CREATE FUNCTION prevent_allocation_to_cancelled_receivable() RETURNS trigger AS $$
BEGIN
  IF NEW.amount_halere > 0 AND EXISTS (
    SELECT 1 FROM receivables r
    WHERE r.id = NEW.receivable_id AND r.cancelled_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Zrušený dluh nelze uhradit.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER payment_allocations_not_cancelled
BEFORE INSERT ON payment_allocations
FOR EACH ROW EXECUTE FUNCTION prevent_allocation_to_cancelled_receivable();--> statement-breakpoint
CREATE FUNCTION prevent_cancelled_receivable_change() RETURNS trigger AS $$
BEGIN
  IF OLD.cancelled_at IS NOT NULL AND (
    NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
    OR NEW.cancelled_by_user_id IS DISTINCT FROM OLD.cancelled_by_user_id
    OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason
  ) THEN
    RAISE EXCEPTION 'Zrušení dluhu nelze změnit ani vrátit.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER receivables_cancellation_final
BEFORE UPDATE ON receivables
FOR EACH ROW EXECUTE FUNCTION prevent_cancelled_receivable_change();--> statement-breakpoint
INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', 'M7-0029', now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
