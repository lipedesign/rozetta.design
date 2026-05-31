# Architecture

System shape, layering, and data flow. For domain types see [`domain.md`](./domain.md). For API surface see [`contracts.md`](./contracts.md).

---

## 1. Layers

```
┌──────────────────────────────────────────────────────────────┐
│  UI components (src/components/**)                           │
│  - read state via Zustand selectors                          │
│  - dispatch via store actions or Server Actions              │
└─────────────┬────────────────────────────┬───────────────────┘
              │                            │
              │  store actions             │  Server Actions
              ▼                            ▼
┌────────────────────────────┐  ┌──────────────────────────────┐
│  State (src/lib/stores)    │  │  Server boundary             │
│  - tokens-store            │  │  src/lib/tokens/actions.ts   │
│  - themes/store            │  │  ('use server')              │
│  - design-system/store     │  │  design-system actions       │
│  - UI reactivity           │  │  DB repositories             │
└─────────────┬──────────────┘  └─────────────┬────────────────┘
              │                               │
              │  invariant-preserving         │  server/MCP-only fs
              ▼                               ▼
┌────────────────────────────┐  ┌──────────────────────────────┐
│  Domain (src/lib/dtcg)     │  │  Filesystem helpers          │
│  - types, parser,          │  │  src/lib/tokens/filesystem.ts│
│    serializer, resolver,   │  │                              │
│    format, schema          │  │                              │
└────────────────────────────┘  └─────────────┬────────────────┘
                                              │
                                              ▼
                                       Supabase/Postgres runtime DB
                                       /tokens + /.rozetta artifacts
```

Workspace product modules live alongside the domain layer:
- `src/lib/workspace/**` is pure TypeScript for validation, semantic diff, releases, and profile types.
- `src/lib/git/status.ts` is server/MCP-only and reads Git state for product routes.
- `src/lib/db/**` owns the Supabase/Postgres runtime database via Drizzle. Token Collections, Collection Modes, and Themes are DB-first here; Figma snapshots, mappings, sync runs, AI context, and PR drafts also live here as operational memory. DB credentials live only in `.env.local`.
- `src/lib/auth/**` owns Supabase SSR Auth, profile/workspace bootstrap, workspace switching, and server-side role guards. Product actions MUST resolve or receive `WorkspaceContext` before DB access.
- `src/lib/export-profiles/**` is the server boundary for `.rozetta/export-profiles.json`.
- `src/lib/themes/**` is the server/client boundary for theme drafts in the DB, `.rozetta/themes.json` artifact export, and the legacy theme migration source.
- `src/lib/design-system/**` owns Git-versioned brands/components and pure DS registry helpers.
- `src/lib/figma-bridge/**` owns Server Actions for receiving Figma snapshots, previewing sync operations, preparing plugin writeback payloads, and loading bridge state.
- `src/lib/figma-bridge/writeback/**` (planned, see [`figma-writeback.md`](./features/figma-writeback.md)) owns the writeback adapter contract and the per-adapter implementations (`plugin`, `figma-cli`). It MUST stay server-only and is disabled for `figma-cli` in hosted runtime.
- `figma-plugin/**` owns the **Rozetta Bridge** Figma plugin (see [`figma-plugin-bridge.md`](./features/figma-plugin-bridge.md)). The plugin is a small operational bridge with its own base-luma-inspired mini UI system; it does not import the web app or share React components.
- `src/lib/github/**` owns explicit GitHub PR draft/publish actions for reviewed artifacts. The staged publish pipeline (planned, see [`github-bridge.md`](./features/github-bridge.md)) MUST run server-only and is disabled in hosted runtime.
- `src/lib/ai-os/**` owns AI settings, patch queue, summarized sessions, provider adapters, patch preview/apply helpers, and connector discovery.
- `src/lib/ai-os/local-agent/**` owns the server-only local agent bridge (Claude Code Local, Codex Local). It MUST stay server-only, use allowlisted `execFile` spawn (no `shell: true`), and be disabled in hosted/Vercel/Edge runtime via the same guard used by `src/lib/figma-bridge/writeback/**` and `src/lib/github/**`.
- `src/lib/ai-os/contract/**` owns the AI Data Contract: Zod operation/proposal schemas, the in-memory context graph builder, the prompt serializer, and read-only retrieval tools. It MUST stay server-only and MUST NOT be imported by client components. See [`features/ai-data-contract.md`](./features/ai-data-contract.md).
- `src/lib/settings/**` owns the `/settings` hub Server Actions and pure server helpers (workspace rename, settings overview, Figma bridge pairing regeneration, runtime DB / app version probes). It MUST stay server-only and is allowed to call into `auth`, `ai-os`, `figma-bridge`, and `db` modules.
- `src/mcp/**` is a Node CLI boundary for MCP stdio and MUST NOT import React/Zustand.

