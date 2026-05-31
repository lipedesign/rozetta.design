# UI patterns

Visual and interaction patterns shared across the app. Specific feature UIs reference this file instead of restating these rules.

---

## 0. Component system

New product UI MUST use the existing Shadcn/Base UI primitives in *src/components/ui/* whenever they fit.

New reusable visual primitives SHOULD be created only when existing primitives cannot express the interaction or layout clearly. If a new primitive is necessary, the implementer SHOULD call it out explicitly in implementation notes.

---

## 1. Floating sheets

Every right-side sheet (token editor, export, upload, future panes) MUST follow this pattern.

### Behavior
1. Sheet content sits 8px inset from every viewport edge.
2. Corners are rounded; the sheet has a shadow and a border so it reads as a layered surface.
3. Children are responsible for their own padding and scroll containers.
4. Clicking the overlay or pressing `Esc` MUST close the sheet.

### Implementation

```tsx
<SheetContent
  side="right"
  className={cn(
    "sm:max-w-md!",  // pick md / lg / xl / 2xl / 4xl based on content density
    "data-[side=right]:top-2 data-[side=right]:bottom-2 data-[side=right]:right-2 data-[side=right]:h-auto",
    "flex w-full flex-col gap-0 overflow-hidden rounded-xl border p-0 shadow-xl"
  )}
>
```

### Width guidance

| Sheet | Max width | Reason |
|---|---|---|
| Token editor | `sm:max-w-md` | Single-column form |
| Upload | `sm:max-w-xl` | File list + drop zone |
| Export | `sm:max-w-4xl` | Side picker + code preview |

### Reference implementations
- *src/components/tokens/token-editor-sheet.tsx*
- *src/components/tokens/export-sheet.tsx*
- *src/components/tokens/upload-sheet.tsx*

Cursor rule: `.cursor/rules/floating-sheets.mdc` (auto-applied to `src/components/**/*.tsx`).

---

## 2. Base UI quirks

The component primitives come from `@base-ui/react`, not Radix. This affects how they're composed:

### `render` instead of `asChild`
```tsx
// ❌ Radix-style — not supported here
<DropdownMenuTrigger asChild>
  <button>Open</button>
</DropdownMenuTrigger>

// ✅ Base UI style
<DropdownMenuTrigger render={<button />}>
  Open
</DropdownMenuTrigger>
```

### Controlled `open`
Prefer `open` + `onOpenChange` over `defaultOpen`. When `defaultOpen` derives from runtime state that may change, Base UI logs a "changing default open state of an uncontrolled" warning.

### `DropdownMenuLabel` requires a group
```tsx
// ✅ Always wrap labels in a group
<DropdownMenuContent>
  <DropdownMenuGroup>
    <DropdownMenuLabel>Create new</DropdownMenuLabel>
    <DropdownMenuItem>…</DropdownMenuItem>
  </DropdownMenuGroup>
