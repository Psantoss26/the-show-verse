DELETE FROM "user_ratings" a
USING "user_ratings" b
WHERE a."id" < b."id"
  AND a."user_id" = b."user_id"
  AND a."tmdb_id" = b."tmdb_id"
  AND a."media_type" = b."media_type"
  AND a."media_type" IN ('movie', 'tv')
  AND a."season" IS NULL
  AND b."season" IS NULL
  AND a."episode" IS NULL
  AND b."episode" IS NULL;--> statement-breakpoint

DELETE FROM "user_ratings" a
USING "user_ratings" b
WHERE a."id" < b."id"
  AND a."user_id" = b."user_id"
  AND a."tmdb_id" = b."tmdb_id"
  AND a."media_type" = 'episode'
  AND b."media_type" = 'episode'
  AND a."season" = b."season"
  AND a."episode" = b."episode"
  AND a."season" IS NOT NULL
  AND a."episode" IS NOT NULL;--> statement-breakpoint

DROP INDEX IF EXISTS "idx_ratings_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ratings_unique_title" ON "user_ratings" USING btree ("user_id","tmdb_id","media_type") WHERE media_type IN ('movie', 'tv') AND season IS NULL AND episode IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ratings_unique_episode" ON "user_ratings" USING btree ("user_id","tmdb_id","season","episode") WHERE media_type = 'episode' AND season IS NOT NULL AND episode IS NOT NULL;