## 2. Layer responsibilities

| Layer | Responsibility | MUST NOT |
|---|---|---|
| **UI** | Render state, dispatch actions, manage transient draft state | Touch the filesystem, mutate domain types directly |
| **State** | Hold reactive client mirrors, mediate CRUD, persist drafts through Server Actions into DB | Read from disk, perform direct filesystem or DB I/O |
| **Domain** | Pure functions over DTCG trees: traversal, mutation, alias resolution, formatting | Depend on React, Zustand, Next.js |
| **Server boundary** | Server Actions and Route Handlers exposed to clients; convert FS/DB errors into `Result` types | Throw across the boundary; expose `node:fs` types |
| **Filesystem** | Read / write `tokens/<collection>/<mode>.tokens.json`, legacy `tokens/*.tokens.json`, and Git-versioned `.rozetta/*.json` files | Be imported from a client component |
| **Runtime DB** | Store live Collections/Modes/Themes plus operational snapshots, mappings, sync runs, AI context, and PR drafts | Store provider secrets, be accessed from client components, or replace exported JSON artifacts for portability |
| **Auth/workspace context** | Resolve authenticated user, active organization/workspace, role, and permission guards | Trust client-provided workspace ids without membership checks, or expose privileged secrets to the browser |

## 3. Routes

| Path | File | Purpose |
|---|---|---|
| `/` | *src/app/page.tsx* | Token editor — table/grid, editor sheet, export, upload |
| `/login` | *src/app/login/page.tsx* | Supabase Auth sign in using email/password, Google, or GitHub |
| `/signup` | *src/app/signup/page.tsx* | Supabase Auth account creation using email/password, Google, or GitHub |
| `/auth/callback` | *src/app/auth/callback/route.ts* | OAuth/email confirmation callback and user workspace bootstrap |
| `/auth/reset-password` | *src/app/auth/reset-password/page.tsx* | Password reset request |
| `/dashboard` | *src/app/dashboard/page.tsx* | Workspace health — validation, theme issues, dirty state, Git summary |
| `/themes` | *src/app/themes/page.tsx* | Theme manager — CRUD, drag-to-reorder, conflicts |
| `/brands` | *src/app/brands/page.tsx* | Paused white-label brand placeholder |
| `/components` | *src/app/components/page.tsx* | Component registry |
| `/ai` | *src/app/ai/page.tsx* | AI Assistant Home, prompt shortcuts, context selection, review suggestions, activity |
| `/settings` | *src/app/settings/page.tsx* | Studio Settings, starting with AI provider/model/API key configuration |
| `/sync` | *src/app/sync/page.tsx* | Connector Hub for Figma, DTCG files, code, and future design tools |
| `/sync/figma` | *src/app/sync/figma/page.tsx* | Figma connector detail: plugin snapshots, Supabase runtime DB, file payloads, semantic diff, PR drafts |
| `/branches` | *src/app/branches/page.tsx* | Read-only Git status, semantic token diff, and registry diff |
| `/releases` | *src/app/releases/page.tsx* | Release notes draft and artifact previews |
| `/exports` | *src/app/exports/page.tsx* | Git-versioned export profiles |
| `/figma-sync` | *src/app/figma-sync/page.tsx* | Compatibility redirect to `/sync/figma` |

Authenticated product routes live inside a `(studio)` route group whose `layout.tsx` mounts the persistent `ProductShell` exactly once. Pages inside the group are content children only — they MUST NOT wrap themselves in `<ProductShell>`. URLs are unchanged because the group name is parenthesized.
Auth routes (`/login`, `/signup`, `/auth/*`), the paused `/brands` placeholder, and the `/figma-sync` compatibility redirect stay outside the `(studio)` group.
Next.js `proxy.ts` protects product routes when Supabase Auth is configured. Local development can opt into the default workspace fallback with `ROZETTA_AUTH_MODE=dev`; production MUST fail closed if Auth env is missing.

## 4. Shell

The `(studio)` layout owns the single `ProductShell`. It hydrates state once and persists across client-side navigation:

| Concern | Where it lives |
|---|---|
| `TokensProvider` hydration | `(studio)/layout.tsx` via `getStudioShellData()` (full Tokens + Themes + Design System registry) |
| `ThemesStore` + `DesignSystemStore` hydration | `(studio)/layout.tsx` via the same loader |
| `AppSidebar` + `SidebarProvider` | `ProductShell` rendered by `(studio)/layout.tsx` |
| Shared sheets (`TokenEditorSheet`, `ExportSheet`, `UploadSheet`, `AiPanel`) | Mounted in `ProductShell`, available to every route in the group |
| Toaster | Mounted in `ProductShell` |
| Editor home (`/`) inner layout | `(studio)/page.tsx` renders `TokenSetsPane` + `Workspace` as children |
| `/themes` inner layout | `(studio)/themes/page.tsx` renders `ThemesPage` as children |
| Other product routes | Each `(studio)/<route>/page.tsx` returns the route-specific content tree |

