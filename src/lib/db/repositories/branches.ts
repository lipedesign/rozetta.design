import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import {
  workspaceBranches,
  workspaces,
} from "@/lib/db/schema";
import { getDb } from "@/lib/db/runtime";
import {
  deleteTokenSetFromDb,
  listThemeGroupsFromDb,
  listThemesFromDb,
  listTokenSetsFromDb,
  replaceThemesInDb,
  upsertTokenSetInDb,
} from "./workspace";
import {
  createThemeGroupInDb,
  deleteThemeGroupFromDb,
  upsertThemeInDb,
} from "./workspace";
import type { WorkspaceContext } from "@/lib/auth/types";
import {
  getWorkspaceContext,
  requireWorkspaceRole,
} from "@/lib/auth/workspace-context";
import type {
  WorkspaceBranch,
  WorkspaceBranchDetail,
  WorkspaceBranchGitBinding,
  WorkspaceBranchSnapshot,
} from "@/lib/branches/types";

async function resolveWorkspaceContext(context?: WorkspaceContext) {
  return context ?? (await getWorkspaceContext());
}

/**
 * Serializes the current workspace state (Collections + Modes + Tokens +
 * Themes + Theme Groups) into a `WorkspaceBranchSnapshot`. Used by both
 * "create branch from current state" and "save current state into active
 * branch before switching".
 */
async function captureSnapshot(
  context: WorkspaceContext
): Promise<WorkspaceBranchSnapshot> {
  const [sets, themes, themeGroups] = await Promise.all([
    listTokenSetsFromDb(context),
    listThemesFromDb(context),
    listThemeGroupsFromDb(context),
  ]);
  return { sets, themes, themeGroups };
}

