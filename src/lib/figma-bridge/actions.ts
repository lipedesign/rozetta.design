"use server";

import { revalidatePath } from "next/cache";

import {
  buildFigmaToRozettaSyncRun,
  createRozettaToFigmaPayload,
} from "@/lib/workspace/figma-bridge";
import type {
  FigmaBridgeState,
  FigmaFileSnapshot,
  SyncOperation,
  SyncRun,
  TokenSemanticDiff,
} from "@/lib/workspace/types";

export type RozettaToFigmaPayload = ReturnType<typeof createRozettaToFigmaPayload>;
import { diffTokenSets } from "@/lib/workspace/diff";
import {
  findLatestFigmaIncomingDraftInDb,
  loadFigmaBridgeStateFromDb,
  loadFigmaSnapshotPayloadFromDb,
  saveFigmaSnapshotToDb,
  saveSyncRunToDb,
} from "@/lib/db/repositories/figma-bridge";
import {
  applyFigmaWritebackResultToDb,
  getFigmaWritebackDraft,
  upsertFigmaWritebackDraft,
} from "@/lib/db/repositories/figma-writeback";
import {
  getWorkspaceFromDb,
  listThemesFromDb,
  listTokenSetsFromDb,
  upsertThemeInDb,
  upsertTokenSetInDb,
} from "@/lib/db/repositories/workspace";
import type { TokenSet } from "@/lib/dtcg/types";
import type { Theme } from "@/lib/themes/types";
import type { WorkspaceContext } from "@/lib/auth/types";

export type ReceiveFigmaSnapshotResult =
  | {
      ok: true;
      state: FigmaBridgeState;
      sets: TokenSet[];
      themes: Theme[];
      syncRun: SyncRun;
      tokenDiff: TokenSemanticDiff;
    }
  | { ok: false; error: string };

export type PreviewFigmaToRozettaResult =
  | {
      ok: true;
      sets: TokenSet[];
      themes: Theme[];
      syncRun: SyncRun;
      tokenDiff: TokenSemanticDiff;
    }
  | { ok: false; error: string };

export async function getFigmaSyncState(context?: WorkspaceContext): Promise<FigmaBridgeState> {
  return loadFigmaBridgeStateFromDb(context);
}

export async function receiveFigmaSnapshot(
  snapshot: FigmaFileSnapshot,
  context?: WorkspaceContext
): Promise<ReceiveFigmaSnapshotResult> {
  try {
    const normalized = normalizeFigmaSnapshot(snapshot);
    const currentSets = (await getWorkspaceFromDb(context)).sets;
    const preview = buildFigmaToRozettaSyncRun({ currentSets, snapshot: normalized });
    const saved = await saveFigmaSnapshotToDb(normalized, preview.result.bindings, context);
    // Persist the preview as a draft SyncRun so `/sync/figma` can show it
    // immediately without the user needing to click "Review latest snapshot".
    const run = {
      ...preview.run,
      sourceSnapshotId: saved.snapshotId,
      status: "draft" as const,
    };
    await saveSyncRunToDb(run, context);
    const state = await loadFigmaBridgeStateFromDb(context);
    revalidateFigmaRoutes();
    return {
      ok: true,
      state,
      sets: preview.result.sets,
      themes: preview.result.themes,
      syncRun: run,
      tokenDiff: diffTokenSets(currentSets, preview.result.sets),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to receive Figma snapshot.",
    };
  }
}

export async function previewFigmaToRozetta(
  snapshot: FigmaFileSnapshot,
  context?: WorkspaceContext
): Promise<PreviewFigmaToRozettaResult> {
  try {
    const normalized = normalizeFigmaSnapshot(snapshot);
    const currentSets = (await getWorkspaceFromDb(context)).sets;
    const preview = buildFigmaToRozettaSyncRun({ currentSets, snapshot: normalized });
    return {
      ok: true,
      sets: preview.result.sets,
      themes: preview.result.themes,
      syncRun: preview.run,
      tokenDiff: diffTokenSets(currentSets, preview.result.sets),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to preview Figma snapshot.",
    };
  }
}

