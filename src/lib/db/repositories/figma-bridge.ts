import { and, desc, eq, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";

import {
  figmaFiles,
  figmaSnapshots,
  figmaVariableBindings,
  syncOperations,
  syncRuns,
} from "@/lib/db/schema";
import { getDb } from "@/lib/db/runtime";
import { ensureWorkspaceImportedFromFiles } from "./workspace";
import type { WorkspaceContext } from "@/lib/auth/types";
import { getWorkspaceContext, requireWorkspaceRole } from "@/lib/auth/workspace-context";
import type {
  FigmaBridgeState,
  FigmaFileSnapshot,
  FigmaVariableBinding,
  SyncOperation,
  SyncRun,
} from "@/lib/workspace/types";

export interface SavedFigmaSnapshot {
  fileId: string;
  snapshotId: string;
  checksum: string;
}

const figmaBridgeStateCache = new Map<string, FigmaBridgeState>();

export async function saveFigmaSnapshotToDb(
  snapshot: FigmaFileSnapshot,
  bindings: FigmaVariableBinding[] = [],
  context?: WorkspaceContext
): Promise<SavedFigmaSnapshot> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  await ensureWorkspaceImportedFromFiles(resolvedContext);
  const db = getDb();
  const now = new Date().toISOString();
  const fileId = `figma:${resolvedContext.workspaceId}:${snapshot.fileKey}`;
  const checksum = stableChecksum(snapshot);
  const snapshotId = `figma-snapshot:${resolvedContext.workspaceId}:${snapshot.fileKey}:${checksum.slice(0, 12)}`;

  await db.insert(figmaFiles)
    .values({
      id: fileId,
      workspaceId: resolvedContext.workspaceId,
      fileKey: snapshot.fileKey,
      name: snapshot.name,
      url: snapshot.url,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [figmaFiles.workspaceId, figmaFiles.fileKey],
      set: {
        name: snapshot.name,
        url: snapshot.url,
        updatedAt: now,
        lastSeenAt: now,
      },
    });

  await db.insert(figmaSnapshots)
    .values({
      id: snapshotId,
      fileId,
      name: snapshot.name,
      source: snapshot.source,
      checksum,
      payload: JSON.stringify(snapshot),
      createdAt: snapshot.createdAt || now,
    })
    .onConflictDoNothing();

  if (bindings.length > 0) {
    await db.insert(figmaVariableBindings)
      .values(bindings.map((binding) => ({
        id: binding.id,
        figmaFileId: fileId,
        variableId: binding.variableId,
        collectionId: binding.collectionId,
        modeId: binding.modeId,
        setId: binding.setId,
        tokenPath: binding.tokenPath,
        metadata: JSON.stringify({
          ...(binding.metadata ?? {}),
          ...(binding.rozettaCollectionId ? { rozettaCollectionId: binding.rozettaCollectionId } : {}),
          ...(binding.rozettaModeId ? { rozettaModeId: binding.rozettaModeId } : {}),
        }),
        createdAt: binding.createdAt,
        updatedAt: binding.updatedAt,
        lastSyncedAt: binding.lastSyncedAt,
      })))
      .onConflictDoUpdate({
        target: [
          figmaVariableBindings.figmaFileId,
          figmaVariableBindings.variableId,
          figmaVariableBindings.modeId,
        ],
        set: {
          collectionId: sql.raw("excluded.collection_id"),
          setId: sql.raw("excluded.set_id"),
          tokenPath: sql.raw("excluded.token_path"),
          metadata: sql.raw("excluded.metadata"),
          updatedAt: now,
          lastSyncedAt: sql.raw("excluded.last_synced_at"),
        },
      });
  }

  invalidateFigmaBridgeStateCache(resolvedContext);
  return { fileId, snapshotId, checksum };
}

