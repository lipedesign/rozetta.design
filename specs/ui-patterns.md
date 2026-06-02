# UI patterns

Visual and interaction patterns shared across the app. Specific feature UIs reference this file instead of restating these rules.

> **v2.** This codifies the **existing** Rozetta visual — the rebuild reproduces it, it is not a redesign. Naming is v2-canonical; the a11y, confirmation, and selector rules that were implicit in v1 are made explicit here (§7, §11). See [§ What changed from v1](#what-changed-from-v1).

---

## 0. Component system

New product UI MUST use the existing Base UI / Shadcn primitives in `src/components/ui/*` whenever they fit.

New reusable visual primitives SHOULD be created only when existing primitives cannot express the interaction or layout clearly. If a new primitive is necessary, the implementer SHOULD call it out explicitly in implementation notes.

---

## 1. Floating sheets

Every right-side sheet (token editor, export, upload, AI panel, future panes) MUST follow this pattern.

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

---

## 2. Base UI quirks

The component primitives come from `@base-ui/react`, not Radix. This affects how they're composed:

### `render` instead of `asChild`
```tsx
// ❌ Radix-style — not supported here
<DropdownMenuTrigger asChild><button>Open</button></DropdownMenuTrigger>

// ✅ Base UI style
<DropdownMenuTrigger render={<button />}>Open</DropdownMenuTrigger>
```

### Controlled `open`
Prefer `open` + `onOpenChange` over `defaultOpen`. When `defaultOpen` derives from runtime state that may change, Base UI logs a *"changing default open state of an uncontrolled"* warning.

### `DropdownMenuLabel` requires a group
A bare `DropdownMenuLabel` outside `DropdownMenuGroup` throws *"MenuGroupRootContext is missing"* at runtime. Always wrap labels in `<DropdownMenuGroup>`.

### Checkbox `indeterminate`
`indeterminate` is a separate boolean prop, NOT a value of `checked`:
```tsx
<Checkbox checked={allChecked} indeterminate={!allChecked && someChecked} />
```

---

## 3. Drag and drop

Three surfaces, all using the HTML5 drag API directly (no extra dep): file ingest (upload sheet), theme reorder (`ThemeSetRef[]`), and column resize (pointer capture on token-table dividers — same gesture vocabulary).

### Conventions
- Set `e.dataTransfer.effectAllowed = "move"` on `dragstart` for reorders, `"copy"` for ingest.
- Call `e.preventDefault()` in `dragover` so the drop is allowed.
- Track the hover index in component state (`dragOverIndex`) and clear it on `dragend`.
- Visual feedback: highlight the drop target with a primary-tinted border.

---

## 4. Empty states

Use the `Empty` component family from `src/components/ui/empty.tsx`. Every empty state MUST include: an **icon** (`size-8`–`size-12`), a **title** (one line, ≤6 words), a **description** (one sentence on what unlocks content), and a **CTA** (the primary content-creating action, when applicable).

| Where | Trigger | CTA |
|---|---|---|
| Workspace, no collection | `activeCollectionId === undefined` | (none — the Collections pane is the entry) |
| Workspace, mode has no tokens | flatten returns empty | (none — user adds via `+`) |
| Workspace, search miss | filter results in 0 | "Clear search" |
| Themes list | `themes.length === 0` | "Create theme" |
| Themes editor | `activeThemeId === null` | "New theme" |
| Theme collection list | `theme.sets.length === 0` | (none — bottom panel surfaces "Add collection") |

---

## 5. Loading and async UI

- Use `LoaderCircleIcon` with `animate-spin` for inline spinners (Save button, etc.).
- Disable the trigger during the operation; do not stack multiple in-flight saves.
- For >1s operations, show a toast (*"Saving…"*) that resolves to success/error.
- Client-only operations resolve the toast immediately.

---

## 6. Toasts

Use `sonner` (`toast.success/error/warning/info`). Toasts are mounted globally by the shell via `<Toaster />`.

- **Title** ≤6 words; **description** optional, ≤1 sentence.
- One toast per user action — do not loop `toast.success` over a list.
- Partial failures use `toast.warning` quantifying the split (*"Saved 3 collections, 1 failed"*).
- **Never swallow errors silently.** If the user clicked something and it failed, they get a toast.

---

## 7. Dirty indicators

A Collection is "dirty" when any mode root deep-differs from its artifact baseline.

| Surface | Indicator |
|---|---|
| Collections pane row | Amber `bg-amber-500` dot before the name; amber count badge |
| Sidebar footer (workspace) | Amber dot next to the workspace name; subline *"`<n>` unsaved changes"* |
| Token editor sheet | (none — one token at a time) |

The amber color is consistent across all dirty surfaces; saved/active uses the sidebar primary color. **Dirty state is computed once in the tokens store and read via a selector** — components MUST NOT re-derive it inline (constitution §5).

---

## 8. Keyboard

| Action | Shortcut |
|---|---|
| Toggle sidebar | `Cmd/Ctrl + B` |
| Open token editor | `Enter` / `Space` on a focused row/card |
| Confirm inline new-collection name | `Enter` |
| Cancel inline new-collection name | `Esc` |
| Close any sheet/dialog | `Esc` |

Tab order MUST flow logically: form fields top-to-bottom; primary action at the end.

---

## 9. Color and theming

- Tailwind v4 `@theme` tokens declared in `src/app/globals.css`.
- Surface variables: `--background`, `--muted`, `--sidebar`, `--popover`. The workspace background uses `--muted` so the floating sidebar reads as elevated.
- Hover/active uses `--sidebar-accent` (locally overridden in the floating sidebar so the see-through panel still has a visible hover state).
- Dark mode is wired via `next-themes`; the switch affordance is not yet exposed.

---

## 10. Iconography

- Use `lucide-react`. Default `className="size-3.5"`–`"size-4"` to match Shadcn defaults.
- Dirty/conflict/warning states use the amber palette (`amber-500` light, `amber-400` dark).
- Destructive actions use `variant="destructive"` on the dropdown item or button — icon and label both go red.

---

## 11. Accessibility & confirmations

These were implicit/partial in v1; in v2 they are MUST-level rules every rebuilt surface meets.

- **Icon-only buttons MUST carry an accessible name** (`aria-label`). A `title` tooltip is not a substitute. Every affordance is reachable and operable by keyboard.
- **Destructive confirmations use a Base UI `Dialog`**, never `window.confirm()`. The dialog has a title, a description, a `variant="destructive"` confirm, and a Cancel that closes on click, `Esc`, and overlay — reuse one shared `ConfirmDialog` rather than re-implementing per site.
- **No `ContextMenu`** (Radix-style right-click menus). Right-click affordances live behind explicit dropdown buttons, so actions are discoverable and keyboard-reachable.
- Respect focus management: opening a sheet/dialog traps focus; closing returns focus to the trigger.

---

## What changed from v1

- **New §11 Accessibility & confirmations** — `aria-label` on icon buttons, Base UI `Dialog` instead of native `confirm()`, the no-`ContextMenu` philosophy, and focus management, all made MUST-level (resolves the v1 a11y gaps).
- **§7 dirty indicators** now states the single-store-selector rule (no inline re-derivation).
- v2-canonical naming (`activeCollectionId`, "Collections pane"); dropped the dead `.cursor/rules` reference.
- Trimmed reference-implementation file paths (the rebuild reproduces the patterns, not the v1 files verbatim).
