CREATE TABLE "actor_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"person_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actor_likes" ADD CONSTRAINT "actor_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_actor_likes_unique" ON "actor_likes" USING btree ("user_id","person_id");--> statement-breakpoint
CREATE INDEX "idx_actor_likes_person" ON "actor_likes" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_actor_likes_user" ON "actor_likes" USING btree ("user_id","created_at");
