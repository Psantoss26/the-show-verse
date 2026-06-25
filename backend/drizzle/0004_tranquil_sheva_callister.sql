CREATE TABLE "dashboard_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pool_key" text NOT NULL,
	"media_type" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_dashboard_pools_key_type" UNIQUE("pool_key","media_type")
);
--> statement-breakpoint
CREATE TABLE "user_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"media_type" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"basis_hash" text DEFAULT '' NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_user_rec_user_type" UNIQUE("user_id","media_type")
);
--> statement-breakpoint
ALTER TABLE "user_recommendations" ADD CONSTRAINT "user_recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dashboard_pools_expires" ON "dashboard_pools" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_user_rec_user" ON "user_recommendations" USING btree ("user_id");