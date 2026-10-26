CREATE TABLE "streaming_content_ids" (
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"content_id" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"season" integer,
	"episode" integer,
	"title" text,
	"poster_path" text,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "streaming_content_ids_user_id_platform_content_id_pk" PRIMARY KEY("user_id","platform","content_id"),
	CONSTRAINT "chk_streaming_content_ids_source" CHECK (source IN ('auto', 'correction')),
	CONSTRAINT "chk_streaming_content_ids_media_type" CHECK (media_type IN ('movie', 'tv')),
	CONSTRAINT "chk_streaming_content_ids_episode" CHECK ((media_type = 'movie' AND season IS NULL AND episode IS NULL) OR (media_type = 'tv' AND season IS NOT NULL AND episode IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "streaming_detections" ADD COLUMN "content_id" text;--> statement-breakpoint
ALTER TABLE "streaming_content_ids" ADD CONSTRAINT "streaming_content_ids_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_streaming_content_ids_content" ON "streaming_content_ids" USING btree ("platform","content_id");