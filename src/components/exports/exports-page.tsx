"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  Edit3Icon,
  EyeIcon,
  LoaderCircleIcon,
  PaletteIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveExportProfiles } from "@/lib/export-profiles/actions";
import { useTokensStore } from "@/lib/stores/tokens-store";
import { useThemesStore } from "@/lib/themes/store";
import {
  previewExportProfile,
  resolveExportProfileStatus,
} from "@/lib/workspace/export-profiles";
import type {
  ExportProfile,
  ExportProfileFormat,
  ExportProfileTargetKind,
} from "@/lib/workspace/types";

const STORAGE_KEY = "rozetta-studio:export-profiles:v1";
const FORMATS: ExportProfileFormat[] = ["css", "tailwind", "json", "style-dictionary"];

interface ExportsPageProps {
  initialProfiles: ExportProfile[];
  profilesFileExists: boolean;
}

export function ExportsPage({ initialProfiles, profilesFileExists }: ExportsPageProps) {
  const sets = useTokensStore((state) => state.sets);
  const themes = useThemesStore((state) => state.themes);
  const themeGroups = useThemesStore((state) => state.themeGroups);
  const [profiles, setProfiles] = useState(() => initialProfiles);
  const [localProfiles, setLocalProfiles] = useState(() =>
    profilesFileExists ? [] : readLocalProfiles()
  );
  const [editingId, setEditingId] = useState<string | undefined>();
  const [selectedProfileId, setSelectedProfileId] = useState(initialProfiles[0]?.id);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [targetKind, setTargetKind] = useState<ExportProfileTargetKind>("collection");
  const [targetId, setTargetId] = useState("");
  const [format, setFormat] = useState<ExportProfileFormat>("css");
  const [destination, setDestination] = useState("preview/download");

  const collectionTargets = useMemo(
    () => sets.map((set) => ({ id: set.id, name: set.name })),
    [sets]
  );

  const themeTargetGroups = useMemo(() => groupThemesByGroup(themes, themeGroups), [themes, themeGroups]);
  const flatThemeTargets = useMemo(
    () => themeTargetGroups.flatMap((group) => group.themes.map((theme) => ({ id: theme.id, name: theme.name }))),
    [themeTargetGroups]
  );

  const targets =
    targetKind === "theme" ? flatThemeTargets : collectionTargets;
  const selectedTargetId = targetId || targets[0]?.id || "";
  const previews = useMemo(
    () => profiles.map((profile) => previewExportProfile(profile, sets, themes)),
    [profiles, sets, themes]
  );
  const selectedPreview =
    previews.find((preview) => preview.profileId === selectedProfileId) ?? previews[0];
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedPreview?.profileId) ?? profiles[0];
  const migrationAvailable = !profilesFileExists && profiles.length === 0 && localProfiles.length > 0;

  function resetForm() {
    setEditingId(undefined);
    setName("");
    setTargetKind("collection");
    setTargetId("");
    setFormat("css");
    setDestination("preview/download");
  }

  function persist(
    next: ExportProfile[],
    successMessage: string,
    onSuccess?: () => void
  ) {
    startTransition(async () => {
      const result = await saveExportProfiles(next);
      if (!result.ok) {
        toast.error("Could not save profiles", {
          description: result.error,
        });
        return;
      }
      setProfiles(next);
      setSelectedProfileId((current) => {
        if (current && next.some((profile) => profile.id === current)) return current;
        return next[0]?.id;
      });
      onSuccess?.();
      toast.success(successMessage);
    });
  }

  function upsertProfile() {
    if (!selectedTargetId) return;
    const targetName = targets.find((target) => target.id === selectedTargetId)?.name ?? selectedTargetId;
    const now = new Date().toISOString();
    // Normalize the legacy "set" target kind to "collection" so newly persisted
    // profiles match the spec — the legacy variant is still readable on load.
    const normalizedTargetKind = resolvedTargetKind(targetKind);
    const nextProfile: ExportProfile = {
      id: editingId ?? `profile-${Date.now().toString(36)}`,
      name: name.trim() || `${targetName} ${format.toUpperCase()}`,
      targetKind: normalizedTargetKind,
      targetId: selectedTargetId,
      format,
      destination: destination.trim() || "preview/download",
      updatedAt: now,
    };
    const next = editingId
      ? profiles.map((profile) => (profile.id === editingId ? nextProfile : profile))
      : [nextProfile, ...profiles];
    persist(next, editingId ? "Profile updated" : "Profile saved", () => {
      setSelectedProfileId(nextProfile.id);
      resetForm();
    });
  }

  function editProfile(profile: ExportProfile) {
    setEditingId(profile.id);
    setName(profile.name);
    setTargetKind(profile.targetKind);
    setTargetId(profile.targetId);
    setFormat(profile.format);
    setDestination(profile.destination);
  }

  function migrateLocalProfiles() {
    persist(localProfiles, "Local profiles migrated");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Best effort migration cleanup.
    }
    setLocalProfiles([]);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <DownloadIcon className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Export profiles
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Exports</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Save repeatable, Git-versioned export presets for collections and themes. One-off previews still live in the sidebar export sheet.
          </p>
        </div>
        <Badge variant="secondary">{profiles.length} profiles</Badge>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <main className="grid xl:grid-cols-[22rem_1fr]">
          <section className="flex min-w-0 flex-col border-b xl:border-r xl:border-b-0">
            {migrationAvailable && (
              <Block
                title="Local profiles found"
                description="Migrate browser-local profiles into `.rozetta/export-profiles.json`."
                className="border-b"
              >
                <Button type="button" onClick={migrateLocalProfiles} disabled={isPending}>
                  {isPending ? <LoaderCircleIcon className="animate-spin" /> : <SaveIcon />}
                  Migrate {localProfiles.length} profiles
                </Button>
              </Block>
            )}

            <Block
              title={editingId ? "Edit profile" : "Create profile"}
              description="Define the target, format, and logical destination."
            >
              <div className="flex flex-col gap-3">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Profile name"
                  aria-label="Profile name"
                />
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Source</span>
                  <div
                    role="tablist"
                    aria-label="Source kind"
                    className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-1"
                  >
                    {(["collection", "theme"] as const).map((kind) => {
                      const active = kind === resolvedTargetKind(targetKind);
                      return (
                        <button
                          key={kind}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => {
                            setTargetKind(kind);
                            setTargetId("");
                          }}
                          className={`flex items-center justify-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium transition-colors ${
                            active
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {kind === "theme" ? <PaletteIcon className="size-3" /> : null}
                          {kind === "theme" ? "Theme" : "Collection"}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Select value={selectedTargetId} onValueChange={(value) => setTargetId(value ?? "")}>
                  <SelectTrigger className="w-full" aria-label="Target">
                    <SelectValue placeholder="No target available" />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {targetKind === "theme"
                      ? themeTargetGroups.map((group) => (
                          <SelectGroup key={group.id}>
                            <SelectLabel>{group.name}</SelectLabel>
                            {group.themes.map((theme) => (
                              <SelectItem key={theme.id} value={theme.id}>
                                {theme.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))
                      : collectionTargets.map((target) => (
                          <SelectItem key={target.id} value={target.id}>
                            {target.name}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
                <Select value={format} onValueChange={(value) => setFormat(value as ExportProfileFormat)}>
                  <SelectTrigger className="w-full" aria-label="Export format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {FORMATS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder="preview/download"
                  aria-label="Destination"
                />
                <div className="flex gap-2">
                  <Button type="button" onClick={upsertProfile} disabled={!selectedTargetId || isPending}>
                    {isPending ? <LoaderCircleIcon className="animate-spin" /> : editingId ? <SaveIcon /> : <PlusIcon />}
                    {editingId ? "Save profile" : "Add profile"}
                  </Button>
                  {editingId && (
                    <Button type="button" variant="outline" onClick={resetForm}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </Block>
          </section>

          <section className="flex min-w-0 flex-col">
            <Block
              title="Saved profiles"
              description="Versioned presets stored in `.rozetta/export-profiles.json`."
              className="border-b"
            >
              {profiles.length === 0 ? (
                <EmptyLine>Create one for a set or theme to make repeat exports predictable.</EmptyLine>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead className="w-52">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.map((profile) => {
                      const status = resolveExportProfileStatus(profile, sets, themes);
                      const preview = previews.find((item) => item.profileId === profile.id);
                      const targetLabel = describeProfileTarget(profile, sets, themes);
                      return (
                        <TableRow key={profile.id} data-state={selectedProfileId === profile.id ? "selected" : undefined}>
                          <TableCell className="font-medium">{profile.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <TargetBadge
                                kind={resolvedTargetKind(profile.targetKind)}
                                label={targetLabel}
                              />
                              {preview && preview.conflicts > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="border-amber-500/50 text-amber-600"
                                  title={`${preview.conflicts} overlapping token path${
                                    preview.conflicts === 1 ? "" : "s"
                                  } resolved by last-wins order.`}
                                >
                                  <AlertTriangleIcon className="size-3" />
                                  {preview.conflicts} conflict{preview.conflicts === 1 ? "" : "s"}
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={status} format={profile.format} />
                          </TableCell>
                          <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                            {profile.destination}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Preview ${profile.name}`}
                                onClick={() => setSelectedProfileId(profile.id)}
                              >
                                <EyeIcon />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Copy ${profile.name}`}
                                disabled={preview?.status !== "valid"}
                                onClick={() => copyPreview(preview)}
                              >
                                <CopyIcon />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Download ${profile.name}`}
                                disabled={preview?.status !== "valid"}
                                onClick={() => downloadPreview(preview)}
                              >
                                <DownloadIcon />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Edit ${profile.name}`}
                                onClick={() => editProfile(profile)}
                              >
                                <Edit3Icon />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Delete ${profile.name}`}
                                disabled={isPending}
                                onClick={() => {
                                  const next = profiles.filter((item) => item.id !== profile.id);
                                  persist(next, "Profile deleted");
                                }}
                              >
                                <Trash2Icon />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Block>

            <Block
              title="Preview"
              description={selectedProfile ? selectedProfile.name : "Select a profile to generate an artifact preview."}
            >
              {!selectedPreview ? (
                <EmptyLine>Create or select a profile to preview its export output.</EmptyLine>
              ) : selectedPreview.status !== "valid" ? (
                <p className="text-sm text-muted-foreground">{selectedPreview.message}</p>
              ) : (
                <div className="overflow-hidden border-t">
                  <div className="flex items-center justify-between gap-3 border-b py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{selectedPreview.filename}</div>
                      <div className="truncate text-xs text-muted-foreground">{selectedPreview.message}</div>
                    </div>
                    <Badge variant="secondary">{selectedPreview.language}</Badge>
                  </div>
                  <ScrollArea className="h-96">
                    <pre className="py-4 font-mono text-xs leading-relaxed">{selectedPreview.output}</pre>
                  </ScrollArea>
                </div>
              )}
            </Block>
          </section>
        </main>
      </ScrollArea>
    </div>
  );
}