</DropdownMenuContent>
```

A bare `DropdownMenuLabel` outside `DropdownMenuGroup` throws *"MenuGroupRootContext is missing"* at runtime.

### Checkbox `indeterminate`
The checkbox's `indeterminate` is a separate boolean prop, NOT a value of `checked`:
```tsx
<Checkbox checked={allChecked} indeterminate={!allChecked && someChecked} />
```

---

## 3. Drag and drop

Three places, all use the HTML5 drag API directly (no extra dep):

| Surface | File | Purpose |
|---|---|---|
| File ingest | *src/components/tokens/upload-sheet.tsx* | Drop `.tokens.json` files onto a labelled zone |
| Theme reorder | *src/components/themes/theme-set-list.tsx* | Reorder `ThemeSetRef[]` for a theme |
| Column resize | *src/components/tokens/token-table.tsx* | Pointer capture on column dividers (not DnD per se, but uses the same gesture vocabulary) |

### Conventions
- Always set `e.dataTransfer.effectAllowed = "move"` on `dragstart` for reorders, `"copy"` for ingest.
- Always call `e.preventDefault()` in `dragover` so the drop is allowed.
- Track the hover index in component state (`dragOverIndex`) and clear it on `dragend`.
- Visual feedback: highlight the drop target with a primary-tinted border.

---

## 4. Empty states

Use the `Empty` component family from *src/components/ui/empty.tsx*. Every empty state MUST include:

1. **Icon** — sized at `size-8` to `size-12` depending on container
2. **Title** — one line, ≤6 words
3. **Description** — one sentence explaining what unlocks content
4. **CTA** — primary action that creates content, when applicable

### Slots used in the app

| Where | Trigger | CTA |
|---|---|---|
| Workspace, no collection | `activeSetId === undefined` | (no CTA — the Collections pane is the entry) |
| Workspace, collection mode has no tokens | flatten returns empty | (none — user adds tokens via `+`) |
| Workspace, search miss | filter results in 0 | "Clear search" button |
| Themes list | `themes.length === 0` | "Create theme" |
| Themes editor | `activeThemeId === null` | "New theme" |
| Theme collection list | `theme.sets.length === 0` | (none — bottom panel surfaces "Add collection") |

---

## 5. Loading and async UI

- Use `LoaderCircleIcon` with `animate-spin` for inline spinners (Save button, etc.).
- Disable the trigger during the operation; do not stack multiple in-flight saves.
- For >1s operations, show a toast ("Saving…") that resolves to success/error.
- For client-only operations (`saveAll` without disk write) the toast resolves immediately.

---

## 6. Toasts

Use `sonner` (`toast.success`, `toast.error`, `toast.warning`, `toast.info`). Toasts are mounted globally by each `*Shell` via `<Toaster />`.

### Conventions
- **Title** is short (≤6 words). **Description** is optional, ≤1 sentence.
- One toast per user action. Do not loop `toast.success` over a list.
- For partial failures, prefer `toast.warning` with a description that quantifies the success/failure split (e.g. *"Saved 3 collections, 1 failed"*).
- Never log errors silently. If the user clicked something and it failed, they get a toast.

---

## 7. Dirty indicators

A Collection is "dirty" when any mode root deep-differs from its artifact baseline in `originals`.

| Surface | Indicator |
|---|---|
| `TokenSetsPane` collection row | Amber `bg-amber-500` dot in front of the name; amber count badge |
| `NavUser` (sidebar footer) | Amber dot next to the workspace name; line under the name reads `"<n> unsaved changes"` |
| `TokenEditorSheet` | (none — the sheet is for one token at a time) |

The amber color is consistent across all dirty surfaces. Saved/active uses the sidebar's primary color.

---

## 8. Keyboard

| Action | Shortcut |
|---|---|
| Toggle sidebar | `Cmd/Ctrl + B` |
| Open token editor | `Enter` or `Space` on a focused row/card |
| Confirm inline new-set name | `Enter` |
| Cancel inline new-set name | `Esc` |
| Close any sheet/dialog | `Esc` |

Tab order MUST flow logically: form fields top-to-bottom; primary action at the end.

---

## 9. Color and theming

- The app uses Tailwind v4 `@theme` tokens declared in *src/app/globals.css*.
- Surface variables: `--background`, `--muted`, `--sidebar`, `--popover`. Workspace background uses `--muted` so the floating sidebar reads as elevated.
- Hover/active uses `--sidebar-accent` (locally overridden in the floating sidebar so the see-through panel still has a visible hover state).
- Dark mode is wired via `next-themes` but UI affordances for switching are not yet exposed.

---

## 10. Iconography

- Use `lucide-react`. Default `className="size-3.5"` to `"size-4"` to match Shadcn's defaults.
- For dirty/conflict/warning states use the amber palette (`amber-500` light, `amber-400` dark).
- Destructive actions use `variant="destructive"` on the dropdown item or button. The icon and label both go red.