Two server loaders coordinate shell hydration:
- `getShellChrome()` — lightweight: `userProfile`, `workspaceContext`, `workspaceOptions`. Useful when a future surface needs sidebar chrome without a full registry hydrate.
- `getStudioShellData()` — full: tokens, themes, brands, components, plus chrome. Called from `(studio)/layout.tsx` so it runs once per session (the layout does not re-render during client-side navigation between sibling routes).

Heavy per-route data (Git status, baseline token sets, Figma preview, AI route data, GitHub PR drafts) MUST be fetched inside the relevant page and streamed via Suspense boundaries when it can block paint.

`/brands` keeps its own page-local `<ProductShell>` because Brands is paused.

## 5. Data flow

### Workspace context cache

`getWorkspaceContext()`, `getCurrentUser()`, and `listWorkspaceSwitcherOptions()` are wrapped in `React.cache(…)` so the layout and any concurrent page in the same render share a single Supabase `auth.getUser()` call and a single workspace-membership lookup. Mutations (Server Actions like `switchWorkspace`, logout, write paths) bypass the cache and resolve fresh state — the cache only deduplicates reads inside one render.

### Read path (boot)
1. The `(studio)` layout calls `getStudioShellData()`. The first thing it does is resolve `WorkspaceContext` (cached for the rest of the render) so downstream Tokens/Themes/Design System loaders reuse the same context.
2. Server code resolves `WorkspaceContext`. In Supabase mode, `getWorkspaceContext()` validates the session, bootstraps the profile/personal organization/workspace if needed, and selects the active workspace from a secure cookie.
3. `getWorkspaceFromDb()` ensures the active organization/workspace exists in Supabase. If no Collections/Themes exist yet for that workspace, it imports `tokens/<collection>/<mode>.tokens.json`, legacy `tokens/*.tokens.json`, legacy `tokens/*.edited.tokens.json`, and `.rozetta/themes.json`.
4. `parseTokenFile` validates each imported token file via Zod.
5. The shell receives DB `TokenCollection[]` (`TokenSet[]` legacy alias) plus artifact `originalRoots` and renders the client tree.
6. `TokensProvider` calls `useTokensStore.hydrate(initialSets, originalRoots)`.
7. `RegistryHydrator` hydrates themes from DB and artifacts, components from Git-versioned `.rozetta` files, and brands only as paused compatibility data.

### Write path (edit)
1. User triggers an action in the UI
2. Component calls a store action (e.g. `patchToken(collectionId, path, patch)`, with legacy `setId` names still present in the store API)
3. The store calls `setTokenAtPath` from the serializer
4. The store updates `sets` and calls a draft Server Action.
5. The Server Action resolves `WorkspaceContext`, enforces write role, validates input, and persists the new Collection/mode root in the DB; `originals` stays unchanged → the Collection becomes dirty relative to exported artifacts
6. UI rerenders; dirty indicators surface in `TokenSetsPane`, `NavUser`, etc.

### Save path
1. User clicks "Save all" in `NavUser`
2. `handleSaveAll` calls `saveWorkspaceArtifacts()` (Server Action → DB snapshot → `tokens/<collection>/<mode>.tokens.json` + `.rozetta/themes.json`)
3. On success: token/theme stores snapshot current state into `originals`
4. On failure: stores remain dirty and a toast surfaces the export error

