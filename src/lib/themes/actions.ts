"use server";

import { revalidatePath } from "next/cache";

import type { Theme, ThemeGroup } from "./types";
import {
  createThemeGroupInDb,
  deleteThemeFromDb,
  deleteThemeGroupFromDb,
  getThemeWorkspaceFromDb,
  listThemeGroupsFromDb,
  replaceThemesInDb,
  updateThemeGroupInDb,
  upsertThemeInDb,
} from "@/lib/db/repositories/workspace";
import { regenerateFigmaWritebackDraft } from "@/lib/figma-bridge/actions";

async function refreshFigmaWritebackDraft() {
  try {
    await regenerateFigmaWritebackDraft();
  } catch (err) {
    console.warn("[figma-bridge] writeback refresh failed:", err);
  }
}

export interface ThemesStateFile {
  exists: boolean;
  path: string;
  themes: Theme[];
  originalThemes: Theme[];
}

export type SaveThemesResult =
  | { ok: true; path: string; themes: Theme[] }
  | { ok: false; error: string };

export async function getThemes(): Promise<ThemesStateFile> {
  const workspace = await getThemeWorkspaceFromDb();
  return {
    exists: workspace.themesFileExists,
    path: "supabase://workspace/themes",
    themes: workspace.themes,
    originalThemes: workspace.originalThemes,
  };
}

export async function saveThemes(themes: Theme[]): Promise<SaveThemesResult> {
  try {
    await replaceThemesInDb(themes);
    revalidatePath("/", "layout");
    await refreshFigmaWritebackDraft();
    return { ok: true, path: "supabase://workspace/themes", themes };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to save themes.",
    };
  }
}

export async function saveThemeDraft(theme: Theme): Promise<SaveThemesResult> {
  try {
    const saved = await upsertThemeInDb(theme);
    revalidatePath("/", "layout");
    await refreshFigmaWritebackDraft();
    return { ok: true, path: "supabase://workspace/themes", themes: [saved] };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to save theme draft.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Theme Groups (Tokens Studio model)
// ─────────────────────────────────────────────────────────────────────

export type ThemeGroupResult =
  | { ok: true; themeGroup: ThemeGroup }
  | { ok: false; error: string };

export type ThemeGroupListResult =
  | { ok: true; themeGroups: ThemeGroup[] }
  | { ok: false; error: string };

export type ThemeResult =
  | { ok: true; theme: Theme }
  | { ok: false; error: string };

export async function listThemeGroups(): Promise<ThemeGroupListResult> {
  try {
    const themeGroups = await listThemeGroupsFromDb();
    return { ok: true, themeGroups };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to list theme groups.",
    };
  }
}

export async function createThemeGroup(input: {
  name: string;
  description?: string;
}): Promise<ThemeGroupResult> {
  try {
    const themeGroup = await createThemeGroupInDb(input);
    revalidatePath("/themes");
    return { ok: true, themeGroup };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to create theme group.",
    };
  }
}

export async function updateThemeGroup(
  themeGroupId: string,
  patch: { name?: string; description?: string }
): Promise<ThemeGroupResult> {
  try {
    const updated = await updateThemeGroupInDb(themeGroupId, patch);
    if (!updated) return { ok: false, error: "Theme group not found." };
    revalidatePath("/themes");
    return { ok: true, themeGroup: updated };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to update theme group.",
    };
  }
}

export async function deleteThemeGroup(
  themeGroupId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await deleteThemeGroupFromDb(themeGroupId);
    revalidatePath("/themes");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to delete theme group.",
    };
  }
}

export async function createThemeInGroup(input: {
  themeGroupId: string;
  name: string;
  description?: string;
}): Promise<ThemeResult> {
  try {
    const now = new Date().toISOString();
    const themeId = `theme:${input.themeGroupId}:${slugify(input.name)}:${Date.now()}`;
    const theme: Theme = {
      id: themeId,
      themeGroupId: input.themeGroupId,
      name: input.name,
      description: input.description,
      position: 0,
      sets: [],
      updatedAt: now,
    };
    const saved = await upsertThemeInDb(theme);
    revalidatePath("/themes");
    return { ok: true, theme: saved };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to create theme.",
    };
  }
}

export async function deleteTheme(
  themeId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await deleteThemeFromDb(themeId);
    revalidatePath("/themes");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to delete theme.",
    };
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "theme";
}
