CREATE TABLE "watch_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"season" integer DEFAULT 0 NOT NULL,
	"episode" integer DEFAULT 0 NOT NULL,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"runtime_seconds" integer DEFAULT 0 NOT NULL,
	"percent" real DEFAULT 0 NOT NULL,
	"platform" text,
	"title" text,
	"poster_path" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_watch_progress_media_type" CHECK (media_type IN ('movie', 'tv'))
);
--> statement-breakpoint
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_watch_progress_item" ON "watch_progress" USING btree ("user_id","tmdb_id","media_type","season","episode");--> statement-breakpoint
CREATE INDEX "idx_watch_progress_user_updated" ON "watch_progress" USING btree ("user_id","updated_at");