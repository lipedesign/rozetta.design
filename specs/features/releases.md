# Feature: Release Drafts

## Status
partial — publish-to-GitHub via `gh release create` landed; scheduled releases and release history are still planned.

## Purpose
Prepare release notes and artifact previews from semantic token and design-system registry changes, and optionally publish them as a real GitHub Release through the local `gh` CLI.

## User stories
- As a maintainer, I can choose a release kind and get editable release notes.
- As a tooling engineer, I can see which artifacts a design-system release would produce.
- As a maintainer with `gh` installed and authenticated, I can publish the current release notes as a GitHub Release without leaving the page.
- As a maintainer running Rozetta on Vercel, I see the publish action marked unavailable instead of silently failing.

## Behavior
1. The sidebar's **Releases** item MUST navigate to `/releases`.
2. Release drafts are generated from the Collection/Mode semantic diff (`diffTokenSets` legacy helper name) and optional `diffDesignSystemRegistry(baselineRegistry, currentRegistry)`.
3. The user can choose `patch`, `minor`, `major`, or `canary`.
4. Notes are editable in the browser.
5. The user can copy notes to clipboard or download them as Markdown.
6. Artifact previews MUST be descriptive only in this version.
7. Token changes and generated notes are grouped by Collection and Mode.
8. Theme, brand, and component registry changes are grouped by registry area.
9. The empty state uses the shared `Empty` component.
10. The feature MUST NOT create tags, commits, pushes, or package releases. Publishing a **GitHub Release** is allowed only through the dedicated publish action below.

## Publish to GitHub
1. The page exposes a "Publish to GitHub" action next to "Copy notes" and "Download markdown".
2. Clicking the action MUST call `checkGhReleaseReadiness()` first. If readiness fails (gh missing, gh unauthenticated, or hosted runtime), the inline panel MUST surface the reason and MUST NOT call `createGitHubRelease`.
3. The inline publish panel renders directly under the action buttons (NOT a sheet) and contains:
   - Tag input (default `v0.0.0-${YYYYMMDD}.${HHmm}` so the suggestion validates as semver-ish).
   - Release name input (default: `Design tokens — ${YYYY-MM-DD}`).
   - Prerelease checkbox.
   - Cancel and Publish buttons.
4. On submit, the page MUST call `createGitHubRelease({ tag, name, body, prerelease })` where `body` is the current editor content.
5. The Server Action MUST validate the tag against `^v?\d+\.\d+\.\d+([-+][A-Za-z0-9.-]+)?$` and reject invalid release names and target refs before touching the filesystem or `gh`.
6. The Server Action MUST write the release body to a temporary file under the OS temp directory (`mkdtemp("rozetta-release-")`), invoke `gh release create <tag> --title <name> --notes-file <path> [--target <ref>] [--prerelease]`, and remove the temp file and its directory in a `finally` block.
7. The Server Action MUST return `{ ok: true, url }` on success or `{ ok: false, error }` on failure. It MUST NOT throw across the boundary.
8. On success the UI MUST surface the release URL with a copy button and an external-link affordance to open it in a new tab.

## Runtime guard
1. `createGitHubRelease` and `checkGhReleaseReadiness` MUST refuse to run when `process.env.VERCEL` is set or `process.env.NEXT_RUNTIME === "edge"`, mirroring the local-only guard in `src/lib/git/actions.ts`.
2. The UI MUST surface the runtime-unavailable reason via the readiness check so the publish button explains itself instead of silently failing.

## Process execution
1. Implementation file: *src/lib/github/releases.ts* (`'use server'`, `import "server-only"`).
2. The bridge MUST use `execFile` from Node, never `exec` and never `shell: true`. Arguments MUST be passed as arrays.
3. Allowed binary: exactly `gh`. The releases module MUST NOT invoke `git` or any other binary.
4. Allowed `gh` subcommands for this surface: `release create`, `--version`, `auth status`.
5. The release body MUST be passed via `--notes-file`, never as a CLI argument, to avoid argument-length limits and shell quoting hazards on large markdown payloads.
6. Each `gh` invocation MUST set a per-command timeout (default 60s) and bounded `maxBuffer` (default 10 MiB).
7. The temp file lifecycle is: create under `mkdtemp(tmpdir() + "/rozetta-release-")`, write notes with utf-8 encoding, pass to `gh`, then remove both the file and the temp directory in a `finally` block. Cleanup errors MUST be swallowed.

## Data
- Types: `ReleaseDraft`, `ReleaseVersionKind`, `ReleaseArtifactPreview`, `DesignSystemDiff`.
- Pure draft generation: *src/lib/workspace/releases.ts*.
- New result types live in *src/lib/github/releases.ts*: `CreateGitHubReleaseInput`, `CreateGitHubReleaseResult`, `GhReleaseReadiness`.

## UI
- Route: `/releases`.
- Component: *src/components/releases/releases-page.tsx*.
- Shell: *src/components/product-shell.tsx*.

## Out of scope
- Creating tags, commits, branches, or pushes (those live in [GitHub Bridge](./github-bridge.md)).
- Attaching generated files (assets) to the release.
- Persisting draft notes between sessions.
- Scheduled releases.
- Release history / list of past published releases.

Opening a PR carrying the release notes alongside reviewed artifacts is owned by [GitHub Bridge](./github-bridge.md). This feature publishes a standalone GitHub Release using the notes already drafted in `/releases`; it does not commit, push, or open PRs.

## Open questions
- Should release drafts become versioned workspace records? Currently no.
- Should publish attach uploaded artifacts (zip of `tokens/**` and `.rozetta/*.json`) to the release? Probably yes, behind an opt-in.
- Should the publish panel offer release-history navigation once we keep records? Track alongside the previous question.
