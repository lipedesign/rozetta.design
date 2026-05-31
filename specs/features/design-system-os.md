# Feature: Design System OS

## Status
partial

## Purpose

Rozetta evolves from a token editor into a local-first Design System OS: tokens, themes, component metadata, release notes, connector mappings, code bindings, and AI-first proposals live in one Git-native workspace. Brand packages remain compatible but are paused as an active UI feature.

## User stories
- As a design-system maintainer, I can manage tokens, themes, and component metadata in one Git-native workspace.
- As an AI/MCP user, I can ask for proposals, inspect patch previews, and apply only reviewed changes.

## Behavior

1. Collections remain the atomic source for DTCG token data.
2. Themes compose Collections into exportable token packages.
3. Brands are a paused future white-label unit. Existing `.rozetta/brands.json` data remains compatible, but `/brands` is hidden and non-authoring.
4. Components are metadata-first registry entries owned by Rozetta. They can reference tokens, Figma nodes, and code paths.
5. AI/MCP can propose DS changes, but cannot apply them automatically.
6. `/ai` is the primary AI-first assistant surface for DS diagnosis, proposals, and reviewed suggestions.
7. `/settings` manages local provider settings for AI.
8. `/sync` is the connector surface for Figma, DTCG files, code, and future design tools.

## Data

- `.rozetta/themes.json` stores `Theme[]`.
- `.rozetta/brands.json` stores `Brand[]`.
- `.rozetta/components.json` stores `DesignSystemComponent[]`.
- `.rozetta/ai-patches.json` stores reviewable AI proposals.
- `.rozetta/ai-sessions.json` stores summarized AI task history.
- `.rozetta/ai-settings.local.json` stores local provider settings and MUST be ignored by Git.
- Legacy `rozetta-themes-v1` is read only as a migration source when the versioned themes file is missing.

## UI
- `/brands` shows a paused placeholder and is hidden from the primary sidebar.
- `/components` manages component registry metadata.
- `/ai` manages assistant prompts, context selection, review suggestions, and summarized activity.
- `/settings` manages Studio Settings, starting with AI providers.
- `/sync` shows connector readiness.
- `/dashboard`, `/branches`, and `/releases` include design-system registry data.

## Out of scope

- Cloud sync, members, approvals, and permissions.
- Automatic Figma API sync.
- Automatic code scanning or component codegen.
- AI-written changes applied without user review.

## Open questions
- What white-label package workflow should re-enable Brands?
