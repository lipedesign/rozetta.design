"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangleIcon,
  LoaderCircleIcon,
  PaletteIcon,
  PencilIcon,
  SaveIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCollectionModes } from "@/lib/dtcg/collections";
import { useTokensStore } from "@/lib/stores/tokens-store";
import { useThemesStore } from "@/lib/themes/store";
import { saveThemeDraft } from "@/lib/themes/actions";
import { resolveTheme } from "@/lib/themes/resolver";
import type { Theme, ThemeSetRef } from "@/lib/themes/types";
import { cn } from "@/lib/utils";

const EXCLUDED = "__excluded__";

/**
 * Right-side editor for `/themes`. Mirrors `Workspace` for the Tokens page:
 *   sticky header with breadcrumb + title + actions, then content.
 *
 * Content is one of:
 *   - "No selection" empty state.
 *   - Theme Group view (lists themes in the selected group).
 *   - Theme view (composition editor: per-Collection Mode picker).
 */
export function ThemeWorkspace() {
  const themes = useThemesStore((state) => state.themes);
  const themeGroups = useThemesStore((state) => state.themeGroups);
  const activeThemeId = useThemesStore((state) => state.activeThemeId);
  const activeThemeGroupId = useThemesStore((state) => state.activeThemeGroupId);
  const selectTheme = useThemesStore((state) => state.selectTheme);
  const selectThemeGroup = useThemesStore((state) => state.selectThemeGroup);

  const activeTheme = themes.find((theme) => theme.id === activeThemeId) ?? null;
  const activeGroup = activeTheme
    ? themeGroups.find((group) => group.id === activeTheme.themeGroupId) ?? null
    : themeGroups.find((group) => group.id === activeThemeGroupId) ?? null;

  if (!activeTheme && !activeGroup) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PaletteIcon />
            </EmptyMedia>
            <EmptyTitle>No theme selected</EmptyTitle>
            <EmptyDescription>
              Pick a Theme Group or a Theme on the left, or create a new one with
              the + button.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="bg-background flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <button
                type="button"
                className="text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => {
                  selectThemeGroup(null);
                  selectTheme(null);
                }}
              >
                Theme Groups
              </button>
            </BreadcrumbItem>
            {activeGroup ? (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {activeTheme ? (
                    <button
                      type="button"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => {
                        selectTheme(null);
                        selectThemeGroup(activeGroup.id);
                      }}
                    >
                      {activeGroup.name}
                    </button>
                  ) : (
                    <BreadcrumbPage>{activeGroup.name}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </>
            ) : null}
            {activeTheme ? (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{activeTheme.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : null}
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      {activeTheme ? (
        <ThemeEditor theme={activeTheme} />
      ) : activeGroup ? (
        <ThemeGroupOverview groupId={activeGroup.id} groupName={activeGroup.name} />
      ) : null}
    </div>
  );
}

function ThemeGroupOverview({ groupId, groupName }: { groupId: string; groupName: string }) {
  const themes = useThemesStore((state) =>
    state.themes.filter((theme) => theme.themeGroupId === groupId)
  );
  const selectTheme = useThemesStore((state) => state.selectTheme);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-semibold">{groupName}</h1>
          <span className="text-xs tabular-nums text-muted-foreground">
            {themes.length} theme{themes.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      {themes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PaletteIcon />
              </EmptyMedia>
              <EmptyTitle>No themes in this group</EmptyTitle>
              <EmptyDescription>
                Click the + on the group row in the sidebar to add a theme.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col divide-y">
            {themes
              .slice()
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
              .map((theme) => (
                <li key={theme.id}>
                  <button
                    type="button"
                    onClick={() => selectTheme(theme.id)}
                    className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-base font-medium">{theme.name}</div>
                      {theme.description ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {theme.description}
                        </div>
                      ) : null}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {theme.sets.length} Collection ref
                      {theme.sets.length === 1 ? "" : "s"}
                    </Badge>
                  </button>
                </li>
              ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}

function ThemeEditor({ theme }: { theme: Theme }) {
  const sets = useTokensStore((state) => state.sets);
  const upsertThemes = useThemesStore((state) => state.upsertThemes);
  const [draft, setDraft] = useState<Theme>(theme);
  const [editingDraft, setEditingDraft] = useState<{ name: string; description: string } | null>(
    null
  );
  const [isPending, startTransition] = useTransition();

  // Theme can change when the user picks a different one in the sidebar. We
  // resync the draft via the theme id rather than useEffect (React 19 purity).
  const [lastSyncedId, setLastSyncedId] = useState(theme.id);
  if (theme.id !== lastSyncedId) {
    setLastSyncedId(theme.id);
    setDraft(theme);
    setEditingDraft(null);
  }

  const resolveResult = useMemo(() => resolveTheme(draft, sets), [draft, sets]);
  const conflicts = resolveResult.conflicts;

  const setsByCollectionId = useMemo(() => {
    const map = new Map<string, ThemeSetRef>();
    for (const ref of draft.sets) {
      map.set(ref.collectionId ?? ref.setId, ref);
    }
    return map;
  }, [draft.sets]);

  function persistDraft(next: Theme) {
    setDraft(next);
    upsertThemes([next]);
    startTransition(async () => {
      const result = await saveThemeDraft(next);
      if (!result.ok) {
        toast.error("Couldn't save theme", { description: result.error });
      }
    });
  }

  function commitMeta() {
    if (!editingDraft) return;
    const next: Theme = {
      ...draft,
      name: editingDraft.name.trim() || draft.name,
      description: editingDraft.description.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    setEditingDraft(null);
    persistDraft(next);
  }

  function setCollectionMode(collectionId: string, modeValue: string) {
    const newSets = [...draft.sets];
    const existingIndex = newSets.findIndex(
      (ref) => (ref.collectionId ?? ref.setId) === collectionId
    );
    if (modeValue === EXCLUDED) {
      if (existingIndex >= 0) newSets.splice(existingIndex, 1);
    } else if (existingIndex >= 0) {
      newSets[existingIndex] = {
        ...newSets[existingIndex]!,
        modeId: modeValue,
        state: "enabled",
        mode: "enabled",
      };
    } else {
      newSets.push({
        collectionId,
        setId: collectionId,
        modeId: modeValue,
        state: "enabled",
        mode: "enabled",
      });
    }
    persistDraft({
      ...draft,
      sets: newSets,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="bg-background flex h-14 shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          {editingDraft ? (
            <div className="flex flex-col gap-1.5">
              <Input
                autoFocus
                value={editingDraft.name}
                onChange={(event) =>
                  setEditingDraft({ ...editingDraft, name: event.target.value })
                }
                placeholder="Theme name"
                className="h-7 font-semibold"
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitMeta();
                  if (event.key === "Escape") setEditingDraft(null);
                }}
              />
              <Input
                value={editingDraft.description}
                onChange={(event) =>
                  setEditingDraft({ ...editingDraft, description: event.target.value })
                }
                placeholder="Description (optional)"
                className="h-7 text-sm"
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitMeta();
                  if (event.key === "Escape") setEditingDraft(null);
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <h1 className="text-lg font-semibold">{draft.name}</h1>
              {draft.description ? (
                <p className="text-xs text-muted-foreground">{draft.description}</p>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {conflicts.length > 0 ? (
            <Badge
              variant="outline"
              className="gap-1.5 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"
            >
              <AlertTriangleIcon className="size-3" />
              {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""}
            </Badge>
          ) : null}
          {editingDraft ? (
            <Button size="sm" onClick={commitMeta} disabled={isPending}>
              {isPending ? (
                <LoaderCircleIcon className="size-3.5 animate-spin" />
              ) : (
                <SaveIcon className="size-3.5" />
              )}
              Save
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setEditingDraft({ name: draft.name, description: draft.description ?? "" })
              }
            >
              <PencilIcon className="size-3.5" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-6 px-6 py-5">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
                Collections in this Theme
              </h2>
              <span className="text-xs text-muted-foreground">
                Pick which mode of each Collection is active in this Theme.
              </span>
            </div>
            {sets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Collections in the workspace yet. Create Collections on the
                Tokens page first.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sets.map((set) => {
                  const modes = getCollectionModes(set);
                  const ref = setsByCollectionId.get(set.id);
                  const currentValue = ref?.modeId ?? EXCLUDED;
                  return (
                    <li
                      key={set.id}
                      className={cn(
                        "flex items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3",
                        ref && "border-foreground/20"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{set.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {modes.length} mode{modes.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      <Select
                        value={currentValue}
                        onValueChange={(value) => {
                          if (value) setCollectionMode(set.id, value);
                        }}
                      >
                        <SelectTrigger className="h-8 w-56">
                          <SelectValue placeholder="Excluded" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EXCLUDED}>Excluded</SelectItem>
                          {modes.map((mode) => (
                            <SelectItem key={mode.id} value={mode.id}>
                              {mode.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {conflicts.length > 0 ? (
            <section>
              <h2 className="mb-3 text-xs font-medium tracking-wide uppercase text-muted-foreground">
                Conflicts
              </h2>
              <ul className="flex flex-col gap-2">
                {conflicts.map((entry) => (
                  <li
                    key={entry.path}
                    className="rounded-lg border bg-background px-4 py-3"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <AlertTriangleIcon className="size-3.5 text-amber-500" />
                      <code className="text-foreground font-mono text-xs">
                        {entry.path}
                      </code>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Defined in{" "}
                      {entry.setIds.map((id, index) => (
                        <span key={id}>
                          <span
                            className={cn(
                              "font-medium",
                              id === entry.winnerId
                                ? "text-foreground"
                                : "line-through opacity-50"
                            )}
                          >
                            {id}
                          </span>
                          {index < entry.setIds.length - 1 && ", "}
                        </span>
                      ))}
                      .{" "}
                      <span className="text-foreground font-medium">{entry.winnerId}</span>{" "}
                      wins.
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
