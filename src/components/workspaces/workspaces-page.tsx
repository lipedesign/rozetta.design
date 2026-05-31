"use client";

import { useCallback, useMemo, useState } from "react";

import type { WorkspaceSwitcherOption } from "@/lib/auth/types";

import { WorkspaceDetail } from "./workspace-detail";
import { WorkspacesPane } from "./workspaces-pane";

/**
 * `/workspaces` mirrors `/themes` in structure:
 *
 *   <WorkspacesPane />          <WorkspaceDetail />
 *   ┌──────────────┐  ┌────────────────────────────┐
 *   │ Workspaces   │  │  selected workspace editor  │
 *   │  + New       │  │  · name (editable)          │
 *   │  ▸ Personal  │  │  · slug, org, role, dates   │
 *   │  ▸ Acme      │  │  · "Set as active"          │
 *   └──────────────┘  └────────────────────────────┘
 *
 * The persistent `(studio)` layout already provides the rounded card wrapper;
 * this component returns its two panes as siblings so they flex side-by-side.
 */
export function WorkspacesPage({
  initialWorkspaces,
}: {
  initialWorkspaces: WorkspaceSwitcherOption[];
}) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSwitcherOption[]>(initialWorkspaces);
  const initialSelectedId = useMemo(
    () =>
      initialWorkspaces.find((option) => option.isActive)?.id ??
      initialWorkspaces[0]?.id ??
      null,
    [initialWorkspaces]
  );
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);

  const selected = useMemo(
    () => workspaces.find((option) => option.id === selectedId) ?? null,
    [workspaces, selectedId]
  );

  const upsertWorkspace = useCallback((next: WorkspaceSwitcherOption) => {
    setWorkspaces((prev) => {
      const index = prev.findIndex((entry) => entry.id === next.id);
      if (index === -1) return [...prev, next];
      const clone = prev.slice();
      clone[index] = next;
      return clone;
    });
  }, []);

  const replaceWorkspaces = useCallback((next: WorkspaceSwitcherOption[]) => {
    setWorkspaces(next);
  }, []);

  return (
    <>
      <WorkspacesPane
        workspaces={workspaces}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUpsertWorkspace={upsertWorkspace}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <WorkspaceDetail
          workspace={selected}
          onUpsertWorkspace={upsertWorkspace}
          onReplaceWorkspaces={replaceWorkspaces}
        />
      </div>
    </>
  );
}
