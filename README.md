# Rozetta.design

> **The open-source Design System OS.** One canonical source — translated into Figma, tokens, and code, and kept in sync.

Like the Rosetta Stone carried the same decree in three scripts so the undecipherable could finally be read, **Rozetta** keeps one source of truth and projects it into every language your design system speaks — Figma, DTCG tokens, code, and docs — so design and code never drift out of sync.

A Supabase-backed, Git-native design-system workspace built with Next.js 16, React 19, Tailwind CSS v4, and Shadcn UI. Inspired by [Tokens Studio](https://tokens.studio), storing tokens in the native [DTCG / W3C Design Tokens](https://www.designtokens.org/tr/drafts/format/) format and extending them into components, releases, exports, Figma sync, and MCP-friendly workflows.

> **Specs are the source of truth.** This README is a quick-start. Engineering decisions, contracts, and feature behavior live in [`/specs`](./specs/). Agents and contributors: read [`AGENTS.md`](./AGENTS.md) first.

---

## Quick start

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Before running the product routes, connect the project to Supabase and fill `.env.local`.
Use `pnpm supabase:login`, `pnpm supabase:link`, then copy the Postgres credentials
and API keys from the Supabase project dashboard. Secrets MUST stay local. You may
either set `DATABASE_URL` directly or set `SUPABASE_DB_PASSWORD` with the host/user
fields from `.env.example`; Rozetta will build the runtime connection string. Keep
`DATABASE_MAX_CONNECTIONS=1` for local development unless you deliberately move to
a larger Supabase pool.

Auth is powered by Supabase SSR cookies. Configure:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `DATABASE_URL` or `SUPABASE_DB_PASSWORD`
- `FIGMA_BRIDGE_PAIRING_SECRET` for signing temporary Figma plugin pairing codes, or another server-only fallback secret in local development

Production fails closed when Supabase Auth env is missing. Local development may
use `ROZETTA_AUTH_MODE=dev` to keep the default workspace fallback while iterating.
Google and GitHub OAuth require provider setup in the Supabase Dashboard with
`/auth/callback` as the redirect target.

### Token files

Drop `.tokens.json` files into the `/tokens` folder. They MUST follow the DTCG format:

```json
{
  "color": {
    "brand": {
      "$type": "color",
      "$value": "#7C3AED"
    }
  }
}
```

Two example sets ship with the repo: `Default.tokens.json`, `Consumer.tokens.json`.

The editor is DB-first: the live workspace is stored in Supabase Postgres.
On Save/PR, Rozetta exports reviewed token artifacts back to `<id>.edited.tokens.json`
next to the source file, preserving originals.

Design-system registry data is Git-native under `.rozetta/`:

- `.rozetta/themes.json`
- `.rozetta/export-profiles.json`
- `.rozetta/brands.json` (compatibility only while Brands is paused)
- `.rozetta/components.json`
- `.rozetta/ai-conversations.json`
- `.rozetta/ai-patches.json`
- `.rozetta/ai-sessions.json`

Local AI provider secrets live in `.rozetta/ai-settings.local.json`, which is ignored by Git.

Supabase is the live workspace for Tokens/Themes and the operational memory for
Figma snapshots, mappings, sync runs, AI context, and GitHub PR drafts. GitHub
receives only reviewed JSON artifacts generated from that DB.

Users can belong to multiple organizations and workspaces. Runtime actions are
scoped through `WorkspaceContext`, server-side role guards, and RLS-ready policies;
the browser never receives DB passwords, service role keys, AI keys, or local
secret files.

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the Turbopack dev server |
| `pnpm build` | Production build |
| `pnpm start` | Run the production build |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run unit tests for pure workspace modules |
| `pnpm mcp` | Run the local MCP server over stdio |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply Drizzle migrations to Supabase/Postgres |
| `pnpm db:studio` | Open Drizzle Studio for Supabase/Postgres |
| `pnpm supabase:login` | Authenticate the Supabase CLI |
| `pnpm supabase:link` | Link this repo to the Supabase project |
| `pnpm supabase:status` | Show Supabase CLI project status |

---

## Where to read next

| If you want to… | Read |
|---|---|
| Understand the principles | [`specs/constitution.md`](./specs/constitution.md) |
| See the system shape | [`specs/architecture.md`](./specs/architecture.md) |
| Learn the data model | [`specs/domain.md`](./specs/domain.md) |
| Check the public API surface | [`specs/contracts.md`](./specs/contracts.md) |
| Match a UI pattern | [`specs/ui-patterns.md`](./specs/ui-patterns.md) |
| Understand a feature | [`specs/features/`](./specs/features/) |
| Contribute as an AI agent | [`AGENTS.md`](./AGENTS.md) |

---

## Features (high-level)

- **Token editor** — table & grid views, inline editing, alias resolution
- **Collections + Modes** — Figma-aligned token collections, per-collection modes, search across all collections, dirty tracking
- **Themes** — compose collections/modes with last-wins merge, drag-to-reorder, conflict visualization
- **Brands** — paused white-label package foundation kept for compatibility, hidden from the active product UI
- **Components** — metadata-first registry for variants, props, states, token refs, Figma bindings, and code bindings
- **AI Assistant** — persisted local chat, friendly prompt shortcuts, deterministic fallback, and reviewable suggestions
- **Studio Settings** — local BYOK provider/model/API key configuration
- **Connector Hub** — agnostic sync surface for Figma connector details, DTCG files, code, and future design tools
- **Workspace health** — validation dashboard for aliases, themes, components, values, dirty collections, and Git status
- **Branches** — read-only Git status plus semantic token and registry diff against `HEAD`
- **Releases** — editable design-system release-note drafts and artifact previews
- **Export profiles** — Git-versioned presets with real preview/download
- **Figma connector** — plugin bridge, Supabase snapshots/mappings, semantic diff before apply, nested under Sync Hub
- **AI Panel + MCP** — quick AI entry, assistant link, and a local MCP stdio server
- **Supabase Auth + workspaces** — email/password, Google/GitHub OAuth, workspace selector, server guards, and RLS-ready schema
- **Import** — drag-and-drop `.tokens.json` with Zod validation
- **Export** — CSS variables, Tailwind config, flat JSON
- **Save / discard** — DB-first drafts with explicit export to Git-native files

For per-feature behavior, see [`specs/features/`](./specs/features/).

---

## Tech stack

Next.js 16.2.5 · React 19.2.4 · Tailwind CSS v4 · Shadcn UI on Base UI · Zustand · Zod · Sonner · Culori · cmdk · Lucide/Hugeicons · Drizzle ORM · Supabase/Postgres · MCP TypeScript SDK.

---

## Roadmap

- [x] Workspace health dashboard
- [x] Git integration (read-only status + semantic diff)
- [x] Release drafts
- [x] Export profiles
- [x] Figma plugin bridge (local snapshot DB + file payload v1)
- [x] MCP server + AI panel (safe proposal v1)
- [x] Component registry foundation
- [ ] Reactivate white-label Brand packages
- [x] AI Assistant, Studio Settings, and reviewable suggestions
- [x] Connector Hub foundation
- [x] GitHub PR drafts for reviewed artifacts
- [x] DB-first live workspace for Tokens and Themes
- [x] Supabase Auth and multi-workspace foundation
- [ ] Full Git write actions (branch switcher, commit/push)
- [ ] Schema Marketplace
- [ ] Member management, billing, MFA, and SSO
- [ ] `mode === "source"` differentiated semantics
- [ ] Per-set settings (rename, change filename, delete)
- [ ] Edit history tab in the token editor sheet
- [ ] Range-select via shift-click in tables
