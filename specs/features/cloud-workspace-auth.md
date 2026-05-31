# Cloud Workspace Auth

## Status
partial

## Purpose
Make Rozetta cloud-ready by giving every authenticated user a secure workspace context: profiles, organizations, memberships, workspaces, server-side permission guards, and RLS-ready Supabase policies.

## User stories
- As a user, I can sign up and sign in with email/password, Google, or GitHub, so that my workspaces are scoped to my account.
- As a design-system maintainer, I can belong to multiple organizations and switch workspaces without leaking data between them.
- As an owner/admin, I can rely on server-side role checks before any workspace mutation.
- As a security reviewer, I can verify that secrets stay server-side and that public database access is constrained by memberships.

## Behavior
1. Product routes MUST require a Supabase session unless the app is running in local dev fallback or tests.
2. `/login`, `/signup`, `/auth/callback`, and `/auth/reset-password` MUST remain public.
3. Login and signup MUST use Supabase SSR cookies through `@supabase/ssr`; client code receives only `NEXT_PUBLIC_SUPABASE_URL` and the publishable key.
4. Email/password signup MUST validate email, password, and confirmation on the server.
5. Passwords MUST be at least 12 characters.
6. Reset password responses MUST NOT reveal whether an email exists.
7. Password reset links MUST route through `/auth/callback` to establish the recovery session before `/auth/reset-password` accepts a new password.
8. First authenticated login MUST create or update `profiles`, then create a personal organization and initial workspace if the user has no membership yet.
9. Every runtime read/write that touches workspace data MUST be scoped by `WorkspaceContext`.
10. `WorkspaceContext` MUST contain `userId`, `organizationId`, `workspaceId`, `role`, and `source`.
11. Server mutations MUST call `requireWorkspaceRole` or an equivalent guard before writing.
12. Viewers MUST NOT perform workspace writes.
13. Editors MAY mutate workspace content. Admins and owners MAY manage workspace-level settings.
14. Switching workspace MUST only accept workspaces available through organization or workspace membership.
15. Runtime DB rows for product and operational data MUST include `workspace_id`; multi-tenant rows SHOULD include `organization_id`, `created_by`, `updated_by`, `created_at`, and `updated_at` where useful.
16. RLS policies MUST be prepared for public Supabase tables and MUST target `authenticated` users.
17. RLS policies MUST check membership and MUST NOT trust `raw_user_meta_data` for authorization.
18. Drizzle privileged access MAY remain server-only in this phase, but server-side guards are still mandatory.
19. `.env.local`, DB passwords, service role keys, provider secrets, and `.rozetta/*.local.json` MUST NOT be exposed to the browser or committed.
20. In production, missing Supabase Auth env MUST fail closed instead of falling back to dev auth.
21. Audit events MUST record actor, organization, workspace, resource type, and resource id for important mutations.

## Data
- `profiles`
- `organizations`
- `organization_members`
- `workspaces`
- `workspace_memberships`
- Workspace-scoped product data: Collections, token index, themes, theme sets.
- Workspace-scoped operational data: Figma snapshots, sync runs, AI context, PR drafts, artifact exports, audit events.
- `WorkspaceRole = "owner" | "admin" | "editor" | "viewer"`.

## UI
- Sidebar top shows the active workspace selector.
- Sidebar footer shows user avatar, display name, email, plan, Settings, and Logout.
- `/settings` includes `Workspace`, `Account`, `AI Providers`, and `Integrations`.
- Login and signup use the `login-02` and `signup-02` shadcn patterns adapted to `base-luma`.

## Out of scope
- Billing, plan enforcement, MFA, SSO/SAML, organization invitations, and full member management.
- Client-side direct database reads using user-scoped Supabase clients.
- Magic link login.

## Open questions
- Should workspace-level membership override organization-level role, or only reduce it?
- When billing lands, does plan live on `profiles`, `organizations`, or both?
