CREATE TABLE "streaming_discards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"origin" text,
	"trigger_text" text NOT NULL,
	"fingerprint" text DEFAULT '' NOT NULL,
	"content_id" text,
	"signal" jsonb NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_streaming_discards_kind" CHECK (kind IN ('detail', 'playback')),
	CONSTRAINT "chk_streaming_discards_reason" CHECK (reason IN ('unresolved', 'not_a_title', 'hint_mismatch', 'empty_title')),
	CONSTRAINT "chk_streaming_discards_origin" CHECK (origin IS NULL OR origin IN ('android', 'browser'))
);
--> statement-breakpoint
ALTER TABLE "streaming_discards" ADD CONSTRAINT "streaming_discards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_streaming_discards_user_created" ON "streaming_discards" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_streaming_discards_platform_created" ON "streaming_discards" USING btree ("platform","created_at");