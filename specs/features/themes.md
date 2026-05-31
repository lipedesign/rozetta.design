# Feature: Themes

## Status
implemented — Theme Groups CRUD + Themes CRUD + per-Theme Collection/Mode composition editor + Conflicts panel are all live. Drag-to-reorder and ExportSheet "Theme" tab are not yet shipped.

## Purpose
Themes mirror the [Tokens Studio](https://docs.tokens.studio/themes/) model: a workspace owns N **Theme Groups**, each Theme Group owns N **Themes**, and each Theme picks which Collection+Mode of the workspace participates in that configuration. Theme Groups stay empty by default — they are exclusively user-authored.

```
Workspace
  └─ Theme Groups (N, empty by default)
       └─ Themes (N)
            └─ Collection / Mode references (composition)
```

Tokens themselves live in Collections (page `/`); Themes never own tokens directly. Themes are a *projection* layer that says "for this scenario, use these Collections at these Modes". Examples: a `Brand` group with `Acme / Globex`, a `Surface` group with `Light / Dark / High contrast`, a `Density` group with `Comfortable / Compact`.

Previous iterations of this spec described two other models that were tried and discarded:
1. *Composition of Collections via drag-to-reorder* — close but missing the Group layer; users couldn't express "pick one of N alternatives" cleanly.
2. *Singular workspace Theme that auto-included every Collection* — wrong: it duplicated `/`'s token table and removed user agency.

The current spec status is `planned` because the data model (Theme Groups), CRUD Server Actions, and editor UI are not yet implemented. The `/themes` page renders the canonical empty state until they ship.

## User stories
- As a designer, I can create a Theme Group named "Brand" and add Themes `Acme`, `Globex` inside it.
- As a designer, I can create a Theme Group named "Surface" and add `Light`, `Dark` inside it.
- As a designer, each Theme picks which Mode of each Collection is active for that scenario.
- As a designer, I can export a Theme directly — it produces a single merged token artifact covering its chosen Mode selections.
- As a developer, I can read which Theme is active in code via the workspace state and resolve aliases at build time.

## Layout
The `/themes` page mirrors the Tokens page structure:

- **Left pane** (`ThemeGroupsPane`, *src/components/themes/theme-groups-pane.tsx*): `w-60` aside with "THEME GROUPS" label + `+` dropdown menu (creates Theme Group or Theme). Each Theme Group row is a collapsible chevron + name + theme-count badge + hover affordances (add theme, delete group). Expanded groups list their Themes indented; each Theme row selects on click and hovers to reveal delete. Inline create input (Enter/Escape) inside the parent group, matching `TokenSetsPane`'s create pattern.
- **Right pane** (`ThemeWorkspace`, *src/components/themes/theme-workspace.tsx*): sticky breadcrumb header (`Theme Groups / <Group> / <Theme>`), then content. Three content states: empty (nothing selected), Theme Group overview (lists Themes), and Theme editor.

## Behavior

1. The Figma Bridge MUST NOT auto-populate Theme Groups or Themes. Theme Groups are user-authored only.
2. Tokens (Collections + Modes) MUST live on `/` and MUST NOT be mirrored into `/themes`.
3. Creating a Theme Group MUST happen inline at the bottom of the sidebar list. Creating a Theme MUST happen inline inside its parent group.
4. Deleting a Theme Group MUST require explicit confirm and MUST cascade-delete every Theme inside.
5. Selecting a Theme Group (without a Theme) shows the group overview with a list of Themes inside.
6. Selecting a Theme shows the Theme editor on the right.
7. The Theme editor MUST surface: theme name (editable), description (editable), and a per-Collection Mode picker that lists every workspace Collection.
8. The per-Collection Mode picker MUST default to "Excluded". Changing the dropdown MUST persist immediately via `saveThemeDraft`.
9. The Theme editor MUST surface a "Conflicts" sub-panel when overlapping token paths between selected Collections resolve differently than the user might expect; each conflict MUST highlight the winner (last-wins by ref order).

## Planned (not yet shipped)

10. Themes MUST be exportable from `ExportSheet` alongside Collections, producing a merged token artifact at the chosen Modes. *Done for the persistent `/exports` page (see [`export-profiles.md`](./export-profiles.md#theme-as-source)); the right-side `ExportSheet` "Theme" tab is still pending.*
11. Theme Groups and Themes MUST be reorderable inside their parent via drag-to-reorder.
12. The Theme Bridge to Figma — propagating a selected Theme as the "active mode" of each Figma Collection during writeback — is open and tracked in `figma-writeback.md`.
7. Persistence:
   - The Theme lives operationally in Supabase/Postgres. The DB MAY hold legacy multi-theme rows for older workspaces, but the active read path MUST collapse to the single canonical workspace Theme.
   - `.rozetta/themes.json` is a Git-native artifact generated on Save/PR; it stores the workspace Theme (single object inside an array for backward compatibility with current exporters).
   - `rozetta-themes-v1` is legacy migration input only.
   - Hydration is triggered by the persistent `(studio)` layout once per session.

## Data
- Types: `Theme`, `ThemeSetRef`, `ThemeSetMode` ([domain §7](../domain.md#7-theme-semantics)).
- Resolver: `resolveTheme(theme, allSets)` — see [contracts §8](../contracts.md#8-theme-resolver).
- Conflict detection: any path written by 2+ enabled Collection/Mode refs during the merge.

## UI
- Components:
  - *src/components/themes/themes-shell.tsx*
  - *src/components/themes/themes-page.tsx*
  - *src/components/themes/theme-set-list.tsx*
  - *src/components/themes/theme-create-dialog.tsx*
- Empty states:
  - No themes: "No themes yet" + CTA "Create theme".
  - No active theme: "No theme selected" + CTA "New theme".
  - Empty Collection list: "No collections yet — add one below" + the bottom add-collection panel.

## Out of scope
- `mode === "source"` differentiated semantics (currently behaves like `enabled`).
- Per-theme overrides (editing a token "only in this theme" — would require breaking the "themes are pure composition" model).
- Importing/exporting theme definitions to JSON (only token output is exportable, not the theme metadata).

## Open questions
- Should a theme show a warning when it references a Collection id that no longer exists? Currently the resolver silently skips.
- Should aliases that cross Collection boundaries be resolved before or after merging? Currently after — `resolveTheme` produces the merged Collection, and exporters call `resolveToken` against that virtual Collection.
