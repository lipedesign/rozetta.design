<!-- PR title in Conventional-Commit form, e.g. `feat(tokens): add alias resolution` -->

## Summary

<!-- What this changes and why, in 2-4 lines. -->

## Changes

<!-- The notable changes, grouped if the PR is large. Keep it skimmable.
- `area`: what changed
-->

## Design decisions

<!-- Optional: non-obvious choices and trade-offs, so reviewers don't have to reverse-engineer them. Delete if N/A. -->

## Test plan

<!-- Paste real results, not intentions. -->
- [ ] `pnpm exec tsc --noEmit` clean
- [ ] `pnpm lint` clean
- [ ] `pnpm test` → <!-- e.g. 182 passed -->
- [ ] <!-- manual / scenario checks, if any -->

## Out of scope

<!-- What this deliberately does NOT do (and any follow-up issues). Delete if N/A. -->

---

## Linked issue

Closes #

## Type

- [ ] feat
- [ ] fix
- [ ] refactor
- [ ] docs
- [ ] chore
- [ ] perf

## Checklist

- [ ] Targets `develop` (not `main`)
- [ ] Relevant `specs/features/*.md` `Status` updated (if behavior changed)
- [ ] `specs/contracts.md` updated (if an exported signature changed)
- [ ] No secrets / build artifacts committed

<!-- The Claude Code Review runs automatically on this PR. -->
