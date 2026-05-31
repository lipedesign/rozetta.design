import { Suspense } from "react";

import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { ShieldCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getExportProfiles } from "@/lib/export-profiles/actions";
import { getGitStatusSummary } from "@/lib/git/status";
import { measureAsync } from "@/lib/perf/measure";

export default function DashboardRoute() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardAsync />
    </Suspense>
  );
}

async function DashboardAsync() {
  const [git, profiles] = await Promise.all([
    measureAsync("dashboard.gitStatus", getGitStatusSummary),
    measureAsync("dashboard.exportProfiles", getExportProfiles),
  ]);
  return <DashboardPage git={git} exportProfiles={profiles.profiles} />;
}

function DashboardSkeleton() {
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
        <Badge variant="outline">Loading</Badge>
      </header>
      <div className="flex flex-col gap-6 px-6 py-5">
        <Skeleton className="h-4 w-80" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Skeleton className="h-44 rounded-lg" />
          <Skeleton className="h-44 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
