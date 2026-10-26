ALTER TABLE "subscriptions" ADD COLUMN "billing_interval" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;
