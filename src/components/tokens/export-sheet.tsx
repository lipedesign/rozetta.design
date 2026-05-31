"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  LayersIcon,
  PaletteIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EXPORT_FORMATS,
  runExport,
  type ExportFormatId,
} from "@/lib/exporters";
import { flattenTokens } from "@/lib/dtcg/parser";
import { useTokensStore } from "@/lib/stores/tokens-store";
import { resolveTheme } from "@/lib/themes/resolver";
import { useThemesStore } from "@/lib/themes/store";
import { cn } from "@/lib/utils";

interface ExportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PickerMode = "set" | "theme";

/**
 * Quick Export: a floating right-side sheet to export a single Collection
 * or a Theme (merged via `resolveTheme`). Triggered from the sidebar's
 * "Quick Export" item.
 *
 * Theme rows are grouped by Theme Group (Tokens Studio model). Themes
 * without a `themeGroupId` (legacy / orphaned) fall into an "Ungrouped"
 * section so existing data still surfaces.
 */
export function ExportSheet({ open, onOpenChange }: ExportSheetProps) {
  const sets = useTokensStore((s) => s.sets);
  const themes = useThemesStore((s) => s.themes);
  const themeGroups = useThemesStore((s) => s.themeGroups);

  const [pickerMode, setPickerMode] = useState<PickerMode>("set");
  const [selectedSetId, setSelectedSetId] = useState<string | undefined>(undefined);
  const [selectedThemeId, setSelectedThemeId] = useState<string | undefined>(undefined);
  const [format, setFormat] = useState<ExportFormatId>("css");

  const selectedSet = useMemo(
    () => sets.find((s) => s.id === selectedSetId) ?? sets[0],
    [selectedSetId, sets]
  );
  const selectedTheme = useMemo(
    () => themes.find((t) => t.id === selectedThemeId) ?? themes[0],
    [selectedThemeId, themes]
  );

  const themeResolution = useMemo(() => {
    if (pickerMode !== "theme" || !selectedTheme) return undefined;
    return resolveTheme(selectedTheme, sets);
  }, [pickerMode, selectedTheme, sets]);

  const exportSet = useMemo(() => {
    if (pickerMode === "theme") return themeResolution?.merged;
    return selectedSet;
  }, [pickerMode, selectedSet, themeResolution]);

  const formatMeta = EXPORT_FORMATS.find((f) => f.id === format)!;
  const exportScope =
    pickerMode === "theme" && exportSet
      ? [exportSet, ...sets.filter((s) => s.id !== exportSet.id)]
      : sets;

  let output = "";
  if (exportSet) {
    try {
      output = runExport(format, exportSet, exportScope);
    } catch (err) {
      console.error("[export]", err);
      output = `/* Export failed: ${(err as Error).message} */`;
    }
  }

  const filename = exportSet ? formatMeta.filename(exportSet.name) : "";
  const tokenCount = exportSet ? flattenTokens(exportSet).length : 0;
  const byteSize = output ? new Blob([output]).size : 0;

  // Group themes by Theme Group. Themes without a themeGroupId end up in
  // an "Ungrouped" bucket so legacy / unassigned data still shows up.
  const groupedThemes = useMemo(() => {
    const byGroup = new Map<string | null, typeof themes>();
    for (const theme of themes) {
      const key = theme.themeGroupId ?? null;
      const list = byGroup.get(key) ?? [];
      list.push(theme);
      byGroup.set(key, list);
    }
    const groups = themeGroups
      .map((group) => ({
        id: group.id,
        name: group.name,
        themes: (byGroup.get(group.id) ?? []).sort(
          (a, b) => (a.position ?? 0) - (b.position ?? 0)
        ),
      }))
      .filter((group) => group.themes.length > 0);
    const ungrouped = byGroup.get(null) ?? [];
    if (ungrouped.length > 0) {
      groups.push({ id: "__ungrouped", name: "Ungrouped", themes: ungrouped });
    }
    return groups;
  }, [themes, themeGroups]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "sm:max-w-4xl!",
          "data-[side=right]:top-2 data-[side=right]:bottom-2 data-[side=right]:right-2 data-[side=right]:h-auto",
          "flex w-full flex-col gap-0 overflow-hidden rounded-xl border p-0 shadow-xl"
        )}
      >
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <SheetTitle>Quick Export</SheetTitle>
              <SheetDescription>
                Generate a downloadable artifact from the in-memory state — any
                unsaved edits are included.
              </SheetDescription>
            </div>
            {exportSet ? (
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary" className="font-mono text-xs">
                  {tokenCount} tokens
                </Badge>
                <Badge variant="outline" className="font-mono text-xs">
                  {formatBytes(byteSize)}
                </Badge>
              </div>
            ) : null}
          </div>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr]">
          <aside className="bg-muted/30 flex min-w-0 flex-col border-r">
            <div className="flex border-b">
              {(["set", "theme"] as PickerMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPickerMode(mode)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium capitalize transition-colors",
                    pickerMode === mode
                      ? "bg-background text-foreground border-b-2 border-b-primary -mb-px"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {mode === "theme" ? (
                    <PaletteIcon className="size-3" />
                  ) : (
                    <LayersIcon className="size-3" />
                  )}
                  {mode === "set" ? "Collections" : "Themes"}
                </button>
              ))}
            </div>

            <ScrollArea className="flex-1">
              {pickerMode === "set" ? (
                <ul className="flex flex-col gap-0.5 px-2 py-2">
                  {sets.length === 0 ? (
                    <li className="text-muted-foreground px-2 py-2 text-xs">
                      No collections loaded.
                    </li>
                  ) : (
                    sets.map((set) => {
                      const active = selectedSet?.id === set.id;
                      const count = flattenTokens(set).length;
                      return (
                        <li key={set.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedSetId(set.id)}
                            className={cn(
                              "hover:bg-accent hover:text-accent-foreground flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                              active && "bg-accent text-accent-foreground font-medium"
                            )}
                          >
                            <span className="truncate">{set.name}</span>
                            <span
                              className={cn(
                                "font-mono text-xs tabular-nums",
                                active ? "" : "text-muted-foreground"
                              )}
                            >
                              {count} tokens
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : groupedThemes.length === 0 ? (
                <p className="text-muted-foreground px-3 py-3 text-xs">
                  No themes yet — create one under <code>/themes</code>.
                </p>
              ) : (
                <div className="flex flex-col gap-3 px-2 py-2">
                  {groupedThemes.map((group) => (
                    <div key={group.id}>
                      <div className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {group.name}
                      </div>
                      <ul className="flex flex-col gap-0.5">
                        {group.themes.map((theme) => {
                          const active = selectedTheme?.id === theme.id;
                          const conflictCount =
                            active && themeResolution
                              ? themeResolution.conflicts.length
                              : countThemeConflictsLazy();
                          const enabledCount = theme.sets.filter(
                            (s) => (s.state ?? s.mode) !== "disabled"
                          ).length;
                          return (
                            <li key={theme.id}>
                              <button
                                type="button"
                                onClick={() => setSelectedThemeId(theme.id)}
                                className={cn(
                                  "hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                                  active && "bg-accent text-accent-foreground font-medium"
                                )}
                              >
                                <div className="flex min-w-0 flex-col gap-0.5">
                                  <span className="truncate">{theme.name}</span>
                                  <span
                                    className={cn(
                                      "font-mono text-xs tabular-nums",
                                      active
                                        ? "text-accent-foreground/70"
                                        : "text-muted-foreground"
                                    )}
                                  >
                                    {enabledCount} set{enabledCount !== 1 ? "s" : ""}
                                  </span>
                                </div>
                                {conflictCount > 0 ? (
                                  <span
                                    className="flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-400"
                                    title={`${conflictCount} conflicting path${conflictCount === 1 ? "" : "s"}`}
                                  >
                                    <AlertTriangleIcon className="size-3" />
                                    <span className="font-mono text-xs">{conflictCount}</span>
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-col">
            {pickerMode === "theme" && themeResolution && themeResolution.conflicts.length > 0 ? (
              <div className="flex items-center gap-2 border-b bg-amber-50/50 px-4 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                <AlertTriangleIcon className="size-3.5 shrink-0" />
                <span>
                  {themeResolution.conflicts.length} conflicting path
                  {themeResolution.conflicts.length === 1 ? "" : "s"} — later sets
                  in the theme override earlier ones (last-wins).
                </span>
              </div>
            ) : null}
            <Tabs
              value={format}
              onValueChange={(v) => v && setFormat(v as ExportFormatId)}
              className="flex min-h-0 min-w-0 flex-1 flex-col"
            >
              <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
                <TabsList>
                  {EXPORT_FORMATS.map((f) => (
                    <TabsTrigger key={f.id} value={f.id}>
                      {f.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <div className="flex items-center gap-1.5">
                  <CopyButton text={output} />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!exportSet) return;
                      downloadTextFile(filename, output);
                      toast.success(`Downloaded ${filename}`);
                    }}
                    disabled={!exportSet}
                  >
                    <DownloadIcon />
                    Download
                  </Button>
                </div>
              </div>

              {EXPORT_FORMATS.map((f) => (
                <TabsContent
                  key={f.id}
                  value={f.id}
                  className="m-0 flex min-h-0 min-w-0 flex-1 flex-col"
                >
                  <div className="text-muted-foreground border-b px-4 py-2 text-xs">
                    {f.description}{" "}
                    <span className="text-foreground/70 font-mono">{filename}</span>
                  </div>
                  <ScrollArea className="flex-1">
                    <pre className="p-4 font-mono text-xs leading-relaxed">{output}</pre>
                  </ScrollArea>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={!text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast.success("Copied to clipboard");
          setTimeout(() => setCopied(false), 1400);
        } catch {
          toast.error("Couldn't access the clipboard");
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function downloadTextFile(filename: string, contents: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Stub: only the currently-selected theme runs through `resolveTheme` in the
 * main `useMemo` (above). For the other theme rows we'd ideally show their
 * conflict count too, but resolving every theme on every render is wasteful
 * for large workspaces. Returning 0 keeps the badge hidden for non-selected
 * rows; the selected one is computed accurately by the caller.
 */
function countThemeConflictsLazy(): number {
  return 0;
}
