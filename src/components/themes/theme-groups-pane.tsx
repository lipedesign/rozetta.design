"use client";

import { useRef, useState, useTransition } from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  LayersIcon,
  PaletteIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createThemeGroup,
  createThemeInGroup,
  deleteTheme,
  deleteThemeGroup,
} from "@/lib/themes/actions";
import { useThemesStore } from "@/lib/themes/store";
import type { Theme, ThemeGroup } from "@/lib/themes/types";
import { cn } from "@/lib/utils";

/**
 * Left sidebar for `/themes` — mirrors `TokenSetsPane` in shape:
 *   header (label + "+" menu) → list (Theme Groups → Themes, expandable).
 * Selecting a Theme makes it active in the right-side workspace editor.
 */
export function ThemeGroupsPane() {
  const themeGroups = useThemesStore((state) => state.themeGroups);
  const themes = useThemesStore((state) => state.themes);
  const activeThemeId = useThemesStore((state) => state.activeThemeId);
  const activeThemeGroupId = useThemesStore((state) => state.activeThemeGroupId);
  const expandedGroups = useThemesStore((state) => state.expandedGroups);
  const setThemeGroups = useThemesStore((state) => state.setThemeGroups);
  const upsertThemes = useThemesStore((state) => state.upsertThemes);
  const selectTheme = useThemesStore((state) => state.selectTheme);
  const selectThemeGroup = useThemesStore((state) => state.selectThemeGroup);
  const toggleGroupExpanded = useThemesStore((state) => state.toggleGroupExpanded);

  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingThemeInGroup, setCreatingThemeInGroup] = useState<string | null>(null);
  const [newThemeName, setNewThemeName] = useState("");
  const newGroupInputRef = useRef<HTMLInputElement>(null);
  const newThemeInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function startCreateGroup() {
    setCreatingGroup(true);
    setNewGroupName("");
    queueMicrotask(() => newGroupInputRef.current?.focus());
  }

  function cancelCreateGroup() {
    setCreatingGroup(false);
    setNewGroupName("");
  }

  function commitCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createThemeGroup({ name });
      if (!result.ok) {
        toast.error("Couldn't create theme group", { description: result.error });
        return;
      }
      setThemeGroups([...themeGroups, result.themeGroup]);
      selectThemeGroup(result.themeGroup.id);
      cancelCreateGroup();
    });
  }

  function startCreateTheme(groupId: string) {
    setCreatingThemeInGroup(groupId);
    setNewThemeName("");
    queueMicrotask(() => newThemeInputRef.current?.focus());
  }

  function cancelCreateTheme() {
    setCreatingThemeInGroup(null);
    setNewThemeName("");
  }

  function commitCreateTheme(groupId: string) {
    const name = newThemeName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createThemeInGroup({ themeGroupId: groupId, name });
      if (!result.ok) {
        toast.error("Couldn't create theme", { description: result.error });
        return;
      }
      upsertThemes([result.theme]);
      selectTheme(result.theme.id);
      cancelCreateTheme();
    });
  }

  function removeGroup(group: ThemeGroup) {
    if (!confirm(`Delete theme group "${group.name}" and every theme inside?`)) return;
    startTransition(async () => {
      const result = await deleteThemeGroup(group.id);
      if (!result.ok) {
        toast.error("Couldn't delete theme group", { description: result.error });
        return;
      }
      setThemeGroups(themeGroups.filter((entry) => entry.id !== group.id));
      const surviving = themes.filter((theme) => theme.themeGroupId !== group.id);
      upsertThemes(surviving);
      if (activeThemeGroupId === group.id) selectThemeGroup(null);
    });
  }

  function removeTheme(theme: Theme) {
    if (!confirm(`Delete theme "${theme.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteTheme(theme.id);
      if (!result.ok) {
        toast.error("Couldn't delete theme", { description: result.error });
        return;
      }
      upsertThemes(themes.filter((entry) => entry.id !== theme.id));
      if (activeThemeId === theme.id) selectTheme(null);
    });
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
          Theme Groups
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="Create new…"
              />
            }
          >
            <PlusIcon className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Create new</DropdownMenuLabel>
              <DropdownMenuItem onClick={startCreateGroup}>
                <LayersIcon />
                Theme Group
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (themeGroups.length > 0) startCreateTheme(themeGroups[0]!.id);
                }}
                disabled={themeGroups.length === 0}
              >
                <PaletteIcon />
                Theme
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1">
        <ul className="flex flex-col gap-0.5 px-2 py-1">
          {themeGroups.length === 0 && !creatingGroup ? (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">
              No theme groups yet — click + to create one.
            </li>
          ) : null}

          {themeGroups.map((group) => {
            const groupThemes = themes
              .filter((theme) => theme.themeGroupId === group.id)
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
            const expanded = expandedGroups[group.id] ?? true;
            const isActive = activeThemeGroupId === group.id && !activeThemeId;
            return (
              <li key={group.id}>
                <div
                  className={cn(
                    "group flex items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted/60",
                    isActive && "bg-muted font-medium"
                  )}
                >
                  <button
                    type="button"
                    aria-label={expanded ? "Collapse" : "Expand"}
                    onClick={() => toggleGroupExpanded(group.id)}
                    className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  >
                    <ChevronRightIcon
                      className={cn(
                        "size-3 transition-transform",
                        expanded && "rotate-90"
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => selectThemeGroup(group.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <LayersIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{group.name}</span>
                    <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {groupThemes.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Add theme"
                    onClick={() => startCreateTheme(group.id)}
                    className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted/60 hover:text-foreground group-hover:opacity-100"
                  >
                    <PlusIcon className="size-3" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete group"
                    onClick={() => removeGroup(group)}
                    className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                </div>

                {expanded ? (
                  <ul className="ml-6 flex flex-col gap-0.5 py-0.5">
                    {groupThemes.map((theme) => (
                      <li key={theme.id}>
                        <div
                          className={cn(
                            "group flex items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted/60",
                            activeThemeId === theme.id && "bg-muted font-medium"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => selectTheme(theme.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <PaletteIcon className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{theme.name}</span>
                          </button>
                          <button
                            type="button"
                            aria-label="Delete theme"
                            onClick={() => removeTheme(theme)}
                            className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          >
                            <Trash2Icon className="size-3" />
                          </button>
                        </div>
                      </li>
                    ))}

                    {creatingThemeInGroup === group.id ? (
                      <li>
                        <div className="flex items-center gap-1 px-1.5 py-1">
                          <Input
                            ref={newThemeInputRef}
                            value={newThemeName}
                            onChange={(e) => setNewThemeName(e.target.value)}
                            placeholder="Theme name…"
                            className="h-6 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitCreateTheme(group.id);
                              if (e.key === "Escape") cancelCreateTheme();
                            }}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-5 shrink-0"
                            onClick={() => commitCreateTheme(group.id)}
                            disabled={!newThemeName.trim() || isPending}
                          >
                            <CheckIcon className="size-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-5 shrink-0"
                            onClick={cancelCreateTheme}
                          >
                            <XIcon className="size-3" />
                          </Button>
                        </div>
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </li>
            );
          })}

          {creatingGroup ? (
            <li>
              <div className="flex items-center gap-1 px-2 py-1">
                <Input
                  ref={newGroupInputRef}
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Theme Group name…"
                  className="h-6 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitCreateGroup();
                    if (e.key === "Escape") cancelCreateGroup();
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-5 shrink-0"
                  onClick={commitCreateGroup}
                  disabled={!newGroupName.trim() || isPending}
                >
                  <CheckIcon className="size-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-5 shrink-0"
                  onClick={cancelCreateGroup}
                >
                  <XIcon className="size-3" />
                </Button>
              </div>
            </li>
          ) : null}
        </ul>
      </ScrollArea>
    </aside>
  );
}
