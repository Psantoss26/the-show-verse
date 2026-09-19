CREATE TABLE "streaming_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"entity_key" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "streaming_events" ADD CONSTRAINT "streaming_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_streaming_event_unique" ON "streaming_events" USING btree ("user_id","event_id");--> statement-breakpoint
CREATE INDEX "idx_streaming_event_entity_time" ON "streaming_events" USING btree ("user_id","entity_key","observed_at");