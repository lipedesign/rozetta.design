# Feature: Branches & Semantic Diff

## Status
partial — Workspace Branches CRUD (DB-native snapshots, Git-optional) + Git status + Git action bar + Create PR draft are live. Merge/diff between two Workspace Branches and the Git binding propagation (auto-sync to `git switch`) are next.

## Purpose
Branches in Rozetta is a **two-mode** concept:

1. **Workspace Branches** — DB-native snapshots of the entire workspace (Collections + Modes + Tokens + Themes + Theme Groups). Independent of Git: users without a local repo still get full branching. Each Workspace Branch stores a `snapshot` JSON plus optional `gitBinding` metadata.
2. **Git integration** — when the user has a local git repo, the page additionally exposes `git switch`, branch creation, and "Create PR draft" so Workspace Branches can be reflected in the Git tree.

The `/branches` page surfaces both: Workspace Branches list at the top (primary surface) + Git status & action bar (secondary, only meaningful when `git.available`).

## User stories
- As a designer without Git, I can create a Workspace Branch called "exploration/dark" from my current state, experiment, and switch back to "main" without losing changes.
- As a designer with Git, I can link a Workspace Branch to a git branch and use the Git action bar to switch, create branches, and open a PR draft.
- As a tooling engineer, I can see the current Git branch, ahead/behind, and changed files in real time.
- As a design system maintainer, I can review semantic token, theme, brand, and component changes instead of raw JSON noise.

## Behavior

### Workspace Branches (primary)
W1. The DB MUST store one or more `WorkspaceBranch` rows per workspace. Each branch holds `id`, `name`, `description`, `parentBranchId`, `snapshot` (full `{ sets, themes, themeGroups }` JSON), and optional `gitBinding` metadata.
W2. The `workspaces.active_branch_id` column MUST point at exactly one branch at a time. If null, the workspace MUST auto-create a `main` branch from the current state on next read (idempotent).
W3. Creating a Workspace Branch MUST snapshot the current workspace state at creation time. The new branch MAY immediately become active.
W4. Switching a Workspace Branch MUST first capture the current workspace state into the previously active branch (auto-save), then replace the workspace tables (Collections, Themes, Theme Groups) with the target branch's snapshot, then update `workspaces.active_branch_id`.
W5. The "auto-save before switch" behavior MUST be transparent — users should expect that returning to a branch later finds it as they left it.
W6. Deleting a branch MUST refuse to delete the active branch or the only remaining branch.
W7. Workspace Branches are independent of Git. They MUST work without a local repo. The `gitBinding` field is informational metadata only; switching a Workspace Branch does NOT execute `git switch` in v1.

### Git integration (secondary, only when `git.available`)
1. The sidebar's **Branches** item MUST navigate to `/branches`.
2. Read paths: branch, ahead/behind, porcelain status, token-file changes, and `.rozetta` registry file changes (`src/lib/git/status.ts`).
3. Write paths: list local branches, create branch, switch branch (`src/lib/git/actions.ts`, `'use server'`). All write paths MUST use `execFile` with arg arrays, allowlist the `git` binary, validate branch names against `^(?!\.)(?!.*\.{2})[A-Za-z0-9._/-]{1,200}$`, and MUST be disabled in hosted runtime (`process.env.VERCEL`).
4. `loadGitBaselineTokenSets()` MUST load tracked `tokens/<collection>/<mode>.tokens.json` files and legacy top-level token artifacts from `HEAD`.
5. `loadGitBaselineDesignSystemRegistry()` MUST load tracked `.rozetta/themes.json`, `.rozetta/brands.json`, and `.rozetta/components.json` from `HEAD`.
6. `diffTokenSets(baselineSets, currentSets)` MUST classify:
   - collection created / removed
   - token created / removed
   - value changed
   - type changed
   - description changed
   - alias changed
7. `diffDesignSystemRegistry(baselineRegistry, currentRegistry)` MUST classify theme, brand, and component created / removed / updated changes.
8. The UI MUST show file status, token semantic diff, and registry semantic diff separately.
9. The UI MUST expose an action bar with: branch dropdown (switch to local branch), "New branch" affordance (inline name + confirm), and "Create PR draft" button wired to `createGitHubPrDraft`. The "Read-only" badge is removed and replaced by this action bar.
10. Switching a branch MUST `revalidatePath("/", "layout")` so the persistent shell refetches workspace data against the new tree.

## Data
- Types: `GitStatusSummary`, `GitFileStatus`, `TokenSemanticDiff`, `TokenChangeKind`, `DesignSystemDiff`.
- Server-only Git: *src/lib/git/status.ts*.
- Pure diff: *src/lib/workspace/diff.ts* and *src/lib/design-system/registry.ts*.

## UI
- Route: `/branches`.
- Component: *src/components/branches/branches-page.tsx*.
- Shell: *src/components/product-shell.tsx*.

## Out of scope (still)
- Commit, push, pull, merge, or conflict resolution from the `/branches` UI. Those mutations stay inside the GitHub Bridge publish flow (`publishGitHubPr`) which validates and stages the allowlisted artifacts.
- Git provider authentication (assumes the working tree's local clone already has push rights via the user's environment).
- Stash / pop, rebase, cherry-pick.

The reviewed artifact-only publish path (stage allowlist, commit, push, open PR) is owned by [GitHub Bridge](./github-bridge.md). `/branches` exposes the entry points (create/switch branches, create PR draft); the publish surface itself remains at `/sync/figma`.

## Open questions
- Should future diffs compare against another branch/tag instead of `HEAD`? Currently no.
