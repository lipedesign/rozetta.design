# Feature: Export

## Status
implemented

## Purpose
Generate consumable artifacts from the in-memory token state. A single sheet handles both single-set exports and theme exports, with three formats and live preview.

## User stories
- As a designer, I can pick a Collection and copy it as CSS variables.
- As a developer, I can pick a theme and export it as a Tailwind config block.
- As a designer-in-Figma, I can pick any format and download a flat JSON for round-tripping.
- As a designer, I can flip between formats and see the preview update instantly.

## Behavior

1. The export sheet is opened from the sidebar's **Quick Export** action.
2. The left rail of the sheet has two tabs: **Set** and **Theme**.
3. **Set tab**:
   - Lists every loaded set in alphabetical order.
   - Selecting a set updates the preview.
4. **Theme tab**:
   - Lists every theme in `useThemesStore.themes`.
   - Each row shows name + count of enabled sets.
   - Selecting a theme calls `resolveTheme(theme, sets)` and uses `result.merged` as the source for the exporter.
5. Format picker (top toolbar):
   - **CSS variables** — `:root { --color-bg-primary: #fff; }`
   - **Tailwind config** — `module.exports = { theme: { extend: { … } } }`
   - **JSON flat** — `{ "color.bg.primary": "#fff" }`
6. The preview pane shows the generated artifact in a monospaced block. Output is computed via `runExport(format, set, sets)`. For theme exports, `sets` MUST include the virtual merged theme set first so aliases inside the merged tree can resolve against it.
7. Toolbar actions:
   - **Copy** — copies preview text via `navigator.clipboard.writeText`. Surfaces a toast.
   - **Download** — downloads the preview text as `<filename>` derived from `format.filename(set.name)`.
8. Filename naming conventions:
   - CSS: `<slug>.css`
   - Tailwind: `tailwind.<slug>.config.js`
   - JSON flat: `<slug>.flat.json`
9. The sheet preserves the user's last picks across opens (set, theme, format).
10. Resolution behavior in exporters:
    - All aliases are resolved transitively before formatting.
    - Tokens whose aliases fail to resolve (cycle / not-found / invalid) are dropped silently from the output.
    - Output is sorted by path for determinism.

## Data
- Reads: `sets`, `themes`.
- Format: `runExport(format, set, sets)` from *src/lib/exporters/index.ts*.
- Theme exports pass `[mergedThemeSet, ...loadedSets]` as the resolver scope.
- Theme merge: `resolveTheme(theme, sets)` from *src/lib/themes/resolver.ts*.

## UI
- Component: *src/components/tokens/export-sheet.tsx*.
- Sheet pattern: floating, `sm:max-w-4xl` ([ui-patterns §1](../ui-patterns.md#1-floating-sheets)).
- Format-specific affordances:
  - CSS preview is highlighted as `language-css`.
  - Tailwind preview as `language-javascript`.
  - JSON preview as `language-json`.

## Out of scope
- Exporting themes themselves (only their resolved tokens).
- Custom file naming.
- Multi-format zip download.
- Direct integration with package managers / dotfile injectors.

## Open questions
- Should the Tailwind exporter project tokens into Tailwind's standard buckets (`colors`, `spacing`, `fontFamily`, `borderRadius`) by default, falling back to a `custom` namespace for everything else? Currently yes, controlled by `TAILWIND_BUCKETS`.
- Should we expose a "skip alias resolution" toggle so consumers can post-process aliases themselves? Currently no.
