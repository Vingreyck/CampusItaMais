ALTER TABLE "tasks" ADD COLUMN "dependency" text DEFAULT 'nenhuma' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "dependency_note" text DEFAULT '' NOT NULL;