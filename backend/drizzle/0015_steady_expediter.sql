ALTER TABLE "user_ratings" DROP CONSTRAINT "chk_ratings_media_type";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ratings_unique_season" ON "user_ratings" USING btree ("user_id","tmdb_id","season") WHERE media_type = 'season' AND season IS NOT NULL AND episode IS NULL;--> statement-breakpoint
ALTER TABLE "user_ratings" ADD CONSTRAINT "chk_ratings_media_type" CHECK (media_type IN ('movie', 'tv', 'season', 'episode'));
