"use client";

import { TokenSetsPane } from "@/components/token-sets-pane";
import { Workspace } from "@/components/workspace";

/**
 * Inner content for the editor home (`/`). The persistent `(studio)` layout
 * mounts `ProductShell`, `TokensProvider`, the sidebar, and the shared sheets —
 * this component owns just the editor's two-pane body so navigation between
 * sibling routes does not re-mount the chrome.
 */
export function StudioEditor() {
  return (
    <>
      <TokenSetsPane />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Workspace />
      </div>
    </>
  );
}
