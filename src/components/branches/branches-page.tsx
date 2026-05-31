"use client";

import { useMemo, useState } from "react";

import type { WorkspaceBranch } from "@/lib/branches/types";
import type { TokenSet } from "@/lib/dtcg/types";
import type {
  DesignSystemRegistryInput,
  GitStatusSummary,
} from "@/lib/workspace/types";

import { BranchesPane } from "./branches-pane";
import { BranchesWorkspace } from "./branches-workspace";

interface BranchesPageProps {
  git: GitStatusSummary;
  baselineSets: TokenSet[];
  baselineRegistry: DesignSystemRegistryInput;
  initialBranches: WorkspaceBranch[];
}

/**
 * `/branches` follows the Tokens / Themes pattern:
 *
 *   <BranchesPane />          <BranchesWorkspace />
 *   ┌──────────────┐  ┌─────────────────────────────┐
 *   │ Workspace    │  │  Selected branch detail      │
 *   │  Branches    │  │  · metadata + actions        │
 *   │ ▼ main       │  │  · snapshot summary          │
 *   │   exploration│  │  · git integration           │
 *   │              │  │  · diffs                     │
 *   └──────────────┘  └─────────────────────────────┘
 *
 * The persistent `(studio)` layout provides the rounded card wrapper; this
 * component returns the two panes as siblings so they flex side-by-side.
 */
export function BranchesPage({
  git,
  baselineSets,
  baselineRegistry,
  initialBranches,
}: BranchesPageProps) {
  const [branches, setBranches] = useState<WorkspaceBranch[]>(initialBranches);
  // `null` = "no manual override yet"; we derive an effective selection from
  // `branches` (auto-picks the active branch) until the user clicks one. This
  // avoids the setState-in-effect anti-pattern.
  const [selectedOverride, setSelectedOverride] = useState<string | null>(null);

  const selectedId =
    selectedOverride ??
    branches.find((branch) => branch.isActive)?.id ??
    branches[0]?.id ??
    null;
  const setSelectedId = setSelectedOverride;

  const selected = useMemo(
    () => branches.find((branch) => branch.id === selectedId) ?? null,
    [branches, selectedId]
  );

  return (
    <>
      <BranchesPane
        selectedId={selectedId}
        branches={branches}
        onSelect={setSelectedId}
        onBranchesChange={setBranches}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <BranchesWorkspace
          selected={selected}
          branches={branches}
          git={git}
          baselineSets={baselineSets}
          baselineRegistry={baselineRegistry}
          onBranchesChange={setBranches}
          onSelectionChange={setSelectedId}
        />
      </div>
    </>
  );
}