### Discard path
1. User clicks "Discard all" in `NavUser` (or "Discard changes" in a set's row menu)
2. Client store reverts Tokens/Themes to their artifact baselines and persists the reverted draft state back into the DB
3. Git-native artifacts are not deleted by discard; they remain the last saved baseline

### Figma sync path
1. The local Figma plugin reads Collections, Modes, Variables, aliases, and code syntax.
2. `/sync/figma` creates a signed temporary workspace pairing code for the active `WorkspaceContext`.
3. The plugin pairs with a Rozetta workspace using a local URL and that workspace code.
4. The plugin POSTs a `FigmaFileSnapshot` to `/api/figma/snapshot` with `X-Rozetta-Workspace-Code`.
5. The Route Handler validates the code, resolves workspace scope, and stores snapshots/bindings/sync runs in Supabase/Postgres.
6. `/sync/figma` previews the semantic diff and applies a Rozetta draft to the DB only after user review.
7. The normal Save flow exports reviewed token/theme JSON artifacts from the DB.
8. The GitHub PR flow creates a branch/commit/PR only from reviewed Git artifacts, never from raw database rows.

### Figma writeback path
1. Rozetta creates a reviewed `rozetta-figma-writeback/v1` payload from DB-first workspace state.
2. The user confirms the payload in Rozetta and/or Rozetta Bridge.
3. The plugin applies Variables through the Figma Plugin API and reports created/updated/skipped/failed outcomes.
4. Destructive deletes are blocked in v1.

## 6. Persistence keys

| Key | Owner | Shape |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Auth | Browser-safe Auth config only |
| `DATABASE_URL` / Supabase Postgres | Runtime DB | Live Tokens/Themes workspace; Figma snapshots, bindings, sync runs, AI operational events, GitHub PR drafts |
| `FIGMA_BRIDGE_PAIRING_SECRET` | Figma Bridge | Optional server-side secret for signing temporary plugin pairing codes; falls back to other server-only secrets in local/dev |
| `tokens/<collection-id>/<mode-id>.tokens.json` | Save/PR artifact export | Canonical DTCG Collection/Mode roots generated from DB |
| `tokens/*.tokens.json` / `tokens/*.edited.tokens.json` | Legacy import | Backward-compatible single-mode Collection sources |
| `.rozetta/themes.json` | Save/PR artifact export | `Theme[]` generated from DB |
| `rozetta-themes-v1` | themes-store | Legacy migration source only |
| `.rozetta/export-profiles.json` | Exports route | `ExportProfile[]` |
| `.rozetta/brands.json` | Paused Brands compatibility | `Brand[]` |
| `.rozetta/components.json` | Components route | `DesignSystemComponent[]` |
| `.rozetta/ai-conversations.json` | AI Assistant | `AiConversation` |
| `.rozetta/ai-patches.json` | AI Assistant | `AiPatchProposal[]` |
| `.rozetta/ai-sessions.json` | AI Assistant | `AiCommandSession[]` |
| `.rozetta/ai-settings.local.json` | Studio Settings | `AiSettings` with local secrets; ignored by Git |
| `rozetta-studio:export-profiles:v1` | Exports route | Legacy migration source only |
| `rozetta-studio:token-table:column-widths:v3` | TokenTable | `Record<columnId, number>` |

(Exact key names live in the implementing files; if you rename one, update this table.)

## 7. Module boundaries

- `src/lib/dtcg/**` MUST NOT import from `src/lib/stores/**`, `src/lib/tokens/**`, `src/components/**`, or anywhere in `src/app/`.
- `src/lib/stores/**` MUST NOT import from `src/components/**` or `src/app/**`.
- `src/components/**` MAY import from any other layer.
- `src/lib/tokens/filesystem.ts` MUST be imported only by server actions, MCP tools, or DB workspace repositories.
- `src/lib/tokens/actions.ts` MUST be marked `'use server'`.
- `src/lib/git/status.ts` MUST remain server/MCP-only and MUST NOT be imported by client components.
- `src/lib/workspace/**` SHOULD remain pure and reusable by routes, future MCP handlers, and AI tooling.
- `src/lib/export-profiles/filesystem.ts` MUST remain server/MCP-only and MUST NOT be imported by client components.
- `src/lib/themes/filesystem.ts` and `src/lib/design-system/filesystem.ts` MUST remain server/MCP-only.
- `src/lib/ai-os/filesystem.ts` and `src/lib/ai-os/model.ts` MUST remain server/MCP-only.
- `src/lib/ai-os/registry.ts` SHOULD remain pure and reusable by UI, MCP, and tests.
- `src/lib/db/**` MUST NOT be imported from client components. UI accesses runtime state through Server Actions or Route Handlers.
- `src/lib/figma-bridge/actions.ts` and `src/lib/github/actions.ts` MUST remain server-only surfaces.
- `src/lib/figma-bridge/writeback/**` MUST remain server-only. The `figma-cli` adapter MUST be disabled in hosted runtime via the same runtime guard used by the local agent bridge.
- `src/lib/github/**` execution helpers (process wrapper, readiness, plan, run) MUST remain server-only. The bridge MUST be disabled in hosted runtime. Allowed binaries are exactly `git` and `gh`; allowed subcommand sets are enumerated in [`github-bridge.md`](./features/github-bridge.md#process-execution).
- `src/lib/auth/**` MUST remain server-first except for browser-safe Supabase client helpers. `WorkspaceContext` and role guards are the mandatory boundary for DB-backed product data.
- `src/lib/settings/**` MUST remain server-only. `actions.ts` is the `'use server'` action surface and `server.ts` holds sync helpers (`readStorageStatus`, `redactDatabaseUrl`, `readRuntimeInfo`, `isWorkspaceDbConfigured`).
- `src/mcp/**` MAY use Node APIs and the MCP SDK, but MUST NOT import from `src/components/**`, `src/app/**`, or Zustand stores.
