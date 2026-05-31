CREATE TABLE IF NOT EXISTS "workspace_branches" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_branch_id" text,
	"snapshot" text NOT NULL,
	"git_binding" text,
	"created_by" text,
	"updated_by" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "active_branch_id" text;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "workspace_branches" ADD CONSTRAINT "workspace_branches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_branches_workspace_idx" ON "workspace_branches" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_branches_workspace_name_unique" ON "workspace_branches" USING btree ("workspace_id","name");
