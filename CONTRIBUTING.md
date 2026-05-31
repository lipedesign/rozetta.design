# Contributing to Rozetta.design

Thanks for your interest in **Rozetta.design** — the open-source Design System OS. This project is licensed under **AGPL-3.0** (see [`LICENSE`](./LICENSE)).

## Specs are the source of truth

Rozetta follows **Specification-Driven Development**. Before writing code, read [`AGENTS.md`](./AGENTS.md) and the relevant specs in [`/specs`](./specs/) in this order: `constitution.md` → `architecture.md` → `domain.md` → `contracts.md` → the feature spec → `ui-patterns.md`. If no spec covers your change, write the spec first.

## Workflow

- Branch off `main`: `<type>/<slug>` (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`).
- Use **Conventional Commits** (`feat(scope): summary`).
- Write everything that lands on GitHub (commits, PR titles/bodies, comments) in **English**.
- Open the PR against `main`. Merges are human-gated.

See [`.claude/rules/git-workflow.md`](./.claude/rules/git-workflow.md) for the full conventions.

## Before opening a PR

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
```

All three must pass. Update the feature spec's `Status`, and update `specs/contracts.md` if you changed an exported signature.

## Review

Every PR gets an automated review from Claude (see [`.github/workflows/claude-code-review.yml`](./.github/workflows/claude-code-review.yml)). You can also mention `@claude` in a comment for help.
