CREATE TABLE "recommendation_dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_recommendation_dismissals_media_type" CHECK (media_type IN ('movie', 'tv'))
);
--> statement-breakpoint
ALTER TABLE "recommendation_dismissals" ADD CONSTRAINT "recommendation_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_recommendation_dismissals_unique" ON "recommendation_dismissals" USING btree ("user_id","tmdb_id","media_type");--> statement-breakpoint
CREATE INDEX "idx_recommendation_dismissals_user" ON "recommendation_dismissals" USING btree ("user_id","dismissed_at");