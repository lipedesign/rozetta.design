# Constitution

Non-negotiable principles for Rozetta. Every PR, every refactor, every new feature MUST respect these.

If a principle blocks a feature, the principle wins. If the principle is wrong, change *the principle here* (with justification) before changing the code.

---

## 1. Git-native, cloud-backed

The app uses Supabase/Postgres as the live workspace database and Git-native JSON as the portable artifact layer.

- Token/theme workspace state lives in Supabase/Postgres.
- Token and theme JSON files are Git-native artifacts exported from the DB on Save/PR.
- UI preferences may use `localStorage`; design-system data MUST NOT depend on it as the primary persistence layer.
- No telemetry or analytics. Auth/RLS are planned, but v1 keeps privileged DB access server-only.

## 2. Git artifacts are generated from the DB

The live workspace is DB-first. Git token artifacts are generated snapshots, not the operational source of truth after boot.

- The canonical token artifact layout is `tokens/<collection-id>/<mode-id>.tokens.json`.
- Legacy `tokens/*.tokens.json` and `tokens/*.edited.tokens.json` files are import-compatible migration sources.
- The "Save" and reviewed PR pipelines MUST serialize the active DB workspace into Git artifacts.
- Loading imports artifacts into the DB only when the workspace has no Collections yet, preferring edited legacy copies when present.
- The app MAY overwrite generated artifacts for the active workspace on Save/PR, but MUST NOT mutate DB state while merely previewing a diff or export.

## 3. DTCG is the on-disk format

The on-disk and in-memory representation MUST be the [W3C DTCG format](https://www.designtokens.org/tr/drafts/format/) shape.

- A node is either a token (has `$value`) or a group (object without `$value`). Never both.
- `$type`, `$value`, `$description`, `$extensions` are reserved property names.
- `$extensions` MUST be preserved across all edits (round-tripping is non-negotiable).
- Aliases are written as `{group.token.path}` strings.
- Composite types (typography, shadow, gradient, border, transition) MUST be modelled in `src/lib/dtcg/types.ts` even if the editor UI doesn't surface every field yet.

## 4. Type safety end-to-end

- TypeScript strict mode. No `any` in checked-in code without an explanation comment.
- Zod (`src/lib/dtcg/schema.ts`) validates every external input (uploaded JSON, file reads).
- Type guards (`isDtcgToken`, `isDtcgGroup`) gate every traversal of the DTCG tree.

## 5. State has one source of truth

- Tokens and themes live operationally in Supabase/Postgres and are mirrored in `useTokensStore`/`useThemesStore` for UI reactivity. There is no second client persistence layer.
- Server data flows in via `tokens-provider.tsx#hydrate`; nothing else mutates the initial server state.
- Components read from the store via selectors. They MUST NOT keep duplicate copies in `useState` except for transient editor draft fields.

## 6. Edits go through the serializer

Every mutation of a token tree MUST go through `setTokenAtPath`, `insertTokenAtPath`, or `deleteTokenAtPath` from *src/lib/dtcg/serializer.ts*.

- Direct mutation of `collection.root` / mode roots is forbidden — it bypasses `$extensions` preservation and structural integrity checks.
- The store's CRUD actions are the only public surface for mutating tokens.

## 7. Server Actions for I/O

Filesystem reads and writes exposed to the app MUST happen in `'use server'` action files backed by server/MCP-only helpers.

- Client components MUST NOT import from `filesystem.ts`.
- Server actions return discriminated results (`{ ok: true, … }` or `{ ok: false, error }`); they MUST NOT throw across the boundary.
- Token/theme live persistence goes through *src/lib/db/repositories/workspace.ts* behind Server Actions. Artifact export still uses *src/lib/tokens/filesystem.ts* and *src/lib/themes/filesystem.ts*.
- Export profile persistence lives in *src/lib/export-profiles/actions.ts* and *src/lib/export-profiles/filesystem.ts*.

## 8. Reactive selection

`activeSetId` (legacy store key for active Collection), `activeGroupPath`, `selectedToken`, and `multiSelection` are derived state for UI focus. After any mutation that could invalidate a selection (delete, move, discard, mode switch), the store MUST reconcile selections to a valid state — never leave stale references.

## 9. Floating sheets

Every right-side sheet (editor, export, upload, future panels) follows the floating pattern documented in [`ui-patterns.md`](./ui-patterns.md#floating-sheets). No full-bleed slide-ins.

## 10. Specs lead, code follows

When code disagrees with a spec, EITHER fix the code OR update the spec deliberately. Drift is a bug.

A new feature MUST start with a spec file in `specs/features/` (status: `planned`) before implementation. Status flips to `partial` while in flight, then `implemented` when complete.
