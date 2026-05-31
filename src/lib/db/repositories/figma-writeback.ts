import { and, desc, eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";

import { getDb } from "@/lib/db/runtime";
import {
  figmaWritebackDrafts,
  syncOperations,
  syncRuns,
} from "@/lib/db/schema";
import { ensureWorkspaceImportedFromFiles } from "./workspace";
import type { WorkspaceContext } from "@/lib/auth/types";
import {
  getWorkspaceContext,
  requireWorkspaceRole,
} from "@/lib/auth/workspace-context";
import type { SyncOperation, SyncRunStatus } from "@/lib/workspace/types";

export interface FigmaWritebackDraftRecord {
  workspaceId: string;
  seq: number;
  deliveredSeq: number;
  payloadHash: string;
  payload: string;
  syncRunId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertWritebackDraftInput {
  payloadJson: string;
  /**
   * Optional pre-computed hash; helpful for tests. Defaults to sha256(payloadJson).
   */
  payloadHash?: string;
}

export interface UpsertWritebackDraftResult {
  changed: boolean;
  draft: FigmaWritebackDraftRecord;
}

export async function upsertFigmaWritebackDraft(
  input: UpsertWritebackDraftInput,
  context?: WorkspaceContext
): Promise<UpsertWritebackDraftResult> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  await ensureWorkspaceImportedFromFiles(resolvedContext);

  const payloadHash = input.payloadHash ?? hashPayload(input.payloadJson);
  const db = getDb();
  const now = new Date().toISOString();

  const existing = await db
    .select()
    .from(figmaWritebackDrafts)
    .where(eq(figmaWritebackDrafts.workspaceId, resolvedContext.workspaceId))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing && existing.payloadHash === payloadHash) {
    return {
      changed: false,
      draft: draftFromRow(existing),
    };
  }

  const nextSeq = (existing?.seq ?? 0) + 1;
  const syncRunId = `figma-writeback-draft:${resolvedContext.workspaceId}:${nextSeq}`;

  await db
    .insert(figmaWritebackDrafts)
    .values({
      workspaceId: resolvedContext.workspaceId,
      seq: nextSeq,
      payloadHash,
      payload: input.payloadJson,
      syncRunId,
      deliveredSeq: existing?.deliveredSeq ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: figmaWritebackDrafts.workspaceId,
      set: {
        seq: nextSeq,
        payloadHash,
        payload: input.payloadJson,
        syncRunId,
        updatedAt: now,
      },
    });

  await db
    .insert(syncRuns)
    .values({
      id: syncRunId,
      workspaceId: resolvedContext.workspaceId,
      connectorId: "figma",
      direction: "rozetta-to-figma",
      status: "draft",
      summary: `Live sync draft #${nextSeq}`,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: syncRuns.id,
      set: {
        status: "draft",
        summary: `Live sync draft #${nextSeq}`,
        completedAt: null,
      },
    });

  return {
    changed: true,
    draft: {
      workspaceId: resolvedContext.workspaceId,
      seq: nextSeq,
      deliveredSeq: existing?.deliveredSeq ?? 0,
      payloadHash,
      payload: input.payloadJson,
      syncRunId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    },
  };
}

export async function getFigmaWritebackDraft(
  context?: WorkspaceContext
): Promise<FigmaWritebackDraftRecord | undefined> {
  const resolvedContext = await resolveWorkspaceContext(context);
  const row = await getDb()
    .select()
    .from(figmaWritebackDrafts)
    .where(eq(figmaWritebackDrafts.workspaceId, resolvedContext.workspaceId))
    .limit(1)
    .then((rows) => rows[0]);
  return row ? draftFromRow(row) : undefined;
}

export interface DeliveredWritebackUpdate {
  deliveredSeq: number;
}

export async function markFigmaWritebackDelivered(
  input: DeliveredWritebackUpdate,
  context?: WorkspaceContext
): Promise<void> {
  const resolvedContext = await resolveWorkspaceContext(context);
  const now = new Date().toISOString();
  await getDb()
    .update(figmaWritebackDrafts)
    .set({
      deliveredSeq: input.deliveredSeq,
      updatedAt: now,
    })
    .where(eq(figmaWritebackDrafts.workspaceId, resolvedContext.workspaceId));
}

export interface ApplyWritebackResultInput {
  syncRunId: string;
  ackSeq: number;
  status: Extract<SyncRunStatus, "applied" | "failed">;
  summary: string;
  operations: SyncOperation[];
}

export async function applyFigmaWritebackResultToDb(
  input: ApplyWritebackResultInput,
  context?: WorkspaceContext
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  const db = getDb();
  const draft = await db
    .select()
    .from(figmaWritebackDrafts)
    .where(eq(figmaWritebackDrafts.workspaceId, resolvedContext.workspaceId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!draft) return { ok: false, error: "no-draft" };
  if (draft.syncRunId !== input.syncRunId) return { ok: false, error: "stale-syncRun" };
  if (input.ackSeq !== draft.seq) return { ok: false, error: "stale-seq" };

  const now = new Date().toISOString();
  await db
    .update(syncRuns)
    .set({
      status: input.status,
      summary: input.summary,
      completedAt: now,
    })
    .where(eq(syncRuns.id, input.syncRunId));

  if (input.operations.length > 0) {
    await db
      .insert(syncOperations)
      .values(
        input.operations.map((operation) => ({
          id: operation.id,
          runId: input.syncRunId,
          kind: operation.kind,
          status: operation.status,
          targetKind: operation.targetKind,
          targetId: operation.targetId,
          summary: operation.summary,
          payload: JSON.stringify(operation.payload),
          createdAt: operation.createdAt,
        }))
      )
      .onConflictDoNothing({ target: syncOperations.id });
  }

  await db
    .update(figmaWritebackDrafts)
    .set({
      deliveredSeq: input.ackSeq,
      updatedAt: now,
    })
    .where(eq(figmaWritebackDrafts.workspaceId, resolvedContext.workspaceId));

  return { ok: true };
}

export async function findRecentDraftFigmaToRozettaRun(
  context?: WorkspaceContext
) {
  const resolvedContext = await resolveWorkspaceContext(context);
  const row = await getDb()
    .select()
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.workspaceId, resolvedContext.workspaceId),
        eq(syncRuns.direction, "figma-to-rozetta"),
        eq(syncRuns.status, "draft")
      )
    )
    .orderBy(desc(syncRuns.createdAt))
    .limit(1)
    .then((rows) => rows[0]);
  return row;
}

function hashPayload(json: string) {
  return createHash("sha256").update(json).digest("hex");
}

function draftFromRow(row: typeof figmaWritebackDrafts.$inferSelect): FigmaWritebackDraftRecord {
  return {
    workspaceId: row.workspaceId,
    seq: row.seq,
    deliveredSeq: row.deliveredSeq,
    payloadHash: row.payloadHash,
    payload: row.payload,
    syncRunId: row.syncRunId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function resolveWorkspaceContext(context?: WorkspaceContext) {
  return context ?? (await getWorkspaceContext());
}

export function newSyncOperationId() {
  return `sync-op:${randomUUID()}`;
}
