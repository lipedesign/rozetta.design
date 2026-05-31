# Feature: Multi-selection

## Status
implemented

## Purpose
Select multiple tokens at once for bulk operations. The MVP supports bulk delete; the same selection model is reusable for future bulk operations (move, change type, set $description prefix, etc.).

## User stories
- As a designer, I can tick multiple tokens and delete them in one action.
- As a designer, I can use a "select all" checkbox to grab everything currently visible.
- As a designer, I can clear my selection without committing any action.
- As a designer, I can see how many tokens I've selected, with a contextual toolbar offering bulk actions.

## Behavior

1. The token table has a leading checkbox column.
2. Each row's checkbox toggles the row's `${setId}::${path}` key in `multiSelection` via `toggleMultiSelection`.
3. Clicking a checkbox MUST NOT also open the editor sheet for that row (the click stops propagation).
4. The header checkbox:
   - When the visible rows are entirely unselected → renders unchecked.
   - When the visible rows are entirely selected → renders checked.
   - Otherwise → renders indeterminate.
   - Clicking it toggles the entire visible set on/off via `setMultiSelection` / `clearMultiSelection`.
5. When `multiSelection.size > 0`, the workspace toolbar swaps from "title + view tabs" to a "selection toolbar":
   - `<n> selected`
   - **Clear** — `clearMultiSelection`.
   - **Delete** — `deleteSelected`. Surfaces a toast with the deleted count.
6. Selecting another set or group MUST clear `multiSelection` (the selection is scoped to the current view).
7. Bulk delete uses the serializer for each selected path; a single set tree is rebuilt at most once even when many tokens belong to it.
8. After bulk delete:
   - `multiSelection` is emptied.
   - `selectedToken` is cleared if it was inside the deleted set of paths.

## Data
- State: `multiSelection: Set<SelectionKey>` where `SelectionKey = \`${setId}::${path}\``.
- Helpers: `toSelectionKey`, `fromSelectionKey`.
- Action: `deleteSelected()` — uses `deleteTokenAtPath` per token, grouped by setId.

## UI
- Components:
  - *src/components/tokens/token-table.tsx* — checkbox column, header checkbox.
  - *src/components/workspace.tsx* — selection toolbar.
- Header checkbox uses the `indeterminate` prop ([ui-patterns §2](../ui-patterns.md#base-ui-quirks)).

## Out of scope
- Range select (shift-click to select a range). Planned.
- Bulk edit of $type, $value, $description.
- Multi-select across set boundaries when in single-set mode (currently only "All tokens" view shows tokens from multiple sets, so cross-set selection is implicit there).

## Open questions
- Should bulk delete prompt for confirmation when n > 5? Currently no — undo via "Discard changes" is the safety net.
