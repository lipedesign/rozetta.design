# Feature: Settings hub

## Status
partial — `/settings` is consolidated into a sidebar + workspace layout with five categories: Workspace, AI Providers, Bridge, Storage, About. Workspace rename is wired through a new `updateWorkspaceMeta` Server Action. AI Providers reuses the existing `saveAiSettings` surface. Bridge, Storage, and About are read-only summaries built from existing server helpers.

## Purpose
`/settings` is the single hub for workspace-, theme-, and branch-level studio settings. Previously the page only exposed AI providers, with related controls scattered across `/themes`, `/branches`, and `/sync/figma`. Settings now consolidates the "configure" surface so users have one predictable destination for studio-wide preferences.

## User stories
- As a workspace owner, I can rename my active workspace from a single place.
- As an AI-curious user, I can configure provider/model/API key choices and see which provider is active.
- As a Figma bridge user, I can see whether the bridge is paired and regenerate a pairing code.
- As an operator, I can confirm at a glance whether the runtime DB is configured and which driver is active (pglite vs postgres).
- As a contributor, I can see the running app version, the runtime mode, and links into the live specs.

## Behavior

S1. `/settings` MUST render a sidebar + workspace layout that mirrors `/themes` and `/tokens` in shape:
  - **Left pane**: vertical list of categories (`Workspace`, `AI Providers`, `Bridge`, `Storage`, `About`).
  - **Right pane**: detail editor for the selected category.

S2. The Workspace category MUST display read-only workspace slug, organization name, and role from `WorkspaceContext` and MUST expose a name field that calls `updateWorkspaceMeta({ name })`.

S3. `updateWorkspaceMeta({ name })` MUST:
  - resolve `WorkspaceContext` and require at least the `admin` role;
  - validate `name` matches `/^.{1,80}$/` after trimming;
  - persist `workspaces.name` and bump `workspaces.updated_at` and `updated_by`;
  - return `{ ok: true, workspace }` or `{ ok: false, error }`;
  - `revalidatePath("/", "layout")` so the persistent shell picks up the new name.

S4. The AI Providers category MUST reuse the existing `saveAiSettings(settings)` Server Action. API keys MUST stay write-only (no echoing existing values into the client).

S5. The Bridge category MUST display the current Figma bridge pairing summary loaded from `getFigmaSyncState()` and MUST offer a "Regenerate pairing code" action that wraps `createFigmaBridgePairingCode(workspaceContext)`. The action's result MUST display the new code and expiry in the UI but MUST NOT be persisted to disk by this route.

S6. The Storage category MUST display:
  - whether the runtime DB is configured (`isWorkspaceDbConfigured()` server-side check based on `process.env.DATABASE_URL` or Supabase env);
  - the runtime driver (`pglite` vs `postgres`) using `isUsingPglite()`;
  - the canonical token artifact path (`tokens/<collection-id>/<mode-id>.tokens.json`).

S7. The About category MUST display the package version (`package.json#version` read server-side), the Node runtime, and links to the live specs (`specs/constitution.md`, `specs/architecture.md`, this spec).

S8. `getSettingsOverview()` MUST return everything the page needs in one shot to keep page rendering on the server: workspace identity, AI settings (redacted), Figma bridge state, storage status, runtime info, and app version.

S9. All Server Actions exposed by *src/lib/settings/actions.ts* MUST return discriminated `{ ok: true, ... } | { ok: false, error }` results. Server Actions MUST NOT throw across the boundary.

## Data
- Re-uses: `WorkspaceContext`, `WorkspaceSwitcherOption`, `AiSettings`, `FigmaBridgeState`, `FigmaBridgePairingCode`.
- Adds: `SettingsOverview`, `UpdateWorkspaceMetaResult`, `SettingsStorageStatus`, `SettingsRuntimeInfo` (defined in *src/lib/settings/types.ts*).

## UI
- Route: `/settings` — *src/app/(studio)/settings/page.tsx*.
- Hub shell: *src/components/settings/settings-page.tsx*.
- Category list: *src/components/settings/settings-categories.tsx*.
- Detail panels:
  - *src/components/settings/workspace-settings-panel.tsx*
  - *src/components/settings/ai-providers-panel.tsx* (extracted from `studio-settings.tsx`)
  - *src/components/settings/bridge-settings-panel.tsx*
  - *src/components/settings/storage-settings-panel.tsx*
  - *src/components/settings/about-settings-panel.tsx*

The previous `studio-settings.tsx` is retired in favor of the panels above. Authentication account/profile concerns intentionally remain out of this iteration — they belong to a future Account spec, not the workspace-scoped Settings hub.

## Out of scope (v1)
- Workspace slug rename (slug is stable for now to avoid Git artifact churn).
- Member / role management (covered by future Cloud Workspace Auth spec).
- Persisting regenerated pairing codes server-side (regeneration is ephemeral display).
- Editing Storage/About content — they stay read-only.

## Open questions
- Should Bridge surface multi-bridge pairings once we have more than Figma? Currently only Figma.
- Should About expose a "Reset workspace" destructive action behind a confirm dialog? Out for v1.
