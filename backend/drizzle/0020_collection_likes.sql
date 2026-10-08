CREATE TABLE "collection_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"collection_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_likes" ADD CONSTRAINT "collection_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_collection_likes_unique" ON "collection_likes" USING btree ("user_id","collection_id");--> statement-breakpoint
CREATE INDEX "idx_collection_likes_collection" ON "collection_likes" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "idx_collection_likes_user" ON "collection_likes" USING btree ("user_id","created_at");