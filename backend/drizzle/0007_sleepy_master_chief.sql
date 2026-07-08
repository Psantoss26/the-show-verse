CREATE TABLE "community_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"title" text,
	"poster_path" text,
	"position" integer DEFAULT 0,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" bigint,
	"user_list_id" uuid,
	"slug" text,
	"name" text NOT NULL,
	"description" text,
	"owner_name" text,
	"owner_username" text,
	"owner_avatar_url" text,
	"item_count" integer DEFAULT 0 NOT NULL,
	"copied_item_count" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"privacy" text,
	"trakt_url" text,
	"preview_posters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "title_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"source" text NOT NULL,
	"external_id" bigint,
	"user_id" uuid,
	"author_name" text,
	"author_username" text,
	"author_avatar_url" text,
	"author_is_vip" boolean DEFAULT false,
	"body" text NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"spoiler" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_title_comments_source" CHECK (source IN ('trakt','native'))
);
--> statement-breakpoint
CREATE TABLE "title_community_state" (
	"tmdb_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"trakt_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"seeded_at" timestamp with time zone,
	"sentiment_built_at" timestamp with time zone,
	"sentiment_provider" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_title_state_media_type" CHECK (media_type IN ('movie','tv'))
);
--> statement-breakpoint
CREATE TABLE "title_sentiment" (
	"tmdb_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"good" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bad" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" text,
	"model" text,
	"source_comment_count" integer DEFAULT 0 NOT NULL,
	"is_provisional" boolean DEFAULT false NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_list_items" ADD CONSTRAINT "community_list_items_list_id_community_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."community_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_lists" ADD CONSTRAINT "community_lists_user_list_id_user_lists_id_fk" FOREIGN KEY ("user_list_id") REFERENCES "public"."user_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_comments" ADD CONSTRAINT "title_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_community_list_items_unique" ON "community_list_items" USING btree ("list_id","tmdb_id","media_type");--> statement-breakpoint
CREATE INDEX "idx_community_list_items_title" ON "community_list_items" USING btree ("tmdb_id","media_type");--> statement-breakpoint
CREATE INDEX "idx_community_list_items_list" ON "community_list_items" USING btree ("list_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_community_lists_external" ON "community_lists" USING btree ("external_id") WHERE source = 'trakt' AND external_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_community_lists_likes" ON "community_lists" USING btree ("likes");--> statement-breakpoint
CREATE INDEX "idx_community_lists_items" ON "community_lists" USING btree ("item_count");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_title_comments_external" ON "title_comments" USING btree ("external_id") WHERE external_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_title_comments_likes" ON "title_comments" USING btree ("tmdb_id","media_type","likes");--> statement-breakpoint
CREATE INDEX "idx_title_comments_created" ON "title_comments" USING btree ("tmdb_id","media_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_title_state_pk" ON "title_community_state" USING btree ("tmdb_id","media_type");--> statement-breakpoint
CREATE INDEX "idx_title_state_status" ON "title_community_state" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_title_sentiment_pk" ON "title_sentiment" USING btree ("tmdb_id","media_type");