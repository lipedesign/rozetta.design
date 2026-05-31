# Rozetta — Specifications

Specification-Driven Development (SDD) docs for Rozetta. **Specs are the source of truth.** Code implements specs; when they disagree, fix the code or update the spec deliberately.

## Reading order for new agents

1. [`constitution.md`](./constitution.md) — non-negotiable principles. Read first. Never violate.
2. [`architecture.md`](./architecture.md) — system shape, layers, data flow.
3. [`domain.md`](./domain.md) — DTCG type system, invariants, vocabulary.
4. [`contracts.md`](./contracts.md) — public API surface (Server Actions, store actions, exporters).
5. [`ui-patterns.md`](./ui-patterns.md) — visual + interaction patterns (floating sheets, drag, empty states).
6. [`brand.md`](./brand.md) — Rozetta's own visual identity (hero shader, register, what not to use).
7. [`features/`](./features/) — one spec per feature. Read the relevant ones for your task.

## Spec format

Every feature spec follows the same skeleton:

```
# <Feature name>

## Status
implemented | partial | planned

## Purpose
One paragraph: why this feature exists, who it's for.

## User stories
- As a <role>, I can <action>, so that <outcome>.

## Behavior
Numbered, testable statements. The contract.

## Data
Types touched, invariants enforced, persistence keys.

## UI
Components involved, copy, states (empty / loading / error / success).

## Out of scope
Explicit non-goals — things this feature deliberately does NOT do.

## Open questions
Decisions deferred. Linked to roadmap items when applicable.
```

## Conventions for spec authors

- **Behavior statements are numbered.** Each is a single, falsifiable claim. Tests should be derivable 1:1 from them.
- **Use MUST / MUST NOT / SHOULD / MAY** ([RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119)) for normative language.
- **Code identifiers in `backticks`.** File paths in *italics*: `src/lib/stores/tokens-store.ts` → *src/lib/stores/tokens-store.ts*.
- **Cross-references** use relative links: `[constitution §3](../constitution.md#3-...)`.
- **Status changes** require updating both the feature spec and `architecture.md` if a new layer is introduced.

## When to update specs

| Trigger | What to update |
|---|---|
| Adding a new feature | New file in `features/`, link from `README.md` |
| Changing a public API | `contracts.md` first, then implementation |
| Changing a UI pattern | `ui-patterns.md` + the relevant feature spec |
| Breaking an invariant | `domain.md` + `constitution.md` if needed |
| Renaming or moving files | `architecture.md` |

## Index

### Foundations
- [Constitution](./constitution.md)
- [Architecture](./architecture.md)
- [Domain model](./domain.md)
- [Contracts (API surface)](./contracts.md)
- [UI patterns](./ui-patterns.md)
- [Brand](./brand.md)

### Features
- [Token editor](./features/token-editor.md)
- [Collections and modes](./features/collections.md)
- [Themes](./features/themes.md)
- [Import](./features/import.md)
- [Export](./features/export.md)
- [Export profiles](./features/export-profiles.md)
- [Figma Sync](./features/figma-sync.md)
- [Rozetta Bridge plugin](./features/figma-plugin-bridge.md)
- [Figma Writeback Bridge](./features/figma-writeback.md)
- [GitHub Bridge](./features/github-bridge.md)
- [MCP & AI Panel](./features/mcp-ai.md)
- [AI OS](./features/ai-os.md)
- [Desktop Local AI](./features/desktop-local-ai.md)
- [Local Agent Bridge](./features/local-agent-bridge.md)
- [Connector Hub](./features/connector-hub.md)
- [Design System OS](./features/design-system-os.md)
- [Brands](./features/brands.md)
- [Component Registry](./features/component-registry.md)
- [Workspace health](./features/workspace-health.md)
- [Branches & semantic diff](./features/branches.md)
- [Release drafts](./features/releases.md)
- [Save & discard](./features/save-discard.md)
- [Cloud workspace auth](./features/cloud-workspace-auth.md)
- [Multi-selection](./features/multi-selection.md)
