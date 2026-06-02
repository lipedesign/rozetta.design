CREATE TABLE "design_components" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"data" text NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "design_components" ADD CONSTRAINT "design_components_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "design_components_workspace_name_idx" ON "design_components" USING btree ("workspace_id","name");