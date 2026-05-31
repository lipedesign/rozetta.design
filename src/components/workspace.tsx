"use client";

import { useMemo, useState } from "react";
import { LayoutGridIcon, TableIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { TokenGrid, type TokenGridItem } from "@/components/tokens/token-grid";
import { TokenTable } from "@/components/tokens/token-table";

import { flattenTokens } from "@/lib/dtcg/parser";
import { getCollectionModes } from "@/lib/dtcg/collections";
import { ALL_SETS_ID, useTokensStore } from "@/lib/stores/tokens-store";

/**
 * Tokens-Studio-style flat workspace.
 *
 * Always renders a single, recursive list of every token in the active
 * scope (a single collection or all collections), regardless of nesting. Group cards
 * are intentionally omitted — drill-down happens via the breadcrumb
 * (after a search, when matches are scoped to a path) or by typing a
 * group prefix in the search box. This mirrors the "All collections" UX in
 * Figma Variables and keeps a consistent surface across collections.
 */
export function Workspace() {
  const sets = useTokensStore((s) => s.sets);
  const activeSetId = useTokensStore((s) => s.activeSetId);
  const activeGroupPath = useTokensStore((s) => s.activeGroupPath);
  const selectGroup = useTokensStore((s) => s.selectGroup);
  const selectCollectionMode = useTokensStore((s) => s.selectCollectionMode);
  const searchQuery = useTokensStore((s) => s.searchQuery);
  const setSearchQuery = useTokensStore((s) => s.setSearchQuery);
  const multiSelection = useTokensStore((s) => s.multiSelection);
  const clearMultiSelection = useTokensStore((s) => s.clearMultiSelection);
  const deleteSelected = useTokensStore((s) => s.deleteSelected);

  const [view, setView] = useState<"grid" | "table">("table");

  const isAllSetsView = activeSetId === ALL_SETS_ID;
  const activeSet = useMemo(
    () => (isAllSetsView ? undefined : sets.find((s) => s.id === activeSetId)),
    [sets, activeSetId, isAllSetsView]
  );
  const activeModes = useMemo(
    () => (activeSet ? getCollectionModes(activeSet) : []),
    [activeSet]
  );

  const breadcrumbSegments = useMemo(() => {
    const segs = activeGroupPath ? activeGroupPath.split(".") : [];
    if (isAllSetsView) {
      return [
        { label: "All collections", path: "" },
        ...segs.map((label, i) => ({
          label,
          path: segs.slice(0, i + 1).join("."),
        })),
      ];
    }
    if (!activeSet) return [] as Array<{ label: string; path: string }>;
    return [
      { label: activeSet.name, path: "" },
      ...segs.map((label, i) => ({
        label,
        path: segs.slice(0, i + 1).join("."),
      })),
    ];
  }, [activeSet, activeGroupPath, isAllSetsView]);

  /**
   * Flat token list across the active scope. Both `All collections` and a
   * single-collection view are built from `flattenTokens`, which walks the tree
   * recursively. The `activeGroupPath` filter (applied below) lets the
   * breadcrumb drill into a subgroup without changing the surface.
   */
  const allTokenItems: TokenGridItem[] = useMemo(() => {
    const collect = (s: (typeof sets)[number]): TokenGridItem[] =>
      flattenTokens(s).map((t) => ({
        setId: s.id,
        path: t.path,
        name: t.name,
        $type: t.$type,
        $value: t.$value,
        $description: t.$description,
        isAlias: t.isAlias,
        token: {
          $type: t.$type,
          $value: t.$value,
          $description: t.$description,
          $extensions: t.$extensions,
        },
      }));

    if (isAllSetsView) {
      return sets.flatMap(collect);
    }
    if (!activeSet) return [];
    return collect(activeSet);
  }, [isAllSetsView, sets, activeSet]);

  const tokenItems = useMemo(() => {
    let items = allTokenItems;

    if (activeGroupPath) {
      items = items.filter(
        (it) =>
          it.path === activeGroupPath ||
          it.path.startsWith(activeGroupPath + ".")
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(
        (it) =>
          it.path.toLowerCase().includes(q) ||
          it.name.toLowerCase().includes(q) ||
          (it.$description ?? "").toLowerCase().includes(q)
      );
    }

    return items;
  }, [allTokenItems, activeGroupPath, searchQuery]);

  const noSelection = activeSetId === undefined;
  const headerTitle = isAllSetsView
    ? "All collections"
    : activeGroupPath
      ? activeGroupPath.split(".").pop() ?? activeSet?.name ?? ""
      : activeSet?.name ?? "";

  const totalCount = tokenItems.length;

  return (
    <>
      <header className="bg-background flex h-14 shrink-0 items-center gap-2 border-b">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/">Rozetta</BreadcrumbLink>
              </BreadcrumbItem>
              {breadcrumbSegments.length === 0 ? (
                <>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Tokens</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              ) : (
                breadcrumbSegments.map((segment, index) => {
                  const isLast = index === breadcrumbSegments.length - 1;
                  return (
                    <span key={`${segment.label}-${index}`} className="contents">
                      <BreadcrumbSeparator className="hidden md:block" />
                      <BreadcrumbItem>
                        {isLast ? (
                          <BreadcrumbPage>{segment.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink
                            onClick={(e) => {
                              e.preventDefault();
                              selectGroup(segment.path);
                            }}
                            href="#"
                          >
                            {segment.label}
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </span>
                  );
                })
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      {noSelection ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No collection selected</EmptyTitle>
              <EmptyDescription>
                Pick a collection from the sidebar to inspect its tokens.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <>
          {/*
            * Sticky title row (heading + view toggle). When the user has
            * tokens multi-selected, the row swaps in a contextual toolbar
            * with bulk actions — same vertical real estate, different
            * affordances. This is the GitHub / Linear pattern.
            */}
          <div className="bg-background flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
            {multiSelection.size > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Clear selection"
                    onClick={clearMultiSelection}
                    className="-ml-2"
                  >
                    <XIcon />
                  </Button>
                  <span className="text-sm font-medium tabular-nums">
                    {multiSelection.size} selected
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const n = deleteSelected();
                      if (n > 0) {
                        toast.success(
                          `Deleted ${n} token${n === 1 ? "" : "s"}`
                        );
                      }
                    }}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2Icon data-icon="inline-start" />
                    Delete
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <h1 className="text-lg font-semibold">{headerTitle}</h1>
                  {tokenItems.length > 0 ? (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {totalCount} token{totalCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {activeSet && activeModes.length > 1 ? (
                    <Select
                      value={activeSet.activeModeId ?? activeModes[0]?.id}
                      onValueChange={(modeId) => {
                        if (modeId) selectCollectionMode(activeSet.id, modeId);
                      }}
                    >
                      <SelectTrigger size="sm" aria-label="Collection mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {activeModes.map((mode) => (
                          <SelectItem key={mode.id} value={mode.id}>
                            {mode.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
                <Tabs
                  className="-mb-px self-stretch"
                  value={view}
                  onValueChange={(v) => setView(v as "grid" | "table")}
                >
                  <TabsList variant="line">
                    <TabsTrigger value="table">
                      <TableIcon data-icon="inline-start" />
                      Table
                    </TabsTrigger>
                    <TabsTrigger value="grid">
                      <LayoutGridIcon data-icon="inline-start" />
                      Grid
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </>
            )}
          </div>

          {/*
            * Scroll surface. For the table view we delegate scrolling to the
            * table itself (so its sticky <thead> can pin to the top of the
            * scroll container). For the grid view we keep a simple vertical
            * scroll on this wrapper.
            */}
          {tokenItems.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-4">
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>
                    {searchQuery
                      ? "No tokens match your search"
                    : "No tokens in this collection"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {searchQuery
                      ? `Try a different query than "${searchQuery}".`
                      : "This collection, mode, or group does not contain any tokens."}
                  </EmptyDescription>
                </EmptyHeader>
                {searchQuery ? (
                  <EmptyContent>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSearchQuery("")}
                    >
                      <XIcon data-icon="inline-start" />
                      Clear search
                    </Button>
                  </EmptyContent>
                ) : null}
              </Empty>
            </div>
          ) : view === "table" ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <TokenTable
                items={tokenItems}
                showSetColumn={isAllSetsView}
              />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <TokenGrid items={tokenItems} />
            </div>
          )}
        </>
      )}
    </>
  );
}
