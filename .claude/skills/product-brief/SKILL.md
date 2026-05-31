---
name: product-brief
description: Turn a raw idea into a scoped PRD for Rozetta, grounded in the competitive research and the product's wedge (AI-first governance for design tokens). Use when an idea needs framing before it becomes a feature spec or GitHub issue.
---

# product-brief — idea → PRD

Frame a raw idea into a decision-ready brief before it becomes a `specs/features/<slug>.md` (use the `spec-feature` skill for that) or a GitHub issue (`/issues:create`).

## Ground the brief in research

Read the relevant files in `.docs/research/` before writing — especially:
- `competitive-landscape-ai-first-design-system-tools.md` (who we compete with and the wedge),
- `competitive-community-pain-signals.md` and the `reddit-*` / `tokens-studio-*` signal docs (real user pain).

Rozetta's wedge is **AI-first governance for tokens and exports**: AI review gate, projection health (anti-drift), AI context pack, DTCG canonical workspace, reviewable Figma/Git publishing — NOT "another token sync" and NOT prompt-to-app. Keep the brief inside that wedge.

## Brief structure

```markdown
# Brief: <idea>

## Problem / pain
<who hurts, evidence from .docs/research with citations>

## Why now / wedge fit
<how it advances AI-first governance; what competitor gap it exploits>

## Proposed solution (shape, not spec)
<the smallest thing that delivers the value>

## Success metric
<measurable signal it worked>

## Risks / out of scope
<incl. what we deliberately don't build — e.g. Components/Brands paused>

## Next step
<feature spec via spec-feature, or issue via /issues:create>
```

## Done

Hand the brief to `product-manager` to formalize into a spec, or open an issue. Keep it short — a brief is a decision aid, not a spec.
