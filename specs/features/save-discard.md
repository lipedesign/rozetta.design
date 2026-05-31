# Feature: Save & discard

## Status
implemented

## Purpose
DB-first persistence: edits are saved into the Supabase/Postgres workspace immediately, while Git-native files are exported explicitly on Save/PR. Git artifacts are generated snapshots of the DB.

## User stories
- As a designer, I can edit tokens/themes freely and reload the page without losing my DB draft.
- As a designer, I can explicitly "Save" my edits to disk so the diff lives in version control.
- As a designer, I can discard one Collection's changes without losing my edits in other Collections.
- As a designer, I can see at a glance how many token/theme changes differ from the last exported Git artifacts.

## Behavior

### Dirty detection
1. After `hydrate`, `originals[id]` is set to a deep clone of each artifact baseline root loaded from `tokens/<collection>/<mode>.tokens.json` or legacy top-level token files.
2. `isDirty(id)` MUST return `true` when a Collection has no original baseline, OR when any mode root differs from `originals[id]` / `originals[id:modeId]`.
3. `dirtySetIds()` returns every dirty Collection id. `dirtyThemeIds()` does the same for themes.
4. UI dirty surfaces ([ui-patterns §7](../ui-patterns.md#7-dirty-indicators)) MUST stay reactive — they read from current DB mirrors and artifact baselines directly.

### Save All (NavUser)
1. Trigger: "Save all changes" item in the workspace footer dropdown.
2. The trigger is disabled when no token/theme changes are dirty.
3. The trigger shows a spinner and disables during the operation.
4. The handler MUST:
   1. Call `saveWorkspaceArtifacts()` once.
   2. Server-side export serializes DB Collections/Modes to `tokens/<collection-id>/<mode-id>.tokens.json` and DB themes to `.rozetta/themes.json`.
   3. Call the local token/theme `saveAll()` actions to snapshot artifact baselines after success.
   4. Surface a toast:
      - Success: `toast.success(\`Saved \${n} changes\`)` with description `"Workspace exported to Git-native files."`.
      - Failure: `toast.error("Save failed")`.

### Discard all (NavUser)
1. Trigger: "Discard all changes" item, styled as `variant="destructive"`.
2. Disabled when no Collections are dirty.
3. The handler MUST:
   1. Call token/theme `discardAll()` to revert current DB drafts to artifact baselines.
   2. Persist the reverted draft state back into the DB.
   3. Surface `toast.success(\`Discarded \${n} changes\`)`.

### Discard one (Collections pane row menu)
1. The row's dropdown menu surfaces "Discard changes" only when the Collection is dirty.
2. Calls `discardSet(id)` directly. It reverts the DB draft for that Collection; saved artifacts are not deleted.
3. Selection inside the discarded Collection is reconciled (paths that no longer exist are dropped from `selectedToken` and `multiSelection`).
4. If the Collection has no original baseline yet (new/imported but unsaved), `discardSet(id)` removes that Collection locally.

### `saveAll` (store action)
1. Snapshots every Collection/Mode root into `originals[id]` and `originals[id:modeId]` (deep clones), including newly created/imported Collections.
2. Returns the count of Collections that were dirty *before* the snapshot.

### `discardAll` (store action)
1. Walks `dirtySetIds()` and calls `discardSet(id)` for each.
2. Returns the count of reverted Collections.

## Data
- Server: `saveTokenSetDraft`, `saveWorkspaceArtifacts`, `saveThemes` ([contracts §1](../contracts.md#1-server-actions)).
- Runtime DB: Supabase/Postgres is the live workspace.
- Filesystem artifacts: `tokens/<collection-id>/<mode-id>.tokens.json` and `.rozetta/themes.json` ([constitution §2](../constitution.md#2-git-artifacts-are-generated-from-the-db)).

## UI
- Component: *src/components/nav-user.tsx*.
- Dirty surfacing: see [ui-patterns §7](../ui-patterns.md#7-dirty-indicators).
- Save spinner: `LoaderCircleIcon` with `animate-spin`.

## Out of scope
- Conflict resolution if the on-disk file changed while the editor was open.
- Auto-save on a timer.
- Diff preview before save.

The reviewed publish-to-GitHub flow (branch + commit + push + PR) for the artifacts produced by Save is owned by [GitHub Bridge](./github-bridge.md). Save itself only writes local files; publish is a separate, reviewable step.

## Open questions
- Should Save support a pre-export diff preview before writing artifacts?
