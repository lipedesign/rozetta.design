"use client";

import * as React from "react";
import {
  CopyIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { isAliasValue } from "@/lib/dtcg/parser";
import { formatTokenValue } from "@/lib/dtcg/format";
import { resolveToken, readFigmaAlias } from "@/lib/dtcg/resolver";
import {
  toSelectionKey,
  useTokensStore,
  type SelectionKey,
} from "@/lib/stores/tokens-store";

import { ProgressiveBlur } from "@/components/ui/progressive-blur";

import { TokenSwatch } from "./token-swatch";

import type { TokenGridItem } from "./token-grid";

interface TokenTableProps {
  items: TokenGridItem[];
  /** When true (e.g. "All collections" view), the COLLECTION column is rendered. */
  showSetColumn?: boolean;
}

type ColumnId = "name" | "type" | "value" | "resolved" | "description" | "set";

const MIN_COLUMN_WIDTH = 80;
const STORAGE_KEY = "rozetta-studio:token-table:column-widths:v3";

const DEFAULT_WIDTHS: Record<ColumnId, number> = {
  name: 200,
  type: 84,
  value: 160,
  resolved: 180,
  description: 200,
  set: 100,
};

/**
 * Tokens-Studio-style dense table with resizable columns. Columns:
 *   NAME · TYPE · VALUE (raw / alias path) · RESOLVED (swatch + literal) ·
 *   DESCRIPTION · COLLECTION (optional)
 *
 * Widths are persisted to localStorage so the user's preferred layout
 * survives reloads. The Description column auto-fills the remaining space
 * when the table is wider than the sum of fixed columns.
 */
export function TokenTable({ items, showSetColumn = false }: TokenTableProps) {
  const sets = useTokensStore((s) => s.sets);
  const selectToken = useTokensStore((s) => s.selectToken);
  const multiSelection = useTokensStore((s) => s.multiSelection);
  const toggleMultiSelection = useTokensStore((s) => s.toggleMultiSelection);
  const setMultiSelection = useTokensStore((s) => s.setMultiSelection);

  const [widths, setWidths] = useColumnWidths();

  /**
   * "Select all" derived state across the *currently visible* tokens. We
   * compare the count of selected-and-visible keys against the total
   * visible item count to decide between three checkbox states:
   *   - 0 selected  → unchecked
   *   - all selected → checked
   *   - in-between  → indeterminate
   */
  const visibleKeys = React.useMemo<SelectionKey[]>(
    () => items.map((it) => toSelectionKey(it.setId, it.path)),
    [items]
  );
  const selectedVisibleCount = React.useMemo(
    () => visibleKeys.reduce((acc, k) => acc + (multiSelection.has(k) ? 1 : 0), 0),
    [visibleKeys, multiSelection]
  );
  const allChecked =
    visibleKeys.length > 0 && selectedVisibleCount === visibleKeys.length;
  const someChecked =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleKeys.length;

  const onToggleAll = (next: boolean | "indeterminate") => {
    if (next === true) {
      // Merge already-selected (e.g. selections in groups not currently visible)
      // with every visible key, so toggling on a filtered view never deselects
      // hidden rows by accident.
      const merged = new Set<SelectionKey>(multiSelection);
      for (const k of visibleKeys) merged.add(k);
      setMultiSelection(Array.from(merged));
    } else {
      // Deselect only the currently visible rows.
      const remaining = new Set<SelectionKey>(multiSelection);
      for (const k of visibleKeys) remaining.delete(k);
      setMultiSelection(Array.from(remaining));
    }
  };

  const visibleColumns: ColumnId[] = [
    "name",
    "type",
    "value",
    "resolved",
    "description",
    ...(showSetColumn ? (["set"] as const) : []),
  ];

  /**
   * +32 for the leading checkbox column, +44 for the trailing actions
   * column (`...` menu). Both are fixed-width and sit outside the
   * resizable user columns.
   */
  const totalWidth =
    visibleColumns.reduce((acc, c) => acc + widths[c], 0) + 32 + 44;

  /**
   * Outer wrapper owns BOTH scroll axes (vertical + horizontal). This is what
   * lets the <thead> stick to the top — `position: sticky` only works against
   * the nearest scrollable ancestor. The shadcn Table component normally
   * wraps its <table> in its own `overflow-x-auto` div, but since our outer
   * wrapper takes ownership of all scrolling we override that wrapper to be
   * `display: contents` via the `[&>[data-slot=table-container]]:contents`
   * selector below.
   */
  return (
    <div
      className={cn(
        "bg-background relative isolate min-h-0 min-w-0 flex-1 overflow-auto",
        // Aggressive corner clipping. Three CSS properties stack here, each
        // a fallback for the others depending on browser/GPU quirks:
        //
        //   1. `overflow:auto` + `rounded-xl` — the baseline. Works in all
        //      browsers for normal content, fails when a descendant uses
        //      `backdrop-filter` (Chromium hoists those into their own GPU
        //      paint root that can escape ancestor clipping).
        //   2. `clip-path: inset(... round)` — forces a literal pixel mask
        //      shaped to the border radius. Solves most cases.
        //   3. `contain: paint` — gives this element a self-contained paint
        //      root, so any descendant compositing layer (including
        //      `backdrop-filter`) is forced to render INTO this element's
        //      box and is then clipped by the rounded outline. This is the
        //      belt-and-suspenders fix for the Chromium-on-macOS ghost
        //      rectangle that leaked from <ProgressiveBlur>.
        "[clip-path:inset(0_round_var(--radius-xl))]",
        "contain-paint",
        // shadcn's <Table> wraps the <table> in
        // `<div data-slot="table-container" class="overflow-x-auto">`. That
        // extra div creates a competing scroll context that breaks sticky
        // positioning on the <thead> against THIS wrapper. Collapsing it to
        // `display: contents` removes its box entirely so the <table>
        // behaves as a direct child of the scroll container.
        "*:data-[slot=table-container]:contents"
      )}
    >
      {/*
        * Frosted-glass sticky band behind the <thead>.
        *
        *   1. ProgressiveBlur — backdrop-filter blur that gets stronger
        *      toward the top edge, layered under the rounded card corner.
        *   2. Linear color overlay — `--background` → transparent that adds
        *      the milky sheen so the band reads as a panel, not a lens.
        *
        * The wrapper is `h-0` so it occupies no space in the flow — its two
        * children are absolutely positioned and float over the <thead> as
        * the table content scrolls underneath. The wrapper's containing
        * block is the outer card, which already has `overflow:auto` plus a
        * `clip-path: inset(... round var(--radius-xl))` to prevent the
        * `backdrop-filter` GPU layer from leaking past the rounded corners.
        */}
      <div
        aria-hidden
        className="pointer-events-none sticky inset-x-0 top-0 z-20 h-0 w-full"
      >
        <ProgressiveBlur
          position="top"
          height="64px"
          blurLevels={[0, 1, 2, 4, 8, 16, 24]}
        />
        <div className="absolute inset-x-0 top-0 h-[64px] bg-[linear-gradient(to_bottom,var(--background)_0%,color-mix(in_oklab,var(--background)_85%,transparent)_50%,color-mix(in_oklab,var(--background)_30%,transparent)_85%,transparent_100%)]" />
      </div>
      <Table
        /**
         * Layout + subtle separators. `border-separate` lets each cell carry
         * its own hairline border (rather than a global `border-collapse`),
         * which plays nicely with sticky <thead>. The `:not(:last-child)
         * :not(:nth-last-child(2))` selector skips the last two cells —
         * the actions column and the spacer column at the very right —
         * so the right edge of the table stays clean.
         *
         * `tr:last-child td:border-b-0` removes the bottom border on the
         * final row to avoid doubling up with the card's outer border.
         */
        className={cn(
          "border-separate border-spacing-0",
          "[&_th]:px-4 [&_td]:px-4",
          "[&_td]:border-b [&_td]:border-border/50",
          // Vertical column dividers: skip the leading checkbox cell, the
          // trailing actions cell, and the very last spacer cell.
          "[&_th:not(:first-child):not(:last-child):not(:nth-last-child(2))]:border-r",
          "[&_th:not(:first-child):not(:last-child):not(:nth-last-child(2))]:border-border/50",
          "[&_td:not(:first-child):not(:last-child):not(:nth-last-child(2))]:border-r",
          "[&_td:not(:first-child):not(:last-child):not(:nth-last-child(2))]:border-border/50",
          "[&_tr:last-child_td]:border-b-0"
        )}
        style={{ minWidth: totalWidth + 1, width: "100%", tableLayout: "fixed" }}
      >
        <colgroup>
          {/* Selection checkbox column. 32px = 12px left padding + 16px
              checkbox + 4px breathing room before the next column. */}
          <col style={{ width: 32 }} />
          {visibleColumns.map((col) => (
            <col key={col} style={{ width: widths[col] }} />
          ))}
          {/* Actions column (the `...` row menu). Fixed at 44px — wide
              enough for an icon button with comfortable hit area. */}
          <col style={{ width: 44 }} />
          {/* Spacer column absorbs leftover horizontal space so the sticky
              header background and row separators always span the full width
              of the scroll container. */}
          <col />
        </colgroup>
        {/*
          * Sticky header. The frosted-glass effect comes from the sibling
          * <ProgressiveBlur> rendered above; the <thead> only carries the
          * cell content + resize handles, so its <th>s use a transparent
          * background to let the blur layer show through.
          */}
        <TableHeader className="sticky top-0 z-30 [&_th]:bg-transparent">
          <TableRow className="hover:bg-transparent">
            <TableHead
              className="pl-3! pr-0!"
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={allChecked}
                indeterminate={!allChecked && someChecked}
                onCheckedChange={onToggleAll}
                aria-label={
                  allChecked ? "Deselect all visible tokens" : "Select all visible tokens"
                }
              />
            </TableHead>
            <ResizableHead
              column="name"
              widths={widths}
              setWidths={setWidths}
            >
              Name
            </ResizableHead>
            <ResizableHead
              column="type"
              widths={widths}
              setWidths={setWidths}
            >
              Type
            </ResizableHead>
            <ResizableHead
              column="value"
              widths={widths}
              setWidths={setWidths}
            >
              Value
            </ResizableHead>
            <ResizableHead
              column="resolved"
              widths={widths}
              setWidths={setWidths}
            >
              Resolved
            </ResizableHead>
            <ResizableHead
              column="description"
              widths={widths}
              setWidths={setWidths}
            >
              Description
            </ResizableHead>
            {showSetColumn ? (
              <ResizableHead
                column="set"
                widths={widths}
                setWidths={setWidths}
                isLast
              >
                Collection
              </ResizableHead>
            ) : null}
            {/* Empty cell sitting above the actions column. */}
            <TableHead aria-hidden className="p-0!" />
            <TableHead aria-hidden className="p-0!" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const aliasByDtcg = isAliasValue(item.$value);
            const aliasByFigma = item.token
              ? Boolean(readFigmaAlias(item.token)?.targetVariableName)
              : false;
            const isAlias = aliasByDtcg || aliasByFigma;

            const resolution = isAlias
              ? resolveToken(item.setId, item.path, {
                  currentSetId: item.setId,
                  sets,
                })
              : undefined;

            const setName = sets.find((s) => s.id === item.setId)?.name ?? item.setId;

            const rowKey = toSelectionKey(item.setId, item.path);
            const isRowSelected = multiSelection.has(rowKey);

            return (
              <TableRow
                key={`${item.setId}-${item.path}`}
                data-state={isRowSelected ? "selected" : undefined}
                className="hover:bg-muted/40 data-[state=selected]:bg-muted/50 group/row cursor-pointer"
                onClick={() => selectToken(item.setId, item.path)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectToken(item.setId, item.path);
                  }
                }}
              >
                <TableCell
                  className="pl-3! pr-0!"
                  /**
                   * Stopping propagation on the cell — not the checkbox —
                   * because Base UI's <Checkbox.Root> swallows arbitrary
                   * `onClick` props before they reach React's synthetic
                   * pipeline. Catching the bubble at the <td> guarantees
                   * the row's `onClick` (which opens the editor sheet)
                   * never fires when the user toggles selection.
                   */
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={isRowSelected}
                    onCheckedChange={() =>
                      toggleMultiSelection(item.setId, item.path)
                    }
                    aria-label={`Select ${item.path}`}
                  />
                </TableCell>
                <TableCell className="overflow-hidden">
                  <span className="block truncate font-mono text-xs">
                    {item.path}
                  </span>
                </TableCell>
                <TableCell className="overflow-hidden">
                  <span className="text-muted-foreground block truncate text-xs">
                    {item.$type}
                  </span>
                </TableCell>
                <TableCell className="overflow-hidden">
                  <RawValueCell
                    isAlias={isAlias}
                    rawValue={item.$value}
                    aliasTarget={
                      aliasByDtcg
                        ? `{${(item.$value as string).slice(1, -1)}}`
                        : aliasByFigma && item.token
                          ? `{${
                              readFigmaAlias(item.token)
                                ?.targetVariableName?.replaceAll("/", ".") ?? ""
                            }}`
                          : undefined
                    }
                    typeHint={item.$type}
                  />
                </TableCell>
                <TableCell className="overflow-hidden">
                  <ResolvedValueCell
                    item={item}
                    resolvedValue={
                      isAlias ? resolution?.value : item.$value
                    }
                  />
                </TableCell>
                <TableCell className="text-muted-foreground overflow-hidden text-xs">
                  {item.$description ? (
                    <span className="block truncate">{item.$description}</span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </TableCell>
                {showSetColumn ? (
                  <TableCell className="overflow-hidden">
                    <Badge variant="outline" className="text-xs">
                      {setName}
                    </Badge>
                  </TableCell>
                ) : null}
                <TableCell className="p-0! text-right">
                  <TokenRowActions setId={item.setId} path={item.path} />
                </TableCell>
                <TableCell aria-hidden className="p-0!" />
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Per-row action menu rendered in the trailing actions column.
 *
 * The trigger button is invisible by default (`opacity-0`) and only becomes
 * visible when the row is hovered (`group-hover/row`), keeps focus within
 * the row, or has the menu open. This mirrors the GitHub / Linear pattern
 * for "row commands you only need on demand".
 *
 * Click events on the trigger and the menu items are stopped from
 * propagating so they don't bubble up to the row's `onClick` (which would
 * also open the editor sheet).
 */
function TokenRowActions({ setId, path }: { setId: string; path: string }) {
  const selectToken = useTokensStore((s) => s.selectToken);
  const duplicateToken = useTokensStore((s) => s.duplicateToken);
  const deleteToken = useTokensStore((s) => s.deleteToken);

  const tokenName = path.split(".").pop() ?? path;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${tokenName}`}
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground size-8 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
          />
        }
      >
        <MoreHorizontalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(e) => e.stopPropagation()}
        className="w-44"
      >
        <DropdownMenuItem onClick={() => selectToken(setId, path)}>
          <PencilIcon data-icon="inline-start" />
          Edit token
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const newPath = duplicateToken(setId, path);
            if (newPath) {
              toast.success(`Duplicated as ${newPath.split(".").pop()}`);
            }
          }}
        >
          <CopyIcon data-icon="inline-start" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            deleteToken(setId, path);
            toast.success(`Deleted ${tokenName}`);
          }}
        >
          <Trash2Icon data-icon="inline-start" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ResizableHeadProps {
  column: ColumnId;
  widths: Record<ColumnId, number>;
  setWidths: React.Dispatch<React.SetStateAction<Record<ColumnId, number>>>;
  isLast?: boolean;
  children: React.ReactNode;
}

function ResizableHead({
  column,
  widths,
  setWidths,
  isLast,
  children,
}: ResizableHeadProps) {
  /**
   * Drag handle uses pointer capture so the resize keeps tracking even when
   * the cursor leaves the small handle area. Width updates flow through the
   * `setWidths` setter which also persists to localStorage.
   */
  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = widths[column];
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    handle.dataset.dragging = "true";
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      const next = Math.max(MIN_COLUMN_WIDTH, startWidth + (ev.clientX - startX));
      setWidths((w) => ({ ...w, [column]: next }));
    };
    const onUp = (ev: PointerEvent) => {
      handle.removeAttribute("data-dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch {
        // ignored
      }
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const onDoubleClick = () => {
    setWidths((w) => ({ ...w, [column]: DEFAULT_WIDTHS[column] }));
  };

  return (
    <TableHead className="relative overflow-visible text-xs text-muted-foreground">
      <span className="block truncate pr-2">{children}</span>
      {!isLast ? (
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${column} column`}
          tabIndex={-1}
          onPointerDown={onPointerDown}
          onDoubleClick={onDoubleClick}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute top-0 -right-1 z-20 flex h-full w-2 cursor-col-resize touch-none items-center justify-center select-none",
            "after:bg-border hover:after:bg-foreground/40 data-[dragging=true]:after:bg-foreground/60 after:h-4 after:w-px after:rounded after:transition-colors"
          )}
        />
      ) : null}
    </TableHead>
  );
}