export async function applyFigmaSnapshotToRozettaDraft(
  snapshot: FigmaFileSnapshot,
  context?: WorkspaceContext,
  draftSyncRunId?: string
): Promise<PreviewFigmaToRozettaResult> {
  try {
    const normalized = normalizeFigmaSnapshot(snapshot);
    const currentSets = (await getWorkspaceFromDb(context)).sets;
    const preview = buildFigmaToRozettaSyncRun({ currentSets, snapshot: normalized });
    await Promise.all([
      ...preview.result.sets.map((set) =>
        upsertTokenSetInDb(set, { source: "figma-sync" }, context)
      ),
      ...preview.result.themes.map((theme) => upsertThemeInDb(theme, undefined, context)),
    ]);
    const now = new Date().toISOString();
    const finalRun: SyncRun = draftSyncRunId
      ? { ...preview.run, id: draftSyncRunId, status: "reviewed", completedAt: now }
      : { ...preview.run, status: "reviewed", completedAt: now };
    await saveSyncRunToDb(finalRun, context);
    revalidateFigmaRoutes();
    return {
      ok: true,
      sets: preview.result.sets,
      themes: preview.result.themes,
      syncRun: preview.run,
      tokenDiff: {
        generatedAt: new Date().toISOString(),
        baselineSets: currentSets.length,
        currentSets: preview.result.sets.length,
        changes: [],
        summary: {
          "set-created": 0,
          "set-removed": 0,
          "token-created": 0,
          "token-removed": 0,
          "value-changed": 0,
          "type-changed": 0,
          "description-changed": 0,
          "alias-changed": 0,
          total: 0,
        },
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to apply Figma snapshot.",
    };
  }
}

export async function prepareFigmaPayload(input?: {
  sets?: TokenSet[];
  themes?: Theme[];
  context?: WorkspaceContext;
}) {
  const [state, currentSets, themesFile] = await Promise.all([
    loadFigmaBridgeStateFromDb(input?.context),
    input?.sets ? Promise.resolve(input.sets) : listTokenSetsFromDb(input?.context),
    input?.themes ? Promise.resolve({ themes: input.themes }) : listThemesFromDb(input?.context).then((themes) => ({ themes })),
  ]);
  return createRozettaToFigmaPayload({
    sets: currentSets,
    themes: themesFile.themes,
    bindings: state.bindings,
  });
}

export interface IncomingFigmaSnapshotSummary {
  syncRunId: string;
  sourceSnapshotId?: string;
  fileName: string;
  createdAt: string;
  operationCount: number;
  changeCount: number;
  summary: string;
}

/**
 * Lightweight poller for the global "Figma sent something" side sheet. Returns
 * the most recent `figma-to-rozetta` draft SyncRun summary, or `null` if there
 * is nothing pending. Does NOT load the full snapshot payload so it stays cheap
 * to call every few seconds from every authenticated route.
 */
export async function getLatestFigmaIncoming(
  context?: WorkspaceContext
): Promise<IncomingFigmaSnapshotSummary | null> {
  const draft = await findLatestFigmaIncomingDraftInDb(context);
  if (!draft) return null;
  return {
    syncRunId: draft.syncRunId,
    sourceSnapshotId: draft.sourceSnapshotId,
    fileName: draft.fileName,
    createdAt: draft.createdAt,
    operationCount: 0,
    changeCount: 0,
    summary: draft.summary,
  };
}

export type ApplyIncomingFigmaResult =
  | {
      ok: true;
      syncRunId: string;
      appliedTokenSets: number;
      appliedThemes: number;
      sets: TokenSet[];
      themes: Theme[];
    }
  | { ok: false; error: string };

/**
 * Applies the latest Figma → Rozetta draft to the workspace. The client side
 * sheet calls this after the user clicks Confirm. We re-load the snapshot from
 * the DB rather than trusting a payload passed from the browser.
 */
export async function applyFigmaIncoming(
  context?: WorkspaceContext
): Promise<ApplyIncomingFigmaResult> {
  try {
    const draft = await findLatestFigmaIncomingDraftInDb(context);
    if (!draft) return { ok: false, error: "No incoming Figma draft to apply." };
    if (!draft.sourceSnapshotId) {
      return { ok: false, error: "Draft has no source snapshot." };
    }
    const snapshot = await loadFigmaSnapshotPayloadFromDb(draft.sourceSnapshotId, context);
    if (!snapshot) return { ok: false, error: "No Figma snapshot found." };
    const result = await applyFigmaSnapshotToRozettaDraft(snapshot, context, draft.syncRunId);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      syncRunId: draft.syncRunId,
      appliedTokenSets: result.sets.length,
      appliedThemes: result.themes.length,
      sets: result.sets,
      themes: result.themes,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to apply incoming Figma changes.",
    };
  }
}

/**
 * Dismiss = mark the draft SyncRun as `failed` with a "dismissed by user"
 * summary so it stops bubbling up in the side sheet without losing audit trail.
 */
export async function dismissFigmaIncoming(
  syncRunId: string,
  context?: WorkspaceContext
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const state = await loadFigmaBridgeStateFromDb(context);
    const draft = state.recentSyncRuns.find((run) => run.id === syncRunId);
    if (!draft) return { ok: false, error: "Draft not found." };
    await saveSyncRunToDb(
      {
        ...draft,
        status: "failed",
        summary: `${draft.summary} — dismissed by user`,
        completedAt: new Date().toISOString(),
      },
      context
    );
    revalidateFigmaRoutes();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to dismiss Figma incoming.",
    };
  }
}

export type RegenerateWritebackResult =
  | { ok: true; changed: boolean; seq: number; syncRunId?: string }
  | { ok: false; error: string };

