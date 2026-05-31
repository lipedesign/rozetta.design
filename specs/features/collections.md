# Feature: Collections and modes

## Status
implemented

## Purpose
Collections are the canonical unit of token organization in Rozetta. They map to Figma Variable Collections. Each Collection contains one or more Modes, and each Mode owns a DTCG root. Groups are derived from token paths inside a Mode, not stored as a separate entity.

The Collections pane lets the user browse Collections, search across them, create/import new Collections, and switch Modes when a Collection has more than one Mode.

## User stories
- As a designer, I can see every Collection in the project at a glance, with token counts and dirty state.
- As a designer, I can switch between viewing one Collection and viewing all tokens from every Collection ("All collections").
- As a designer, I can switch Modes inside a Collection when multiple Modes exist.
- As a designer, I can search across every Collection by token name or path.
- As a designer, I can create a new empty Collection without leaving the pane.
- As a designer, I can discard pending changes for a single Collection via its row menu.
- As a designer, I can create a new token directly from the `+` menu, even when no Collection is selected.

## Behavior

1. The pane lists, in order:
   1. An "All collections" aggregate row (icon: layers).
   2. One row per Collection in alphabetical order, with token count and dirty dot.
   3. (When creating) an inline input for the new Collection's name.
2. Selecting a row sets `activeSetId` as a legacy store field that now points to a Collection id. Selecting "All collections" sets `activeSetId === ALL_SETS_ID` (`"*"`).
3. Selecting a Collection MUST reset `activeGroupPath` to `""` and clear `multiSelection`.
4. Search input updates `searchQuery` reactively. The `Workspace` filters `flattenTokens` by name AND path against the lowercased query.
5. The `+` button opens a dropdown with two items:
   - **Collection** — opens the inline input (focuses the field, `Enter` confirms, `Esc` cancels).
   - **Token** — calls `createToken()`. Disabled when `sets.length === 0`.
6. Confirming a new Collection name MUST call `importSet(name, {})` and select the new Collection.
7. A Collection row's right-click MUST NOT open the browser's context menu; it opens the dropdown menu instead. The menu surfaces:
   - **Discard changes** (only when dirty) — calls `discardSet(id)`.
8. Dirty indicators ([ui-patterns §7](../ui-patterns.md#7-dirty-indicators)):
   - Amber dot in front of the Collection name.
   - Amber count badge.
9. The pane is mounted only on `/`. It MUST NOT appear in `/themes`.
10. If a Collection has multiple Modes, the main workspace header shows a Mode selector. Selecting a Mode swaps the active DTCG root for that Collection without creating a separate Collection.

## Data
- Reads: `sets` (legacy store name for Collections), `originals`, `activeSetId`, `activeModeId`, `searchQuery`.
- Writes: `setSearchQuery`, `selectSet`, `selectCollectionMode`, `importSet`, `createToken`, `discardSet`.
- Persistence: indirectly via the tokens store ([architecture §6](../architecture.md#6-persistence-keys)).

## UI
- Component: *src/components/token-sets-pane.tsx* (legacy filename; UI label is Collections).
- Search bar uses `InputGroup` with a leading search icon.
- The pane sits between the primary `AppSidebar` and the `Workspace`. Width: 14rem.
- Hover/active states use `--sidebar-accent`.

## Out of scope
- Renaming an existing Collection (planned).
- Per-Collection settings (changing artifact path, deleting the Collection entirely).
- Reordering Collections manually (currently alphabetical).

## Open questions
- Should the engine auto-detect when a Collection/Mode path collides with another loaded Collection/Mode? Currently no — collisions only matter inside themes.
