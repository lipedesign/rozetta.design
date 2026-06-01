# Constitution

Non-negotiable principles for Rozetta. Every PR, every refactor, every new feature MUST respect these.

If a principle blocks a feature, the principle wins. If the principle is wrong, change *the principle here* (with justification) before changing the code.

> **v2.** This is the greenfield v2 constitution. Each principle is stated as the clean target. One-time v1 compatibility lives in [§ Migration from v1](#migration-from-v1); a diff of intent is in [§ What changed from v1](#what-changed-from-v1).

---

## 1. Git-native, cloud-backed

Supabase/Postgres is the live workspace database; Git-native DTCG JSON is the portable artifact layer.

- Token/theme workspace state lives in Supabase/Postgres.
- Token and theme JSON files are Git-native artifacts exported from the DB on Save/PR.
- UI preferences MAY use `localStorage`; design-system data MUST NOT depend on it as the primary persistence layer.
- No telemetry or analytics. Auth and workspace scoping are first-class (not "planned"): privileged DB access is server-only, and every workspace read/write resolves a `WorkspaceContext` and guards on role.

## 2. Git artifacts are generated from the DB

The live workspace is DB-first. Git token artifacts are generated snapshots, not the operational source of truth after boot.

- The canonical token artifact layout is `tokens/<collection-id>/<mode-id>.tokens.json`.
- The "Save" and reviewed-PR pipelines MUST serialize the active DB workspace into Git artifacts.
- Previewing a diff or export MUST NOT mutate DB state.
- Seeding a new/empty workspace from committed `tokens/*.tokens.json` artifacts runs **only in local/self-hosted runtime** (the §7 runtime guard). Hosted signups start empty.

## 3. DTCG on disk, with explicit semantic intent

The on-disk and in-memory representation MUST be the [W3C DTCG format](https://www.designtokens.org/tr/drafts/format/) shape.

- A node is either a token (has `$value`) or a group (object without `$value`). Never both.
- `$type`, `$value`, `$description`, `$extensions` are reserved property names.
- `$extensions` MUST be preserved across all edits (round-tripping is non-negotiable).
- Aliases are written as `{group.token.path}` strings.
- Composite types (typography, shadow, gradient, border, transition) MUST be modelled in the DTCG types even if the editor UI doesn't surface every field yet.
- **Semantic intent is a first-class DTCG concern.** A token carries an explicit tier (`primitive` | `semantic` | `component`) and MAY carry structured description (intent / usage / don'ts) and typed relationships (alias plus `backs` / `variant-of` / `pairs-with` / `replaces`), stored under the reserved semantic extension. Agents and validators depend on this; without it they degrade to "file access, not understanding." (domain invariant I11)

## 4. Type safety end-to-end

- TypeScript strict mode. No `any` in checked-in code without an explanation comment.
- Zod validates every external input (uploaded JSON, file reads, Figma/MCP/AI payloads).
- Type guards (`isDtcgToken`, `isDtcgGroup`) gate every traversal of the DTCG tree.

## 5. State has one source of truth

- Tokens and themes live operationally in Supabase/Postgres and are mirrored in their Zustand stores for UI reactivity. There is no second client persistence layer.
- Server data flows in through a single hydration path; nothing else mutates the initial server state.
- Components read from the store via selectors. They MUST NOT keep duplicate copies in `useState` (or re-derive shared state inline) except for transient editor draft fields.

## 6. Edits go through the serializer

Every mutation of a token tree MUST go through `setTokenAtPath`, `insertTokenAtPath`, or `deleteTokenAtPath` from the DTCG serializer.

- Direct mutation of a Collection root or mode root is forbidden — it bypasses `$extensions` preservation and structural integrity checks.
- The store's CRUD actions are the only public surface for mutating tokens.

## 7. Server boundary: actions, results, server-derived context, runtime gating

Filesystem and DB I/O exposed to the app MUST happen in `'use server'` action files backed by server/MCP-only helpers.

- Client components MUST NOT import filesystem, DB, or bridge modules.
- Server actions return discriminated results (`{ ok: true, … }` or `{ ok: false, error }`); they MUST NOT throw across the boundary.
- **`WorkspaceContext` is always server-derived** for browser-facing actions (resolved from the authenticated session), never accepted as a client parameter. Mutations call `requireWorkspaceRole` (or an equivalent guard). The only context that may arrive over the wire is a signed pairing token on the internal plugin route.
- Process-spawning / local-only bridges (`git`, `gh`, Figma CLI, the local agent) use allowlisted `execFile` (no `shell: true`) and are **disabled in hosted/Vercel/Edge runtime** via a single shared runtime guard.

## 8. Reactive selection

`activeCollectionId`, `activeGroupPath`, `selectedToken`, and `multiSelection` are derived state for UI focus. After any mutation that could invalidate a selection (delete, move, discard, mode switch), the store MUST reconcile selections to a valid state — never leave stale references.

## 9. Floating sheets

Every right-side sheet (editor, export, upload, AI panels, future surfaces) follows the floating pattern documented in [`ui-patterns.md`](./ui-patterns.md#floating-sheets). No full-bleed slide-ins. Destructive confirmations use a Base UI dialog, never `window.confirm()`.

## 10. Specs lead, code follows

When code disagrees with a spec, EITHER fix the code OR update the spec deliberately. Drift is a bug.

A new feature MUST start with a spec file in `specs/features/` (status: `planned`) before implementation. Status flips to `partial` while in flight, then `implemented` when complete.

---

## Migration from v1

These are one-time concerns for importing a v1 workspace; they are NOT part of the steady-state rules above. v2 boots from an empty DB by default.

- Legacy single-mode artifacts `tokens/*.tokens.json` and `tokens/*.edited.tokens.json` are import-compatible sources, read once into the DB when a workspace has no Collections.
- Legacy migration sources `rozetta-themes-v1` (themes) and `rozetta-studio:export-profiles:v1` (export profiles) are read once, then dropped.
- v1 store naming (`activeSetId`, `setId` params, `TokenSet` as an alias of `TokenCollection`) is replaced by Collection/Mode terminology; no legacy aliases in v2 code.
- White-label Brands remains paused; its `.rozetta/brands.json` is kept readable for compatibility only.

## What changed from v1

- **Auth/workspace scoping is first-class**, not "planned" — context is always server-derived; mutations are role-guarded (§1, §7).
- **Semantic intent is a constitutional DTCG concern** (§3), not a later AI feature.
- **Runtime gating and allowlisted spawn are explicit** in the server-boundary principle (§7).
- **Hosted vs local seed** behavior is stated (§2): hosted workspaces start empty.
- **Legacy aliases and migration paths moved out** of the steady-state rules into [§ Migration from v1].
- Selection key renamed `activeSetId` → `activeCollectionId` (§8); destructive confirmations standardized on Base UI dialogs (§9).