export async function loadFigmaBridgeStateFromDb(
  context?: WorkspaceContext
): Promise<FigmaBridgeState> {
  const resolvedContext = await resolveWorkspaceContext(context);
  const cached = figmaBridgeStateCache.get(resolvedContext.workspaceId);
  if (cached) return cloneFigmaBridgeState(cached);
  await ensureWorkspaceImportedFromFiles(resolvedContext);
  const db = getDb();
  const latestSnapshotRow = (await db
    .select({ snapshot: figmaSnapshots })
    .from(figmaSnapshots)
    .innerJoin(figmaFiles, eq(figmaSnapshots.fileId, figmaFiles.id))
    .where(eq(figmaFiles.workspaceId, resolvedContext.workspaceId))
    .orderBy(desc(figmaSnapshots.createdAt))
    .limit(1))[0]?.snapshot;

  const fileId = latestSnapshotRow?.fileId;
  const latestSnapshot = latestSnapshotRow
    ? (JSON.parse(latestSnapshotRow.payload) as FigmaFileSnapshot)
    : undefined;

  const bindingRows = fileId
    ? await db
        .select()
        .from(figmaVariableBindings)
        .where(eq(figmaVariableBindings.figmaFileId, fileId))
    : [];

  const recentRunRows = await db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.workspaceId, resolvedContext.workspaceId))
    .orderBy(desc(syncRuns.createdAt))
    .limit(8);

  const recentSyncRuns = recentRunRows.map((run) => syncRunFromRow(run));
  const operationsByRun = new Map<string, SyncOperation[]>();
  for (const run of recentSyncRuns) {
    operationsByRun.set(run.id, await loadSyncOperations(run.id));
  }

  const state = {
    fileId,
    latestSnapshot,
    bindings: bindingRows.map((row) => {
      const metadata = parseBindingMetadata(row.metadata);
      return {
        id: row.id,
        figmaFileId: row.figmaFileId,
        variableId: row.variableId,
        collectionId: row.collectionId,
        ...(row.modeId ? { modeId: row.modeId } : {}),
        setId: row.setId,
        tokenPath: row.tokenPath,
        metadata,
        rozettaCollectionId:
          typeof metadata?.rozettaCollectionId === "string" ? metadata.rozettaCollectionId : undefined,
        rozettaModeId: typeof metadata?.rozettaModeId === "string" ? metadata.rozettaModeId : undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastSyncedAt: row.lastSyncedAt,
      };
    }),
    lastSyncRun: recentSyncRuns[0]
      ? { ...recentSyncRuns[0], operations: operationsByRun.get(recentSyncRuns[0].id) ?? [] }
      : undefined,
    recentSyncRuns: recentSyncRuns.map((run) => ({
      ...run,
      operations: operationsByRun.get(run.id) ?? [],
    })),
  };
  figmaBridgeStateCache.set(resolvedContext.workspaceId, state);
  return cloneFigmaBridgeState(state);
}

export async function loadFigmaSnapshotPayloadFromDb(
  snapshotId: string,
  context?: WorkspaceContext
): Promise<FigmaFileSnapshot | null> {
  const resolvedContext = await resolveWorkspaceContext(context);
  const db = getDb();
  const row = (await db
    .select({ payload: figmaSnapshots.payload })
    .from(figmaSnapshots)
    .innerJoin(figmaFiles, eq(figmaSnapshots.fileId, figmaFiles.id))
    .where(
      and(
        eq(figmaSnapshots.id, snapshotId),
        eq(figmaFiles.workspaceId, resolvedContext.workspaceId)
      )
    )
    .limit(1))[0];
  if (!row?.payload) return null;
  try {
    return JSON.parse(row.payload) as FigmaFileSnapshot;
  } catch {
    return null;
  }
}

export interface FigmaIncomingDraftRow {
  syncRunId: string;
  sourceSnapshotId?: string;
  summary: string;
  createdAt: string;
  fileName: string;
}

/**
 * Narrow query for the global polling sheet. Returns just the latest
 * `figma-to-rozetta` draft sync run + the snapshot's file name, with no joins
 * across bindings/operations and no JSON payload parse. Drops the cost of the
 * 4s-interval poll from ~1.3s to ~30ms by avoiding `loadFigmaBridgeStateFromDb`.
 */
