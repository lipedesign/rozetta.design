# Feature: Workspace Health

## Status
implemented

## Purpose
Give design systems and tooling teams a fast read on whether the local design-system workspace is safe to save, export, sync, or release.

## User stories
- As a maintainer, I can see aliases, values, themes, components, dirty Collections, and Git state in one dashboard.
- As a developer, I can review actionable issues before producing release artifacts.

## Behavior
1. The sidebar's **Dashboard** item MUST navigate to `/dashboard`.
2. `/dashboard` MUST keep `/` as the Tokens workspace; no redirect is performed.
3. The dashboard shows counts for Collections, raw tokens, themes, components, dirty Collections, local-only Collections, and Git status.
4. `buildWorkspaceHealth` MUST classify issues as `error`, `warning`, or `info`.
5. Issues MUST include source metadata and an action string.
6. Broken aliases and theme references to missing sets are errors.
7. Theme token overrides, invalid values, and unsupported token types are warnings.
8. Brand references remain valid in the pure validator for compatibility, but the dashboard does not surface brand metrics while Brands is paused.
9. Component token references and manual Figma/code bindings are validated as registry issues; brand scopes are ignored by the dashboard while Brands is paused.
10. Local-only sets and dirty Git worktrees are informational.
11. The UI MUST use existing Shadcn/Base UI primitives.

## Data
- Types: `WorkspaceHealth`, `ValidationIssue`, `IssueSeverity`, `IssueSource`.
- Pure logic: *src/lib/workspace/validation.ts* and *src/lib/design-system/registry.ts*.
- Git summary: *src/lib/git/status.ts*.

## UI
- Route: `/dashboard`.
- Component: *src/components/dashboard/dashboard-page.tsx*.
- Shell: *src/components/product-shell.tsx*.

## Out of scope
- Applying fixes from the dashboard.
- Auto-saving local-only Collections.
- Cloud or team health checks.

## Open questions
- Should future issues deep-link directly to token rows and theme rows? Currently no.
