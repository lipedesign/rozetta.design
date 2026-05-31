DROP INDEX IF EXISTS "token_index_set_path_unique";--> statement-breakpoint
ALTER TABLE "token_index" ADD COLUMN IF NOT EXISTS "mode_id" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "token_sets" ADD COLUMN IF NOT EXISTS "modes" text;--> statement-breakpoint
ALTER TABLE "token_sets" ADD COLUMN IF NOT EXISTS "mode_roots" text;--> statement-breakpoint
ALTER TABLE "token_sets" ADD COLUMN IF NOT EXISTS "active_mode_id" text;--> statement-breakpoint
ALTER TABLE "theme_sets" ADD COLUMN IF NOT EXISTS "mode_id" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "theme_sets_theme_set_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "token_index_set_mode_path_unique" ON "token_index" USING btree ("set_id","mode_id","path");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "theme_sets_theme_set_mode_unique" ON "theme_sets" USING btree ("theme_id","set_id","mode_id");
