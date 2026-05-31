"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDotIcon,
  GitBranchIcon,
  GitCompareIcon,
  GitPullRequestIcon,
  LayersIcon,
  LoaderCircleIcon,
  PaletteIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  deleteWorkspaceBranch,
  listWorkspaceBranches,
} from "@/lib/branches/actions";
import { runBranchSwitch } from "@/lib/branches/switch-state";
import type { WorkspaceBranch } from "@/lib/branches/types";
import { useDesignSystemStore } from "@/lib/design-system/store";
import { diffDesignSystemRegistry } from "@/lib/design-system/registry";
import {
  createGitBranch,
  listLocalBranches,
  switchGitBranch,
  type LocalBranch,
} from "@/lib/git/actions";
import { createGitHubPrDraft } from "@/lib/github/actions";
import { useTokensStore } from "@/lib/stores/tokens-store";
import { useThemesStore } from "@/lib/themes/store";
import { diffTokenSets } from "@/lib/workspace/diff";
import type { TokenSet } from "@/lib/dtcg/types";
import type {
  DesignSystemChange,
  DesignSystemRegistryInput,
  GitStatusSummary,
  TokenChange,
} from "@/lib/workspace/types";

interface BranchesWorkspaceProps {
  selected: WorkspaceBranch | null;
  branches: WorkspaceBranch[];
  git: GitStatusSummary;
  baselineSets: TokenSet[];
  baselineRegistry: DesignSystemRegistryInput;
  onBranchesChange: (next: WorkspaceBranch[]) => void;
  onSelectionChange: (id: string | null) => void;
}

export function BranchesWorkspace({
  selected,
  branches,
  git,
  baselineSets,
  baselineRegistry,
  onBranchesChange,
  onSelectionChange,
}: BranchesWorkspaceProps) {
  if (!selected) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitBranchIcon />
            </EmptyMedia>
            <EmptyTitle>No branch selected</EmptyTitle>
            <EmptyDescription>
              Pick a Workspace Branch on the left, or create a new one with the
              + button.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <BranchDetail
      key={selected.id}
      branch={selected}
      branches={branches}
      git={git}
      baselineSets={baselineSets}
      baselineRegistry={baselineRegistry}
      onBranchesChange={onBranchesChange}
      onSelectionChange={onSelectionChange}
    />
  );
}

interface BranchDetailProps {
  branch: WorkspaceBranch;
  branches: WorkspaceBranch[];
  git: GitStatusSummary;
  baselineSets: TokenSet[];
  baselineRegistry: DesignSystemRegistryInput;
  onBranchesChange: (next: WorkspaceBranch[]) => void;
  onSelectionChange: (id: string | null) => void;
}

