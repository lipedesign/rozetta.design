# Feature: MCP & AI

## Status
implemented

## Purpose
Make Rozetta AI-first without letting AI mutate workspace state automatically.

## Behavior
1. The sidebar's lower **Ask AI** action opens a floating right-side sheet.
2. The panel explains validation issues, suggests token names, proposes safe fix plans, proposes design-system registry changes, and can generate release notes when a Git baseline is available.
3. The panel MUST link to `/ai` for the full AI Assistant workflow.
4. `/ai` is the primary AI usage surface and owns prompt shortcuts, context selection, review suggestions, and summarized activity.
5. `/settings` owns Studio Settings, including BYOK OpenAI/Anthropic provider configuration stored only in `.rozetta/ai-settings.local.json`.
6. When no configured provider key is available, the deterministic fallback MUST run.
7. AI proposals MUST be reviewed before apply.
8. The MCP server runs as a separate Node CLI over stdio via `pnpm mcp`.
9. MCP tools MUST call pure domain helpers or Node-only workspace readers, never React components or Zustand stores.
10. `propose_patch`, AI proposal tools, and design-system proposal tools return structured proposals only; they MUST NOT write files or mutate state.
11. MCP MAY read the Supabase/Postgres runtime DB for DB-first tokens/themes, Figma bridge state, and PR drafts, but MUST NOT publish PRs or write snapshots.

## MCP tools
- `list_collections`
- `list_collection_modes`
- `list_sets`
- `list_themes`
- `search_tokens`
- `resolve_alias`
- `validate_workspace`
- `semantic_diff`
- `preview_export`
- `propose_patch`
- `list_brands`
- `list_components`
- `validate_design_system`
- `design_system_diff`
- `propose_brand`
- `propose_component`
- `propose_design_system_patch`
- `get_workspace_context`
- `run_ai_proposal`
- `list_ai_patches`
- `preview_ai_patch`
- `validate_ai_patch`
- `list_sync_connectors`
- `connector_readiness`
- `figma_bridge_state`
- `list_github_pr_drafts`

`list_sets` remains only as a compatibility alias. New MCP clients SHOULD use Collection/Mode vocabulary.

## UI
- Component: *src/components/ai/ai-panel.tsx*.
- AI Assistant: *src/components/ai/ai-assistant-home.tsx*.
- Studio Settings: *src/components/settings/studio-settings.tsx*.
- Mounted by shared shells so it is available across Tokens, Themes, and product routes.

## CLI
- Entry: *src/mcp/server.ts*.
- Script: `pnpm mcp`.
