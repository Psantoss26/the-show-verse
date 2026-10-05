CREATE TABLE "detection_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"detection_id" uuid,
	"platform" text NOT NULL,
	"fingerprint" text NOT NULL,
	"trigger_text" text NOT NULL,
	"verdict" text NOT NULL,
	"rejected_tmdb_id" integer NOT NULL,
	"rejected_media_type" text NOT NULL,
	"tmdb_id" integer,
	"media_type" text,
	"season" integer,
	"episode" integer,
	"title" text,
	"poster_path" text,
	"signal" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_detection_corrections_verdict" CHECK (verdict IN ('not_a_title', 'wrong_title'))
);
--> statement-breakpoint
CREATE TABLE "detection_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" text NOT NULL,
	"platform" text NOT NULL,
	"fingerprint" text NOT NULL,
	"rule" text NOT NULL,
	"tmdb_id" integer,
	"media_type" text,
	"title" text,
	"poster_path" text,
	"trigger_text" text NOT NULL,
	"supporters" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_detection_rules_rule" CHECK (rule IN ('override', 'not_a_title', 'reject'))
);
--> statement-breakpoint
CREATE TABLE "streaming_detections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"kind" text NOT NULL,
	"fingerprint" text NOT NULL,
	"trigger_text" text NOT NULL,
	"signal" jsonb NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"season" integer,
	"episode" integer,
	"title" text,
	"poster_path" text,
	"confidence" text,
	"source" text DEFAULT 'search' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"corrected_tmdb_id" integer,
	"corrected_media_type" text,
	"corrected_season" integer,
	"corrected_episode" integer,
	"corrected_title" text,
	"corrected_poster_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_streaming_detections_kind" CHECK (kind IN ('detail', 'playback')),
	CONSTRAINT "chk_streaming_detections_status" CHECK (status IN ('active', 'corrected', 'dismissed')),
	CONSTRAINT "chk_streaming_detections_media_type" CHECK (media_type IN ('movie', 'tv'))
);
--> statement-breakpoint
ALTER TABLE "watch_history" ADD COLUMN "detection_id" uuid;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD COLUMN "detection_id" uuid;--> statement-breakpoint
ALTER TABLE "detection_corrections" ADD CONSTRAINT "detection_corrections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detection_corrections" ADD CONSTRAINT "detection_corrections_detection_id_streaming_detections_id_fk" FOREIGN KEY ("detection_id") REFERENCES "public"."streaming_detections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaming_detections" ADD CONSTRAINT "streaming_detections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_detection_corrections_detection" ON "detection_corrections" USING btree ("user_id","detection_id");--> statement-breakpoint
CREATE INDEX "idx_detection_corrections_fingerprint" ON "detection_corrections" USING btree ("platform","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_detection_rules_decision" ON "detection_rules" USING btree ("owner","platform","fingerprint") WHERE rule IN ('override', 'not_a_title');--> statement-breakpoint
CREATE UNIQUE INDEX "idx_detection_rules_reject" ON "detection_rules" USING btree ("owner","platform","fingerprint","tmdb_id","media_type") WHERE rule = 'reject';--> statement-breakpoint
CREATE INDEX "idx_detection_rules_lookup" ON "detection_rules" USING btree ("platform","fingerprint");--> statement-breakpoint
CREATE INDEX "idx_detection_rules_owner_platform" ON "detection_rules" USING btree ("owner","platform","rule");--> statement-breakpoint
CREATE INDEX "idx_streaming_detections_user_created" ON "streaming_detections" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_detection_id_streaming_detections_id_fk" FOREIGN KEY ("detection_id") REFERENCES "public"."streaming_detections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_detection_id_streaming_detections_id_fk" FOREIGN KEY ("detection_id") REFERENCES "public"."streaming_detections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_watch_history_detection" ON "watch_history" USING btree ("detection_id");--> statement-breakpoint
CREATE INDEX "idx_watch_progress_detection" ON "watch_progress" USING btree ("detection_id");