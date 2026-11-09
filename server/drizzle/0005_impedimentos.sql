CREATE TABLE "impediment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"impediment_id" uuid NOT NULL,
	"message" text NOT NULL,
	"user_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impediments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" serial NOT NULL,
	"task_id" uuid,
	"action_text" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'outros' NOT NULL,
	"impact" text DEFAULT 'medio' NOT NULL,
	"responsible_name" text DEFAULT '' NOT NULL,
	"measure" text DEFAULT '' NOT NULL,
	"due_date" date,
	"status" text DEFAULT 'em_analise' NOT NULL,
	"resolved_at" date,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "impediment_events" ADD CONSTRAINT "impediment_events_impediment_id_impediments_id_fk" FOREIGN KEY ("impediment_id") REFERENCES "public"."impediments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impediments" ADD CONSTRAINT "impediments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impediments" ADD CONSTRAINT "impediments_created_by_id_access_keys_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."access_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "impediment_events_idx" ON "impediment_events" USING btree ("impediment_id");--> statement-breakpoint
CREATE INDEX "impediments_status_idx" ON "impediments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "impediments_task_idx" ON "impediments" USING btree ("task_id");