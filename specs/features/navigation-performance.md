# Feature: Navigation Performance

## Status
implemented

## Purpose
Make navigation between authenticated Rozetta routes feel instantaneous by hoisting the `ProductShell` chrome (sidebar, providers, sheets) into a persistent layout, splitting shell chrome data from per-route data, deduplicating `WorkspaceContext` resolution per render, and deferring heavy operational data behind Suspense boundaries or user intent.

## Motivation
Today every product route renders its own `<ProductShell>`, calls `getProductShellData()`, and re-fetches Tokens, Themes, Brands, Components, the AuthUserProfile, the active WorkspaceContext, and the workspace switcher list. Several routes also run heavy Git/Figma/PR work synchronously at boot:
- `/sync/figma` executes `previewFigmaToRozetta` on every render.
- `/ai` waits on `getGitStatusSummary`, `loadGitBaselineTokenSets`, `getAiSettings`, `getAiPatchQueue`, `getAiSessions`, `getAiConversation`, `getFigmaSyncState`, and `getGitHubPrDrafts` before returning.
- `/branches` and `/releases` block on `getGitStatusSummary`, `loadGitBaselineTokenSets`, and `loadGitBaselineDesignSystemRegistry`.

Combined with React tree remounts because the shell lives inside each page, this produces a full reload feel on every navigation.

## User stories
- As a logged-in user, I can move between Studio routes (`/`, `/ai`, `/dashboard`, `/themes`, `/components`, `/branches`, `/releases`, `/exports`, `/settings`, `/sync`, `/sync/figma`) without the sidebar, providers, or sheets remounting.
- As a developer, I can opt into `ROZETTA_PERF_DEBUG=1` and see how long each named server stage takes (shell, workspaceContext, tokens, themes, aiRouteData, figmaPreview, gitDiff) without exposing those timings in production.
- As a Figma sync user, I can open `/sync/figma` without waiting for `previewFigmaToRozetta` until I explicitly click "Review latest snapshot".

## Behavior

### Persistent (studio) route group
1. A new `(studio)` route group MUST host every authenticated product route without changing URLs: `/`, `/ai`, `/dashboard`, `/themes`, `/components`, `/branches`, `/releases`, `/exports`, `/settings`, `/sync`, `/sync/figma`.
2. The `(studio)/layout.tsx` MUST render the persistent `ProductShell` exactly once. Pages inside the group MUST be authored as content children and MUST NOT wrap themselves in `<ProductShell>`.
3. Auth routes (`/login`, `/signup`, `/auth/*`) and the paused `/brands` placeholder MUST remain outside the `(studio)` group. `/brands` continues to mount its own `ProductShell` because Brands is paused, not migrated.
4. The compatibility redirect at `/figma-sync` stays out of the group.

### Shell data split
5. The lightweight shell chrome loader MUST return only `userProfile`, `workspaceContext`, and `workspaceOptions` for routes whose pages do not need the full Tokens/Themes registry payload.
6. The full studio shell loader MUST continue to return Tokens, Themes, and Design System registry data hydrated into the `(studio)` layout once per session.
7. `TokensProvider` MUST remain functional. Pages that do not edit tokens MUST NOT cause the layout to re-serialize Tokens/originalRoots into their response payloads. (The studio layout hydrates the store once; client-side navigation between sibling routes MUST NOT re-serialize hydration props.)
8. Export, Import (Upload), and Ask AI sheets MUST remain openable from the persistent sidebar regardless of whether the active route is a tokens-editing route.

### WorkspaceContext deduplication
9. `getWorkspaceContext()`, `getCurrentUser()`, and `listWorkspaceSwitcherOptions()` reads MUST be deduplicated per render (request-scoped via `React.cache`).
10. Mutations (e.g. `switchWorkspace`, logout, write Server Actions) MUST continue to resolve a fresh context — the cache only covers read paths inside the same render.
11. No render-path MUST call Supabase `auth.getUser()` more than once for the same render.

