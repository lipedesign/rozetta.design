import { Suspense } from "react";
import { PlugZapIcon } from "lucide-react";

import { FigmaSyncPage } from "@/components/figma-sync/figma-sync-page";
import { Badge } from "@/components/ui/badge";
import { getWorkspaceContext } from "@/lib/auth/workspace-context";
import { getFigmaSyncState } from "@/lib/figma-bridge/actions";
import { createFigmaBridgePairingCode } from "@/lib/figma-bridge/pairing";
import { getGitHubPrDrafts } from "@/lib/github/actions";
import { measureAsync } from "@/lib/perf/measure";

export default function SyncFigmaRoute() {
  return (
    <Suspense fallback={<FigmaSyncSkeleton />}>
      <SyncFigmaAsync />
    </Suspense>
  );
}

async function SyncFigmaAsync() {
  const [workspaceContext, figmaState, prDrafts] = await Promise.all([
    measureAsync("figma.workspaceContext", getWorkspaceContext),
    measureAsync("figma.state", getFigmaSyncState),
    measureAsync("figma.prDrafts", getGitHubPrDrafts),
  ]);
  const generatedAt = new Date().toISOString();
  // Note: previewFigmaToRozetta is intentionally NOT executed at boot. The
  // FigmaSyncPage exposes a "Review latest snapshot" action that calls it on
  // demand, keeping the route fast and the DB read-only on render.
  const pairing = createFigmaBridgePairingCode(workspaceContext);
  const bridgeLocalUrl = process.env.NEXT_PUBLIC_ROZETTA_LOCAL_URL ?? "http://localhost:3001";

  return (
    <FigmaSyncPage
      bridgeLocalUrl={bridgeLocalUrl}
      bridgePairingCode={pairing.code}
      bridgePairingExpiresAt={pairing.expiresAt}
      generatedAt={generatedAt}
      initialFigmaState={figmaState}
      initialPrDrafts={prDrafts}
    />
  );
}

function FigmaSyncSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PlugZapIcon className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Figma sync
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Figma</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Loading bridge state…
          </p>
        </div>
        <Badge variant="outline">Loading</Badge>
      </header>
    </div>
  );
}
