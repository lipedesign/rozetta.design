# Feature: Import

## Status
implemented

## Purpose
Bring external `.tokens.json` files into the editor without round-tripping through the filesystem. Validates the file shape, lets the user choose to add as a new set or replace an existing one, then commits the result to the store.

## User stories
- As a designer, I can drag a `.tokens.json` file onto the upload sheet to import it.
- As a designer, I can pick multiple files at once and validate them all before committing.
- As a designer, I can see why a file failed validation, with the specific Zod error.
- As a designer, I can choose to replace an existing set or add the file as a new set with a different id.

## Behavior

1. The upload sheet is opened from the sidebar's **Import Tokens** action (`AppSidebar.onOpenUpload`).
2. Files can be added by:
   - Dropping onto the labelled drop zone.
   - Clicking the drop zone (opens the file picker).
   - Pasting (not yet supported, planned).
3. Each file is read as text and parsed via `parseTokenFile` from *src/lib/dtcg/schema.ts*.
4. Each file entry shows:
   - Filename
   - Status: `validating | ok | error`
   - On `ok`: token count from `flattenTokens(virtualSet).length`.
   - On `error`: the Zod error message inline.
5. For each `ok` file the user picks one of two outcomes:
   - **Add as new set** (default) — derives the set name from the filename (strip `.tokens.json`, title-case).
   - **Replace `<existing>`** — picks an existing Collection id to overwrite. The dropdown lists every loaded set.
6. On confirm, the sheet calls `importSet(name, root, options)` for each `ok` file:
   - `options.replaceId` is undefined for new sets, set otherwise.
   - The newly imported (or replaced) set is selected.
   - All imported sets are marked dirty (the user must "Save" to persist to disk).
7. The sheet closes on confirm. A `toast.success` summarizes the count.
8. Files with errors are NOT imported. The user can fix the file and drop it again.

## Data
- Reads: `useTokensStore.sets` (for the replace dropdown).
- Writes: `importSet`.
- Validation: Zod schema in *src/lib/dtcg/schema.ts*.
- No disk I/O until the user explicitly saves.

## UI
- Component: *src/components/tokens/upload-sheet.tsx*.
- Sheet pattern: floating, `sm:max-w-xl` ([ui-patterns §1](../ui-patterns.md#1-floating-sheets)).
- Drop zone visual states:
  - **Idle** — dashed border, muted text.
  - **Drag-over** — primary border tint, primary text, slight scale.
  - **With files** — file list replaces the drop zone copy; the user can still add more.
- File-row icons: `CheckIcon` (ok, emerald), `AlertCircleIcon` (error, red), `LoaderCircleIcon` (validating, animate-spin).

## Out of scope
- Importing themes (only Collections).
- Importing arbitrary formats (CSS, Style Dictionary, Figma JSON). Only DTCG.
- Overwriting on import without confirmation — the user always picks the destination.

## Open questions
- Should we surface a diff preview before replacing an existing set? Currently no.