### Per-route lazy data
12. `/ai` MUST render the chat/conversation surface first. Git baseline data, Figma sync state, GitHub PR drafts, AI patch queue, and AI sessions MUST be deferred via Suspense boundaries or fetched only when the user opens the corresponding panel.
13. `/sync/figma` MUST NOT execute `previewFigmaToRozetta` on initial render. The preview MUST run only when the user clicks the explicit "Review latest snapshot" action.
14. `/branches` and `/releases` MUST stream Git status, baseline token sets, and baseline registry inside Suspense boundaries with skeleton fallbacks so the shell never blocks on them.
15. `/dashboard` MUST separate fast workspace health summaries from any heavy Git or validation work — heavy work goes through a Suspense boundary.
16. `force-dynamic` MUST be removed from pages where dynamic behavior is already covered by the persistent layout or by the data fetch's own dynamic markers.

### Performance instrumentation
17. `src/lib/perf/measure.ts` MUST expose a server-only `measureAsync(name, fn)` helper, gated by `ROZETTA_PERF_DEBUG=1`. When the env var is absent or falsy, the helper MUST be a zero-overhead pass-through that simply returns the wrapped promise.
18. Instrumented stages MUST include at minimum: `shell`, `workspaceContext`, `tokens`, `themes`, `aiRouteData`, `figmaPreview`, `gitDiff`.

## Acceptance criteria
- `ProductShell` is not mounted from any page component in the `(studio)` group. It lives in the group layout.
- `getProductShellData()` is renamed/refactored so the heavy Tokens/Themes/Brands/Components branch is invoked only by the studio layout (or routes that explicitly need it). Routes that only need chrome data call the lightweight loader.
- `WorkspaceContext` is resolved at most once per render across server components, layouts, and pages.
- Client-side navigation between sibling routes in `(studio)` does not re-mount the sidebar, providers, or sheets.
- `/sync/figma` only computes the Figma preview after explicit user review.
- Permissions, Auth, Supabase, Figma Bridge contracts, and data semantics are unchanged.

## Out of scope
- Visual redesign of routes.
- Changing Auth, Supabase, or Figma Bridge contracts.
- Reactivating the paused `/brands` route or removing it.
- Touching the `.docs/*` working-tree edits, which are preserved separately.

## Open questions
- None. Implementation may proceed incrementally page-by-page; status flips to `partial` while migrations are in flight and to `implemented` when every route in the list above lives under `(studio)`.

## Phase 2 — Bundle, invalidation, and parallel I/O

### Behavior
19. The shared sheets mounted by `ProductShell` (`TokenEditorSheet`, `ExportSheet`, `UploadSheet`, `AiPanel`) MUST be loaded via `next/dynamic({ ssr: false })`. They are user-driven overlays with no SSR requirement; deferring them shrinks the initial JS payload on every authenticated route.
20. `/ai/page.tsx` MUST issue every data fetch (chat-critical and operational) in a single `Promise.all` so the Suspense boundary waits only for the slowest fetch instead of the sum of two sequential rounds.
21. Server Actions that mutate workspace state MUST NOT scatter `revalidatePath` calls across unrelated routes. Token, theme, and design-system mutations all affect the persistent `(studio)` layout — they MUST be expressed as a single `revalidatePath("/", "layout")` instead of per-route lists. Targeted mutations whose data lives only on one page (AI patch queue → `/ai`, Figma snapshot → `/sync/figma`, GitHub PR draft → `/sync/figma` + `/branches`) MUST stay narrow.

### Acceptance criteria
- The route-level bundle for routes that never open a sheet (e.g. `/dashboard`, `/branches`, `/releases`, `/settings`, `/exports`, `/sync`) does not statically include `AiPanel`, `TokenEditorSheet`, `ExportSheet`, or `UploadSheet`.
- `/ai` paint waits on `max(slowestFetch)`, not `sumOf(fetches)`.
- No Server Action calls `revalidatePath` for more than 2 distinct route strings, and layout-affecting mutations use the `"layout"` scope instead of enumerated paths.

### Future work (not in Phase 2)
- Refactor `AiAssistantHome` so chat surface and operational sections can hydrate independently via `use()` + inner `<Suspense>`. Today they share a single component with deeply-coupled state.
- Enable browser View Transitions for `(studio)` navigation. The clean integration requires React's `ViewTransition` API (post-19.2.4) or a custom `document.startViewTransition` interceptor; both add complexity beyond this round's scope.
- Per-collection lazy token loading. The persistent layout currently hydrates every Collection on first paint (~250 KB tokens JSON). A future change can split per-Collection so unused collections are loaded on demand.
