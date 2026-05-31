import { Suspense } from "react";
import { BotIcon } from "lucide-react";

import { AiAssistantHome } from "@/components/ai/ai-assistant-home";
import { Badge } from "@/components/ui/badge";
import {
  getAiConversation,
  getAiPatchQueue,
  getAiSessions,
  getAiSettings,
} from "@/lib/ai-os/actions";
import { getExportProfiles } from "@/lib/export-profiles/actions";
import { getFigmaSyncState } from "@/lib/figma-bridge/actions";
import { getGitStatusSummary, loadGitBaselineTokenSets } from "@/lib/git/status";
import { getGitHubPrDrafts } from "@/lib/github/actions";
import { measureAsync } from "@/lib/perf/measure";

export default function AiRoute() {
  return (
    <Suspense fallback={<AiSkeleton />}>
      <AiAsync />
    </Suspense>
  );
}

async function AiAsync() {
  const [
    settings,
    conversation,
    profiles,
    git,
    baselineSets,
    patches,
    sessions,
    figmaState,
    prDrafts,
  ] = await Promise.all([
    measureAsync("ai.settings", getAiSettings),
    measureAsync("ai.conversation", getAiConversation),
    measureAsync("ai.exportProfiles", getExportProfiles),
    measureAsync("ai.gitStatus", getGitStatusSummary),
    measureAsync("ai.baselineSets", loadGitBaselineTokenSets),
    measureAsync("ai.patches", getAiPatchQueue),
    measureAsync("ai.sessions", getAiSessions),
    measureAsync("ai.figmaState", getFigmaSyncState),
    measureAsync("ai.prDrafts", getGitHubPrDrafts),
  ]);

  return (
    <AiAssistantHome
      initialSettings={settings.settings}
      initialPatches={patches.patches}
      initialSessions={sessions.sessions}
      initialConversation={conversation.conversation}
      exportProfiles={profiles.profiles}
      baselineSets={baselineSets}
      git={git}
      operational={{
        figma: figmaState,
        githubPrDrafts: prDrafts,
        syncRuns: figmaState.recentSyncRuns,
      }}
    />
  );
}

function AiSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BotIcon className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              AI Assistant
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Ask AI</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Preparing workspace context…
          </p>
        </div>
        <Badge variant="outline">Loading</Badge>
      </header>
    </div>
  );
}
