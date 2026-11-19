CREATE TABLE "request_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "request_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"method" text NOT NULL,
	"route" text NOT NULL,
	"status" smallint NOT NULL,
	"duration_ms" integer NOT NULL,
	"user_id" uuid,
	"country" text,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE INDEX "idx_request_log_ts" ON "request_log" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "idx_request_log_user_ts" ON "request_log" USING btree ("user_id","ts");