function useColumnWidths() {
  /**
   * Initialise from localStorage without an effect-time state reset, then
   * sync back on every change. SSR-safe: server render uses defaults.
   */
  const [widths, setWidths] = React.useState<Record<ColumnId, number>>(
    readStoredColumnWidths
  );

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
    } catch {
      // storage quota / private mode — ignore
    }
  }, [widths]);

  return [widths, setWidths] as const;
}

function readStoredColumnWidths(): Record<ColumnId, number> {
  if (typeof window === "undefined") return DEFAULT_WIDTHS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WIDTHS;
    const parsed = JSON.parse(raw) as Partial<Record<ColumnId, number>>;
    return { ...DEFAULT_WIDTHS, ...parsed };
  } catch {
    return DEFAULT_WIDTHS;
  }
}

function RawValueCell({
  isAlias,
  rawValue,
  aliasTarget,
  typeHint,
}: {
  isAlias: boolean;
  rawValue: unknown;
  aliasTarget?: string;
  typeHint: string;
}) {
  if (isAlias && aliasTarget) {
    return (
      <span
        className={cn(
          "inline-flex max-w-full items-center rounded px-1.5 py-0.5 font-mono text-xs",
          "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200"
        )}
      >
        <span className="truncate">{aliasTarget}</span>
      </span>
    );
  }
  return (
    <span className="text-muted-foreground block truncate font-mono text-xs">
      {formatTokenValue(rawValue as never, typeHint as never)}
    </span>
  );
}

function ResolvedValueCell({
  item,
  resolvedValue,
}: {
  item: TokenGridItem;
  resolvedValue: unknown;
}) {
  if (resolvedValue === undefined) {
    return (
      <span className="text-muted-foreground/50 text-xs italic">unresolved</span>
    );
  }
  return (
    <span className="flex items-center gap-2 overflow-hidden">
      <span className="size-5 shrink-0 overflow-hidden rounded border">
        <TokenSwatch
          setId={item.setId}
          path={item.path}
          $type={item.$type}
          $value={item.$value}
          token={item.token}
          compact
          className="size-full h-5 rounded-none border-0"
        />
      </span>
      <span className="text-foreground truncate font-mono text-xs">
        {formatTokenValue(resolvedValue as never, item.$type)}
      </span>
    </span>
  );
}
