ALTER TABLE "comments" ADD COLUMN "external_key" text;--> statement-breakpoint
ALTER TABLE "subtasks" ADD COLUMN "external_key" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "external_key" text;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_external_key_unique" UNIQUE("external_key");--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_external_key_unique" UNIQUE("external_key");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_external_key_unique" UNIQUE("external_key");