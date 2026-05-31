import { Suspense } from "react";
import { TagIcon } from "lucide-react";

import { ReleasesPage } from "@/components/releases/releases-page";
import { Badge } from "@/components/ui/badge";
import {
  getGitStatusSummary,
  loadGitBaselineDesignSystemRegistry,
  loadGitBaselineTokenSets,
} from "@/lib/git/status";
import { measureAsync } from "@/lib/perf/measure";

export default function ReleasesRoute() {
  return (
    <Suspense fallback={<ReleasesSkeleton />}>
      <ReleasesAsync />
    </Suspense>
  );
}

async function ReleasesAsync() {
  const [git, baselineSets, baselineRegistry] = await Promise.all([
    measureAsync("releases.gitStatus", getGitStatusSummary),
    measureAsync("releases.baselineSets", loadGitBaselineTokenSets),
    measureAsync("releases.baselineRegistry", loadGitBaselineDesignSystemRegistry),
  ]);
  return (
    <ReleasesPage git={git} baselineSets={baselineSets} baselineRegistry={baselineRegistry} />
  );
}

function ReleasesSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TagIcon className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Releases
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Releases</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Building release notes…
          </p>
        </div>
        <Badge variant="outline">Loading</Badge>
      </header>
    </div>
  );
}
