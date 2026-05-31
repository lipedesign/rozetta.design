"use client";

import { useMemo, useState } from "react";
import {
  KeyRoundIcon,
  PlugZapIcon,
  ServerIcon,
  Settings2Icon,
  Settings2Icon as Settings2IconAlias,
  WorkflowIcon,
} from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import type { SettingsOverview } from "@/lib/settings/types";

import { AboutSettingsPanel } from "./about-settings-panel";
import { AiProvidersPanel } from "./ai-providers-panel";
import { BridgeSettingsPanel } from "./bridge-settings-panel";
import { SettingsCategories } from "./settings-categories";
import type { SettingsCategoryId, SettingsCategoryItem } from "./settings-categories";
import { StorageSettingsPanel } from "./storage-settings-panel";
import { WorkspaceSettingsPanel } from "./workspace-settings-panel";

interface SettingsPageProps {
  overview: SettingsOverview;
}

// Order matches the categories list in the sidebar. Keeping these in one place
// avoids drift between the left rail and the right panel switch below.
const CATEGORIES: SettingsCategoryItem[] = [
  { id: "workspace", label: "Workspace", icon: WorkflowIcon, description: "Identity, name, and role" },
  { id: "ai-providers", label: "AI Providers", icon: KeyRoundIcon, description: "Model and API keys" },
  { id: "bridge", label: "Bridge", icon: PlugZapIcon, description: "Figma plugin pairing" },
  { id: "storage", label: "Storage", icon: ServerIcon, description: "Runtime database" },
  { id: "about", label: "About", icon: Settings2IconAlias, description: "App version and specs" },
];

/**
 * `/settings` shell.
 *
 *   <SettingsCategories />        <Selected panel />
 *   ┌──────────────┐  ┌─────────────────────────────┐
 *   │  Workspace   │  │  Detail editor for active   │
 *   │  AI          │  │  category. Workspace renames│
 *   │  Bridge      │  │  call updateWorkspaceMeta;  │
 *   │  Storage     │  │  AI reuses saveAiSettings;  │
 *   │  About       │  │  Bridge/Storage/About read- │
 *   │              │  │  only.                      │
 *   └──────────────┘  └─────────────────────────────┘
 */
export function SettingsPage({ overview }: SettingsPageProps) {
  const [activeId, setActiveId] = useState<SettingsCategoryId>("workspace");
  const [workspace, setWorkspace] = useState(overview.workspace);

  const headerLabel = useMemo(
    () => CATEGORIES.find((category) => category.id === activeId)?.label ?? "Settings",
    [activeId]
  );

  return (
    <>
      <SettingsCategories
        categories={CATEGORIES}
        activeId={activeId}
        onSelect={setActiveId}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <Settings2Icon className="size-4 text-muted-foreground" />
          <h1 className="text-sm font-medium">{headerLabel}</h1>
        </header>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-6 py-6">
            {activeId === "workspace" ? (
              <WorkspaceSettingsPanel
                workspace={workspace}
                workspaceOptions={overview.workspaceOptions}
                onUpdated={(next) => setWorkspace(next)}
              />
            ) : null}
            {activeId === "ai-providers" ? (
              <AiProvidersPanel initialSettings={overview.aiSettings} />
            ) : null}
            {activeId === "bridge" ? (
              <BridgeSettingsPanel state={overview.figma} />
            ) : null}
            {activeId === "storage" ? (
              <StorageSettingsPanel
                storage={overview.storage}
                runtime={overview.runtime}
              />
            ) : null}
            {activeId === "about" ? (
              <AboutSettingsPanel
                runtime={overview.runtime}
                links={overview.aboutLinks}
              />
            ) : null}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
