import { Suspense } from "react";
import { GitBranchIcon } from "lucide-react";

import { BranchesPage } from "@/components/branches/branches-page";
import { Badge } from "@/components/ui/badge";
import { listWorkspaceBranches } from "@/lib/branches/actions";
import {
  getGitStatusSummary,
  loadGitBaselineDesignSystemRegistry,
  loadGitBaselineTokenSets,
} from "@/lib/git/status";
import { measureAsync } from "@/lib/perf/measure";

export default function BranchesRoute() {
  return (
    <Suspense fallback={<BranchesSkeleton />}>
      <BranchesAsync />
    </Suspense>
  );
}

async function BranchesAsync() {
  const [git, baselineSets, baselineRegistry, branchesResult] = await Promise.all([
    measureAsync("branches.gitStatus", getGitStatusSummary),
    measureAsync("branches.baselineSets", loadGitBaselineTokenSets),
    measureAsync("branches.baselineRegistry", loadGitBaselineDesignSystemRegistry),
    measureAsync("branches.list", listWorkspaceBranches),
  ]);
  const initialBranches = branchesResult.ok ? branchesResult.branches : [];
  return (
    <BranchesPage
      git={git}
      baselineSets={baselineSets}
      baselineRegistry={baselineRegistry}
      initialBranches={initialBranches}
    />
  );
}

function BranchesSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitBranchIcon className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Branches
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Branches</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Reading Git baseline and semantic diff…
          </p>
        </div>
        <Badge variant="outline">Loading</Badge>
      </header>
    </div>
  );
}
