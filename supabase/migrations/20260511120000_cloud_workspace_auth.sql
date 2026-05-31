CREATE TABLE IF NOT EXISTS "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "created_by" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "updated_by" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "created_by" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "updated_by" text;--> statement-breakpoint
ALTER TABLE "token_sets" ADD COLUMN IF NOT EXISTS "created_by" text;--> statement-breakpoint
ALTER TABLE "token_sets" ADD COLUMN IF NOT EXISTS "updated_by" text;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "created_by" text;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "updated_by" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "organization_id" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "actor_type" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "actor_id" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "resource_type" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "resource_id" text;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_members_organization_id_organizations_id_fk') THEN
    ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_memberships_workspace_id_workspaces_id_fk') THEN
    ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_email_unique" ON "profiles" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_members_org_user_unique" ON "organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_memberships_workspace_user_unique" ON "workspace_memberships" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_memberships_user_idx" ON "workspace_memberships" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "token_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "token_index" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "themes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "theme_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "artifact_exports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "figma_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "figma_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "figma_variable_bindings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_operations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_context_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github_pr_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_self_read') THEN
    CREATE POLICY "profiles_self_read" ON "profiles" FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_self_update') THEN
    CREATE POLICY "profiles_self_update" ON "profiles" FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL AND id = auth.uid()::text) WITH CHECK (auth.uid() IS NOT NULL AND id = auth.uid()::text);
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE
  workspace_table text;
BEGIN
  FOREACH workspace_table IN ARRAY ARRAY[
    'token_sets',
    'token_index',
    'themes',
    'theme_sets',
    'artifact_exports',
    'audit_events',
    'figma_files',
    'sync_runs',
    'ai_context_events',
    'github_pr_drafts'
  ]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = workspace_table AND policyname = workspace_table || '_member_read') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (
          auth.uid() IS NOT NULL AND EXISTS (
            SELECT 1
            FROM organization_members om
            JOIN workspaces w ON w.organization_id = om.organization_id
            WHERE w.id = %I.workspace_id AND om.user_id = auth.uid()::text
          )
        )',
        workspace_table || '_member_read',
        workspace_table,
        workspace_table
      );
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organization_members' AND policyname = 'organization_members_self_read') THEN
    CREATE POLICY "organization_members_self_read" ON "organization_members" FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'workspace_memberships' AND policyname = 'workspace_memberships_self_read') THEN
    CREATE POLICY "workspace_memberships_self_read" ON "workspace_memberships" FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizations' AND policyname = 'organizations_member_read') THEN
    CREATE POLICY "organizations_member_read" ON "organizations" FOR SELECT TO authenticated USING (
      auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.organization_id = organizations.id AND om.user_id = auth.uid()::text
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'workspaces' AND policyname = 'workspaces_member_read') THEN
    CREATE POLICY "workspaces_member_read" ON "workspaces" FOR SELECT TO authenticated USING (
      auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.organization_id = workspaces.organization_id AND om.user_id = auth.uid()::text
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'figma_snapshots' AND policyname = 'figma_snapshots_member_read') THEN
    CREATE POLICY "figma_snapshots_member_read" ON "figma_snapshots" FOR SELECT TO authenticated USING (
      auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1 FROM figma_files ff
        JOIN workspaces w ON w.id = ff.workspace_id
        JOIN organization_members om ON om.organization_id = w.organization_id
        WHERE ff.id = figma_snapshots.file_id AND om.user_id = auth.uid()::text
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'figma_variable_bindings' AND policyname = 'figma_variable_bindings_member_read') THEN
    CREATE POLICY "figma_variable_bindings_member_read" ON "figma_variable_bindings" FOR SELECT TO authenticated USING (
      auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1 FROM figma_files ff
        JOIN workspaces w ON w.id = ff.workspace_id
        JOIN organization_members om ON om.organization_id = w.organization_id
        WHERE ff.id = figma_variable_bindings.figma_file_id AND om.user_id = auth.uid()::text
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sync_operations' AND policyname = 'sync_operations_member_read') THEN
    CREATE POLICY "sync_operations_member_read" ON "sync_operations" FOR SELECT TO authenticated USING (
      auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1 FROM sync_runs sr
        JOIN workspaces w ON w.id = sr.workspace_id
        JOIN organization_members om ON om.organization_id = w.organization_id
        WHERE sr.id = sync_operations.run_id AND om.user_id = auth.uid()::text
      )
    );
  END IF;
END $$;
