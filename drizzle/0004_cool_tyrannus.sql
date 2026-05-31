CREATE TABLE IF NOT EXISTS "theme_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "theme_group_id" text;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "theme_groups" ADD CONSTRAINT "theme_groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "theme_groups_workspace_position_idx" ON "theme_groups" USING btree ("workspace_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "themes_group_position_idx" ON "themes" USING btree ("theme_group_id","position");