function Block({
  title,
  description,
  action,
  className,
  children,
}: {
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`px-6 py-6 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function resolvedTargetKind(kind: ExportProfileTargetKind): "collection" | "theme" {
  return kind === "theme" ? "theme" : "collection";
}

interface ThemeOption {
  id: string;
  name: string;
}

interface ThemeGroupOption {
  id: string;
  name: string;
  themes: ThemeOption[];
}

function groupThemesByGroup(
  themes: ReturnType<typeof useThemesStore.getState>["themes"],
  themeGroups: ReturnType<typeof useThemesStore.getState>["themeGroups"]
): ThemeGroupOption[] {
  const out: ThemeGroupOption[] = [];
  const byGroupId = new Map<string, ThemeOption[]>();
  const orphans: ThemeOption[] = [];

  for (const theme of themes) {
    const option = { id: theme.id, name: theme.name };
    if (theme.themeGroupId) {
      const bucket = byGroupId.get(theme.themeGroupId);
      if (bucket) bucket.push(option);
      else byGroupId.set(theme.themeGroupId, [option]);
    } else {
      orphans.push(option);
    }
  }

  const sortedGroups = [...themeGroups].sort((a, b) => a.position - b.position);
  for (const group of sortedGroups) {
    const bucket = byGroupId.get(group.id);
    if (bucket && bucket.length > 0) {
      out.push({ id: group.id, name: group.name, themes: bucket });
    }
  }

  if (orphans.length > 0) {
    out.push({ id: "__ungrouped__", name: "Ungrouped", themes: orphans });
  }

  return out;
}

function describeProfileTarget(
  profile: ExportProfile,
  sets: ReturnType<typeof useTokensStore.getState>["sets"],
  themes: ReturnType<typeof useThemesStore.getState>["themes"]
): string {
  if (resolvedTargetKind(profile.targetKind) === "theme") {
    const theme = themes.find((item) => item.id === profile.targetId);
    return theme?.name ?? profile.targetId;
  }
  const set = sets.find((item) => item.id === profile.targetId);
  if (!set) return profile.targetId;
  const activeMode = set.modes?.find((mode) => mode.id === set.activeModeId);
  return activeMode ? `${set.name}/${activeMode.name}` : set.name;
}

function TargetBadge({ kind, label }: { kind: "collection" | "theme"; label: string }) {
  const prefix = kind === "theme" ? "Theme" : "Collection";
  return (
    <Badge variant="outline" className="font-normal">
      {kind === "theme" ? <PaletteIcon className="size-3" /> : null}
      <span className="text-muted-foreground">{prefix}:</span>
      <span className="text-foreground">{label}</span>
    </Badge>
  );
}

function StatusBadge({ status, format }: { status: string; format: ExportProfileFormat }) {
  if (status === "valid") {
    return (
      <Badge variant="secondary">
        <CheckIcon />
        {format}
      </Badge>
    );
  }
  if (status === "planned-format") return <Badge variant="outline">planned</Badge>;
  return <Badge variant="destructive">missing target</Badge>;
}

async function copyPreview(preview: ReturnType<typeof previewExportProfile> | undefined) {
  if (!preview || preview.status !== "valid") return;
  try {
    await navigator.clipboard.writeText(preview.output);
    toast.success("Export copied");
  } catch {
    toast.error("Couldn't access the clipboard");
  }
}

function downloadPreview(preview: ReturnType<typeof previewExportProfile> | undefined) {
  if (!preview || preview.status !== "valid") return;
  downloadTextFile(preview.filename, preview.output);
  toast.success(`Downloaded ${preview.filename}`);
}

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function readLocalProfiles(): ExportProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ExportProfile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