interface BranchListRow {
  id: string;
  name: string;
  description: string | null;
  parentBranchId: string | null;
  gitBinding: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToBranch(
  row: BranchListRow,
  activeBranchId: string | null
): WorkspaceBranch {
  let gitBinding: WorkspaceBranchGitBinding | undefined;
  if (row.gitBinding) {
    try {
      gitBinding = JSON.parse(row.gitBinding) as WorkspaceBranchGitBinding;
    } catch {
      gitBinding = undefined;
    }
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    parentBranchId: row.parentBranchId ?? undefined,
    gitBinding,
    isActive: row.id === activeBranchId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function readActiveBranchId(
  workspaceId: string
): Promise<string | null> {
  const row = await getDb()
    .select({ activeBranchId: workspaces.activeBranchId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
    .then((rows) => rows[0]);
  return row?.activeBranchId ?? null;
}

export async function listWorkspaceBranchesFromDb(
  context?: WorkspaceContext
): Promise<WorkspaceBranch[]> {
  const resolvedContext = await resolveWorkspaceContext(context);
  const [rows, activeBranchId] = await Promise.all([
    getDb()
      .select({
        id: workspaceBranches.id,
        name: workspaceBranches.name,
        description: workspaceBranches.description,
        parentBranchId: workspaceBranches.parentBranchId,
        gitBinding: workspaceBranches.gitBinding,
        createdAt: workspaceBranches.createdAt,
        updatedAt: workspaceBranches.updatedAt,
      })
      .from(workspaceBranches)
      .where(eq(workspaceBranches.workspaceId, resolvedContext.workspaceId))
      .orderBy(asc(workspaceBranches.createdAt)),
    readActiveBranchId(resolvedContext.workspaceId),
  ]);
  return rows.map((row) => rowToBranch(row, activeBranchId));
}

export async function getWorkspaceBranchFromDb(
  branchId: string,
  context?: WorkspaceContext
): Promise<WorkspaceBranchDetail | undefined> {
  const resolvedContext = await resolveWorkspaceContext(context);
  const row = await getDb()
    .select()
    .from(workspaceBranches)
    .where(
      and(
        eq(workspaceBranches.workspaceId, resolvedContext.workspaceId),
        eq(workspaceBranches.id, branchId)
      )
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (!row) return undefined;
  const activeBranchId = await readActiveBranchId(resolvedContext.workspaceId);
  const base = rowToBranch(row, activeBranchId);
  let snapshot: WorkspaceBranchSnapshot;
  try {
    snapshot = JSON.parse(row.snapshot) as WorkspaceBranchSnapshot;
  } catch {
    snapshot = { sets: [], themes: [], themeGroups: [] };
  }
  return { ...base, snapshot };
}

export async function createWorkspaceBranchFromCurrentState(
  input: {
    name: string;
    description?: string;
    parentBranchId?: string;
    gitBinding?: WorkspaceBranchGitBinding;
    makeActive?: boolean;
  },
  context?: WorkspaceContext
): Promise<WorkspaceBranch> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  const name = input.name.trim();
  if (!name) throw new Error("Branch name is required.");
  const snapshot = await captureSnapshot(resolvedContext);
  const now = new Date().toISOString();
  const id = `branch:${randomUUID()}`;
  const db = getDb();
  await db.insert(workspaceBranches).values({
    id,
    workspaceId: resolvedContext.workspaceId,
    name,
    description: input.description ?? null,
    parentBranchId: input.parentBranchId ?? null,
    snapshot: JSON.stringify(snapshot),
    gitBinding: input.gitBinding ? JSON.stringify(input.gitBinding) : null,
    createdBy: resolvedContext.userId,
    updatedBy: resolvedContext.userId,
    createdAt: now,
    updatedAt: now,
  });
  if (input.makeActive) {
    await db
      .update(workspaces)
      .set({ activeBranchId: id, updatedAt: now })
      .where(eq(workspaces.id, resolvedContext.workspaceId));
  }
  return {
    id,
    name,
    description: input.description,
    parentBranchId: input.parentBranchId,
    gitBinding: input.gitBinding,
    isActive: Boolean(input.makeActive),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Ensures the workspace has at least one branch. Auto-creates a "main"
 * branch (active) from the current state on first read. Idempotent.
 */
export async function ensureWorkspaceHasMainBranch(
  context?: WorkspaceContext
): Promise<WorkspaceBranch> {
  const resolvedContext = await resolveWorkspaceContext(context);
  const existing = await listWorkspaceBranchesFromDb(resolvedContext);
  if (existing.length > 0) {
    const active = existing.find((branch) => branch.isActive) ?? existing[0]!;
    if (!existing.some((branch) => branch.isActive)) {
      // No active branch set yet — make the first one active.
      const now = new Date().toISOString();
      await getDb()
        .update(workspaces)
        .set({ activeBranchId: active.id, updatedAt: now })
        .where(eq(workspaces.id, resolvedContext.workspaceId));
      return { ...active, isActive: true };
    }
    return active;
  }
  return createWorkspaceBranchFromCurrentState(
    {
      name: "main",
      description: "Default workspace branch.",
      makeActive: true,
    },
    resolvedContext
  );
}

/**
 * Apply a snapshot to the current workspace state. Replaces Collections,
 * Themes, and Theme Groups — but only the sections that actually changed
 * relative to the live workspace. Each section is gated by its own hash so
 * a partial diff (e.g. only themes changed) avoids the heavy token rewrite.
 */
async function applySnapshot(
  snapshot: WorkspaceBranchSnapshot,
  context: WorkspaceContext,
  current?: WorkspaceBranchSnapshot
): Promise<void> {
  const baseline = current ?? (await captureSnapshot(context));

  // Tokens
  const setsBefore = stableStringify(baseline.sets);
  const setsAfter = stableStringify(snapshot.sets);
  if (setsBefore !== setsAfter) {
    await applyTokenSetsDelta(baseline.sets, snapshot.sets, context);
  }

  // Themes (replace strategy — replaceThemesInDb already deletes + inserts)
  const themesBefore = stableStringify(baseline.themes);
  const themesAfter = stableStringify(snapshot.themes);
  if (themesBefore !== themesAfter) {
    await replaceThemesInDb(snapshot.themes, { audit: false }, context);
  }

  // Theme Groups: replace strategy
  const groupsBefore = stableStringify(baseline.themeGroups);
  const groupsAfter = stableStringify(snapshot.themeGroups);
  if (groupsBefore !== groupsAfter) {
    const currentGroups = await listThemeGroupsFromDb(context);
    for (const group of currentGroups) {
      await deleteThemeGroupFromDb(group.id, context);
    }
    for (const group of snapshot.themeGroups) {
      const created = await createThemeGroupInDb(
        { name: group.name, description: group.description },
        context
      );
      for (const theme of snapshot.themes.filter((t) => t.themeGroupId === group.id)) {
        await upsertThemeInDb(
          { ...theme, themeGroupId: created.id },
          { audit: false },
          context
        );
      }
    }
  }
}

async function applyTokenSetsDelta(
  currentSets: WorkspaceBranchSnapshot["sets"],
  targetSets: WorkspaceBranchSnapshot["sets"],
  context: WorkspaceContext
): Promise<void> {
  const targetById = new Map(targetSets.map((set) => [set.id, set]));
  const currentById = new Map(currentSets.map((set) => [set.id, set]));

  // Delete sets that are no longer in the target snapshot.
  for (const set of currentSets) {
    if (!targetById.has(set.id)) {
      await deleteTokenSetFromDb(set.id, context);
    }
  }
  // Upsert sets that are new or whose serialized shape changed.
  for (const set of targetSets) {
    const existing = currentById.get(set.id);
    if (!existing || stableStringify(existing) !== stableStringify(set)) {
      await upsertTokenSetInDb(set, { source: "branch-switch", audit: false }, context);
    }
  }
}

/**
 * Save current workspace state into the active branch (if any), then load
 * the target branch's snapshot into the workspace. After the switch,
 * `workspaces.active_branch_id` points to the target.
 *
 * Optimisations:
 *   - Capture the current state ONCE up front and reuse it for both the
 *     auto-save comparison and the target-equality comparison.
 *   - Skip the auto-save UPDATE if the active branch already holds the
 *     current state byte-for-byte (no DB write).
 *   - Skip the entire `applySnapshot` if the target branch's snapshot is
 *     byte-equal to the current state (just flip `active_branch_id`).
 *   - Hash equality is a `stableStringify` (sorted object keys) so a
 *     freshly captured object compares equal to a parsed-from-DB object.
 */
export async function switchWorkspaceBranch(
  targetBranchId: string,
  context?: WorkspaceContext
): Promise<WorkspaceBranchDetail> {
  const switchStartedAt = performance.now();
  const phases: Record<string, number> = {};
  const mark = (label: string, startedAt: number) => {
    phases[label] = Math.round(performance.now() - startedAt);
  };
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  const db = getDb();

  const tFetchTarget = performance.now();
  const target = await getWorkspaceBranchFromDb(targetBranchId, resolvedContext);
  mark("fetchTarget", tFetchTarget);
  if (!target) throw new Error("Workspace branch not found.");

  const tReadActive = performance.now();
  const activeId = await readActiveBranchId(resolvedContext.workspaceId);
  mark("readActive", tReadActive);
  const now = new Date().toISOString();

  if (activeId === targetBranchId) {
    logSwitchTiming(targetBranchId, target.name, "noop", switchStartedAt, phases);
    return { ...target, isActive: true } satisfies WorkspaceBranchDetail;
  }

  const tCapture = performance.now();
  const currentSnapshot = await captureSnapshot(resolvedContext);
  mark("capture", tCapture);
  const currentHash = hashSnapshot(currentSnapshot);
  const targetHash = hashSnapshot(target.snapshot);

  if (activeId) {
    const tActiveHash = performance.now();
    const activeStoredHash = await readActiveSnapshotHash(
      resolvedContext.workspaceId,
      activeId
    );
    mark("activeHash", tActiveHash);
    if (activeStoredHash !== currentHash) {
      const tAutoSave = performance.now();
      await db
        .update(workspaceBranches)
        .set({
          snapshot: JSON.stringify(currentSnapshot),
          updatedAt: now,
          updatedBy: resolvedContext.userId,
        })
        .where(
          and(
            eq(workspaceBranches.workspaceId, resolvedContext.workspaceId),
            eq(workspaceBranches.id, activeId)
          )
        );
      mark("autoSave", tAutoSave);
    }
  }

  if (currentHash !== targetHash) {
    const tApply = performance.now();
    await applySnapshot(target.snapshot, resolvedContext, currentSnapshot);
    mark("apply", tApply);
  }

  const tFlip = performance.now();
  await db
    .update(workspaces)
    .set({ activeBranchId: targetBranchId, updatedAt: now })
    .where(eq(workspaces.id, resolvedContext.workspaceId));
  mark("flipPointer", tFlip);

  logSwitchTiming(targetBranchId, target.name, "full", switchStartedAt, phases);
  return { ...target, isActive: true } satisfies WorkspaceBranchDetail;
}

function logSwitchTiming(
  targetId: string,
  targetName: string,
  kind: "noop" | "full",
  startedAt: number,
  phases: Record<string, number>
) {
  const totalMs = Math.round(performance.now() - startedAt);
  // Always log total + per-phase breakdown so the developer can see where
  // time is going during a branch switch. Cheap; runs only on Server Actions
  // that the user explicitly triggers.
  console.log(
    `[branches] switch ${kind} → ${targetName} (${targetId}) total=${totalMs}ms`,
    phases
  );
}

/**
 * Reads only the snapshot column of a branch and hashes it. Used by the
 * switch fast-path so we don't need to parse the full JSON when we only care
 * whether the bytes match.
 */
async function readActiveSnapshotHash(
  workspaceId: string,
  branchId: string
): Promise<string | null> {
  const row = await getDb()
    .select({ snapshot: workspaceBranches.snapshot })
    .from(workspaceBranches)
    .where(
      and(
        eq(workspaceBranches.workspaceId, workspaceId),
        eq(workspaceBranches.id, branchId)
      )
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (!row) return null;
  try {
    return hashSnapshot(JSON.parse(row.snapshot) as WorkspaceBranchSnapshot);
  } catch {
    return null;
  }
}

function hashSnapshot(snapshot: WorkspaceBranchSnapshot): string {
  return stableStringify(snapshot);
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((entry) => stableStringify(entry)).join(",") + "]";
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map(
        (key) =>
          JSON.stringify(key) +
          ":" +
          stableStringify((value as Record<string, unknown>)[key])
      )
      .join(",") +
    "}"
  );
}

export async function deleteWorkspaceBranchFromDb(
  branchId: string,
  context?: WorkspaceContext
): Promise<void> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  const branches = await listWorkspaceBranchesFromDb(resolvedContext);
  if (branches.length <= 1) {
    throw new Error("Cannot delete the only Workspace Branch.");
  }
  const target = branches.find((branch) => branch.id === branchId);
  if (!target) throw new Error("Branch not found.");
  if (target.isActive) {
    throw new Error("Switch to another branch before deleting the active one.");
  }
  await getDb()
    .delete(workspaceBranches)
    .where(
      and(
        eq(workspaceBranches.workspaceId, resolvedContext.workspaceId),
        eq(workspaceBranches.id, branchId)
      )
    );
}

export async function updateWorkspaceBranchMetaInDb(
  branchId: string,
  patch: { name?: string; description?: string; gitBinding?: WorkspaceBranchGitBinding | null },
  context?: WorkspaceContext
): Promise<WorkspaceBranch | undefined> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  const now = new Date().toISOString();
  await getDb()
    .update(workspaceBranches)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description ?? null }
        : {}),
      ...(patch.gitBinding !== undefined
        ? {
            gitBinding:
              patch.gitBinding === null ? null : JSON.stringify(patch.gitBinding),
          }
        : {}),
      updatedBy: resolvedContext.userId,
      updatedAt: now,
    })
    .where(
      and(
        eq(workspaceBranches.workspaceId, resolvedContext.workspaceId),
        eq(workspaceBranches.id, branchId)
      )
    );
  const branches = await listWorkspaceBranchesFromDb(resolvedContext);
  return branches.find((branch) => branch.id === branchId);
}

/**
 * Periodically called by token/theme mutations so the active branch's
 * snapshot reflects the latest workspace state. Cheap; just re-serializes.
 */
export async function syncActiveBranchSnapshot(
  context?: WorkspaceContext
): Promise<void> {
  const resolvedContext = await resolveWorkspaceContext(context);
  const activeId = await readActiveBranchId(resolvedContext.workspaceId);
  if (!activeId) return;
  const snapshot = await captureSnapshot(resolvedContext);
  const now = new Date().toISOString();
  await getDb()
    .update(workspaceBranches)
    .set({
      snapshot: JSON.stringify(snapshot),
      updatedAt: now,
      updatedBy: resolvedContext.userId,
    })
    .where(
      and(
        eq(workspaceBranches.workspaceId, resolvedContext.workspaceId),
        eq(workspaceBranches.id, activeId)
      )
    );
}
