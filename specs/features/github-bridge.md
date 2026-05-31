[//]: # (Feature spec: GitHub Bridge)

# Feature: GitHub Bridge

## Status
planned (supersedes the current narrow PR-draft contract in [`save-discard.md`](./save-discard.md) and [`branches.md`](./branches.md))

## Purpose
Turn the current "one-shot publish" GitHub PR draft flow into a reviewable, staged write bridge that covers branch selection, artifact-only commits, push, and PR creation. Today `publishGitHubPr` runs `git switch -c → git add → git commit → git push → gh pr create` in a single Server Action with no readiness checks, no hosted/Vercel guard, no per-step preview, and no allowlist for the binaries it invokes. This spec defines the missing safety, observability, and review controls so:

- Rozetta can publish reviewed design-system artifacts without leaking other working-tree changes.
- The AI Assistant can produce a `github.pr.create` proposal that the user accepts after reviewing the diff.
- Hosted/Vercel deployments cannot run local `git`/`gh` and MUST refuse cleanly instead of attempting and failing late.
- Branch state surfaced in `/branches` stays read-only; writes only happen behind explicit, reviewed actions in `/sync/figma`, `/releases`, or future `/sync/github` surfaces.

This feature does NOT introduce a generalized Git write surface — operations remain limited to the reviewed artifact publish path. Broad Git workflows stay out of scope ([constitution §1](../constitution.md#1-git-native-cloud-backed) and the roadmap item "Full Git write actions").

## User stories
- As a design-system maintainer, I can publish reviewed Rozetta artifacts as a PR without copying JSON or running terminal commands.
- As a maintainer with uncommitted unrelated work, I can publish a Rozetta PR knowing only `tokens/**`, `.rozetta/**`, and a small allowlist of files reach the commit.
- As an AI Assistant user, I can ask the agent to "open a PR for these renames" and receive a reviewable `github.pr.create` proposal that I explicitly accept.
- As a maintainer running Rozetta on Vercel, I see the GitHub bridge marked unavailable with clear copy instead of a broken button.
- As a security reviewer, I can prove that `git` and `gh` are invoked with allowlisted args, no shell interpolation, redacted logs, and never with credentials passed by Rozetta.

## Definitions
- **Artifact-only commit**: a commit whose tree changes are restricted to `tokens/**`, `.rozetta/**`, and a small documented allowlist.
- **Local runtime**: Rozetta running on the user's machine through `pnpm dev`, `next start`, or a future Electron main process.
- **Hosted runtime**: Rozetta running on Vercel or any environment without local `git`/`gh` access.
- **PR draft**: a `GitHubPrDraft` row in DB representing intent to publish. May be `draft`, `published`, or `failed`.
- **Publish run**: one bounded execution of the publish pipeline for a given draft.
- **Readiness**: aggregate state of `git` + `gh` availability, repo cleanliness around artifacts, branch validity, and auth.

## Behavior

### Readiness
1. `getGitHubBridgeReadiness` MUST return a structured readiness report covering: runtime allowed, repo detected, `git` available, `gh` available, `gh auth` valid, current branch, ahead/behind, conflicting changes outside the artifact allowlist, and the active remote.
2. The readiness report MUST NOT throw on missing tools; it MUST return `available: false` with a safe diagnostic.
3. Readiness MUST be recomputed before every publish run.
4. Readiness MUST be cached for short windows (≤ 30s) inside a single request only.

### Drafts
1. `createGitHubPrDraft` MUST be unchanged in shape, but MUST validate `baseBranch` against a non-empty string and reject control characters / whitespace.
2. `createGitHubPrDraft` MUST default `baseBranch` to the repo's default branch when omitted, falling back to `"main"` only if detection fails.
3. `updateGitHubPrDraft` (new) MUST let the user edit title, body, baseBranch, and headBranch on a `draft` row before publish.
4. `deleteGitHubPrDraft` (new) MUST delete a draft only when its status is `draft` or `failed`. Published drafts MUST NOT be deleted.
5. Drafts MUST persist the chosen branch policy (`auto-timestamp` | `explicit:<name>`) so the publish step is reproducible.

### Publish pipeline
1. Publish MUST run as discrete, ordered steps. Each step MUST be observable in the resulting `SyncRun`:
   1. Readiness check.
   2. Export workspace artifacts to disk (existing `exportWorkspaceArtifacts`).
   3. Compute artifact-only working tree changes.
   4. Refuse-or-proceed gate (errors if non-allowlisted paths changed and the user did not opt-in).
   5. Branch switch / create.
   6. Stage allowlisted paths.
   7. Verify staged diff is non-empty.
   8. Commit with the draft's title.
   9. Push to origin with `-u`.
   10. Run `gh pr create`.
   11. Persist URL and mark the draft `published`.
2. Each step MUST return a discriminated result and MUST NOT throw across the Server Action boundary.
3. The publish pipeline MUST be idempotent against re-runs: if the branch already exists, `switch` MUST reuse it; if there are no staged changes, the run MUST end with `status: "failed"` and a clear error.
4. Publish MUST capture each step's outcome into a `SyncRun` (`direction: "github-pr"`) with one `SyncOperation` per step.
5. Publish MUST surface partial-success cleanly: if push succeeded but `gh pr create` failed, the run MUST mark the draft `failed` with a recoverable error and keep the branch pushed for retry.

### Artifact allowlist
1. The default staging allowlist MUST be exactly:
   - `tokens/`
   - `.rozetta/themes.json`
   - `.rozetta/brands.json`
   - `.rozetta/components.json`
   - `.rozetta/export-profiles.json`
   - `specs/`
   - `README.md`
   - `AGENTS.md`
2. `.rozetta/ai-conversations.json`, `.rozetta/ai-patches.json`, and `.rozetta/ai-sessions.json` are deliberately excluded from the default allowlist. They MAY be added via a documented opt-in flag on the draft.
3. `.rozetta/ai-settings.local.json` MUST never be staged. The bridge MUST refuse if it appears in the staged set.
4. The user MAY extend the allowlist per-draft via `payload.allowlist: string[]`. Extensions MUST be validated against path traversal.
5. The bridge MUST refuse to stage paths matching `.env`, `.env.*`, `**/credentials*`, `**/secret*`, or any path containing a literal `\0`.

### Branch handling
1. The default branch policy MUST be `auto-timestamp`: `rozetta/sync-YYYYMMDDHHMMSS`.
2. An explicit branch policy (`explicit:<name>`) MUST validate `<name>` against Git ref naming rules.
3. The bridge MUST NOT switch into a branch with uncommitted non-allowlisted changes unless the user opts in via `payload.allowDirtyWorktree: true`.
4. The bridge MUST refuse to publish onto a protected ref (`main`, `master`, `release/*`, or any user-configured protection list). The user MUST publish from a feature branch.

### Cancellation and timeouts
1. Each shell command MUST have a per-command timeout (default 60s) and the overall publish MUST have a wall-clock timeout (default 5 minutes).
2. Cancellation during publish MUST terminate the active child process and mark the run `failed` with reason `cancelled`.
3. Partial state after cancellation MUST be reflected in the `SyncRun` so the user can see what was applied.

## Server Actions
File: *src/lib/github/actions.ts* (`'use server'`).

The existing exports stay but `publishGitHubPr` is updated to dispatch through the pipeline. The following actions are added:

```ts
function getGitHubBridgeReadiness(): Promise<GitHubBridgeReadiness>;
function updateGitHubPrDraft(
  draftId: string,
  patch: Partial<Pick<GitHubPrDraft, "title" | "body" | "baseBranch" | "headBranch" | "payload">>
): Promise<{ ok: true; draft: GitHubPrDraft } | { ok: false; error: string }>;
function deleteGitHubPrDraft(draftId: string): Promise<{ ok: true } | { ok: false; error: string }>;
function previewGitHubPrPublish(draftId: string): Promise<
  | { ok: true; readiness: GitHubBridgeReadiness; plan: GitHubPublishPlan }
  | { ok: false; error: string }
>;
function cancelGitHubPrPublish(draftId: string): Promise<{ ok: boolean; error?: string }>;
```

`publishGitHubPr` MUST be updated to:

- Validate readiness before any side effect.
- Run through the staged pipeline above.
- Return `{ ok: true; draft, url, syncRun }` or `{ ok: false; error, draft?, syncRun? }`.

These signatures MUST be added to [contracts §4](../contracts.md#4-workspace-product-modules) under "GitHub PR actions" before implementation lands.

## Data
- New type: `GitHubBridgeReadiness` covering runtime, repo, `git`, `gh`, `gh auth`, branch, ahead/behind, dirty state, and remote info.
- New type: `GitHubPublishPlan` describing the ordered steps and the staged path set for a given draft.
- New type: `GitHubPublishStep` enumerating `readiness`, `export-artifacts`, `verify-allowlist`, `switch-branch`, `stage`, `commit`, `push`, `gh-pr-create`, `finalize`.
- Extend `GitHubPrDraft.payload` with non-secret structured fields: `branchPolicy`, `allowlist`, `allowDirtyWorktree`, `protectedRefs`.
- `SyncRun` already supports `direction: "github-pr"`. Each publish run MUST create one `SyncRun` with one `SyncOperation` per step.
- Per-step `SyncOperation.payload` MUST contain a redacted summary, not raw `git`/`gh` stdout.
- The Supabase/Postgres runtime DB MUST NOT store credentials, tokens, or raw stdout/stderr from `git`/`gh`. Only step outcomes, exit codes, and redacted summaries.
- `.rozetta/ai-patches.json` MAY contain `github.pr.create` operations referencing a `draftId`. Validation MUST require that the draft exists and is in `draft` or `failed` status.

## Server modules
The implementation SHOULD use small server-only modules with separate responsibilities:

- *src/lib/github/types.ts*: shared types.
- *src/lib/github/runtime.ts*: hosted/local runtime detection (reuse the local-agent-bridge guard).
- *src/lib/github/process.ts*: safe process execution wrapper (reuse the local-agent-bridge process wrapper if compatible).
- *src/lib/github/readiness.ts*: structured readiness probe for `git` / `gh` / repo state.
- *src/lib/github/plan.ts*: pure plan derivation from a `GitHubPrDraft` and a readiness report.
- *src/lib/github/allowlist.ts*: pure allowlist validation.
- *src/lib/github/run.ts*: staged publish executor.
- *src/lib/github/index.ts*: server-only public entrypoint.

These module names are a target shape, not a public API. If implementation picks different names, this spec and [architecture](../architecture.md) MUST be updated.

## Runtime guard
The runtime guard MUST deny `git`/`gh` execution when any of these are true:

- `process.env.VERCEL` is set.
- `process.env.NEXT_RUNTIME === "edge"`.
- A future Rozetta hosted flag is set.
- The runtime cannot access Node child process APIs.
- The request is not handled by server-only code.

The guard MAY allow execution when:

- Rozetta is running through `pnpm dev`.
- Rozetta is running through self-hosted `next start` on the user's machine.
- Rozetta is running through a future Electron main process that explicitly enables local bridges.

In denied environments, Server Actions MUST return a typed `runtime-unavailable` result and the UI MUST surface a clear "GitHub bridge is local-only" copy.

## Process execution
1. The bridge MUST use `execFile` / `spawn` from Node, never `exec` or interpolated shell strings.
2. The bridge MUST NOT use `shell: true`.
3. The bridge MUST pass arguments as arrays.
4. The bridge MUST allowlist binaries: `git`, `gh`. User-approved absolute paths to these binaries MAY override the PATH lookup.
5. The bridge MUST normalize user-approved binary paths and reject relative paths.
6. The bridge MUST NOT accept arbitrary `git` subcommands. The allowed subcommand list MUST be: `rev-parse`, `branch`, `status`, `switch`, `add`, `commit`, `push`, `remote`, `config --get`, `ls-remote`.
7. The bridge MUST NOT accept arbitrary `gh` subcommands. The allowed subcommand list MUST be: `auth status`, `pr create`, `pr view`, `repo view`.
8. The bridge MUST set per-command timeouts (default 60s) and an overall publish timeout (default 5 minutes).
9. The bridge MUST kill child processes and descendants on timeout, cancellation, server shutdown, or request abort.
10. The bridge MUST limit captured stdout/stderr bytes per command.
11. The bridge MUST redact stdout/stderr before persisting diagnostics or returning them to the UI.
12. The bridge MUST pass a minimal environment: `PATH`, `HOME`, `SHELL`, `TMPDIR`, locale values, `GH_TOKEN` only if the user has set it via the existing local-only settings surface.
13. The bridge MUST NOT pass the full `process.env`.
14. The bridge MUST use the active Rozetta workspace root as `cwd`.
15. The bridge MUST NOT run `git config --global`, `git config --system`, `git config --local`, or any write operation on Git configuration.
16. The bridge MUST NOT run `git push --force`, `git push --force-with-lease`, `git push --delete`, or any destructive push variant.
17. The bridge MUST NOT run `git reset --hard`, `git clean -fd`, or any history-rewriting command.

## Authentication
1. The bridge MUST NOT prompt for, ask, or store GitHub passwords or personal access tokens through Rozetta UI.
2. The bridge MUST rely on the user's existing `gh auth` session for PR creation.
3. The bridge MUST detect `gh auth status` and surface readiness without leaking the token or session details.
4. If the user has set `GH_TOKEN` in their shell, the bridge MAY pass it through the minimal environment, but MUST NOT echo, log, or persist it.
5. The bridge MUST NOT attempt SSH or HTTPS credential setup. That stays an OS-level concern.

## Filesystem controls
1. The bridge MUST preserve original token immutability ([constitution §2](../constitution.md#2-originals-are-immutable)).
2. The bridge MUST stage only paths that pass the allowlist + traversal check.
3. The bridge MUST resolve real paths (no symlink escape) before staging.
4. The bridge MUST refuse staged paths outside the workspace root.
5. The bridge MUST NOT delete files; staging-only.

## AI and prompt-injection controls
1. AI MUST produce `github.pr.create` proposals only via Rozetta-owned tools.
2. The AI tool surface MUST NOT expose a "run arbitrary git/gh" capability.
3. Proposal validation MUST reject `github.pr.create` operations whose `draftId` is unknown, applied, or deleted.
4. Proposal preview MUST show: target draft, base/head branches, title, body, and the exact staged path set.
5. Proposal apply MUST revalidate against the current draft and current workspace state.

## UI

### `/branches`
1. `/branches` MUST remain read-only ([`branches.md`](./branches.md) status `implemented`).
2. `/branches` MUST gain a "Bridge" panel showing readiness + a "New PR draft" CTA.
3. The CTA MUST navigate to a new `/sync/github` surface (or open a modal) for draft creation.

### `/sync/github` (new) or `/sync/figma` (existing) integration
1. PR drafts created from `/sync/figma` after a Figma → Rozetta apply MUST continue to work; this spec does not change that entry point.
2. A new `/sync/github` route SHOULD list all PR drafts, show readiness, and host the per-draft preview/publish/cancel actions.
3. The preview view MUST show the staged path set, the per-step plan, and the readiness report.
4. The publish view MUST show step-by-step progress while running.
5. The cancel button MUST stay visible during a running publish.

### `/settings`
1. `/settings` MUST gain a "GitHub bridge" subsection.
2. The subsection MUST show readiness and a "test connection" action (`git --version`, `gh auth status`).
3. The subsection MUST let users set an optional user-approved `git`/`gh` executable path.
4. The subsection MUST clearly mark the bridge as local-only.
5. The subsection MUST NOT show raw stdout/stderr or environment values.

## Testing
Unit tests MUST cover:
1. Allowlist accepts the default set and rejects extensions outside the workspace.
2. Allowlist rejects `.env`, credentials, and secret-like paths even when explicitly extended.
3. Plan derivation produces a stable, ordered step list for a given draft.
4. Runtime guard rejects Vercel/Edge runtime.
5. Process wrapper uses arg arrays and rejects `shell: true`.
6. Process wrapper rejects non-allowlisted binaries.
7. Process wrapper rejects non-allowlisted `git`/`gh` subcommands.
8. Branch policy rejects invalid ref names.
9. Branch policy rejects protected refs.
10. Readiness handles missing `git`, missing `gh`, and unauthenticated `gh`.
11. Redaction removes tokens, bearer headers, and `GH_TOKEN`-like patterns.
12. Cancellation marks the `SyncRun` as failed with reason `cancelled`.

Integration tests SHOULD cover:
1. Publish against a temporary repo end-to-end (mock `gh` if needed) produces a `SyncRun` with all steps successful.
2. Publish refuses when the working tree has non-allowlisted changes and the user did not opt in.
3. Publish recovers when re-run after a `gh pr create` failure (branch already pushed).
4. Hosted runtime refuses publish with a typed result.
5. AI-generated `github.pr.create` proposal end-to-end through preview/apply.

Manual QA SHOULD cover:
1. `gh` installed and authenticated.
2. `gh` installed but unauthenticated.
3. `gh` missing.
4. Local repo with uncommitted unrelated changes.
5. Local repo on a protected branch.
6. Local repo with a remote that does not exist.
7. Publish then immediately re-publish (idempotency).
8. Mid-publish cancellation.

## Implementation plan

### Phase 0 — Spec and contracts
1. Add this feature spec and link it from the specs index.
2. Update [contracts §4](../contracts.md#4-workspace-product-modules) with the new types and Server Action signatures.
3. Update [architecture §1](../architecture.md#1-layers) and §7 to introduce the new modules under *src/lib/github/***.
4. Update [`save-discard.md`](./save-discard.md) and [`branches.md`](./branches.md) to reference this bridge.

### Phase 1 — Readiness and runtime guard
1. Add `getGitHubBridgeReadiness` and runtime guard.
2. Surface readiness on `/branches` (read-only initially) and `/settings`.
3. Hide publish CTAs when readiness is unavailable.

### Phase 2 — Staged publish pipeline
1. Extract the existing `publishGitHubPr` body into staged steps.
2. Persist a `SyncRun` per publish with one `SyncOperation` per step.
3. Add allowlist + traversal validation.
4. Add per-command and overall timeouts.
5. Add cancellation hook.

### Phase 3 — Draft editing and preview
1. Add `updateGitHubPrDraft` and `deleteGitHubPrDraft`.
2. Add `previewGitHubPrPublish` returning the plan and readiness.
3. Build the `/sync/github` UI for listing drafts and running previews.

### Phase 4 — AI integration
1. Validate `github.pr.create` proposals against current drafts and readiness.
2. Surface PR proposals in `ai-review-queue.tsx`.
3. Block apply when readiness is unavailable.

### Phase 5 — Settings UI
1. Add "GitHub bridge" subsection.
2. Add executable-path overrides.
3. Add "test connection" action.

### Phase 6 — Hosted boundary
1. Hosted/Vercel UI hides publish affordances and explains the local-only constraint.
2. Hosted/Vercel runtime never imports the bridge execution modules at runtime.

## Acceptance checks
1. `pnpm lint` passes.
2. `pnpm exec tsc --noEmit` passes.
3. Bridge never runs `git push --force` or any destructive variant.
4. Bridge never runs `git config` write operations.
5. Bridge never invokes a binary outside the allowlist.
6. Bridge never invokes a `git`/`gh` subcommand outside the allowlist.
7. Bridge is unavailable when `VERCEL` is set.
8. Bridge is unavailable in Edge runtime.
9. Allowlist refuses `.env`, credentials, and secret-like paths even with explicit extension.
10. Logs are redacted and truncated.
11. Cancellation terminates child processes and marks the run failed.
12. Apply revalidates against the current draft and workspace state.
13. AI-generated PR proposals enter the review queue and never auto-publish.
14. No GitHub token, `gh` session token, or credential is stored in Git artifacts or the Supabase/Postgres runtime DB.
15. Hosted builds never bundle bridge execution modules.

## Out of scope
- Generalized Git write workflows (rebase, merge, cherry-pick, tag, fetch, pull).
- Conflict resolution UI.
- Branch switcher across the whole product (read-only branch UI in `/branches` stays read-only).
- GitHub Releases publishing (release notes drafts stay in [`releases.md`](./releases.md)).
- GitHub Actions / CI configuration.
- Issue creation, comments, or reviewer assignment beyond `gh pr create` defaults.
- Self-hosted Git (GitLab, Bitbucket, Gitea) — `gh` only in v1.
- Asking users for personal access tokens in Rozetta UI.
- Bundling `gh` as a Rozetta dependency.

## Open questions
- Should the bridge support GitLab/Bitbucket via pluggable adapters mirroring the writeback adapter pattern? Currently no.
- Should the publish pipeline support `--draft` PRs in `gh pr create`? Probably yes; track as a v1.1 toggle.
- Should the bridge track PR review state (`gh pr view`) and surface it in `/branches` after publish? Currently no.
- Should publish allow signing commits (`-S`)? Currently relies on the user's `git config`, never overridden.
- Should a future Electron version persist its own `gh` token vault, or always defer to the user's host `gh` install? Currently always defer.
