---
name: sdd-check
description: Pre-PR gate for Rozetta — verify the current diff against the constitution principles, the domain.md invariants, and the contracts.md public signatures, and report violations. Use before opening a PR or finishing a feature, in addition to /code-review and /security-review.
---

# sdd-check — SDD compliance gate

Verify that a change honors the specs before it merges. This complements `/code-review` (bugs/cleanups) and `/security-review` (security) — it checks **SDD conformance**.

## Steps

1. **Get the diff**: `git diff` (working tree) or `git diff main...HEAD` for the branch.
2. **Constitution**: read `specs/constitution.md`. For each principle, confirm the diff does not violate it. Flag any violation explicitly.
3. **Invariants**: read `specs/domain.md` invariants (I-N). For every token-tree / model mutation in the diff, name the invariant it touches and confirm it's preserved. Common ones: serializer-only mutation (no direct `set.root[...]`), type guards on traversal, selection reconciliation after delete/move (I6).
4. **Contracts**: read `specs/contracts.md`. If the diff changes any exported signature listed there, confirm `contracts.md` was updated in the same change. A signature change without a spec update is a finding.
5. **Boundaries** (from `AGENTS.md`): client code must not import server-only filesystem/db/bridge modules; AI calls go through Vercel AI SDK adapters; workspace mutations call `requireWorkspaceRole`.
6. **Status**: confirm the feature spec's `Status:` reflects reality.

## Output

A short report: ✅ conformant areas, and ❌ violations as `file_path:line — principle/invariant/contract — fix`. If clean, say so plainly. Do not pass a change with an unresolved violation.
