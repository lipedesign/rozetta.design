# Contributing to Rozetta.design

Thanks for your interest in **Rozetta.design** — the open-source Design System OS. The project is licensed under **AGPL-3.0** (see [`LICENSE`](./LICENSE)).

## Specs are the source of truth

Rozetta follows **Specification-Driven Development (SDD)**. Before writing code, read [`AGENTS.md`](./AGENTS.md) and the relevant specs in [`/specs`](./specs/) in this order: `constitution.md` → `architecture.md` → `domain.md` → `contracts.md` → the feature spec → `ui-patterns.md`. If no spec covers your change, write the spec first.

## Git Flow

- **`main`** — stable / released; protected, updated only by promoting `develop`.
- **`develop`** — integration branch; all work targets it.
- Branch off **`develop`**: `<type>/<slug>` (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`).
- Use **Conventional Commits** (`feat(scope): summary`).
- Write everything that lands on GitHub (commits, PR titles/bodies, comments) in **English**.
- Open the PR against **`develop`** with `Closes #<issue>` in the body. Merges are human-gated.

See [`.claude/rules/git-workflow.md`](./.claude/rules/git-workflow.md) for the full conventions.

## Before opening a PR

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
```

All three must pass. Update the feature spec's `Status`, and update `specs/contracts.md` if you changed an exported signature.

## Review

Every PR to `develop` (and `main`) gets an automated review from **Claude Code Review**. You can also mention `@claude` in a comment for help (trusted authors).

## Labels

Issues use `type:` (always) + optional `area:` labels (see the issue forms). PRs follow the same convention via their title type.