export async function findLatestFigmaIncomingDraftInDb(
  context?: WorkspaceContext
): Promise<FigmaIncomingDraftRow | null> {
  const resolvedContext = await resolveWorkspaceContext(context);
  const db = getDb();
  const draftRow = (await db
    .select({
      id: syncRuns.id,
      sourceSnapshotId: syncRuns.sourceSnapshotId,
      summary: syncRuns.summary,
      createdAt: syncRuns.createdAt,
    })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.workspaceId, resolvedContext.workspaceId),
        eq(syncRuns.direction, "figma-to-rozetta"),
        eq(syncRuns.status, "draft")
      )
    )
    .orderBy(desc(syncRuns.createdAt))
    .limit(1))[0];
  if (!draftRow) return null;

  let fileName = "Figma file";
  if (draftRow.sourceSnapshotId) {
    const nameRow = (await db
      .select({ name: figmaSnapshots.name })
      .from(figmaSnapshots)
      .where(eq(figmaSnapshots.id, draftRow.sourceSnapshotId))
      .limit(1))[0];
    if (nameRow?.name) fileName = nameRow.name;
  }

  return {
    syncRunId: draftRow.id,
    sourceSnapshotId: draftRow.sourceSnapshotId ?? undefined,
    summary: draftRow.summary,
    createdAt: draftRow.createdAt,
    fileName,
  };
}

export async function saveSyncRunToDb(
  run: SyncRun,
  context?: WorkspaceContext
): Promise<SyncRun> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  await ensureWorkspaceImportedFromFiles(resolvedContext);
  const db = getDb();
  await db.insert(syncRuns)
    .values({
      id: run.id,
      workspaceId: resolvedContext.workspaceId,
      connectorId: run.connectorId,
      direction: run.direction,
      status: run.status,
      sourceSnapshotId: run.sourceSnapshotId,
      summary: run.summary,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
    })
    .onConflictDoUpdate({
      target: syncRuns.id,
      set: {
        status: run.status,
        summary: run.summary,
        completedAt: run.completedAt,
      },
    });

  if (run.operations.length > 0) {
    await db.insert(syncOperations)
      .values(run.operations.map((operation) => ({
        id: operation.id,
        runId: operation.runId,
        kind: operation.kind,
        status: operation.status,
        targetKind: operation.targetKind,
        targetId: operation.targetId,
        summary: operation.summary,
        payload: JSON.stringify(operation.payload),
        createdAt: operation.createdAt,
      })))
      .onConflictDoUpdate({
        target: syncOperations.id,
        set: {
          status: sql.raw("excluded.status"),
          summary: sql.raw("excluded.summary"),
          payload: sql.raw("excluded.payload"),
        },
      });
  }

  invalidateFigmaBridgeStateCache(resolvedContext);
  return run;
}

export function buildRuntimeId(prefix: string) {
  return `${prefix}:${randomUUID()}`;
}

async function loadSyncOperations(runId: string): Promise<SyncOperation[]> {
  const rows = await getDb()
    .select()
    .from(syncOperations)
    .where(eq(syncOperations.runId, runId));
  return rows.map((row) => ({
    id: row.id,
    runId: row.runId,
    kind: row.kind as SyncOperation["kind"],
    status: row.status as SyncOperation["status"],
    targetKind: row.targetKind as SyncOperation["targetKind"],
    targetId: row.targetId,
    summary: row.summary,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    createdAt: row.createdAt,
  }));
}

function syncRunFromRow(row: typeof syncRuns.$inferSelect): SyncRun {
  return {
    id: row.id,
    connectorId: row.connectorId,
    direction: row.direction as SyncRun["direction"],
    status: row.status as SyncRun["status"],
    sourceSnapshotId: row.sourceSnapshotId ?? undefined,
    summary: row.summary,
    operations: [],
    createdAt: row.createdAt,
    completedAt: row.completedAt ?? undefined,
  };
}

function invalidateFigmaBridgeStateCache(context?: WorkspaceContext) {
  if (context) {
    figmaBridgeStateCache.delete(context.workspaceId);
    return;
  }
  figmaBridgeStateCache.clear();
}

async function resolveWorkspaceContext(context?: WorkspaceContext) {
  return context ?? (await getWorkspaceContext());
}

function cloneFigmaBridgeState(state: FigmaBridgeState): FigmaBridgeState {
  return JSON.parse(JSON.stringify(state)) as FigmaBridgeState;
}

function parseBindingMetadata(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function stableChecksum(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
