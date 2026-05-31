"use server";

import { revalidatePath } from "next/cache";

import {
  createWorkspaceBranchFromCurrentState,
  deleteWorkspaceBranchFromDb,
  ensureWorkspaceHasMainBranch,
  listWorkspaceBranchesFromDb,
  switchWorkspaceBranch,
  updateWorkspaceBranchMetaInDb,
} from "@/lib/db/repositories/branches";
import type {
  WorkspaceBranch,
  WorkspaceBranchGitBinding,
  WorkspaceBranchSnapshot,
} from "./types";

export type WorkspaceBranchListResult =
  | { ok: true; branches: WorkspaceBranch[] }
  | { ok: false; error: string };

export type WorkspaceBranchResult =
  | { ok: true; branch: WorkspaceBranch }
  | { ok: false; error: string };

export type WorkspaceBranchSwitchResult =
  | { ok: true; branch: WorkspaceBranch; snapshot: WorkspaceBranchSnapshot }
  | { ok: false; error: string };

export async function listWorkspaceBranches(): Promise<WorkspaceBranchListResult> {
  try {
    // Auto-bootstrap a "main" branch on first read so the UI never shows an
    // empty list — the workspace always has at least one branch.
    await ensureWorkspaceHasMainBranch();
    const branches = await listWorkspaceBranchesFromDb();
    return { ok: true, branches };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to list workspace branches.",
    };
  }
}

export async function createWorkspaceBranch(input: {
  name: string;
  description?: string;
  parentBranchId?: string;
  gitBinding?: WorkspaceBranchGitBinding;
  makeActive?: boolean;
}): Promise<WorkspaceBranchResult> {
  try {
    const branch = await createWorkspaceBranchFromCurrentState(input);
    revalidatePath("/branches");
    if (input.makeActive) revalidatePath("/", "layout");
    return { ok: true, branch };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to create workspace branch.",
    };
  }
}

export async function switchToWorkspaceBranch(
  branchId: string
): Promise<WorkspaceBranchSwitchResult> {
  try {
    const detail = await switchWorkspaceBranch(branchId);
    revalidatePath("/", "layout");
    const { snapshot, ...branch } = detail;
    return { ok: true, branch, snapshot };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to switch workspace branch.",
    };
  }
}

export async function deleteWorkspaceBranch(
  branchId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await deleteWorkspaceBranchFromDb(branchId);
    revalidatePath("/branches");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to delete workspace branch.",
    };
  }
}

export async function updateWorkspaceBranchMeta(
  branchId: string,
  patch: { name?: string; description?: string; gitBinding?: WorkspaceBranchGitBinding | null }
): Promise<WorkspaceBranchResult> {
  try {
    const updated = await updateWorkspaceBranchMetaInDb(branchId, patch);
    if (!updated) return { ok: false, error: "Branch not found." };
    revalidatePath("/branches");
    return { ok: true, branch: updated };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to update workspace branch.",
    };
  }
}
