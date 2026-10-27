CREATE TABLE "artwork_votes" (
	"user_id" uuid NOT NULL,
	"media_type" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"kind" text NOT NULL,
	"file_path" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artwork_votes_user_id_media_type_tmdb_id_kind_pk" PRIMARY KEY("user_id","media_type","tmdb_id","kind")
);
--> statement-breakpoint
ALTER TABLE "artwork_votes" ADD CONSTRAINT "artwork_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_artwork_votes_title" ON "artwork_votes" USING btree ("media_type","tmdb_id","kind","file_path");--> statement-breakpoint
-- Las selecciones que ya existían cuentan desde el primer día: un voto por cada
-- entrada válida de `ui_settings.artworkOverrides` ("movie:550": { poster: … }).
INSERT INTO "artwork_votes" ("user_id", "media_type", "tmdb_id", "kind", "file_path", "updated_at")
SELECT p."user_id", split_part(o.key, ':', 1), split_part(o.key, ':', 2)::integer, k.key, k.value, p."updated_at"
FROM "user_preferences" p
CROSS JOIN LATERAL jsonb_each(
  CASE WHEN jsonb_typeof(p."ui_settings"->'artworkOverrides') = 'object' THEN p."ui_settings"->'artworkOverrides' ELSE '{}'::jsonb END
) o
CROSS JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(o.value) = 'object' THEN o.value ELSE '{}'::jsonb END) k
WHERE o.key ~ '^(movie|tv|collection|season):[0-9]{1,9}$'
  AND k.key IN ('poster', 'mobilePoster', 'backdrop', 'background', 'logo')
  AND k.value ~ '^/[A-Za-z0-9._/-]+$'
ON CONFLICT DO NOTHING;
