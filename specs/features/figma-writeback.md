[//]: # (Feature spec: Figma Writeback Bridge)

# Feature: Figma Writeback Bridge

## Status
planned

## Purpose
Close the Rozetta → Figma half of the Figma sync loop. Today Rozetta generates a `rozetta-figma-writeback/v1` JSON payload via `prepareFigmaPayload`, but the local Rozetta plugin only knows how to *send* snapshots (`rozetta-export-snapshot`); the user has to copy/paste JSON if they want changes to reach Figma. This spec defines a reviewable, adapter-based writeback path so that:

- The existing Rozetta plugin gains a `rozetta-apply-writeback` flow that mirrors today's snapshot flow.
- An optional `figma-cli` adapter ([silships/figma-cli](https://github.com/silships/figma-cli)) lets local users push reviewed changes directly into Figma Desktop without copy/paste, via a server-only spawn boundary.
- Both runners reuse the same proposal/review/apply contract so the AI can produce a `figma.push-to-figma` proposal that the user explicitly accepts.
- Hosted/Vercel deployments cannot reach a local Figma Desktop instance and MUST not attempt to.

This feature does NOT replace the existing `Figma → Rozetta` plugin snapshot flow (status `implemented` in [`figma-sync.md`](./figma-sync.md)). The plugin stays canonical for ingestion; writeback is the missing half.

## User stories
- As a design-system maintainer, I can review a Rozetta → Figma writeback diff and push it to Figma via the Rozetta plugin without copy/pasting JSON.
- As a local user with `figma-cli` installed, I can let Rozetta push reviewed token changes directly into the open Figma Desktop file.
- As an AI Assistant user, I can ask the agent to "apply these renames to Figma" and receive a reviewable `figma.push-to-figma` proposal that I explicitly accept before anything reaches Figma.
- As a maintainer running Rozetta on Vercel, I see writeback marked unavailable (no local Figma Desktop) instead of a broken button.
- As a security reviewer, I can prove no `figma-cli`, plugin POST, or Figma Variables mutation happens without a Rozetta-owned review step.

## Definitions
- **Writeback**: any operation that takes reviewed Rozetta state (tokens, themes, bindings) and applies it to Figma Variables in a Figma file.
- **Writeback adapter**: a server-only module that knows how to deliver a `RozettaToFigmaPayload` to a specific runner (`plugin`, `figma-cli`, or a future Figma Enterprise API).
- **Plugin runner**: the existing local Rozetta Figma plugin (*figma-plugin/code.js*), receiving the payload via plugin messaging.
- **Rozetta Bridge**: the local Figma plugin UI/runtime defined in [`figma-plugin-bridge.md`](./figma-plugin-bridge.md). It pairs a workspace, sends snapshots, and applies reviewed writeback payloads.
- **figma-cli runner**: a local CLI process spawned by Rozetta that talks to Figma Desktop via CDP or its own plugin. External tool, not authored by Rozetta.
- **Local runtime**: Rozetta running on the user's machine through `pnpm dev`, `next start`, or a future Electron main process.
- **Hosted runtime**: Rozetta running on Vercel or any environment without access to the user's local Figma Desktop.
- **Writeback proposal**: an `AiPatchProposal` containing one or more `figma.push-to-figma` operations.

## Behavior

### Adapter contract
1. Each writeback adapter MUST implement the same server-only interface so the proposal flow and the AI tool surface stay adapter-agnostic.
2. The adapter interface MUST cover: readiness check, payload validation, diff preview, apply, and cancellation.
3. Adapter modules MUST live under *src/lib/figma-bridge/writeback/*** so the future Electron main process can reuse them from the same import path.
4. Adapter modules MUST NOT import React, Zustand stores, route components, or client-only code.
5. Adapter modules MAY import pure workspace/domain helpers and existing server-only Figma bridge helpers.
6. The default adapter MUST be `plugin`. `figma-cli` is opt-in.
7. Adapters MUST return discriminated results (`{ ok: true, ... }` or `{ ok: false, error }`). They MUST NOT throw across the Server Action boundary.

### Plugin adapter
1. The Rozetta plugin MUST gain a `rozetta-apply-writeback` message handler in *figma-plugin/code.js*.
2. The plugin handler MUST iterate the payload's sets and bindings and upsert Figma Variables and modes through the official Figma Plugin API.
3. The plugin handler MUST refuse to delete Figma Variables in v1 even if the payload's `safety.destructiveDeletes` is `true`. Removal stays a manual operation.
4. The plugin handler MUST surface per-variable results (`created`, `updated`, `skipped`, `failed`) back to the Rozetta UI via the existing plugin → app channel.
5. The plugin handler MUST validate the payload version string (`rozetta-figma-writeback/v1`) before processing.
6. The Rozetta server MUST NOT call any Figma REST/Enterprise API in this adapter; the plugin is the only channel.
7. The plugin UI MUST show a payload preview and require a user confirmation before sending `rozetta-apply-writeback`.
8. The plugin UI MUST use the base-luma mini design system specified in [`figma-plugin-bridge.md`](./figma-plugin-bridge.md), not a purchased kit or generic UI framework.

### figma-cli adapter
1. The `figma-cli` adapter MUST run only in server-only code.
2. The `figma-cli` adapter MUST be disabled in hosted/Vercel runtime under the same rules as the local agent bridge ([`local-agent-bridge.md` §Runtime guard](./local-agent-bridge.md#runtime-guard)).
3. The `figma-cli` adapter MUST detect the `figma-cli` binary safely — auto-detected on `PATH` or via a user-approved absolute path stored in non-secret local settings.
4. The `figma-cli` adapter MUST NOT auto-install or auto-update `figma-cli`. Detection only.
5. The `figma-cli` adapter MUST publish readiness states: `unavailable`, `installed-not-connected`, `ready`, `running`, `timed-out`, `failed`.
6. The `figma-cli` adapter MUST execute through the same safe process wrapper used by the local agent bridge (`spawn` with arg arrays, no `shell: true`, allowlisted binary, timeouts, captured-byte limits, redaction).
7. The `figma-cli` adapter MUST translate the `RozettaToFigmaPayload` into a deterministic sequence of `figma-cli` subcommands (`var create`, `var set`, `col list`, `tokens import-design-md`, or equivalent).
8. The translation step MUST run in pure helpers under *src/lib/figma-bridge/writeback/figma-cli/translate.ts* so it is unit-testable without spawning anything.
9. The `figma-cli` adapter MUST default to a dry-run mode that returns the planned commands without executing them.
10. The `figma-cli` adapter MUST execute commands only after an explicit `apply` call carrying the same proposal id that the dry-run validated.
11. The `figma-cli` adapter MUST NOT pass arbitrary user prompt text to `figma-cli`. Only structured payload-derived commands.
12. The `figma-cli` adapter MUST NOT call destructive `figma-cli` commands (`delete-all`, `var delete`) in v1.
13. The `figma-cli` adapter MUST capture stdout/stderr with byte limits and redact known secret patterns before persisting or returning diagnostics.
14. The `figma-cli` adapter MUST surface per-command results (`applied`, `skipped`, `failed`) and aggregate them into the sync run.

### Proposal and review flow
1. Writeback MUST always go through the patch proposal queue.
2. An AI run producing a `figma.push-to-figma` operation MUST validate the referenced `syncRunId` against the DB.
3. The user MUST be able to preview the writeback in `/sync/figma` before apply.
4. The preview MUST show: chosen adapter, target Figma file, runner readiness, per-set diff, per-binding diff, destructive flag, and a list of commands or plugin operations to be issued.
5. Applying a writeback proposal MUST update the matching `SyncRun` in DB with `status: "applied"` and persist per-operation outcomes.
6. Applying a writeback proposal MUST NOT mutate `tokens/*.edited.tokens.json`, `.rozetta/themes.json`, or any other Git artifact. Token/theme drafts are already saved in the DB before writeback.
7. Apply failures MUST keep the `SyncRun` open (`status: "failed"`) and surface per-operation errors. The proposal MUST stay reviewable so the user can retry.
8. Cancellation during apply MUST terminate the runner cleanly (plugin: ignore further plugin messages; figma-cli: SIGTERM + SIGKILL escalation) and mark the run `failed` with a cancellation reason.

### Live sync (human edits)
Live sync is the always-on companion to the proposal queue, scoped to human edits made directly in Rozetta. It does NOT replace the AI proposal queue and does NOT auto-apply writebacks.

1. Server-driven writebacks generated from human edits in Rozetta MUST follow the same proposal/review/apply contract as AI proposals, except they MAY be regenerated automatically on every persisted token/theme draft.
2. The latest such draft `SyncRun` MUST supersede previous unsent drafts for the same workspace — only one Rozetta→Figma `status: draft` row exists per workspace at a time.
3. Each regeneration MUST be deterministic and skipped (idempotent) when the recomputed `RozettaToFigmaPayload` is byte-identical to the previous draft.
4. Plugin polling and Plugin → server apply reporting are the only new HTTP surfaces this introduces; both MUST authenticate via `X-Rozetta-Workspace-Code` like `/api/figma/snapshot`.
5. The plugin MUST mute its own `documentchange` subscription for at least 2 seconds after applying its own writeback to suppress echoes that would otherwise loop back as auto-snapshots.
6. Live sync MUST NOT auto-apply writebacks in either direction. Both Figma→Rozetta (auto-preview) and Rozetta→Figma (auto-deliver to plugin) require an explicit user-confirmed apply step on the receiving side.
7. The mutation triggers that call `regenerateFigmaWritebackDraft` MUST be gated by a cached `hasActiveBridgePairing` check so workspaces without an active Figma pairing pay no extra cost.

### Connector Hub integration
1. The Figma connector card on `/sync` MUST surface the available writeback adapters and their readiness.
2. Selecting an adapter MUST be a per-workspace preference stored in non-secret settings (see Data).
3. The Connector Hub MUST hide `figma-cli` adapter affordances in hosted runtime.
4. `listSyncConnectors` MAY gain adapter metadata so the AI tool surface can describe writeback to the user.

## Data
- New type: `FigmaWritebackAdapterId = "plugin" | "figma-cli"`.
- New type: `FigmaWritebackReadiness = "unavailable" | "installed-not-connected" | "ready" | "running" | "timed-out" | "failed" | "misconfigured"`.
- New type: `FigmaWritebackPlan` describing the per-adapter ordered operations derived from a `RozettaToFigmaPayload`.
- New type: `FigmaWritebackResult` describing per-operation outcomes.
- New type: `FigmaWritebackPreferences` storing `{ activeAdapterId: FigmaWritebackAdapterId; figmaCli?: { executablePath?: string; timeoutMs?: number } }`.
- New `SyncOperationKind`: `figma.variable.upsert` is already present; add `figma.variable.skip` and `figma.variable.fail` for outcome reporting if needed. Reuse existing kinds when possible.
- Preferences live in `.rozetta/ai-settings.local.json` alongside other local-only settings, OR in a sibling local file. They MUST NOT be Git-versioned.
- Adapter readiness MAY be cached in memory and MUST be recomputed before execution.
- Writeback runs persist as `SyncRun` rows with `direction: "rozetta-to-figma"` (already defined in *types.ts*).
- Plugin-applied writebacks MUST persist the same `SyncRun` shape so both adapters share the run-history surface.
- `figma-cli` adapter execution logs MUST redact API keys, OAuth tokens, file paths outside the workspace when unnecessary, and any captured stdout/stderr line matching secret patterns.
- The Supabase/Postgres runtime DB MUST NOT store `figma-cli` execution stdout/stderr in raw form. Only summary outcomes per `SyncOperation`.
- The AI patch queue continues to live in `.rozetta/ai-patches.json`. `figma.push-to-figma` proposals MUST identify their target `SyncRun` and chosen adapter.

## Server modules
The implementation SHOULD use small server-only modules with separate responsibilities:

- *src/lib/figma-bridge/writeback/types.ts*: shared adapter types.
- *src/lib/figma-bridge/writeback/runtime.ts*: hosted/local runtime detection (reuse the local-agent-bridge helper if possible).
- *src/lib/figma-bridge/writeback/plan.ts*: pure translation from `RozettaToFigmaPayload` to a `FigmaWritebackPlan`.
- *src/lib/figma-bridge/writeback/plugin/index.ts*: plugin adapter (queues plugin messages, awaits ack, reconciles outcomes).
- *src/lib/figma-bridge/writeback/figma-cli/detect.ts*: safe `figma-cli` detection.
- *src/lib/figma-bridge/writeback/figma-cli/translate.ts*: pure plan → CLI argv translation.
- *src/lib/figma-bridge/writeback/figma-cli/run.ts*: process execution wrapper (reuse local-agent-bridge `process.ts` if shape matches).
- *src/lib/figma-bridge/writeback/index.ts*: public server-only entrypoint exposing the adapter interface.

These module names are a target shape, not a public API. If implementation picks different names, this spec and [architecture](../architecture.md) MUST be updated.

## Server Actions
File: *src/lib/figma-bridge/actions.ts* (`'use server'`).

The existing exports stay. The following actions are added:

```ts
function getFigmaWritebackReadiness(): Promise<{
  adapters: Array<{
    id: FigmaWritebackAdapterId;
    readiness: FigmaWritebackReadiness;
    detail?: string;
  }>;
  activeAdapterId: FigmaWritebackAdapterId;
}>;

function previewFigmaWriteback(input: {
  adapterId: FigmaWritebackAdapterId;
  payload?: RozettaToFigmaPayload;
}): Promise<
  | { ok: true; plan: FigmaWritebackPlan; syncRun: SyncRun }
  | { ok: false; error: string }
>;

function applyFigmaWriteback(input: {
  adapterId: FigmaWritebackAdapterId;
  syncRunId: string;
}): Promise<
  | { ok: true; syncRun: SyncRun; result: FigmaWritebackResult }
  | { ok: false; error: string; syncRun?: SyncRun }
>;

function cancelFigmaWriteback(syncRunId: string): Promise<{ ok: boolean; error?: string }>;
```

- `previewFigmaWriteback` MUST produce or reuse a `SyncRun` in `direction: "rozetta-to-figma"` and `status: "draft"`.
- `applyFigmaWriteback` MUST validate against the current workspace draft, not the workspace state used when the proposal was originally created. If the workspace moved on, the action MUST return a `workspace-moved-on` error and keep the run in `status: "draft"`.
- `cancelFigmaWriteback` MUST terminate any active runner and mark the run `failed` with reason `cancelled`.

These signatures MUST be added to [contracts §4](../contracts.md#4-workspace-product-modules) under "Figma bridge Server Actions" before implementation lands.

## Runtime guard
The runtime guard MUST deny `figma-cli` adapter execution when any of these are true:

- `process.env.VERCEL` is set.
- `process.env.NEXT_RUNTIME === "edge"`.
- A future Rozetta hosted flag is set.
- The runtime cannot access Node child process APIs.
- The request is not handled by server-only code.

The guard MAY allow `figma-cli` adapter execution when:

- Rozetta is running through `pnpm dev`.
- Rozetta is running through self-hosted `next start` on the user's machine.
- Rozetta is running through a future Electron main process that explicitly enables local adapters.

The plugin adapter is allowed in hosted runtime, since it depends on the user's local Figma + Rozetta plugin pairing, not on Rozetta having local execution rights.

## Process execution (figma-cli adapter)
1. The adapter MUST use `spawn` from Node, never `exec` or `execSync`.
2. The adapter MUST NOT use `shell: true`.
3. The adapter MUST pass arguments as arrays.
4. The adapter MUST allowlist the binary name (`figma-cli`) or accept a user-approved absolute executable path.
5. The adapter MUST normalize user-approved executable paths and reject relative paths.
6. The adapter MUST set a per-command timeout (default 30s) and an overall apply timeout (default 5 minutes).
7. The adapter MUST kill child processes and descendants on timeout, cancellation, server shutdown, or request abort.
8. The adapter MUST limit captured stdout/stderr bytes per command.
9. The adapter MUST redact stdout/stderr before persisting diagnostics or returning them to the UI.
10. The adapter MUST pass a minimal environment: `PATH`, `HOME`, `SHELL`, `TMPDIR`, locale values, and explicit `figma-cli`-required variables only when documented.
11. The adapter MUST NOT pass the full `process.env`.
12. The adapter MUST use a safe working directory: the active Rozetta workspace root unless a future `figma-cli` command requires a specific path.
13. The adapter MUST NOT invoke `figma-cli connect --safe` automatically. Connection setup is an explicit user action with on-screen confirmation.
14. The adapter MUST NOT invoke `figma-cli` plugin install/setup commands automatically.

## Filesystem controls
1. The adapter MUST preserve the DB-first artifact boundary ([constitution §2](../constitution.md#2-git-artifacts-are-generated-from-the-db)).
2. The adapter MUST NOT write canonical `tokens/<collection>/<mode>.tokens.json`, legacy top-level token artifacts, or `.rozetta/*` artifacts directly.
3. The adapter MAY write a transient `DESIGN.md`-style file in `tmp/figma-writeback/<runId>/` only if `figma-cli` requires a file input. That temp file MUST be cleaned up after each run.
4. The adapter MUST NOT read arbitrary files referenced by model output.
5. The adapter MUST NOT trust paths returned by `figma-cli` output (they are untrusted text until validated).

## AI and prompt-injection controls
1. AI MUST produce `figma.push-to-figma` proposals only via Rozetta-owned tools, not by emitting freeform `figma-cli` commands.
2. The AI tool surface MUST NOT expose a "run arbitrary figma-cli" capability.
3. Proposal validation MUST reject `figma.push-to-figma` operations whose `syncRunId` is unknown, applied, or failed.
4. Proposal validation MUST reject writebacks targeting destructive removals in v1.
5. Proposal preview MUST show the chosen adapter and the exact commands or plugin operations to be issued.

## Connector Hub UI
1. The Figma connector card on `/sync` MUST show a "Writeback" section.
2. The Writeback section MUST list adapters and their readiness.
3. The Writeback section MUST hide `figma-cli` in hosted runtime and replace it with copy explaining why.
4. The Writeback section MUST link to `/sync/figma` for the full review flow.

## `/sync/figma` UI
1. The page MUST surface a "Push to Figma" panel separated from the existing "Receive snapshot" panel.
2. The panel MUST show the adapter picker, readiness state, and a "Preview" action.
3. The panel MUST show a per-set, per-binding diff before apply.
4. The panel MUST require an explicit "Apply to Figma" action.
5. The panel MUST show per-operation outcomes after apply.
6. The panel MUST keep a cancellation affordance while an apply is running.
7. The panel MUST NOT auto-execute when the page loads, even if a draft `SyncRun` exists.

## Settings UI
1. `/settings` MUST gain a "Figma writeback" subsection.
2. The subsection MUST let users choose the active adapter.
3. The subsection MUST let users set a user-approved `figma-cli` executable path.
4. The subsection MUST show readiness and a "test connection" action.
5. The subsection MUST NOT show raw stdout/stderr or environment variables.
6. The subsection MUST clearly mark `figma-cli` as local-only and unavailable on hosted deployments.

## Testing
Unit tests MUST cover:
1. Translation from a `RozettaToFigmaPayload` to a deterministic `FigmaWritebackPlan` (per adapter).
2. Plan refuses destructive removals in v1.
3. `figma-cli` argv translation rejects unsafe characters and disallowed subcommands.
4. Runtime guard rejects Vercel/Edge runtime.
5. Redaction removes API keys, bearer tokens, and `figma-cli` access tokens if present.
6. Process wrapper uses arg arrays and rejects `shell: true`.
7. Detection refuses recursive filesystem scans.
8. Proposal validation rejects unknown/applied/failed `syncRunId`s.
9. Plugin adapter rejects unknown payload versions.
10. Cancellation marks the `SyncRun` as failed with reason `cancelled`.

Integration tests SHOULD cover:
1. `applyFigmaWriteback` against a stubbed plugin runner produces the expected `SyncOperation` outcomes.
2. `applyFigmaWriteback` against a stubbed `figma-cli` runner produces the expected outcomes and respects timeouts.
3. Hosted runtime hides `figma-cli` and refuses execution.
4. Apply revalidates against the current workspace draft (workspace-moved-on path).

Manual QA SHOULD cover:
1. `figma-cli` installed and connected to Figma Desktop.
2. `figma-cli` installed but not connected.
3. `figma-cli` missing.
4. Plugin runner with Figma Desktop closed.
5. Plugin runner with Figma Desktop open but plugin not loaded.
6. Mid-apply cancellation.
7. AI-generated `figma.push-to-figma` proposal end-to-end.

## Implementation plan

### Phase 0 — Spec and contracts
1. Add this feature spec and link it from the specs index.
2. Update [contracts §4](../contracts.md#4-workspace-product-modules) with the new types and Server Action signatures.
3. Update [architecture §1](../architecture.md#1-layers) and §7 to introduce *src/lib/figma-bridge/writeback/***.
4. Update [`figma-sync.md`](./figma-sync.md) to reference this writeback spec.
5. Update [`connector-hub.md`](./connector-hub.md) if writeback adapter metadata changes connector capabilities.

### Phase 1 — Plan helpers (pure)
1. Add `FigmaWritebackPlan`, `FigmaWritebackResult` types.
2. Add `planFigmaWriteback(payload, adapterId)` pure helper with tests.
3. Add destructive-removal refusal with tests.

### Phase 2 — Plugin adapter
1. Add `rozetta-apply-writeback` message handler in *figma-plugin/code.js*.
2. Add plugin UI affordance to accept and confirm a writeback payload.
3. Add the server-side plugin adapter that proxies the payload to the plugin via the existing snapshot channel pattern.
4. Add per-operation outcome reporting back to Rozetta.
5. Wire `previewFigmaWriteback` / `applyFigmaWriteback` Server Actions.

### Phase 3 — `/sync/figma` writeback UI
1. Add "Push to Figma" panel.
2. Add adapter picker (plugin only at this phase).
3. Add preview/apply/cancel actions.
4. Add per-operation outcome view.

### Phase 4 — `figma-cli` adapter (local-only)
1. Add detection helper.
2. Add runtime guard reuse from local-agent-bridge.
3. Add safe process wrapper (reuse from local-agent-bridge if compatible).
4. Add CLI argv translation with tests.
5. Add dry-run mode by default.
6. Add apply path with timeouts and cancellation.
7. Wire the adapter into the existing Server Actions.

### Phase 5 — AI integration
1. Validate `figma.push-to-figma` proposals against current workspace and adapter readiness.
2. Surface writeback proposals in `ai-review-queue.tsx` with adapter metadata.
3. Block apply when adapter is unavailable; show the safe error.

### Phase 6 — Settings UI
1. Add "Figma writeback" subsection to `/settings`.
2. Add executable-path override.
3. Add readiness + test connection action.

### Phase 7 — Hosted boundary
1. Hosted/Vercel UI hides `figma-cli` adapter.
2. Hosted/Vercel runtime never imports `figma-cli` adapter modules at runtime.
3. Document hosted writeback options (plugin only).

## Acceptance checks
1. `pnpm lint` passes.
2. `pnpm exec tsc --noEmit` passes.
3. Writeback never mutates Figma without an explicit user-applied proposal.
4. Plugin adapter refuses unknown payload versions.
5. Plugin adapter refuses destructive removals in v1.
6. `figma-cli` adapter is unavailable when `VERCEL` is set.
7. `figma-cli` adapter is unavailable in Edge runtime.
8. `figma-cli` adapter rejects non-allowlisted binaries and unsafe argv.
9. `figma-cli` adapter applies only after a successful preview.
10. `figma-cli` adapter logs are redacted and truncated.
11. Cancellation terminates child processes and marks the run failed.
12. Apply revalidates against the current workspace draft.
13. AI-generated writeback proposals enter the review queue and never auto-apply.
13a. Live sync MUST NOT auto-apply writebacks in either direction, even though it auto-generates and auto-delivers draft payloads.
14. No `figma-cli` access token, OAuth token, or session token is stored in Git artifacts or the Supabase/Postgres runtime DB.
15. Hosted builds never bundle `figma-cli` adapter execution modules.

## Out of scope
- Figma Enterprise API integration.
- Cloud-hosted writeback (no Figma Desktop on the same machine).
- Autonomous AI-driven writeback without review.
- Destructive removals of Figma Variables, modes, or collections in v1.
- Component/library writeback (only Variables in v1).
- Multi-file writeback in one run.
- Replacing the existing snapshot ingestion path.
- Asking users for Figma personal access tokens.
- Bundling `figma-cli` as a Rozetta dependency.

## Open questions
- Should the plugin adapter and `figma-cli` adapter share a single `FigmaWritebackPlan`, or should each adapter own its plan shape?
- Should `figma-cli` adapter support a "watch mode" where Rozetta streams variable edits as the user edits in Rozetta? Currently no.
- Should writeback automatically generate a follow-up `Figma → Rozetta` snapshot to confirm parity? Currently no.
- Should the `figma-cli` adapter persist its readiness state across server restarts, or always recompute? Currently always recompute.
- Should writeback proposals carry a structured "rollback plan"? Currently no — rollback is a new writeback run.
