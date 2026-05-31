"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ClipboardIcon,
  DownloadIcon,
  ExternalLinkIcon,
  Loader2Icon,
  TagIcon,
  UploadCloudIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useDesignSystemStore } from "@/lib/design-system/store";
import { diffDesignSystemRegistry } from "@/lib/design-system/registry";
import {
  checkGhReleaseReadiness,
  createGitHubRelease,
} from "@/lib/github/releases";
import { useTokensStore } from "@/lib/stores/tokens-store";
import { useThemesStore } from "@/lib/themes/store";
import { diffTokenSets } from "@/lib/workspace/diff";
import { generateReleaseDraft } from "@/lib/workspace/releases";
import type {
  DesignSystemRegistryInput,
  GitStatusSummary,
  ReleaseDraft,
  ReleaseVersionKind,
} from "@/lib/workspace/types";
import type { TokenSet } from "@/lib/dtcg/types";

interface ReleasesPageProps {
  git: GitStatusSummary;
  baselineSets: TokenSet[];
  baselineRegistry: DesignSystemRegistryInput;
}

const VERSION_OPTIONS: ReleaseVersionKind[] = ["patch", "minor", "major", "canary"];

export function ReleasesPage({ git, baselineSets, baselineRegistry }: ReleasesPageProps) {
  const sets = useTokensStore((state) => state.sets);
  const themes = useThemesStore((state) => state.themes);
  const brands = useDesignSystemStore((state) => state.brands);
  const components = useDesignSystemStore((state) => state.components);
  const [versionKind, setVersionKind] = useState<ReleaseVersionKind>("patch");
  const diff = useMemo(() => diffTokenSets(baselineSets, sets), [baselineSets, sets]);
  const designSystemDiff = useMemo(
    () => diffDesignSystemRegistry(baselineRegistry, { themes, brands, components }),
    [baselineRegistry, brands, components, themes]
  );
  const draft = useMemo(
    () => generateReleaseDraft(diff, versionKind, designSystemDiff),
    [designSystemDiff, diff, versionKind]
  );
  const changesBySet = useMemo(() => groupChangesBySet(draft.changes), [draft.changes]);
  const changesByArea = useMemo(
    () => groupDesignChangesByArea(draft.designSystemChanges),
    [draft.designSystemChanges]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TagIcon className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Release draft
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Releases</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Prepare token and design system release notes from the semantic diff. Publishing stays outside the UI for now.
          </p>
        </div>
        <Badge variant={git.clean ? "secondary" : "outline"}>
          {git.clean ? "Git clean" : "Local changes"}
        </Badge>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <main className="grid xl:grid-cols-[1fr_22rem]">
          <section className="flex min-w-0 flex-col border-b xl:border-r xl:border-b-0">
            <Block
              title={draft.title}
              description={draft.summary}
              className="border-b"
              action={
                <Select value={versionKind} onValueChange={(value) => setVersionKind(value as ReleaseVersionKind)}>
                  <SelectTrigger size="sm" aria-label="Version kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end" alignItemWithTrigger={false}>
                    {VERSION_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            >
              <ReleaseNotesEditor key={draft.id} draft={draft} />
            </Block>

            <Block title="Changes in this draft" description="Grouped from the current token and registry diff.">
              {changesBySet.length === 0 && changesByArea.length === 0 ? (
                <EmptyLine>Edit tokens or import a changed set to generate a release draft.</EmptyLine>
              ) : (
                <div className="flex flex-col gap-6">
                  {changesByArea.map(([area, changes]) => (
                    <ChangeGroup key={area} label={area} count={changes.length}>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Kind</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Impact</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {changes.map((change) => (
                            <TableRow key={change.id}>
                              <TableCell>
                                <Badge variant={change.kind.includes("removed") ? "destructive" : "outline"}>
                                  {change.kind}
                                </Badge>
                              </TableCell>
                              <TableCell className="whitespace-normal">{change.name}</TableCell>
                              <TableCell className="max-w-96 whitespace-normal text-xs text-muted-foreground">
                                {change.before ?? "none"} {"->"} {change.after ?? "none"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ChangeGroup>
                  ))}
                  {changesBySet.map(([setName, changes]) => (
                    <ChangeGroup key={setName} label={setName} count={changes.length}>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Kind</TableHead>
                            <TableHead>Token</TableHead>
                            <TableHead>Impact</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {changes.map((change) => (
                            <TableRow key={change.id}>
                              <TableCell>
                                <Badge variant={change.kind.includes("removed") ? "destructive" : "outline"}>
                                  {change.kind}
                                </Badge>
                              </TableCell>
                              <TableCell className="whitespace-normal">
                                {change.path ?? "Set-level change"}
                              </TableCell>
                              <TableCell className="max-w-96 whitespace-normal text-xs text-muted-foreground">
                                {change.before ?? "none"} {"->"} {change.after ?? "none"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ChangeGroup>
                  ))}
                </div>
              )}
            </Block>
          </section>

          <aside className="flex min-w-0 flex-col">
            <Block title="Artifacts" description="Preview only in this version." className="border-b">
              <div className="flex flex-col">
                {draft.artifacts.map((artifact) => (
                  <div key={artifact.id} className="border-b py-3 last:border-b-0 last:pb-0 first:pt-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">{artifact.name}</div>
                      <Badge variant="secondary">{artifact.format}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{artifact.target}</div>
                    <p className="mt-2 text-xs text-muted-foreground">{artifact.description}</p>
                  </div>
                ))}
              </div>
            </Block>
            <Block title="Release guardrails" description="No publish action is wired yet.">
              <p className="text-xs text-muted-foreground">
                Drafts are generated from Git baseline diff and can be copied or downloaded. Commit, tag, push, and publish stay outside Rozetta in this cycle.
              </p>
            </Block>
          </aside>
        </main>
      </ScrollArea>
    </div>
  );
}

function ChangeGroup({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3 border-b pb-2">
        <div className="text-sm font-medium">{label}</div>
        <Badge variant="secondary">{count} changes</Badge>
      </div>
      {children}
    </div>
  );
}

function ReleaseNotesEditor({ draft }: { draft: ReleaseDraft }) {
  const [notes, setNotes] = useState(draft.notes);
  const [publishOpen, setPublishOpen] = useState(false);
  const [readinessReason, setReadinessReason] = useState<string | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  const handleOpenPublish = useCallback(async () => {
    if (publishOpen) {
      setPublishOpen(false);
      return;
    }
    setReadinessLoading(true);
    try {
      const result = await checkGhReleaseReadiness();
      if (!result.ready) {
        setReadinessReason(result.reason);
      } else {
        setReadinessReason(null);
      }
      setPublishOpen(true);
    } catch (err) {
      setReadinessReason(
        err instanceof Error ? err.message : "Could not check gh readiness."
      );
      setPublishOpen(true);
    } finally {
      setReadinessLoading(false);
    }
  }, [publishOpen]);

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        className="min-h-72 font-mono text-xs"
        aria-label="Release notes"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(notes);
            toast.success("Release notes copied");
          }}
        >
          <ClipboardIcon />
          Copy notes
        </Button>
        <Button type="button" variant="outline" onClick={() => downloadNotes(draft, notes)}>
          <DownloadIcon />
          Download markdown
        </Button>
        <Button
          type="button"
          variant="default"
          onClick={handleOpenPublish}
          disabled={readinessLoading}
          aria-expanded={publishOpen}
        >
          {readinessLoading ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <UploadCloudIcon />
          )}
          Publish to GitHub
        </Button>
      </div>
      {publishOpen ? (
        <PublishGitHubReleaseForm
          notes={notes}
          readinessReason={readinessReason}
          onClose={() => setPublishOpen(false)}
        />
      ) : null}
    </div>
  );
}

function PublishGitHubReleaseForm({
  notes,
  readinessReason,
  onClose,
}: {
  notes: string;
  readinessReason: string | null;
  onClose: () => void;
}) {
  const defaults = useMemo(() => buildPublishDefaults(), []);
  const [tag, setTag] = useState(defaults.tag);
  const [name, setName] = useState(defaults.name);
  const [prerelease, setPrerelease] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  const disabled = publishing || Boolean(readinessReason);

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
      const result = await createGitHubRelease({
        tag: tag.trim(),
        name: name.trim(),
        body: notes,
        prerelease,
      });
      if (result.ok) {
        setPublishedUrl(result.url);
        toast.success("Release published");
      } else {
        toast.error(result.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }, [name, notes, prerelease, tag]);

  return (
    <div className="rounded-2xl border bg-muted/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-medium">Publish a GitHub Release</div>
        <Badge variant="outline">Local only</Badge>
      </div>
      {readinessReason ? (
        <p className="mb-3 text-xs text-destructive">{readinessReason}</p>
      ) : (
        <p className="mb-3 text-xs text-muted-foreground">
          Runs <code className="font-mono">gh release create</code> using your local gh CLI session. The release body comes from the editor above.
        </p>
      )}

      {publishedUrl ? (
        <div className="flex flex-col gap-2 rounded-xl border bg-background p-3">
          <div className="text-sm font-medium">Release published</div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="max-w-full truncate rounded bg-muted px-2 py-1 font-mono text-xs">
              {publishedUrl}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(publishedUrl);
                toast.success("Release URL copied");
              }}
            >
              <ClipboardIcon />
              Copy URL
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <a
                  href={publishedUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5"
                />
              }
            >
              <ExternalLinkIcon />
              Open
            </Button>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label htmlFor="release-tag" className="text-xs font-medium">
              Tag
            </label>
            <Input
              id="release-tag"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              placeholder="v1.2.3"
              disabled={disabled}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <p className="text-[11px] text-muted-foreground">
              Use semver such as v1.2.3, 1.2.3, or v1.2.3-rc.1.
            </p>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="release-name" className="text-xs font-medium">
              Release name
            </label>
            <Input
              id="release-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Design tokens"
              disabled={disabled}
            />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={prerelease}
              onCheckedChange={(checked) => setPrerelease(checked === true)}
              disabled={disabled}
            />
            Mark as prerelease
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={publishing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={handlePublish}
              disabled={disabled || !tag.trim() || !name.trim()}
            >
              {publishing ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <UploadCloudIcon />
              )}
              Publish
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function buildPublishDefaults() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return {
    tag: `v0.0.0-${yyyy}${mm}${dd}.${hh}${mi}`,
    name: `Design tokens — ${yyyy}-${mm}-${dd}`,
  };
}

function downloadNotes(draft: ReleaseDraft, notes: string) {
  const blob = new Blob([notes], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${draft.id}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  toast.success(`Downloaded ${draft.id}.md`);
}

function Block({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
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

function groupChangesBySet(draftChanges: ReleaseDraft["changes"]) {
  const grouped = new Map<string, ReleaseDraft["changes"]>();
  for (const change of draftChanges) {
    grouped.set(change.setName, [...(grouped.get(change.setName) ?? []), change]);
  }
  return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function groupDesignChangesByArea(draftChanges: ReleaseDraft["designSystemChanges"]) {
  const grouped = new Map<string, ReleaseDraft["designSystemChanges"]>();
  for (const change of draftChanges) {
    grouped.set(change.area, [...(grouped.get(change.area) ?? []), change]);
  }
  return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
}