/**
 * Idempotent: regenerates the rolling Rozetta → Figma writeback draft for the
 * active workspace. If the recomputed payload matches the last draft byte-for-
 * byte, returns `changed: false` without bumping the seq. Triggered by every
 * persisted token/theme mutation so the plugin always sees the latest desired
 * state when it polls.
 */
export async function regenerateFigmaWritebackDraft(
  context?: WorkspaceContext
): Promise<RegenerateWritebackResult> {
  try {
    const payload = await prepareFigmaPayload({ context });
    const payloadJson = stringifyDeterministic(payload);
    const { changed, draft } = await upsertFigmaWritebackDraft(
      { payloadJson },
      context
    );
    return { ok: true, changed, seq: draft.seq, syncRunId: draft.syncRunId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to regenerate writeback draft.",
    };
  }
}

export interface PendingWritebackResponse {
  hasPending: boolean;
  currentSeq: number;
  syncRunId?: string;
  payload?: RozettaToFigmaPayload;
}

/**
 * Read path for the plugin polling endpoint. Returns the latest draft if the
 * plugin's last-known seq is behind; otherwise reports no pending work.
 */
export async function getPendingFigmaWriteback(
  ackSeq: number,
  context?: WorkspaceContext
): Promise<PendingWritebackResponse> {
  const draft = await getFigmaWritebackDraft(context);
  if (!draft) return { hasPending: false, currentSeq: 0 };
  if (draft.seq <= ackSeq) return { hasPending: false, currentSeq: draft.seq };
  const payload = JSON.parse(draft.payload) as RozettaToFigmaPayload;
  return {
    hasPending: true,
    currentSeq: draft.seq,
    syncRunId: draft.syncRunId,
    payload,
  };
}

export interface ApplyFigmaWritebackResultInput {
  syncRunId: string;
  ackSeq: number;
  operations: SyncOperation[];
  status: "applied" | "failed";
  summary?: string;
}

export type ApplyFigmaWritebackResultResponse =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Plugin ack endpoint. The plugin reports per-operation outcomes after it has
 * applied (or failed to apply) the writeback. Validates the seq matches the
 * latest draft so a stale plugin can't overwrite a newer payload.
 */
export async function applyFigmaWritebackResult(
  input: ApplyFigmaWritebackResultInput,
  context?: WorkspaceContext
): Promise<ApplyFigmaWritebackResultResponse> {
  const summary =
    input.summary ??
    summarizeOperations(input.operations, input.status, input.ackSeq);
  const result = await applyFigmaWritebackResultToDb(
    {
      syncRunId: input.syncRunId,
      ackSeq: input.ackSeq,
      status: input.status,
      summary,
      operations: input.operations,
    },
    context
  );
  if (result.ok) revalidateFigmaRoutes();
  return result;
}

function summarizeOperations(
  operations: SyncOperation[],
  status: "applied" | "failed",
  seq: number
) {
  const buckets = operations.reduce(
    (acc, op) => {
      acc[op.status] = (acc[op.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const parts = Object.entries(buckets).map(
    ([key, value]) => `${value} ${key}`
  );
  return `Live writeback #${seq} ${status} (${parts.join(", ") || "no operations"}).`;
}

/**
 * Deterministic JSON stringify with sorted object keys. Used for payload
 * hashing so logically-equal payloads with different key order are considered
 * equal — otherwise the draft would bump its seq on every regenerate.
 */
function stringifyDeterministic(value: unknown): string {
  return JSON.stringify(value, (_key, current) => {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      const entries = Object.entries(current).sort(([a], [b]) => a.localeCompare(b));
      return Object.fromEntries(entries);
    }
    return current;
  });
}

function normalizeFigmaSnapshot(snapshot: FigmaFileSnapshot): FigmaFileSnapshot {
  if (!snapshot || typeof snapshot !== "object") throw new Error("Figma snapshot is required.");
  if (!snapshot.fileKey) throw new Error("Figma snapshot is missing fileKey.");
  if (!snapshot.name) throw new Error("Figma snapshot is missing name.");
  if (!Array.isArray(snapshot.collections)) throw new Error("Figma snapshot is missing collections.");
  if (!Array.isArray(snapshot.variables)) throw new Error("Figma snapshot is missing variables.");
  const createdAt = snapshot.createdAt || new Date().toISOString();
  return {
    ...snapshot,
    source: snapshot.source ?? "plugin",
    createdAt,
    collections: snapshot.collections.map((collection) => ({
      ...collection,
      modes: Array.isArray(collection.modes) ? collection.modes : [],
      variableIds: Array.isArray(collection.variableIds) ? collection.variableIds : [],
    })),
    variables: snapshot.variables.map((variable) => ({
      ...variable,
      valuesByMode: variable.valuesByMode ?? {},
    })),
  };
}

function revalidateFigmaRoutes() {
  // /sync/figma owns the snapshot/preview render; /sync (hub) is a static
  // overview that doesn't read figma state at page render; /ai consumes figma
  // state only as a context hint and is dynamic anyway.
  revalidatePath("/sync/figma");
}
