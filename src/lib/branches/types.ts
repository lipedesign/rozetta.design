import type { TokenSet } from "@/lib/dtcg/types";
import type { Theme, ThemeGroup } from "@/lib/themes/types";

/**
 * Snapshot of the full workspace state for a single Workspace Branch.
 * Branches are DB-first and independent of Git; they capture the entire
 * Collections + Modes + Tokens + Themes + Theme Groups state.
 */
export interface WorkspaceBranchSnapshot {
  sets: TokenSet[];
  themes: Theme[];
  themeGroups: ThemeGroup[];
}

/**
 * Optional metadata linking a Workspace Branch to a git/GitHub branch. The
 * binding is informational only in v1 — switching the workspace branch does
 * NOT mutate Git. Users with a local git repo can use the existing
 * /branches Git action bar to keep them in sync manually.
 */
export interface WorkspaceBranchGitBinding {
  repo?: string;
  branchName?: string;
  lastSyncedAt?: string;
}

export interface WorkspaceBranch {
  id: string;
  name: string;
  description?: string;
  parentBranchId?: string;
  gitBinding?: WorkspaceBranchGitBinding;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceBranchDetail extends WorkspaceBranch {
  snapshot: WorkspaceBranchSnapshot;
}
