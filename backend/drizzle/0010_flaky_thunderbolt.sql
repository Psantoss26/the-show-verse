ALTER TABLE "watch_history" ADD COLUMN "activity_group" text;--> statement-breakpoint
CREATE INDEX "idx_watch_history_activity_group" ON "watch_history" USING btree ("user_id","activity_group");