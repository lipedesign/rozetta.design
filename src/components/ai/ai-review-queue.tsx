"use client";

import {
  AlertCircleIcon,
  ArchiveIcon,
  CheckCircle2Icon,
  CopyIcon,
  EyeIcon,
  MoreHorizontalIcon,
  SparklesIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemDescription,
} from "@/components/ai-elements/queue";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type {
  AiPatchOperation,
  AiPatchProposal,
  AiReviewResult,
  GitStatusSummary,
  OperationalContext,
  WorkspaceHealth,
} from "@/lib/workspace/types";

interface AiReviewQueueProps {
  git: GitStatusSummary;
  health: WorkspaceHealth;
  isPending: boolean;
  onApply: () => void;
  onArchiveGroup: (patchIds: string[]) => void;
  onCopy: () => void;
  onPreview: () => void;
  onSelect: (id: string) => void;
  operational?: OperationalContext;
  patchQueue: AiPatchProposal[];
  preview: AiReviewResult | undefined;
  releaseNotes: string;
  selectedPatch: AiPatchProposal | undefined;
  selectedPatchId: string | undefined;
  sessionsCount: number;
}

export function AiReviewQueue({
  git,
  health,
  isPending,
  onApply,
  onArchiveGroup,
  onCopy,
  onPreview,
  onSelect,
  operational,
  patchQueue,
  preview,
  releaseNotes,
  selectedPatch,
  selectedPatchId,
  sessionsCount,
}: AiReviewQueueProps) {
  const groups = groupPatchQueue(patchQueue);
  const selectedGroup =
    groups.find((group) => group.patches.some((patch) => patch.id === selectedPatchId)) ??
    groups[0];
  const visiblePatchCount = groups.reduce(
    (count, group) => count + group.patches.length,
    0
  );
  const hiddenCount = patchQueue.length - visiblePatchCount;
  const syncRunCount = operational?.syncRuns.length ?? 0;
  const prDraftCount = operational?.githubPrDrafts.length ?? 0;

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3">
      <section className="shrink-0">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium tracking-tight">Workspace health</span>
          <BriefingStatus errors={health.summary.errors} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {briefingSummary(health, groups.length)}
        </p>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t pt-3">
          <BriefingStat
            label="Health"
            value={healthLabel(health)}
            tone={health.summary.errors > 0 ? "destructive" : "default"}
          />
          <BriefingStat
            label="Review"
            value={`${groups.length} group${groups.length === 1 ? "" : "s"}`}
          />
          <BriefingStat label="Git" value={gitLabel(git)} />
          <BriefingStat
            label="AI"
            value={`${sessionsCount} session${sessionsCount === 1 ? "" : "s"}`}
          />
        </dl>

        {syncRunCount > 0 || prDraftCount > 0 ? (
          <p className="mt-2.5 text-[11px] text-muted-foreground">
            {[
              syncRunCount > 0
                ? `${syncRunCount} sync run${syncRunCount === 1 ? "" : "s"}`
                : null,
              prDraftCount > 0
                ? `${prDraftCount} PR draft${prDraftCount === 1 ? "" : "s"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </section>

      <section className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 px-0.5">
          <div className="flex items-baseline gap-2 text-sm font-medium tracking-tight">
            Suggestions
            {groups.length > 0 && (
              <span className="text-xs font-normal tabular-nums text-muted-foreground/70">
                {groups.length}
              </span>
            )}
          </div>
          {patchQueue.length > 0 && (
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
              {patchQueue.length} total
            </span>
          )}
        </div>

        {groups.length === 0 ? (
          <ScrollArea className="mt-3 min-h-0 flex-1 pr-1">
            <Empty className="min-h-56 border border-dashed bg-transparent">
              <EmptyContent>
                <EmptyMedia variant="icon">
                  <SparklesIcon />
                </EmptyMedia>
                <EmptyTitle>Queue clear</EmptyTitle>
                <EmptyDescription>
                  Ask Rozetta AI for a reviewed suggestion when the workspace needs action.
                </EmptyDescription>
              </EmptyContent>
            </Empty>
            {hiddenCount > 0 && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {hiddenCount} archived or applied suggestion{hiddenCount === 1 ? "" : "s"} hidden
              </p>
            )}
          </ScrollArea>
        ) : (
          <ScrollArea className="mt-2 min-h-0 flex-1 pr-1">
            <Queue className="gap-0 border-0 bg-transparent p-0 shadow-none">
              <ul className="flex flex-col divide-y divide-border/40">
                {groups.map((group) => {
                  const isActive = group.id === selectedGroup?.id;

                  return (
                    <QueueItem
                      key={group.id}
                      data-active={isActive}
                      className={cn(
                        "group relative w-full rounded-md p-0 text-left transition-colors hover:bg-muted/40",
                        isActive && "bg-muted/60"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(group.activePatch.id)}
                        className="relative w-full rounded-md py-1.5 pl-3 pr-2.5 text-left"
                      >
                        {isActive && (
                          <span
                            aria-hidden
                            className="absolute inset-y-1.5 left-0.5 w-0.5 rounded-full bg-foreground/80"
                          />
                        )}
                        <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                          <span className="min-w-0 flex-1">
                            <QueueItemContent
                              className={cn(
                                "line-clamp-1 text-xs leading-snug",
                                isActive ? "font-medium text-foreground" : "text-foreground"
                              )}
                            >
                              {group.title}
                            </QueueItemContent>
                            <QueueItemDescription className="ml-0 mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                              {group.operationLabels.join(", ")}
                              {group.status !== "pending" ? (
                                <>
                                  <span aria-hidden className="mx-1.5 text-muted-foreground/40">·</span>
                                  <span className="capitalize">{group.status}</span>
                                </>
                              ) : null}
                            </QueueItemDescription>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-0.5">
                            <span className="text-[10px] tabular-nums text-muted-foreground/70 transition-opacity group-hover:opacity-100">
                              {formatRelativeTime(group.latestAt)}
                            </span>
                            {group.patches.length > 1 ? (
                              <span
                                className={cn(
                                  "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] tabular-nums",
                                  isActive
                                    ? "bg-foreground text-background"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                {group.patches.length}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                    </QueueItem>
                  );
                })}
              </ul>
            </Queue>
            {hiddenCount > 0 && (
              <p className="mt-3 px-1 text-xs text-muted-foreground">
                {hiddenCount} archived or applied suggestion{hiddenCount === 1 ? "" : "s"} hidden
              </p>
            )}
          </ScrollArea>
        )}
      </section>

      {selectedPatch && selectedGroup ? (
        <section className="flex h-fit shrink-0 self-end rounded-xl bg-muted p-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{selectedPatch.title}</span>
                  {selectedGroup.patches.length > 1 && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {selectedGroup.patches.length}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-2 text-xs">
                  <span className="shrink-0 text-muted-foreground">Change</span>
                  <span className="min-w-0 truncate text-foreground">
                    {selectedPatch.operations.map(operationLabel).join(" · ")}
                  </span>
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  preview?.ok
                    ? "bg-muted text-muted-foreground"
                    : "bg-destructive/10 text-destructive"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    preview?.ok ? "bg-muted-foreground/60" : "bg-destructive"
                  )}
                />
                {preview?.ok ? "Ready" : "Blocked"}
              </span>
            </div>

            {preview && preview.issues.length > 0 && (
              <div className="flex max-h-24 flex-col overflow-auto border-t pt-2 pr-1">
                {preview.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className="flex items-start gap-2 py-1.5 text-xs leading-5"
                  >
                    <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "mb-0.5 text-[10px] font-medium uppercase tracking-wide",
                          issue.severity === "error"
                            ? "text-destructive"
                            : "text-muted-foreground"
                        )}
                      >
                        {issue.severity}
                      </div>
                      <div>{issue.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="h-7 flex-1 rounded-md text-[11px]"
                onClick={onPreview}
              >
                <EyeIcon />
                Preview
              </Button>
              <Button
                type="button"
                size="xs"
                className="h-7 flex-1 rounded-md text-[11px]"
                onClick={onApply}
                disabled={!preview?.ok || isPending}
              >
                <CheckCircle2Icon />
                Apply
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-muted-foreground"
                      aria-label="More actions"
                    />
                  }
                >
                  <MoreHorizontalIcon className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={onCopy}>
                    <CopyIcon />
                    Copy
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      onArchiveGroup(selectedGroup.patches.map((patch) => patch.id))
                    }
                    disabled={isPending}
                    variant="destructive"
                  >
                    <ArchiveIcon />
                    Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {releaseNotes && (
              <div className="border-t pt-2">
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Release notes preview
                </div>
                <pre className="max-h-28 overflow-auto font-mono text-xs whitespace-pre-wrap">
                  {releaseNotes}
                </pre>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export interface AiPatchGroup {
  activePatch: AiPatchProposal;
  id: string;
  latestAt: string;
  operationLabels: string[];
  patches: AiPatchProposal[];
  status: AiPatchProposal["status"];
  summary: string;
  title: string;
}

export function groupPatchQueue(patches: AiPatchProposal[]): AiPatchGroup[] {
  const grouped = new Map<string, AiPatchProposal[]>();

  for (const patch of patches) {
    if (patch.status === "dismissed" || patch.status === "applied") continue;
    const key = getPatchGroupKey(patch);
    grouped.set(key, [...(grouped.get(key) ?? []), patch]);
  }

  return Array.from(grouped.entries())
    .map(([id, groupPatches]) => {
      const sortedPatches = [...groupPatches].sort(comparePatchNewestFirst);
      const activePatch = sortedPatches[0] as AiPatchProposal;

      return {
        activePatch,
        id,
        latestAt: activePatch.createdAt,
        operationLabels: activePatch.operations.map(operationLabel),
        patches: sortedPatches,
        status: activePatch.status,
        summary: activePatch.summary,
        title: activePatch.title,
      };
    })
    .sort((a, b) => comparePatchNewestFirst(a.activePatch, b.activePatch));
}

export function getPatchGroupKey(patch: AiPatchProposal): string {
  return JSON.stringify([
    patch.status,
    patch.title,
    patch.summary,
    patch.source.taskKind,
    patch.source.providerKind,
    patch.source.modelId,
    patch.operations.map(operationLabel),
  ]);
}

export function summarizePatchGroup(group: AiPatchGroup): string {
  const provider = `${group.activePatch.source.providerKind} · ${group.activePatch.source.modelId}`;
  const operations =
    group.operationLabels.length === 1
      ? group.operationLabels[0]
      : `${group.operationLabels.length} change types`;

  return `${operations} · ${provider}`;
}

export function getActivePatchFromGroup(group: AiPatchGroup): AiPatchProposal {
  return group.activePatch;
}

export function archivePatchGroup(
  patches: AiPatchProposal[],
  groupId: string,
  archivedAt = new Date().toISOString()
): AiPatchProposal[] {
  return patches.map((patch) =>
    getPatchGroupKey(patch) === groupId && patch.status !== "applied"
      ? { ...patch, status: "dismissed", updatedAt: archivedAt }
      : patch
  );
}

function BriefingStat({
  className,
  label,
  value,
  tone = "default",
}: {
  className?: string;
  label: string;
  value: string;
  tone?: "default" | "destructive";
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-sm font-medium tabular-nums leading-tight",
          tone === "destructive" ? "text-destructive" : "text-foreground"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function BriefingStatus({ errors }: { errors: number }) {
  const isAttention = errors > 0;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        isAttention
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          isAttention ? "bg-destructive" : "bg-muted-foreground/60"
        )}
      />
      {isAttention ? "Attention" : "Steady"}
    </span>
  );
}

function briefingSummary(health: WorkspaceHealth, groups: number): string {
  if (health.summary.errors > 0) {
    return `${health.summary.errors} issue${
      health.summary.errors === 1 ? "" : "s"
    } blocking review`;
  }
  if (groups > 0) {
    return `${groups} review group${groups === 1 ? "" : "s"} ready to triage`;
  }
  if (health.summary.warnings > 0) {
    return `${health.summary.warnings} warning${
      health.summary.warnings === 1 ? "" : "s"
    } to watch`;
  }
  return "Workspace is calm";
}

function healthLabel(health: WorkspaceHealth): string {
  if (health.summary.errors > 0) return `${health.summary.errors} errors`;
  if (health.summary.warnings > 0) return `${health.summary.warnings} warnings`;
  if (health.summary.dirtySets > 0) return `${health.summary.dirtySets} dirty sets`;
  return "healthy";
}

function gitLabel(git: GitStatusSummary): string {
  if (!git.available) return "unavailable";
  if (git.clean) return `${git.branch} clean`;
  return `${git.files.length} changed`;
}

const RELATIVE_TIME_DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.345, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

function formatRelativeTime(value: string, nowMs: number = Date.now()): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;

  const diffSeconds = (parsed - nowMs) / 1000;
  if (Math.abs(diffSeconds) < 5) return "just now";

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  let duration = diffSeconds;
  for (const division of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return formatter.format(Math.round(duration), "year");
}

function comparePatchNewestFirst(a: AiPatchProposal, b: AiPatchProposal): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

export function operationLabel(operation: AiPatchOperation): string {
  switch (operation.type) {
    case "token.patch":
      return `Update token ${operation.setId}:${operation.path}`;
    case "theme.upsert":
      return `Update theme ${operation.theme.name}`;
    case "brand.upsert":
      return `Update brand ${operation.brand.name}`;
    case "component.upsert":
      return `Update component ${operation.component.name}`;
    case "release-note.generate":
      return "Generate release notes";
    case "export-profile.upsert":
      return `Update export profile ${operation.profile.name}`;
    case "figma.apply-to-rozetta":
      return `Apply reviewed Figma sync ${operation.syncRunId}`;
    case "figma.push-to-figma":
      return `Prepare Figma writeback ${operation.syncRunId}`;
    case "github.pr.create":
      return `Create GitHub PR from draft ${operation.draftId}`;
  }
}
