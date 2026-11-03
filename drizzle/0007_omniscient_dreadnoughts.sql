ALTER TABLE "assessments" ADD CONSTRAINT "assessments_amount_positive" CHECK ("assessments"."amount_halere" > 0);--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_amount_positive" CHECK ("receivables"."amount_halere" > 0);--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_vs_digits" CHECK ("receivables"."variable_symbol" ~ '^[0-9]{1,10}$');