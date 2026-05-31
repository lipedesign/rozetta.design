# Feature: Component Registry

## Status
implemented

## Purpose

The Component Registry is Rozetta's metadata-first source of truth for DS components. It connects component names, categories, props, variants, states, token references, Figma bindings, and code bindings without owning component implementation code.

## User stories
- As a design-system maintainer, I can catalog components and their variants, props, states, and token references.
- As a developer, I can record manual links from registry entries to Figma nodes and code exports.

## Behavior

1. `/components` lists every versioned component from `.rozetta/components.json`.
2. Users can create, edit, duplicate, delete, search, and filter components.
3. A component stores `id`, `name`, `slug`, `description`, `category`, `status`, `tokenRefs`, `variants`, `props`, `states`, `bindings.code`, `bindings.figma`, compatibility `brandIds`, and `updatedAt`.
4. Code bindings are manual source paths/export names in v1.
5. Figma bindings are manual file/node/component metadata in v1.
6. Token refs use `setId:path` so validation can check loaded Collections.
7. Missing token refs and incomplete bindings are surfaced by workspace validation. Brand scopes are retained in data for compatibility but hidden while Brands is paused.

## Data
- Types: `DesignSystemComponent`, `ComponentStatus`, `ComponentVariant`, `ComponentProp`, `ComponentState`, `ComponentCodeBinding`, `ComponentFigmaBinding`.
- Persistence: `.rozetta/components.json`.
- Pure helpers: `normalizeComponents`, `validateDesignSystem`, `diffDesignSystemRegistry`, `proposeDesignSystemPatch`.

## UI
- Route: `/components`.
- Component: *src/components/design-components/components-page.tsx*.
- Store: *src/lib/design-system/store.ts*.

## Out of scope

- Code parser integration.
- Figma API/Dev Mode ingestion.
- Storybook or visual regression integration.
- Automatic docs generation.

## Open questions
- Should future code bindings be discovered automatically from package exports? Currently no.
