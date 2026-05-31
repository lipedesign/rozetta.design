"use server";

/**
 * Server Actions exposed to the client. DB is the live workspace source;
 * filesystem writes are Git-native artifact exports.
 *
 * - `getInitialState`  → loads every set on first render.
 * - `saveTokenSet`     → writes an edited copy without touching the original.
 * - `discardEdits`     → deletes the edited copy.
 */

import { revalidatePath } from "next/cache";

import type { DtcgGroup, TokenSet } from "@/lib/dtcg/types";
import { buildWorkspaceHealth } from "@/lib/workspace/validation";
import {
  discardEditedTokenSet,
  writeEditedTokenSet,
} from "./filesystem";
import {
  deleteTokenSetFromDb,
  ensureWorkspaceImportedFromFiles,
  exportWorkspaceArtifacts,
  getTokenWorkspaceFromDb as loadDbTokenWorkspace,
  listThemesFromDb,
  upsertTokenSetInDb,
} from "@/lib/db/repositories/workspace";
import { regenerateFigmaWritebackDraft } from "@/lib/figma-bridge/actions";

/**
 * Refresh the rolling Rozetta → Figma writeback draft so an open plugin polls
 * the latest desired state on its next tick. Errors are swallowed because a
 * Bridge regression must never break a token save.
 */
async function refreshFigmaWritebackDraft() {
  try {
    await regenerateFigmaWritebackDraft();
  } catch (err) {
    console.warn("[figma-bridge] writeback refresh failed:", err);
  }
}

export interface InitialState {
  sets: TokenSet[];
  originalRoots: Record<string, DtcgGroup>;
}

export async function getInitialState(): Promise<InitialState> {
  const workspace = await loadDbTokenWorkspace();
  return { sets: workspace.sets, originalRoots: workspace.originalRoots };
}

export interface SaveResult {
  ok: boolean;
  filename?: string;
  error?: string;
}

export async function saveTokenSet(
  setId: string,
  root: DtcgGroup
): Promise<SaveResult> {
  try {
    await upsertTokenSetInDb({
      id: setId,
      name: setId.charAt(0).toUpperCase() + setId.slice(1),
      filename: `${setId}.tokens.json`,
      root,
    });
    const fullPath = await writeEditedTokenSet(setId, root);
    revalidateWorkspaceRoutes();
    await refreshFigmaWritebackDraft();
    return { ok: true, filename: fullPath };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error.",
    };
  }
}

export async function saveTokenSetDraft(set: TokenSet): Promise<SaveResult> {
  try {
    await upsertTokenSetInDb(set);
    revalidateWorkspaceRoutes();
    await refreshFigmaWritebackDraft();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to save token set draft.",
    };
  }
}

export async function deleteTokenSetDraft(setId: string): Promise<SaveResult> {
  try {
    await deleteTokenSetFromDb(setId);
    revalidateWorkspaceRoutes();
    await refreshFigmaWritebackDraft();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to delete token set draft.",
    };
  }
}

export async function saveWorkspaceArtifacts(): Promise<
  | { ok: true; tokenFiles: string[]; themesFile?: string; exportedAt: string }
  | { ok: false; error: string }
> {
  try {
    const result = await exportWorkspaceArtifacts();
    revalidateWorkspaceRoutes();
    await refreshFigmaWritebackDraft();
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to export workspace artifacts.",
    };
  }
}

export async function importFilesystemWorkspaceToDb(): Promise<SaveResult> {
  try {
    await ensureWorkspaceImportedFromFiles();
    revalidateWorkspaceRoutes();
    await refreshFigmaWritebackDraft();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to import filesystem workspace.",
    };
  }
}

export async function getDbWorkspaceHealth() {
  const [tokens, themes] = await Promise.all([
    loadDbTokenWorkspace(),
    listThemesFromDb(),
  ]);
  return buildWorkspaceHealth({
    sets: tokens.sets,
    themes,
    brands: [],
    components: [],
  });
}

export async function discardEdits(setId: string): Promise<SaveResult> {
  try {
    await discardEditedTokenSet(setId);
    revalidateWorkspaceRoutes();
    await refreshFigmaWritebackDraft();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error.",
    };
  }
}

function revalidateWorkspaceRoutes() {
  // Tokens/themes/brands/components are served by the persistent `(studio)`
  // layout. One layout-scoped revalidation refreshes every downstream page on
  // its next render; the per-route invalidation list it replaced was redundant.
  revalidatePath("/", "layout");
}
