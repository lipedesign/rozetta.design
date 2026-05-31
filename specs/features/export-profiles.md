# Feature: Export Profiles

## Status
partial — Collection and Theme sources are both wired through `/exports`. `style-dictionary` is still surfaced as `planned-format` and does not generate an artifact yet.

## Purpose
Turn repeat exports into named, Git-versioned local presets while keeping the existing export sheet available for one-off previews.

## User stories
- As a developer, I can save a preset for exporting a Collection or a Theme.
- As a design system maintainer, I can see the intended output format and destination before release work.
- As a designer, I can spot when a Theme-targeted profile has overlapping token paths before I publish.

## Behavior
1. The sidebar's **Exports** item MUST navigate to `/exports`.
2. The existing export sheet remains opened by the sidebar **Quick Export** action.
3. Export profiles are stored on disk at `.rozetta/export-profiles.json`.
4. A profile includes name, target kind, target id, format, destination, and updated timestamp.
5. Supported profile formats are `css`, `tailwind`, `json`, and `style-dictionary`.
6. Active formats (`css`, `tailwind`, `json`) generate preview/download output through `runExport`.
7. Theme profiles resolve via `resolveTheme(theme, sets)` and export with `[mergedThemeSet, ...sets]` scope.
8. `style-dictionary` is shown as `planned-format` and MUST NOT generate output yet.
9. Profiles whose set/theme target is missing are marked `missing-target`.
10. Users can create, edit, delete, preview, copy, and download profiles.
11. If the versioned file is missing and browser-local profiles exist under `rozetta-studio:export-profiles:v1`, the UI shows a migration CTA.
12. Profiles persisted before the Theme integration MAY omit `targetKind`. `normalizeExportProfiles` MUST treat any profile missing `targetKind` (while still carrying a valid `targetId`/format/destination) as a Collection target — no manual migration step is required.

### Theme as source
- The create/edit form exposes a "Source" tab between **Collection** and **Theme**. Switching tabs clears the target id so the dropdown only ever offers valid targets for the active source.
- When **Theme** is selected, the target picker lists workspace Themes grouped by their parent Theme Group (`useThemesStore.themeGroups`). Themes without a group fall into an "Ungrouped" group at the bottom.
- The preview pipeline routes Theme targets through `resolveTheme(theme, sets)`. The merged virtual Collection is prepended to the export scope (`[merged, ...remainingSets]`) so alias resolution still sees every workspace Collection.
- Saved profile rows render a `Theme: <name>` badge for Theme targets and a `Collection: <name>/<mode>` badge for Collection targets (the mode segment is omitted when the Collection has no active mode).
- When `resolveTheme` reports non-empty `conflicts`, the row also shows an amber "N conflict(s)" warning badge so users notice overlapping paths before copying/downloading. The full per-path list still lives on the `/themes` page; the exports page only surfaces the count.

## Data
- Type: `ExportProfile`.
- Persistence file: `.rozetta/export-profiles.json`.
- Migration key: `rozetta-studio:export-profiles:v1`.
- Preview helpers: `resolveExportProfileStatus`, `previewExportProfile`.

## UI
- Route: `/exports`.
- Component: *src/components/exports/exports-page.tsx*.
- Shell: *src/components/product-shell.tsx*.

## Out of scope
- Writing generated export output to disk.
- Multi-profile batch export.
- Style Dictionary config generation.
