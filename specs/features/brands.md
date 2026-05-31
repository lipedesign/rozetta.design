# Feature: Brands

## Status
paused

## Purpose

Brands are the future white-label package unit. They are currently paused in the product UI while Rozetta focuses on Collections, Modes, Components, Figma sync, and AI-assisted review.

## User stories
- As a maintainer, I can keep existing brand files compatible while the first-class workflow is paused.
- As a white-label system owner, I will later create brand packages that inherit from a base brand and add brand-specific overrides.

## Behavior

1. `/brands` renders a paused placeholder and is hidden from the primary sidebar.
2. Users cannot create, edit, duplicate, or delete brands from the product UI while the feature is paused.
3. `.rozetta/brands.json` remains readable/writable by compatibility helpers so existing workspaces do not lose data.
4. Brand contracts, normalization, validation, diff, AI patch types, and MCP aliases remain available for future reactivation and migration.
5. Dashboard, Components, and AI surfaces do not present Brands as active first-class workflow controls.

## Data
- Types: `Brand`, `BrandStatus`, `ResolvedBrandPackage`.
- Persistence: `.rozetta/brands.json` remains compatible but is not an active authoring surface.
- Pure helpers: `normalizeBrands`, `resolveBrandPackage`, `validateDesignSystem`, `diffDesignSystemRegistry`.

## UI
- Route: `/brands`.
- Component: *src/app/brands/page.tsx* paused placeholder.
- Store: *src/lib/design-system/store.ts*.

## Out of scope

- Brand authoring UI.
- Automatic brand generation from AI.
- Figma writes or code export scoped by brand.
- Brand-scoped component filtering.

## Open questions
- What should the reactivated white-label workflow include beyond base inheritance: permissions, brands as export targets, and client package release notes?
