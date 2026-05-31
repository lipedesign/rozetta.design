# Feature: Token editor

## Status
implemented

## Purpose
Inspect and edit a single token. Surfaces metadata (name, type, value, description, set membership, group), shows resolved value if the token is an alias, and lets the user move/rename the token in the same flow as editing.

## User stories
- As a designer, I can click any row in the table to open the editor, so that I can edit the token without leaving the page.
- As a designer, I can rename a token, so that I can fix typos or rebrand a path without re-creating it.
- As a designer, I can move a token to a different set or group, so that I can reorganize my taxonomy without manual JSON surgery.
- As a designer, I can see the resolved value of an alias, so that I understand what the token actually points to.
- As a designer, I can create a new token from the `+` menu and immediately edit it, so that creating tokens is a single fluid flow.

## Behavior

1. The editor is mounted globally by `*Shell` and is driven entirely by `useTokensStore.selectedToken`. It MUST NOT receive props from any consumer.
2. When `selectedToken` is defined, the sheet opens. When it's undefined, the sheet closes.
3. Closing the sheet (overlay click, `Esc`, or the close button) MUST call `clearSelectedToken`.
4. The form fields are seeded from the token's current state every time `selectedToken` changes:
   - Token name (last segment of `path`)
   - Token type (`$type`, defaults to `"string"`)
   - Value (string-encoded; JSON for composite values)
   - Description (`$description`)
   - Token set (the set's id)
   - Group (parent path; empty string = root)
5. The submit button label MUST be `"Create Token"` when `selectedToken.isNew === true`, otherwise `"Update Token"`. The sheet title follows the same rule.
6. Validation rules for the name field:
   - MUST NOT be empty
   - MUST NOT contain `.`, `$`, or whitespace
   - MUST NOT collide with an existing sibling at the target group/set
7. On save:
   - If only the value/type/description changed, call `patchToken`.
   - If the name, group, or set changed, call `patchToken` first (to apply value/type/description) AND THEN `moveToken` to update the path or set.
   - On `moveToken` failure, surface the returned `error` as a `toast.error` and keep the sheet open.
   - On success, close the sheet and surface `toast.success(\`Updated ${path}\`)`.
8. The "Insights" panel MUST show, when applicable, the alias chain (path-by-path) and the resolved literal value.

## Data
- Reads: `useTokensStore.sets`, `selectedToken`, `getNodeAtPath`, `resolveToken`.
- Writes: `patchToken`, `moveToken`, `clearSelectedToken`.
- No direct disk I/O.

## UI
- Component: *src/components/tokens/token-editor-sheet.tsx*.
- Sheet pattern: floating, `sm:max-w-md` ([ui-patterns §1](../ui-patterns.md#1-floating-sheets)).
- States:
  - **Edit** — title `"Edit Token"`, submit `"Update Token"`.
  - **Create** — title `"Create Token"`, submit `"Create Token"`.
  - **History tab** — placeholder copy: *"Edit history is not tracked yet — this tab will show diffs vs. the original file once persistence ships."*

## Out of scope
- Live preview of composite values (typography, shadow) beyond the swatch.
- Edit history / time travel.
- Multi-token batch edit (use multi-selection + bulk delete instead).

## Open questions
- Should renaming auto-update aliases that reference the old path? Currently no — moves leave unresolved aliases that the resolver flags.
