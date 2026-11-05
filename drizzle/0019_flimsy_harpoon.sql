DROP INDEX "bank_integrations_exclusive_team_idx";--> statement-breakpoint
CREATE INDEX "bank_integrations_exclusive_team_idx" ON "bank_integrations" USING btree ("exclusive_team_id");