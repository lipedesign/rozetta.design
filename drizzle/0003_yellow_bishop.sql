CREATE TABLE IF NOT EXISTS "figma_writeback_drafts" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"seq" integer NOT NULL,
	"payload_hash" text NOT NULL,
	"payload" text NOT NULL,
	"sync_run_id" text,
	"delivered_seq" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "figma_writeback_drafts" ADD CONSTRAINT "figma_writeback_drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
