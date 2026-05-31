"use client";

import Link from "next/link";
import { useMemo, type ComponentType, type ReactNode } from "react";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleDotIcon,
  CircleIcon,
  CircleSlashIcon,
  FileWarningIcon,
  GitBranchIcon,
  HeartPulseIcon,
  InfoIcon,
  LayersIcon,
  PackageIcon,
  PaletteIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resolveExportProfileStatus } from "@/lib/workspace/export-profiles";
import { buildWorkspaceHealth } from "@/lib/workspace/validation";
import { useDesignSystemStore } from "@/lib/design-system/store";
import { useTokensStore } from "@/lib/stores/tokens-store";
import { useThemesStore } from "@/lib/themes/store";
import type {
  ExportProfile,
  ExportProfileStatus,
  GitStatusSummary,
  IssueSeverity,
  IssueSource,
  ValidationIssue,
} from "@/lib/workspace/types";

interface DashboardPageProps {
  git: GitStatusSummary;
  exportProfiles: ExportProfile[];
}

export function DashboardPage({ git, exportProfiles }: DashboardPageProps) {
  const sets = useTokensStore((state) => state.sets);
  const originals = useTokensStore((state) => state.originals);
  const themes = useThemesStore((state) => state.themes);
  const components = useDesignSystemStore((state) => state.components);
  const componentsWithoutBrandScopes = useMemo(
    () => components.map((component) => ({ ...component, brandIds: [] })),
    [components]
  );

  const dirtySetIds = useMemo(
    () =>
      sets
        .filter((set) => {
          const original = originals[set.id];
          if (!original) return true;
          return JSON.stringify(set.root) !== JSON.stringify(original);
        })
        .map((set) => set.id),
    [sets, originals]
  );
  const localOnlySetIds = useMemo(
    () => sets.filter((set) => !originals[set.id]).map((set) => set.id),
    [sets, originals]
  );
  const health = useMemo(
    () =>
      buildWorkspaceHealth({
        sets,
        themes,
        exportProfiles,
        brands: [],
        components: componentsWithoutBrandScopes,
        dirtySetIds,
        localOnlySetIds,
        git,
      }),
    [sets, themes, exportProfiles, componentsWithoutBrandScopes, dirtySetIds, localOnlySetIds, git]
  );

  const hasIssues = health.issues.length > 0;
  const healthScore = computeHealthScore(health.summary);
  const groupedIssues = useMemo(() => groupIssuesBySeverity(health.issues), [health.issues]);
  const profilesWithStatus = useMemo(
    () =>
      exportProfiles.map((profile) => ({
        profile,
        status: resolveExportProfileStatus(profile, sets, themes),
      })),
    [exportProfiles, sets, themes]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="bg-background flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheckIcon className="size-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate text-base font-semibold">Dashboard</h1>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Workspace Health
          </span>
        </div>
        <Badge variant={hasIssues ? "outline" : "secondary"} className="gap-1.5">
          {hasIssues ? (
            <>
              <CircleDotIcon className="size-3" />
              {health.issues.length} {health.issues.length === 1 ? "check" : "checks"} to review
            </>
          ) : (
            <>
              <CheckCircle2Icon className="size-3 text-emerald-600" />
              Healthy
            </>
          )}
        </Badge>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <main className="flex flex-col gap-6 px-6 py-5">
          <section>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Local design-system health, theme conflicts, dirty files, and Git
              readiness before sync or release.
            </p>
          </section>

          <section
            aria-label="Hero metrics"
            className="grid grid-cols-1 gap-3 md:grid-cols-3"
          >
            <HeroMetric
              icon={LayersIcon}
              title="Collections"
              value={health.summary.sets}
              caption={`${health.summary.dirtySets} dirty · ${health.summary.localOnlySets} local-only`}
            />
            <HeroMetric
              icon={PaletteIcon}
              title="Themes"
              value={health.summary.themes}
              caption={`${health.summary.tokens} tokens across loaded collections`}
            />
            <HeroMetric
              icon={HeartPulseIcon}
              title="Health score"
              value={`${healthScore}%`}
              caption={
                hasIssues
                  ? `${health.summary.errors} errors · ${health.summary.warnings} warnings · ${health.summary.infos} info`
                  : "All checks passing"
              }
              valueClassName={
                healthScore >= 90
                  ? "text-emerald-600"
                  : healthScore >= 70
                    ? "text-amber-600"
                    : "text-destructive"
              }
            />
          </section>

          <section
            aria-label="Operational status"
            className="grid grid-cols-1 gap-3 lg:grid-cols-2"
          >
            <GitStatusCard git={git} />
            <ExportReadinessCard profilesWithStatus={profilesWithStatus} />
          </section>

          <Separator />

          <section aria-label="Validation issues">
            <header className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium">Validation issues</h2>
                <p className="text-xs text-muted-foreground">
                  Every issue includes a source and the safest next action.
                </p>
              </div>
              {hasIssues ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <SeverityChip severity="error" count={health.summary.errors} />
                  <SeverityChip severity="warning" count={health.summary.warnings} />
                  <SeverityChip severity="info" count={health.summary.infos} />
                </div>
              ) : null}
            </header>

            {!hasIssues ? (
              <Empty className="rounded-lg border bg-background">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CheckCircle2Icon className="text-emerald-600" />
                  </EmptyMedia>
                  <EmptyTitle>All checks passing</EmptyTitle>
                  <EmptyDescription>
                    No broken aliases, theme conflicts, invalid values, or
                    local-only collections found.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col gap-4">
                {(["error", "warning", "info"] as const).map((severity) => {
                  const issues = groupedIssues[severity];
                  if (issues.length === 0) return null;
                  return (
                    <IssueGroup
                      key={severity}
                      severity={severity}
                      issues={issues}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </ScrollArea>
    </div>
  );
}

function HeroMetric({
  icon: Icon,
  title,
  value,
  caption,
  valueClassName,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  value: number | string;
  caption: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-background px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
          {title}
        </span>
        <Icon className="size-4 text-muted-foreground/70" />
      </div>
      <span
        className={`text-3xl font-semibold tracking-tight tabular-nums ${valueClassName ?? ""}`}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{caption}</span>
    </div>
  );
}

function GitStatusCard({ git }: { git: GitStatusSummary }) {
  return (
    <div className="flex flex-col rounded-lg border bg-background">
      <header className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <GitBranchIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Git status</h3>
        </div>
        <Link
          href="/branches"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Open branches
          <ArrowRightIcon className="size-3" />
        </Link>
      </header>
      <Separator />
      {!git.available ? (
        <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
          <CircleSlashIcon className="size-4" />
          {git.error ?? "Git is unavailable in this workspace."}
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4">
          <GitField label="Current branch">
            <span className="font-mono text-sm">{git.branch}</span>
          </GitField>
          <GitField label="Worktree">
            {git.clean ? (
              <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                <CheckCircle2Icon className="size-3.5" />
                Clean
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm">
                <FileWarningIcon className="size-3.5 text-amber-600" />
                {git.files.length} changed
              </span>
            )}
          </GitField>
          <GitField label="Ahead / behind">
            <span className="font-mono text-sm tabular-nums">
              {git.ahead} / {git.behind}
            </span>
          </GitField>
          <GitField label="Tracked artifacts">
            <span className="text-sm tabular-nums">
              {git.tokenFiles.length} token · {git.designSystemFiles.length} DS
            </span>
          </GitField>
        </dl>
      )}
    </div>
  );
}

function GitField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function ExportReadinessCard({
  profilesWithStatus,
}: {
  profilesWithStatus: Array<{ profile: ExportProfile; status: ExportProfileStatus }>;
}) {
  const validCount = profilesWithStatus.filter((entry) => entry.status === "valid").length;

  return (
    <div className="flex flex-col rounded-lg border bg-background">
      <header className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <PackageIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Export readiness</h3>
        </div>
        <Badge variant="outline" className="text-xs">
          {validCount}/{profilesWithStatus.length} valid
        </Badge>
      </header>
      <Separator />
      {profilesWithStatus.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
          <CircleSlashIcon className="size-4" />
          No export profiles configured.
        </div>
      ) : (
        <ul className="divide-y">
          {profilesWithStatus.map(({ profile, status }) => (
            <li
              key={profile.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{profile.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {profile.format} · {profile.targetKind}/{profile.targetId}
                </div>
              </div>
              <ExportStatusBadge status={status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExportStatusBadge({ status }: { status: ExportProfileStatus }) {
  if (status === "valid") {
    return (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2Icon className="size-3 text-emerald-600" />
        Valid
      </Badge>
    );
  }
  if (status === "missing-target") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircleIcon className="size-3" />
        Missing target
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <CircleIcon className="size-3" />
      Planned
    </Badge>
  );
}

function IssueGroup({
  severity,
  issues,
}: {
  severity: IssueSeverity;
  issues: ValidationIssue[];
}) {
  const meta = SEVERITY_META[severity];
  const Icon = meta.icon;
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className={`size-4 ${meta.iconColor}`} />
          <h3 className="text-sm font-medium">{meta.label}</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {issues.length}
          </span>
        </div>
      </header>
      <Separator />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Issue</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue) => (
            <TableRow key={issue.id}>
              <TableCell className="whitespace-normal">
                <div className="font-medium">{issue.title}</div>
                <div className="text-xs text-muted-foreground">{issue.detail}</div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatSource(issue.source)}
              </TableCell>
              <TableCell className="max-w-64 whitespace-normal text-xs text-muted-foreground">
                {issue.action}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SeverityChip({
  severity,
  count,
}: {
  severity: IssueSeverity;
  count: number;
}) {
  const meta = SEVERITY_META[severity];
  const Icon = meta.icon;
  return (
    <Badge variant={count > 0 ? meta.badgeVariant : "outline"} className="gap-1">
      <Icon className="size-3" />
      {meta.label}
      <span className="tabular-nums">{count}</span>
    </Badge>
  );
}

const SEVERITY_META: Record<
  IssueSeverity,
  {
    label: string;
    icon: ComponentType<{ className?: string }>;
    iconColor: string;
    badgeVariant: "destructive" | "outline" | "secondary";
  }
> = {
  error: {
    label: "Errors",
    icon: CircleAlertIcon,
    iconColor: "text-destructive",
    badgeVariant: "destructive",
  },
  warning: {
    label: "Warnings",
    icon: AlertTriangleIcon,
    iconColor: "text-amber-600",
    badgeVariant: "outline",
  },
  info: {
    label: "Info",
    icon: InfoIcon,
    iconColor: "text-muted-foreground",
    badgeVariant: "secondary",
  },
};

function groupIssuesBySeverity(
  issues: ValidationIssue[]
): Record<IssueSeverity, ValidationIssue[]> {
  const groups: Record<IssueSeverity, ValidationIssue[]> = {
    error: [],
    warning: [],
    info: [],
  };
  for (const issue of issues) {
    groups[issue.severity].push(issue);
  }
  return groups;
}

function computeHealthScore(summary: {
  errors: number;
  warnings: number;
  infos: number;
}): number {
  // Errors weigh heaviest, warnings next, infos lightly. Floor at 0.
  const penalty = summary.errors * 15 + summary.warnings * 5 + summary.infos * 1;
  return Math.max(0, Math.min(100, 100 - penalty));
}

function formatSource(source: IssueSource) {
  const parts = [
    source.kind,
    source.setId,
    source.themeId,
    source.brandId,
    source.componentId,
    source.path,
    source.file,
  ].filter(Boolean);
  return parts.join(" / ");
}