function BranchDetail({
  branch,
  branches,
  git,
  baselineSets,
  baselineRegistry,
  onBranchesChange,
  onSelectionChange,
}: BranchDetailProps) {
  const router = useRouter();
  const sets = useTokensStore((state) => state.sets);
  const hydrateTokens = useTokensStore((state) => state.hydrate);
  const themes = useThemesStore((state) => state.themes);
  const hydrateThemes = useThemesStore((state) => state.hydrate);
  const setThemeGroups = useThemesStore((state) => state.setThemeGroups);
  const brands = useDesignSystemStore((state) => state.brands);
  const components = useDesignSystemStore((state) => state.components);
  const [isPending, startTransition] = useTransition();
  const tokenDiff = useMemo(
    () => diffTokenSets(baselineSets, sets),
    [baselineSets, sets]
  );
  const registryDiff = useMemo(
    () => diffDesignSystemRegistry(baselineRegistry, { themes, brands, components }),
    [baselineRegistry, brands, components, themes]
  );

  async function refreshBranches() {
    const result = await listWorkspaceBranches();
    if (result.ok) onBranchesChange(result.branches);
  }

  function handleSwitch() {
    if (branch.isActive) return;
    startTransition(async () => {
      const result = await runBranchSwitch(branch.id, branch.name);
      if (!result.ok) {
        toast.error("Couldn't switch", { description: result.error });
        return;
      }
      hydrateTokens(result.snapshot.sets);
      hydrateThemes(result.snapshot.themes);
      setThemeGroups(result.snapshot.themeGroups);
      toast.success(`On branch "${result.branch.name}"`);
      await refreshBranches();
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(`Delete workspace branch "${branch.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteWorkspaceBranch(branch.id);
      if (!result.ok) {
        toast.error("Couldn't delete", { description: result.error });
        return;
      }
      toast.success(`Branch "${branch.name}" deleted`);
      onSelectionChange(null);
      await refreshBranches();
    });
  }

  function handleCreatePrDraft() {
    startTransition(async () => {
      try {
        const draft = await createGitHubPrDraft({
          title: `Sync from ${branch.name}`,
        });
        toast.success("PR draft created", {
          description: `Branch: ${draft.branchName}. Publish from /sync/figma.`,
        });
      } catch (err) {
        toast.error("Couldn't create PR draft", {
          description: err instanceof Error ? err.message : "Unknown error.",
        });
      }
    });
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="bg-background flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranchIcon className="size-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate font-mono text-base font-semibold">{branch.name}</h1>
          {branch.isActive ? (
            <Badge variant="default" className="gap-1">
              <CircleDotIcon className="size-3" />
              Active
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {!branch.isActive ? (
            <Button size="sm" onClick={handleSwitch} disabled={isPending}>
              {isPending ? (
                <LoaderCircleIcon className="size-3.5 animate-spin" />
              ) : (
                <ArrowRightLeftIcon className="size-3.5" />
              )}
              Switch to this branch
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={handleCreatePrDraft}
            disabled={isPending}
          >
            <GitPullRequestIcon className="size-3.5" />
            Create PR draft
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-destructive hover:text-destructive size-7"
            onClick={handleDelete}
            disabled={isPending || branch.isActive || branches.length <= 1}
            title={
              branch.isActive
                ? "Switch first to delete"
                : branches.length <= 1
                  ? "Cannot delete the only branch"
                  : "Delete branch"
            }
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <main className="flex flex-col gap-6 px-6 py-5">
          {/* Branch metadata */}
          <section>
            {branch.description ? (
              <p className="text-sm text-muted-foreground">{branch.description}</p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              Created {new Date(branch.createdAt).toLocaleString()} · Updated{" "}
              {new Date(branch.updatedAt).toLocaleString()}
            </p>
            {branch.gitBinding?.branchName ? (
              <Badge variant="outline" className="mt-2 font-mono text-xs">
                Linked to git: {branch.gitBinding.branchName}
              </Badge>
            ) : null}
          </section>

          <Separator />

          {/* Snapshot summary */}
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Metric
              icon={<LayersIcon className="size-3.5" />}
              title="Collections"
              value={sets.length}
              description={`${sets.reduce((acc, set) => acc + (set.modes?.length ?? 1), 0)} mode${
                sets.reduce((acc, set) => acc + (set.modes?.length ?? 1), 0) === 1 ? "" : "s"
              }`}
            />
            <Metric
              icon={<PaletteIcon className="size-3.5" />}
              title="Themes"
              value={themes.length}
            />
            <Metric
              icon={<GitCompareIcon className="size-3.5" />}
              title="Diff vs git HEAD"
              value={tokenDiff.summary.total + registryDiff.summary.total}
              description={`${tokenDiff.summary.total} token, ${registryDiff.summary.total} registry`}
            />
          </section>

          {/* Git integration (collapsible inline) */}
          <Separator />
          <section>
            <header className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium">Git integration</h2>
                <p className="text-xs text-muted-foreground">
                  Optional: keep this workspace branch in sync with the local git
                  repo and remote.
                </p>
              </div>
              <GitActionBar git={git} />
            </header>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Metric
                icon={<GitBranchIcon className="size-3.5" />}
                title="Current git branch"
                value={git.available ? git.branch : "Unavailable"}
                description={git.available ? `${git.ahead} ahead, ${git.behind} behind` : git.error}
              />
              <Metric
                title="Worktree"
                value={git.clean ? "Clean" : `${git.files.length} changed`}
                description={`${git.tokenFiles.length} token, ${git.designSystemFiles.length} DS files`}
              />
              <Metric
                title="Tracked artifacts"
                value={`tokens/, .rozetta/*.json`}
                description="Allowlist staged on publish."
              />
            </div>
          </section>

          {/* Diffs */}
          {git.files.length > 0 ? (
            <>
              <Separator />
              <section>
                <header className="mb-3">
                  <h2 className="text-sm font-medium">Changed files</h2>
                  <p className="text-xs text-muted-foreground">
                    Git porcelain status scoped by file.
                  </p>
                </header>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Path</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {git.files.map((file) => (
                        <TableRow key={`${file.path}:${file.indexStatus}:${file.worktreeStatus}`}>
                          <TableCell>
                            <Badge variant="outline">{file.kind}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {file.path}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </>
          ) : null}

          {tokenDiff.changes.length > 0 ? (
            <>
              <Separator />
              <section>
                <header className="mb-3">
                  <h2 className="text-sm font-medium">Semantic token diff</h2>
                  <p className="text-xs text-muted-foreground">
                    Token-level changes vs the git baseline.
                  </p>
                </header>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Change</TableHead>
                        <TableHead>Token</TableHead>
                        <TableHead>Before</TableHead>
                        <TableHead>After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tokenDiff.changes.slice(0, 200).map((change) => (
                        <ChangeRow key={change.id} change={change} />
                      ))}
                    </TableBody>
                  </Table>
                  {tokenDiff.changes.length > 200 ? (
                    <p className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                      Showing the first 200 of {tokenDiff.changes.length} changes.
                    </p>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}

          {registryDiff.changes.length > 0 ? (
            <>
              <Separator />
              <section>
                <header className="mb-3">
                  <h2 className="text-sm font-medium">Design system registry diff</h2>
                  <p className="text-xs text-muted-foreground">
                    Theme, brand, and component registry changes.
                  </p>
                </header>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Area</TableHead>
                        <TableHead>Change</TableHead>
                        <TableHead>Name</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registryDiff.changes.map((change) => (
                        <RegistryChangeRow key={change.id} change={change} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </>
          ) : null}
        </main>
      </ScrollArea>
    </div>
  );
}

function GitActionBar({ git }: { git: GitStatusSummary }) {
  const [branches, setBranches] = useState<LocalBranch[]>([]);
  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listLocalBranches().then((result) => {
      if (cancelled) return;
      if (result.ok) setBranches(result.branches);
    });
    return () => {
      cancelled = true;
    };
  }, [git.branch]);

  async function refresh() {
    const result = await listLocalBranches();
    if (result.ok) setBranches(result.branches);
  }

  function handleSwitch(name: string) {
    if (name === git.branch) return;
    startTransition(async () => {
      const result = await switchGitBranch(name);
      if (!result.ok) {
        toast.error("Couldn't switch git branch", { description: result.error });
        return;
      }
      toast.success(`Switched git to ${result.branch}`);
      await refresh();
    });
  }

  function handleCreate() {
    const name = newBranchName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createGitBranch(name);
      if (!result.ok) {
        toast.error("Couldn't create git branch", { description: result.error });
        return;
      }
      toast.success(`Created and switched git to ${result.branch}`);
      setNewBranchName("");
      setCreating(false);
      await refresh();
    });
  }

  if (!git.available) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Git unavailable
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="sm" variant="outline" disabled={isPending}>
              <GitBranchIcon className="size-3.5" />
              {git.branch}
              <ChevronDownIcon className="size-3.5" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
          {branches.length === 0 ? (
            <DropdownMenuItem disabled>No local branches</DropdownMenuItem>
          ) : (
            branches.map((branch) => (
              <DropdownMenuItem key={branch.name} onClick={() => handleSwitch(branch.name)}>
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs">{branch.name}</span>
                  {branch.isCurrent ? (
                    <CheckIcon className="size-3 text-muted-foreground" />
                  ) : null}
                </div>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {creating ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={newBranchName}
            onChange={(event) => setNewBranchName(event.target.value)}
            placeholder="new-branch"
            className="h-8 w-48 font-mono text-xs"
            onKeyDown={(event) => {
              if (event.key === "Enter") handleCreate();
              if (event.key === "Escape") {
                setCreating(false);
                setNewBranchName("");
              }
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={handleCreate}
            disabled={!newBranchName.trim() || isPending}
            title="Create"
          >
            <CheckIcon className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => {
              setCreating(false);
              setNewBranchName("");
            }}
            title="Cancel"
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCreating(true)}
          disabled={isPending}
        >
          <PlusIcon className="size-3.5" />
          New git branch
        </Button>
      )}
    </div>
  );
}

function Metric({
  icon,
  title,
  value,
  description,
}: {
  icon?: ReactNode;
  title: string;
  value: string | number;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-background px-4 py-3">
      <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase text-muted-foreground">
        {icon}
        {title}
      </span>
      <span className="text-xl font-semibold tracking-tight">{value}</span>
      {description ? (
        <span className="text-xs text-muted-foreground">{description}</span>
      ) : null}
    </div>
  );
}

function ChangeRow({ change }: { change: TokenChange }) {
  return (
    <TableRow>
      <TableCell>
        <Badge variant={change.kind.includes("removed") ? "destructive" : "outline"}>
          {change.kind}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-normal">
        <div className="font-medium">{change.setName}</div>
        <div className="text-xs text-muted-foreground">{change.path ?? "Set-level change"}</div>
      </TableCell>
      <TableCell className="max-w-64 whitespace-normal text-xs text-muted-foreground">
        {change.before ?? "—"}
      </TableCell>
      <TableCell className="max-w-64 whitespace-normal text-xs text-muted-foreground">
        {change.after ?? "—"}
      </TableCell>
    </TableRow>
  );
}

function RegistryChangeRow({ change }: { change: DesignSystemChange }) {
  return (
    <TableRow>
      <TableCell>
        <Badge variant="secondary">{change.area}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant={change.kind.includes("removed") ? "destructive" : "outline"}>
          {change.kind}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-normal">
        <div className="font-medium">{change.name}</div>
        <div className="text-xs text-muted-foreground">
          {change.before ?? "none"} → {change.after ?? "none"}
        </div>
      </TableCell>
    </TableRow>
  );
}
