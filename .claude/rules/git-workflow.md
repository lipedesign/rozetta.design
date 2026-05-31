# Git workflow — Rozetta

Conventions for branches, commits, and PRs. Referenced by `/squad` and the discipline agents.

## Language

- **English for everything that lands on GitHub**: commit messages, branch names, PR titles/bodies, issue titles/bodies, and code comments in PRs/issues (including follow-ups).
- **PT-BR for internal coordination**: chat with the user and messages between teammates.

## Branches (Git Flow)

- **`main`** — stable / released version only. Protected: no direct pushes. Updated only by promoting `develop` (a release).
- **`develop`** — integration branch; all feature/fix work targets it.
- Branch off **`develop`**.
- Name: `<type>/<slug>` where `<type>` ∈ `feat | fix | refactor | chore | docs | test | perf | ci` and `<slug>` is short kebab-case.
- Prefer `gh issue develop <n> --base develop --branch <type>/<slug> --checkout` so the branch is linked to its issue.

## Commits

- **Conventional Commits**: `<type>(<scope>): <summary>` — imperative, < 72 chars.
- Keep commits scoped and reviewable. Do not commit secrets (`.env*`, `.rozetta/*.local.json`) or build artifacts (`.next`, `tsconfig.tsbuildinfo`).
- End commit messages with the co-author trailer:
  `Co-Authored-By: Claude <noreply@anthropic.com>`

## Pull requests

- Open feature/fix PRs against **`develop`**. Title in Conventional-Commit form, referencing the issue: `<type>: <desc> (#<n>)`.
- Body includes `Closes #<n>` for auto-close, a summary, and a "Follow-ups / Out of scope" section if applicable.
- Every PR (to `develop` or `main`) gets an automated Claude review.
- **Gates are human**: do not merge. The user approves and merges in the GitHub UI.

## Releases (develop → main)

- A release is a PR from `develop` into `main`, merged with **"Create a merge commit"** (never squash/rebase — preserves shared ancestry).
- Tag `main` with a lightweight `vX.Y.Z` and cut a GitHub Release.
- `main` always stays deployable.

## SDD obligations (per PR)

- Update the relevant `specs/features/<slug>.md` `Status:` if it transitioned.
- Update `specs/contracts.md` if any exported signature changed.
- Update `specs/architecture.md` if a layer was added or files moved between layers.
- `pnpm lint` and `pnpm exec tsc --noEmit` must pass; relevant `pnpm test` green.

## Don'ts

- No force-push to shared branches. No interactive git (`-i`). No auto-merge. No pushing unless the user asks.
