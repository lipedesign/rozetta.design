# Architecture

System shape, layering, and data flow. For domain types see [`domain.md`](./domain.md). For API surface see [`contracts.md`](./contracts.md).

> **v2.** This describes the clean v2 target architecture. Naming is v2-canonical (Collections / Modes / Themes). Surfaces that are not yet built or are paused are sectioned off explicitly. One-time v1 import concerns live in [`constitution.md` § Migration from v1](./constitution.md#migration-from-v1).

---

## 1. Layers

```
┌──────────────────────────────────────────────────────────────┐
│  UI components (src/components/**)                            │
│  - read state via Zustand selectors                          │
│  - dispatch via store actions or Server Actions              │
└─────────────┬────────────────────────────┬───────────────────┘
              │                            │
              │  store actions             │  Server Actions
              ▼                            ▼
┌────────────────────────────┐  ┌──────────────────────────────┐
│  State (src/lib/stores)    │  │  Server boundary             │
│  - tokens store            │  │  'use server' action files   │
│  - themes store            │  │  + Route Handlers            │
│  - design-system store     │  │  → DB repositories           │
│  - UI reactivity           │  │  → filesystem helpers        │
└─────────────┬──────────────┘  └─────────────┬────────────────┘
              │                               │
              │  invariant-preserving         │  server/MCP-only fs + db
              ▼                               ▼
┌────────────────────────────┐  ┌──────────────────────────────┐
│  Domain (src/lib/dtcg)     │  │  Filesystem / DB             │
│  - types, parser,          │  │  - tokens/themes artifacts   │
│    serializer, resolver,   │  │  - Supabase/Postgres runtime │
│    format, schema,         │  │                              │
│    semantic intent         │  │                              │
└────────────────────────────┘  └─────────────┬────────────────┘
                                              │
                                              ▼
                                       Supabase/Postgres runtime DB
                                       /tokens + /.rozetta artifacts
```

Product modules live alongside the domain layer:

- `src/lib/dtcg/**` is pure TypeScript: DTCG types, parser/traversal, serializer (the only mutation surface), resolver, format, schema, and the **semantic intent** model (tier, structured description, relationships).
- `src/lib/workspace/**` is pure TypeScript for validation, semantic diff, releases, and profile types.
- `src/lib/db/**` owns the Supabase/Postgres runtime database via Drizzle. Collections, Modes, and Themes are DB-first; Figma snapshots, mappings, sync runs, AI context, and PR drafts also live here as operational memory. DB credentials live only in `.env.local`.
- `src/lib/auth/**` owns Supabase SSR Auth, profile/workspace bootstrap, workspace switching, and server-side role guards. Product actions MUST resolve `WorkspaceContext` server-side before DB access (never from a client argument).
- `src/lib/tokens/**`, `src/lib/themes/**`, `src/lib/export-profiles/**`, `src/lib/design-system/**` are the server boundaries for their DB drafts and Git-versioned artifacts.
- `src/lib/git/**` is server/MCP-only and reads Git state for product routes; mutation/exec helpers use allowlisted spawn and are hosted-disabled.
- `src/lib/github/**` owns explicit GitHub PR draft/publish actions for reviewed artifacts. Server-only, hosted-disabled, binaries allowlisted to exactly `git` and `gh`.
- `src/lib/figma-bridge/**` owns Server Actions for receiving Figma snapshots, previewing sync, preparing plugin writeback, and loading bridge state. Browser-facing actions derive `WorkspaceContext` server-side; only the internal plugin route accepts a signed pairing token.
- `src/lib/ai-os/**` owns AI settings, the proposal/review queue, summarized sessions, provider adapters (via the Vercel AI SDK), patch preview/apply, and connector discovery. `src/lib/ai-os/contract/**` owns the AI Data Contract (Zod operation/proposal schemas, context graph, prompt serializer, read-only retrieval tools). `src/lib/ai-os/local-agent/**` owns the server-only local agent bridge. All `ai-os` server modules are server/MCP-only and never imported by clients.
- `src/lib/settings/**` owns the `/settings` hub Server Actions and pure server helpers.
- `src/mcp/**` is a Node CLI boundary for MCP stdio and MUST NOT import React/Zustand.

**Planned / paused** (not part of the steady-state surface; sectioned so the rebuild does not treat them as existing):

- `src/lib/figma-bridge/writeback/**` (planned, [`figma-writeback.md`](./features/figma-writeback.md)) — writeback adapter contract; server-only, hosted-disabled.
- `src/lib/github/**` staged publish pipeline (planned, [`github-bridge.md`](./features/github-bridge.md)) — readiness, per-step preview.
- `figma-plugin/**` — the **Rozetta Bridge** Figma plugin ([`figma-plugin-bridge.md`](./features/figma-plugin-bridge.md)); its own mini UI system, does not import the web app.
- White-label Brands (`/brands`, `.rozetta/brands.json`) — paused; kept readable for compatibility only.

## 2. Layer responsibilities

| Layer | Responsibility | MUST NOT |
|---|---|---|
| **UI** | Render state, dispatch actions, manage transient draft state | Touch the filesystem/DB, mutate domain types directly |
| **State** | Hold reactive client mirrors, mediate CRUD, persist drafts through Server Actions | Read from disk, perform direct filesystem or DB I/O |
| **Domain** | Pure functions over DTCG trees: traversal, mutation, alias resolution, formatting, semantic intent | Depend on React, Zustand, Next.js |
| **Server boundary** | Server Actions and Route Handlers; resolve `WorkspaceContext`, guard role, convert FS/DB errors into `Result` types | Throw across the boundary; accept context from the client; expose `node:fs` types |
| **Filesystem** | Read/write `tokens/<collection>/<mode>.tokens.json` and Git-versioned `.rozetta/*.json` files | Be imported from a client component |
| **Runtime DB** | Store live Collections/Modes/Themes plus operational snapshots, mappings, sync runs, AI context, PR drafts | Store provider secrets, be accessed from client components, or replace exported JSON artifacts for portability |
| **Auth/workspace context** | Resolve authenticated user, active organization/workspace, role, and permission guards | Trust client-provided workspace ids/roles, or expose privileged secrets to the browser |

## 3. Routes

The route surface is preserved from v1 (the rebuild reproduces the same navigation and visual).

| Path | Purpose |
|---|---|
| `/` | Token editor — table/grid, editor sheet, export, upload |
| `/login` · `/signup` | Supabase Auth (email/password, Google, GitHub) |
| `/auth/callback` · `/auth/reset-password` | OAuth/email callback + workspace bootstrap; password reset |
| `/dashboard` | Workspace health — validation, theme issues, dirty state, Git summary |
| `/themes` | Theme manager — CRUD, drag-to-reorder, conflicts |
| `/components` | Component registry |
| `/ai` | AI Assistant home, prompt shortcuts, context selection, review queue, activity |
| `/settings` | Studio settings (AI provider/model/key config, runtime info) |
| `/sync` · `/sync/figma` | Connector hub; Figma connector detail (snapshots, runtime DB, payloads, semantic diff, PR drafts) |
| `/branches` | Git status, semantic token diff, registry diff |
| `/releases` | Release notes draft and artifact previews |
| `/exports` | Git-versioned export profiles |
| `/brands` | **Paused** white-label placeholder |
| `/figma-sync` | Compatibility redirect to `/sync/figma` |

Authenticated product routes live inside a `(studio)` route group whose `layout.tsx` mounts the persistent `ProductShell` exactly once. Pages inside the group are content children only — they MUST NOT wrap themselves in `<ProductShell>`. URLs are unchanged because the group name is parenthesized. Auth routes, the paused `/brands` placeholder, and the `/figma-sync` redirect stay outside the group. `proxy.ts` protects product routes when Auth is configured; production MUST fail closed if Auth env is missing (local dev MAY opt into a default-workspace fallback with `ROZETTA_AUTH_MODE=dev`).

## 4. Shell

The `(studio)` layout owns the single `ProductShell`. It hydrates state once and persists across client-side navigation:

| Concern | Where it lives |
|---|---|
| Tokens / Themes / Design System hydration | `(studio)/layout.tsx` via `getStudioShellData()` |
| `AppSidebar` + `SidebarProvider` | `ProductShell` |
| Shared sheets (editor, export, upload, AI panel) | Mounted in `ProductShell`, available to every route |
| Toaster | `ProductShell` |
| Per-route content | Each `(studio)/<route>/page.tsx` returns the route-specific tree |

Two server loaders coordinate shell hydration:
- `getShellChrome()` — lightweight: `userProfile`, `workspaceContext`, `workspaceOptions`.
- `getStudioShellData()` — full: tokens, themes, components, plus chrome. Called once per session from the layout.

Heavy per-route data (Git status, baseline Collections, Figma preview, AI route data, GitHub PR drafts) MUST be fetched inside the relevant page and streamed via Suspense boundaries when it can block paint.

## 5. Data flow

### Workspace context cache
`getWorkspaceContext()`, `getCurrentUser()`, and `listWorkspaceSwitcherOptions()` are wrapped in `React.cache(…)` so the layout and any concurrent page in one render share a single `auth.getUser()` call and membership lookup. Mutations bypass the cache and resolve fresh state.

### Read path (boot)
1. The `(studio)` layout calls `getStudioShellData()`, which first resolves `WorkspaceContext` (cached for the render).
2. In Supabase mode, `getWorkspaceContext()` validates the session, bootstraps the profile/personal organization/workspace if needed, and selects the active workspace from a secure cookie.
3. The workspace loader ensures the active organization/workspace exists. If it has no Collections/Themes **and** the runtime is local/self-hosted, it seeds from committed artifacts (see constitution §2); hosted workspaces start empty.
4. `parseTokenFile` validates each imported token file via Zod.
5. The shell receives DB `TokenCollection[]` plus artifact baselines and renders the client tree; the stores hydrate once.

### Write path (edit)
1. User triggers an action in the UI.
2. Component calls a store action (e.g. `patchToken(collectionId, path, patch)`).
3. The store calls `setTokenAtPath` from the serializer and updates its `collections` state.
4. The store calls a draft Server Action; the action resolves `WorkspaceContext`, enforces write role, validates input, and persists the new Collection/mode root in the DB. Baselines stay unchanged → the Collection becomes dirty relative to exported artifacts.
5. UI re-renders; dirty indicators surface via a store selector (single source of truth — no per-component re-derivation).

### Save / Discard
- **Save:** a Server Action snapshots the active DB workspace into `tokens/<collection>/<mode>.tokens.json` + `.rozetta/themes.json`; on success the stores snapshot current state into their baselines.
- **Discard:** the store reverts to artifact baselines and persists the reverted draft into the DB; Git artifacts are untouched.

### Figma sync
1. The plugin reads Collections, Modes, Variables, aliases, code syntax.
2. `/sync/figma` creates a signed temporary pairing code for the active `WorkspaceContext`.
3. The plugin POSTs a `FigmaFileSnapshot` to `/api/figma/snapshot` with `X-Rozetta-Workspace-Code`.
4. The Route Handler validates the **pairing token** (the only client-supplied context), resolves workspace scope, and stores snapshots/bindings/sync runs.
5. `/sync/figma` previews the semantic diff and applies a Rozetta draft to the DB only after user review (serializer-only transform).
6. Save exports reviewed artifacts; the GitHub PR flow branches/commits/PRs only from reviewed Git artifacts, never raw DB rows.

### Figma writeback (planned)
Rozetta creates a reviewed writeback payload from DB-first state; the user confirms; the plugin applies Variables and reports outcomes. Destructive deletes are blocked.

## 6. Persistence keys

| Key | Owner | Shape |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Auth | Browser-safe Auth config only |
| `DATABASE_URL` / Supabase Postgres | Runtime DB | Live Collections/Modes/Themes; Figma snapshots, bindings, sync runs, AI events, GitHub PR drafts |
| `FIGMA_BRIDGE_PAIRING_SECRET` | Figma Bridge | Optional server-side secret for signing pairing codes |
| `tokens/<collection-id>/<mode-id>.tokens.json` | Save/PR export | Canonical DTCG Collection/Mode roots generated from DB |
| `.rozetta/themes.json` | Save/PR export | `Theme[]` generated from DB |
| `.rozetta/export-profiles.json` | Exports route | `ExportProfile[]` |
| `.rozetta/components.json` | Components route | `DesignSystemComponent[]` |
| `.rozetta/ai-conversations.json` · `ai-patches.json` · `ai-sessions.json` | AI Assistant | Persisted chat / reviewable proposals / summarized sessions |
| `.rozetta/ai-settings.local.json` | Studio Settings | `AiSettings` with local secrets; ignored by Git |
| `rozetta-studio:token-table:column-widths:v3` | Token table | `Record<columnId, number>` |

Migration-only keys (`tokens/*.tokens.json`, `tokens/*.edited.tokens.json`, `rozetta-themes-v1`, `rozetta-studio:export-profiles:v1`, `.rozetta/brands.json`) are read once on import — see [`constitution.md` § Migration from v1](./constitution.md#migration-from-v1). Exact key names live in the implementing files; renaming one updates this table.

## 7. Module boundaries

- `src/lib/dtcg/**` MUST NOT import from `src/lib/stores/**`, `src/lib/tokens/**`, `src/components/**`, or `src/app/**`.
- `src/lib/stores/**` MUST NOT import from `src/components/**` or `src/app/**`.
- `src/components/**` MAY import from any other layer.
- Filesystem modules (`*/filesystem.ts` under `tokens`, `themes`, `export-profiles`, `design-system`, `ai-os`) MUST be imported only by Server Actions, MCP tools, or DB repositories — never by client components.
- `'use server'` action files are the only client-reachable I/O surface; they derive `WorkspaceContext` server-side and never accept it as an argument.
- `src/lib/db/**` MUST NOT be imported from client components.
- `src/lib/git/**`, `src/lib/github/**` exec helpers, `src/lib/figma-bridge/writeback/**`, and `src/lib/ai-os/local-agent/**` MUST remain server-only, use allowlisted `execFile` (no `shell: true`), and be disabled in hosted/Vercel/Edge runtime via the one shared runtime guard.
- `src/lib/auth/**` MUST remain server-first except for browser-safe Supabase client helpers. `WorkspaceContext` + role guards are the mandatory boundary for DB-backed product data.
- `src/lib/workspace/**` and `src/lib/ai-os/registry.ts` SHOULD remain pure and reusable by routes, MCP handlers, and tests.
- `src/mcp/**` MAY use Node APIs and the MCP SDK, but MUST NOT import from `src/components/**`, `src/app/**`, or Zustand stores.

---

## What changed from v1

- **v2-canonical naming** throughout — Collections/Modes/Themes, `collectionId`, no `set`/`activeSetId`/`TokenSet` aliases.
- **Server-derived `WorkspaceContext`** is stated in the layer matrix and boundaries (§2, §5, §7); the Figma pairing token is the only client-supplied context.
- **Runtime gating + allowlisted spawn** consolidated under one shared guard across git/github/figma-cli/local-agent (§1, §7).
- **Local-only seed** documented in the read path (§5); hosted workspaces start empty.
- **Semantic intent** added to the domain layer (§1).
- **Planned/paused surfaces** (writeback, staged publish, Figma plugin, Brands) are sectioned out of the steady-state description.
- Legacy import paths and migration keys moved to a single note pointing at `constitution.md § Migration from v1`.
