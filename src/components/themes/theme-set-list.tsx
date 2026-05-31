"use client";

import { useCallback, useState } from "react";
import {
  CheckIcon,
  GripVerticalIcon,
  LayersIcon,
  MinusCircleIcon,
  PlusIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getDefaultCollectionMode, materializeCollectionMode } from "@/lib/dtcg/collections";
import { flattenTokens } from "@/lib/dtcg/parser";
import { useTokensStore } from "@/lib/stores/tokens-store";
import { useThemesStore } from "@/lib/themes/store";
import type { Theme, ThemeSetRef } from "@/lib/themes/types";

interface ThemeSetListProps {
  theme: Theme;
}

/**
 * Displays and manages the ordered list of collections for a theme.
 *
 * Features:
 *   - Drag to reorder (HTML5 drag API — no extra dependency)
 *   - Toggle collection state: enabled ↔ disabled
 *   - Add collections not yet in the theme from a bottom panel
 */
export function ThemeSetList({ theme }: ThemeSetListProps) {
  const allSets = useTokensStore((s) => s.sets);
  const setThemeSets = useThemesStore((s) => s.setThemeSets);
  const toggleSetMode = useThemesStore((s) => s.toggleSetMode);

  // ── Drag state ───────────────────────────────────────────────────────
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const onDragStart = useCallback(
    (index: number) => (e: React.DragEvent) => {
      setDragFromIndex(index);
      e.dataTransfer.effectAllowed = "move";
    },
    []
  );

  const onDragOver = useCallback(
    (index: number) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverIndex(index);
    },
    []
  );

  const onDrop = useCallback(
    (toIndex: number) => (e: React.DragEvent) => {
      e.preventDefault();
      const fromIndex = dragFromIndex;
      if (fromIndex === null || fromIndex === toIndex) {
        setDragOverIndex(null);
        setDragFromIndex(null);
        return;
      }
      const next = [...theme.sets];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved!);
      setThemeSets(theme.id, next);
      setDragFromIndex(null);
      setDragOverIndex(null);
    },
    [dragFromIndex, theme.id, theme.sets, setThemeSets]
  );

  const onDragEnd = useCallback(() => {
    setDragFromIndex(null);
    setDragOverIndex(null);
  }, []);

  // ── Collections not yet added to this theme ──────────────────────────
  const includedCollectionIds = new Set(theme.sets.map((s) => s.collectionId ?? s.setId));
  const availableToAdd = allSets.filter((s) => !includedCollectionIds.has(s.id));

  function addSet(collectionId: string) {
    const collection = allSets.find((item) => item.id === collectionId);
    const defaultMode = collection ? getDefaultCollectionMode(collection) : undefined;
    const next: ThemeSetRef[] = [
      ...theme.sets,
      {
        collectionId,
        setId: collectionId,
        modeId: defaultMode?.id,
        state: "enabled",
        mode: "enabled",
      },
    ];
    setThemeSets(theme.id, next);
  }

  function removeSet(collectionId: string) {
    setThemeSets(
      theme.id,
      theme.sets.filter((s) => (s.collectionId ?? s.setId) !== collectionId)
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="flex-1">
        {theme.sets.length === 0 ? (
          <Empty className="px-6 py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayersIcon />
              </EmptyMedia>
              <EmptyTitle>No collections yet</EmptyTitle>
              <EmptyDescription>
                Add a collection below to start composing this theme.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-1 px-4 py-3">
            {theme.sets.map((ref, index) => {
              const collectionId = ref.collectionId ?? ref.setId;
              const set = allSets.find((s) => s.id === collectionId);
              const mode = set?.modes?.find((item) => item.id === ref.modeId) ?? (set ? getDefaultCollectionMode(set) : undefined);
              const tokenCount = set && mode ? flattenTokens(materializeCollectionMode(set, mode.id)).length : 0;
              const state = ref.state ?? ref.mode;
              const enabled = state !== "disabled";

              return (
                <li
                  key={`${collectionId}:${ref.modeId ?? "default"}`}
                  draggable
                  onDragStart={onDragStart(index)}
                  onDragOver={onDragOver(index)}
                  onDrop={onDrop(index)}
                  onDragEnd={onDragEnd}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all",
                    "bg-background",
                    enabled ? "opacity-100" : "opacity-50",
                    dragOverIndex === index &&
                      dragFromIndex !== index &&
                      "border-primary bg-primary/5"
                  )}
                >
                  {/* Drag handle */}
                  <GripVerticalIcon className="text-muted-foreground size-4 shrink-0 cursor-grab active:cursor-grabbing" />

                  {/* Order badge */}
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums",
                      enabled
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {index + 1}
                  </span>

                  {/* Set info */}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={cn(
                        "truncate text-sm font-medium",
                        !enabled && "line-through"
                      )}
                    >
                      {set?.name ?? collectionId}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {set
                        ? `${mode?.name ?? "Default"} mode · ${tokenCount} token${tokenCount !== 1 ? "s" : ""}`
                        : "Collection not found"}
                    </span>
                  </div>

                  {/* Mode badge */}
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                      state === "enabled" &&
                        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
                      state === "source" &&
                        "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
                      state === "disabled" &&
                        "bg-muted text-muted-foreground"
                    )}
                  >
                    {state}
                  </span>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      title={enabled ? "Disable collection" : "Enable collection"}
                      onClick={() => toggleSetMode(theme.id, collectionId)}
                    >
                      {enabled ? (
                        <MinusCircleIcon className="size-3.5 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <CheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive size-6"
                      title="Remove from theme"
                      onClick={() => removeSet(collectionId)}
                    >
                      <MinusCircleIcon className="size-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>

      {/* ── Available collections to add ─────────────────────────────── */}
      {availableToAdd.length > 0 && (
        <div className="border-t px-4 py-3">
          <div className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
            Add collection
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableToAdd.map((s) => (
              <Button
                key={s.id}
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={() => addSet(s.id)}
              >
                <PlusIcon className="size-3" />
                {s.name}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
