CREATE TABLE "ai_context_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"source_id" text,
	"summary" text NOT NULL,
	"payload" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifact_exports" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" text,
	"path" text NOT NULL,
	"checksum" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"payload" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "figma_files" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"file_key" text NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"last_seen_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "figma_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"file_id" text NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"checksum" text NOT NULL,
	"payload" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "figma_variable_bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"figma_file_id" text NOT NULL,
	"variable_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"mode_id" text,
	"set_id" text NOT NULL,
	"token_path" text NOT NULL,
	"metadata" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"last_synced_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_pr_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"branch_name" text NOT NULL,
	"base_branch" text NOT NULL,
	"head_branch" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"url" text,
	"payload" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"summary" text NOT NULL,
	"payload" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"direction" text NOT NULL,
	"status" text NOT NULL,
	"source_snapshot_id" text,
	"summary" text NOT NULL,
	"created_at" text NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "theme_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"theme_id" text NOT NULL,
	"set_id" text NOT NULL,
	"mode" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"updated_at" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_index" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"set_id" text NOT NULL,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"is_alias" boolean NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"filename" text NOT NULL,
	"root" text NOT NULL,
	"source" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_context_events" ADD CONSTRAINT "ai_context_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_exports" ADD CONSTRAINT "artifact_exports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_files" ADD CONSTRAINT "figma_files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_snapshots" ADD CONSTRAINT "figma_snapshots_file_id_figma_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."figma_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_variable_bindings" ADD CONSTRAINT "figma_variable_bindings_figma_file_id_figma_files_id_fk" FOREIGN KEY ("figma_file_id") REFERENCES "public"."figma_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_pr_drafts" ADD CONSTRAINT "github_pr_drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_run_id_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_source_snapshot_id_figma_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."figma_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_sets" ADD CONSTRAINT "theme_sets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_sets" ADD CONSTRAINT "theme_sets_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_index" ADD CONSTRAINT "token_index_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_index" ADD CONSTRAINT "token_index_set_id_token_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."token_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_sets" ADD CONSTRAINT "token_sets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_context_events_workspace_kind_created_idx" ON "ai_context_events" USING btree ("workspace_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "artifact_exports_workspace_created_idx" ON "artifact_exports" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_workspace_kind_created_idx" ON "audit_events" USING btree ("workspace_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "figma_files_workspace_file_key_unique" ON "figma_files" USING btree ("workspace_id","file_key");--> statement-breakpoint
CREATE INDEX "figma_snapshots_file_created_idx" ON "figma_snapshots" USING btree ("file_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "figma_variable_bindings_unique_variable_mode" ON "figma_variable_bindings" USING btree ("figma_file_id","variable_id","mode_id");--> statement-breakpoint
CREATE INDEX "figma_variable_bindings_token_idx" ON "figma_variable_bindings" USING btree ("set_id","token_path");--> statement-breakpoint
CREATE INDEX "github_pr_drafts_workspace_status_created_idx" ON "github_pr_drafts" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "sync_operations_run_idx" ON "sync_operations" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "sync_runs_workspace_connector_created_idx" ON "sync_runs" USING btree ("workspace_id","connector_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "theme_sets_theme_set_unique" ON "theme_sets" USING btree ("theme_id","set_id");--> statement-breakpoint
CREATE INDEX "theme_sets_theme_position_idx" ON "theme_sets" USING btree ("theme_id","position");--> statement-breakpoint
CREATE INDEX "themes_workspace_name_idx" ON "themes" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "token_index_set_path_unique" ON "token_index" USING btree ("set_id","path");--> statement-breakpoint
CREATE INDEX "token_index_workspace_path_idx" ON "token_index" USING btree ("workspace_id","path");--> statement-breakpoint
CREATE INDEX "token_index_workspace_type_idx" ON "token_index" USING btree ("workspace_id","type");--> statement-breakpoint
CREATE INDEX "token_sets_workspace_name_idx" ON "token_sets" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "token_sets_workspace_filename_unique" ON "token_sets" USING btree ("workspace_id","filename");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_organization_slug_unique" ON "workspaces" USING btree ("organization_id","slug");