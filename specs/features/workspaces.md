# Feature: Workspaces

## Status
partial — list/select/rename/create are implemented behind Server Actions and a `/workspaces` sidebar+workspace layout. Workspace-level membership management, deletion, organization picker, and avatar/icon customization are not yet shipped.

## Purpose
`/workspaces` is the user-facing surface for the workspace model already established in [`cloud-workspace-auth.md`](./cloud-workspace-auth.md). It lets the signed-in user list the workspaces they belong to, rename the workspaces where they have sufficient role, create new workspaces inside their active organization, and switch the active workspace cookie used by the rest of the studio.

The page is workspace-scoped UI plumbing — it does NOT touch Collections, Themes, brands, or any token data. It strictly mediates rows in the `workspaces` / `workspace_memberships` tables for the current user.

## User stories
- As a signed-in user, I can see every workspace I am a member of so I know which projects are mine.
- As a signed-in user, I can switch the active workspace so the rest of the studio operates on a different dataset.
- As an admin or owner of a workspace, I can rename it.
- As a signed-in user with at least one organization, I can create a new workspace inside that organization and immediately have `owner` role on it.

## Layout
`/workspaces` mirrors the `/themes` shape:

- **Left pane** (`WorkspacesPane`, *src/components/workspaces/workspaces-pane.tsx*): `w-60` aside with a "WORKSPACES" label and a "+ New workspace" button. Each row shows the workspace name, a small "Active" indicator on the active workspace, and the role badge. Clicking a row selects it for the right-side editor (does NOT auto-switch the active cookie).
- **Right pane** (`WorkspaceDetail`, *src/components/workspaces/workspace-detail.tsx*): sticky header with the workspace name + role badge, followed by:
  - Read-only fields: slug, organization name, created/updated timestamps, your role.
  - "Set as active" button when the selected workspace is not the active one.
  - Inline rename editor (disabled when the current user lacks `admin`/`owner` role on that workspace).

## Behavior
1. The page MUST require an authenticated session via the existing `(studio)` layout guard. In dev/test mode (`isAuthDisabledForRuntime()`), it falls back to the single local workspace returned by `listWorkspaceSwitcherOptions`.
2. `listMyWorkspaces` MUST return only workspaces the current user is a member of (delegates to `listWorkspaceSwitcherOptions`).
3. `renameWorkspace` MUST require `admin` or `owner` role on the target workspace and MUST update both `workspaces.name` and `workspaces.slug` (slugified from the new name, namespaced per organization via the existing `workspaces_organization_slug_unique` index).
4. Workspace names MUST be 1-80 characters after trimming. The server MUST reject empty names with `{ ok: false, error }`.
5. `createWorkspace` MUST create a new workspace inside the user's current `WorkspaceContext.organizationId`, generate a unique slug within that organization, and insert a `workspace_memberships` row with role `owner` for the current user. It MUST NOT change the active workspace cookie automatically.
6. Switching the active workspace MUST go through the existing `switchWorkspace` Server Action in *src/lib/auth/actions.ts*. The page reuses that action so the cookie + layout revalidation behavior stays single-sourced.
7. Server Actions MUST return discriminated `{ ok: true, ... } | { ok: false, error }` results and MUST NOT throw across the boundary.
8. Renames and creates MUST `revalidatePath("/", "layout")` so the sidebar workspace switcher and the studio shell see the new state.
9. The page MUST NOT touch any other workspace data (Collections, Themes, brands, components, AI, etc.).

## Data
- `workspaces` (`id`, `organization_id`, `name`, `slug`, …) — primary table.
- `workspace_memberships` — created for the workspace owner during `createWorkspace`.
- `organization_members` — read indirectly through `listWorkspaceSwitcherOptions` to source workspaces visible via the user's organization role.
- No new tables, no migration — v1 reuses the schema already shipped for [`cloud-workspace-auth.md`](./cloud-workspace-auth.md).

## UI
- Uses the existing UI primitives: `Button`, `Input`, `Badge`, `Empty`, `ScrollArea`, `Select`.
- Inline rename uses an `Input` with Enter to commit and Escape to cancel, mirroring the `/themes` inline-create pattern.
- Create-workspace flow is an inline input in the sidebar (no dialog).
- Active workspace row is marked with a "Active" `Badge`.

## Out of scope (v1)
- Inviting members, member management, role changes.
- Deleting a workspace (requires owner-only flow + cascade messaging; deferred).
- Choosing the target organization for `createWorkspace` (always uses the active org).
- Avatar/icon, color, or description fields on workspaces.
- Cross-organization moves.
- Audit-log surfacing on the page itself (audit events are still emitted server-side via the existing infrastructure when wired in later).

## Open questions
- Should rename also offer a manual slug override, or is name-derived slug enough? Current decision: name-derived only.
- Should switching the active workspace from `/workspaces` redirect to `/` (Tokens) or stay on `/workspaces`? Current decision: stay on `/workspaces` and let the user navigate.
