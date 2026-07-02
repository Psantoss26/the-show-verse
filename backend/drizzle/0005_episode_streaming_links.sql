CREATE TABLE "episode_streaming_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tmdb_id" integer NOT NULL,
	"season" integer NOT NULL,
	"episode" integer NOT NULL,
	"platform" text NOT NULL,
	"content_id" text,
	"playback_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_episode_streaming_links_platform" CHECK (platform IN ('netflix', 'prime', 'max', 'disney', 'plex'))
);
--> statement-breakpoint
ALTER TABLE "episode_streaming_links" ADD CONSTRAINT "episode_streaming_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_episode_streaming_links_unique" ON "episode_streaming_links" USING btree ("user_id","tmdb_id","season","episode","platform");--> statement-breakpoint
CREATE INDEX "idx_episode_streaming_links_lookup" ON "episode_streaming_links" USING btree ("user_id","tmdb_id","season","episode");