# Agent guide — Rozetta

This repository follows **Specification-Driven Development (SDD)**. The specs in [`/specs`](./specs/) are the source of truth; code implements them.

## Reading order

When you start a task, read these in order:

1. [`specs/constitution.md`](./specs/constitution.md) — non-negotiable principles. Never violate.
2. [`specs/architecture.md`](./specs/architecture.md) — system shape and layering rules.
3. [`specs/domain.md`](./specs/domain.md) — DTCG model and invariants.
4. [`specs/contracts.md`](./specs/contracts.md) — public API surface.
5. The relevant file in [`specs/features/`](./specs/features/) for the feature you're touching.
6. [`specs/ui-patterns.md`](./specs/ui-patterns.md) — for any UI work.

## Before writing code

- Identify which feature spec covers your task. If none does, **write the spec first** (status: `planned`).
- Find the public contract you're about to touch in `contracts.md`. Treat the signature as load-bearing — change it deliberately and update the spec in the same PR.
- Locate the invariant that protects the operation you're modifying. Confirm your change preserves it (or update the invariant — and `constitution.md` if needed).

## While writing code

- Use the type guards (`isDtcgToken`, `isDtcgGroup`) on every traversal.
- Mutate token trees only via the serializer (`setTokenAtPath`, `insertTokenAtPath`, `deleteTokenAtPath`). Direct `set.root[...] = ...` is forbidden.
- Filesystem code lives in *src/lib/tokens/filesystem.ts*, *src/lib/themes/filesystem.ts*, *src/lib/export-profiles/filesystem.ts*, *src/lib/design-system/filesystem.ts*, and *src/lib/ai-os/filesystem.ts*. These modules are server/MCP-only. Client components MUST NOT import from them.
- Bridge execution code lives in *src/lib/figma-bridge/writeback/*** (planned, see [`specs/features/figma-writeback.md`](./specs/features/figma-writeback.md)) and *src/lib/github/*** (staged publish, planned, see [`specs/features/github-bridge.md`](./specs/features/github-bridge.md)). Both MUST stay server-only, use allowlisted spawn (no `shell: true`), and be disabled in hosted/Vercel runtime via the same guard as the local agent bridge.
- AI provider calls live in *src/lib/ai-os/model.ts* and MUST use Vercel AI SDK adapters rather than direct provider SDKs.
- Runtime database code lives in *src/lib/db/***. It MAY use Node APIs and Drizzle, and MUST stay behind server/MCP boundaries. Supabase/Postgres is the live workspace DB for Collections/Modes/Themes; Git JSON files are artifacts exported on Save/PR.
- Auth and workspace scoping live in *src/lib/auth/***. Product Server Actions and repositories MUST resolve or receive `WorkspaceContext` before touching workspace data. Mutations MUST call `requireWorkspaceRole` or an equivalent guard.
- Supabase Auth uses SSR cookies via `@supabase/ssr`. Browser code MAY use the public URL and publishable key only; DB passwords, service role keys, AI provider keys, and `.rozetta/*.local.json` MUST stay server/local-only.
- Reach for state via Zustand selectors. Don't keep duplicate copies in `useState` except for transient draft fields in form components.

## Common gotchas

| Symptom | Likely cause | Fix |
|---|---|---|
| `MenuGroupRootContext is missing` at runtime | `DropdownMenuLabel` outside `DropdownMenuGroup` | Wrap in `<DropdownMenuGroup>` ([ui-patterns §2](./specs/ui-patterns.md#2-base-ui-quirks)). |
| `asChild does not exist on type` | Used Radix-style API | Use `render={<Element />}` instead. |
| "changing default open state of an uncontrolled" warning | `defaultOpen` derived from runtime state | Switch to controlled `open` + `onOpenChange`. |
| Edits don't appear after editing the store | Turbopack stale cache | Stop dev server, `rm -rf .next`, restart. |
| `Export isDtcgToken doesn't exist in module …/parser` | Wrong import path | Always `import { isDtcgToken } from "@/lib/dtcg/types"`. |
| Selection points to a missing path after delete/move | Reconciliation step skipped | Update the offending action to clear `selectedToken` / `multiSelection` ([invariant I6](./specs/domain.md#3-invariants)). |

## Persistence keys cheat sheet

| Key | Owner | Purpose |
|---|---|---|
| `DATABASE_URL` / Supabase Postgres | Runtime DB | Live workspace for tokens/themes plus snapshots, mappings, sync runs, AI context, and PR drafts; secrets stay in `.env.local` |
| `NEXT_PUBLIC_SUPABASE_URL` / publishable key | Supabase Auth | Public browser-safe Auth config only; never use DB passwords or service role keys in client code |
| `FIGMA_BRIDGE_PAIRING_SECRET` | Figma Bridge | Optional server-side secret for signing temporary workspace pairing codes |
| `tokens/<collection-id>/<mode-id>.tokens.json` | Save/PR export | Canonical Git-native Collection/Mode artifacts generated from DB |
| `tokens/*.tokens.json` / `tokens/*.edited.tokens.json` | Legacy import | Backward-compatible single-mode Collection artifacts |
| `.rozetta/themes.json` | Save/PR export | Git-versioned theme artifact generated from DB |
| `rozetta-themes-v1` | themes-store | Legacy theme migration source only |
| `.rozetta/export-profiles.json` | Exports route | Git-versioned export profiles |
| `.rozetta/brands.json` | design-system-store | Git-versioned white-label brand registry kept for compatibility while Brands is paused |
| `.rozetta/components.json` | design-system-store | Git-versioned component registry metadata |
| `.rozetta/ai-conversations.json` | AI Assistant | Git-versioned persisted chat conversation |
| `.rozetta/ai-patches.json` | AI Assistant | Git-versioned reviewable AI proposals |
| `.rozetta/ai-sessions.json` | AI Assistant | Git-versioned summarized AI task history |
| `.rozetta/ai-settings.local.json` | Studio Settings | Local provider settings and secrets; ignored by Git |
| `rozetta-studio:export-profiles:v1` | Exports route | Legacy migration source only |
| `rozetta-studio:token-table:column-widths:v3` | TokenTable | Resizable column widths |

## When you're done

- Update the relevant feature spec's `Status` if it transitioned (`planned` → `partial` → `implemented`).
- Update `contracts.md` if you changed any exported signature.
- Update `architecture.md` if you introduced a new layer or moved files between layers.
- Run `pnpm lint` and `pnpm exec tsc --noEmit`. Both must pass.

## Team & tooling

A product team of native subagents lives in `.claude/agents/`. Spawn one with `Agent({ subagent_type: "<name>", ... })`:

| Agent | Use for |
|---|---|
| `tech-lead` | Decompose cross-layer work, review architecture/invariants/contracts, mediate. Squad lead. |
| `product-manager` | SDD feature specs (`specs/features/*.md`), user stories, measurable ACs. Spec-first. |
| `ux-designer` | UI/UX, design critique, UX copy, a11y — `ui-patterns.md` + `brand.md`. |
| `frontend-engineer` | Next.js 16 / React 19 / Base UI / Tailwind v4 UI; client/server boundaries. |
| `backend-engineer` | Server actions, Drizzle/Supabase, MCP, AI-OS; workspace scoping, server-only. |
| `data-engineer` | DTCG model, serializer-only mutation, schema/migrations, collections/modes/themes. |
| `security-auditor` | Auth/workspace guards, boundary leaks, secrets, safe spawn. Review-first. |
| `qa-engineer` | Vitest, regression-first, verify ACs. |

Project skills in `.claude/skills/`: **`spec-feature`** (scaffold/maintain an SDD spec), **`sdd-check`** (pre-PR gate vs constitution/invariants/contracts), **`token-op`** (safe DTCG tree ops), **`product-brief`** (idea → PRD from `.docs/research/`). Compose with the plugin skills (`design:*`, `code-review`, `security-review`, `vercel:*`, `impeccable`, `frontend-design`) rather than duplicating them.

For multi-discipline features/bugs, run **`/squad <issue#>`** — it builds a native Agent Team (lead + 3-5 teammates) from these agents. Follow `.claude/rules/git-workflow.md` (English for GitHub, PT-BR internal, PR → `main`, human-gated merge). For small/single-file work, use a classic `Agent` call without `team_name`.

## Things deliberately not done

- No `ContextMenu` (Radix-style). Right-click affordances live behind dropdown buttons.
- Broad Git write workflows, hosted AI billing, autonomous AI mutation, active brand package authoring, member management, billing, MFA, and SSO are still deliberately not done. A reviewed GitHub PR draft/publish flow exists for versioned Rozetta artifacts only.
- `theme.sets[].state === "source"` (legacy `mode === "source"`) is stored but currently behaves like `"enabled"`.
