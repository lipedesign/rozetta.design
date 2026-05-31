---
name: spec-feature
description: Scaffold or maintain an SDD feature spec for Rozetta under specs/features/<slug>.md, including the status lifecycle (planned → partial → implemented) and reminders to keep contracts.md / architecture.md in sync. Use when starting a new feature, formalizing an idea into a spec, or transitioning a feature's status.
---

# spec-feature — write/maintain an SDD feature spec

Specs in `/specs` are the **source of truth**; code implements them. This skill keeps `specs/features/<slug>.md` correct and consistent with the rest of the SDD.

## Steps

1. **Locate or create.** Find an existing `specs/features/<slug>.md`. If none covers the work, create one with `Status: planned`.
2. **Read the frame first**: `specs/constitution.md`, `specs/architecture.md`, `specs/domain.md`, `specs/contracts.md`, `specs/ui-patterns.md` (for UI). Match an existing feature spec's structure — don't invent a new format.
3. **Fill the template** (below).
4. **Sync the surface**: if the feature changes an exported signature, update `specs/contracts.md` in the same change. If it adds/moves a layer, update `specs/architecture.md`. If it changes an invariant, update `specs/domain.md` (and `constitution.md` if a principle shifts).
5. **Status lifecycle**: `planned` (spec only) → `partial` (some behavior implemented) → `implemented` (matches spec, tests green). Update the `Status:` line as work lands.

## Template

```markdown
# <Feature name>

Status: planned | partial | implemented

## User story
As a <role>, I want <capability> so that <outcome>.

## Scope
<in / out of scope>

## Behavior
<the canonical behavior; reference contracts.md signatures>

## Acceptance criteria
- [ ] <measurable, testable>

## Edge cases & failure states
- <…>

## Contracts touched
- <signature in contracts.md> — <how it changes>

## Invariants
- <domain.md I-N> — preserved by <…>
```

## Done

Confirm `Status` is accurate, `contracts.md` is in sync, and hand off to engineering with the spec path.
