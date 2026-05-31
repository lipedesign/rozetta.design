"use client";

/**
 * Zustand store for Design Themes.
 *
 * Themes are hydrated from the runtime DB and exported to
 * `.rozetta/themes.json` on workspace save. The old localStorage key is read
 * once as a migration fallback when the DB/filesystem baseline is empty.
 */

import { create } from "zustand";
import { saveThemes } from "./actions";
import { createThemeDraft, normalizeThemes } from "./registry";
import type { Theme, ThemeGroup, ThemeSetRef } from "./types";

const STORAGE_KEY = "rozetta-themes-v1";

function readSaved(): Theme[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Theme[];
  } catch {
    return [];
  }
}

function persist(themes: Theme[]): void {
  void saveThemes(themes);
}

interface ThemesState {
  themes: Theme[];
  originals: Theme[];
  /** Workspace Theme Groups (Tokens Studio model). */
  themeGroups: ThemeGroup[];
  /** Currently selected theme in the Themes page (null = none). */
  activeThemeId: string | null;
  /** Currently selected Theme Group in the Themes sidebar (null = none). */
  activeThemeGroupId: string | null;
  /** Per-group expand/collapse state in the sidebar. */
  expandedGroups: Record<string, boolean>;

  /** Load server-provided themes and migrate old localStorage data when needed. */
  hydrate: (themes: Theme[], fileExists?: boolean, originalThemes?: Theme[]) => void;
  /** Replace the Theme Groups list (called by the persistent layout). */
  setThemeGroups: (themeGroups: ThemeGroup[]) => void;
  /** Sidebar selection helpers. */
  selectThemeGroup: (id: string | null) => void;
  toggleGroupExpanded: (id: string) => void;

  createTheme: (name: string, description?: string) => Theme;
  updateTheme: (id: string, patch: Partial<Pick<Theme, "name" | "description">>) => void;
  deleteTheme: (id: string) => void;
  duplicateTheme: (id: string) => Theme | undefined;
  upsertThemes: (themes: Theme[]) => void;

  /** Replace the full collection list for a theme (used by the drag-to-reorder + toggle UI). */
  setThemeSets: (themeId: string, sets: ThemeSetRef[]) => void;

  /** Toggle a collection's inclusion state between enabled ↔ disabled. */
  toggleSetMode: (themeId: string, setId: string) => void;

  selectTheme: (id: string | null) => void;
  isDirty: (id: string) => boolean;
  dirtyThemeIds: () => string[];
  saveAll: () => number;
  discardAll: () => number;
}

export const useThemesStore = create<ThemesState>((set, get) => ({
  themes: [],
  originals: [],
  themeGroups: [],
  activeThemeId: null,
  activeThemeGroupId: null,
  expandedGroups: {},

  setThemeGroups(themeGroups) {
    const expanded = get().expandedGroups;
    // Ensure newly-loaded groups default to expanded; preserve user toggles.
    const nextExpanded = { ...expanded };
    for (const group of themeGroups) {
      if (!(group.id in nextExpanded)) nextExpanded[group.id] = true;
    }
    set({ themeGroups, expandedGroups: nextExpanded });
  },

  selectThemeGroup(id) {
    set({ activeThemeGroupId: id, activeThemeId: null });
  },

  toggleGroupExpanded(id) {
    const expanded = get().expandedGroups;
    set({ expandedGroups: { ...expanded, [id]: !(expanded[id] ?? true) } });
  },

  hydrate(initialThemes, fileExists = true, originalThemes = initialThemes) {
    const normalized = normalizeThemes(initialThemes);
    const normalizedOriginals = normalizeThemes(originalThemes);
    if (normalized.length === 0 && !fileExists) {
      const legacy = normalizeThemes(readSaved());
      if (legacy.length > 0) {
        persist(legacy);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // Best effort migration cleanup.
        }
        set({ themes: legacy, originals: legacy });
        return;
      }
    }
    // Don't auto-select a Theme on hydrate. In the Tokens Studio model the
    // sidebar starts neutral; the user explicitly picks a Theme Group or a
    // Theme. Auto-selecting would also surface orphan themes (those without
    // a themeGroupId) that the sidebar otherwise hides.
    set({
      themes: normalized,
      originals: normalizedOriginals,
    });
  },

  createTheme(name, description) {
    const themes = get().themes;
    const theme = createThemeDraft(themes, name, description);
    const next = [...themes, theme];
    persist(next);
    set({ themes: next, activeThemeId: theme.id });
    return theme;
  },

  updateTheme(id, patch) {
    const next = get().themes.map((t) =>
      t.id === id
        ? { ...t, ...patch, updatedAt: new Date().toISOString() }
        : t
    );
    persist(next);
    set({ themes: next });
  },

  deleteTheme(id) {
    const next = get().themes.filter((t) => t.id !== id);
    persist(next);
    const active = get().activeThemeId;
    set({
      themes: next,
      activeThemeId: active === id ? (next[0]?.id ?? null) : active,
    });
  },

  duplicateTheme(id) {
    const source = get().themes.find((t) => t.id === id);
    if (!source) return undefined;
    const themes = get().themes;
    const copyDraft = createThemeDraft(themes, `${source.name} Copy`, source.description);
    const copy: Theme = {
      ...source,
      id: copyDraft.id,
      name: copyDraft.name,
      updatedAt: new Date().toISOString(),
    };
    const next = [...themes, copy];
    persist(next);
    set({ themes: next, activeThemeId: copy.id });
    return copy;
  },

  upsertThemes(incoming) {
    const byId = new Map(get().themes.map((theme) => [theme.id, theme]));
    for (const theme of incoming) {
      byId.set(theme.id, theme);
    }
    const next = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
    persist(next);
    set({ themes: next, activeThemeId: get().activeThemeId ?? next[0]?.id ?? null });
  },

  setThemeSets(themeId, sets) {
    const next = get().themes.map((t) =>
      t.id === themeId
        ? { ...t, sets, updatedAt: new Date().toISOString() }
        : t
    );
    persist(next);
    set({ themes: next });
  },

  toggleSetMode(themeId, setId) {
    const theme = get().themes.find((t) => t.id === themeId);
    if (!theme) return;
    const existing = theme.sets.find((s) => (s.collectionId ?? s.setId) === setId);
    let newSets: ThemeSetRef[];
    if (!existing) {
      newSets = [...theme.sets, { collectionId: setId, setId, state: "enabled", mode: "enabled" }];
    } else if ((existing.state ?? existing.mode) === "enabled" || (existing.state ?? existing.mode) === "source") {
      newSets = theme.sets.map((s) =>
        (s.collectionId ?? s.setId) === setId
          ? { ...s, state: "disabled" as const, mode: "disabled" as const }
          : s
      );
    } else {
      newSets = theme.sets.map((s) =>
        (s.collectionId ?? s.setId) === setId
          ? { ...s, state: "enabled" as const, mode: "enabled" as const }
          : s
      );
    }
    const next = get().themes.map((t) =>
      t.id === themeId
        ? { ...t, sets: newSets, updatedAt: new Date().toISOString() }
        : t
    );
    persist(next);
    set({ themes: next });
  },

  selectTheme(id) {
    set({ activeThemeId: id });
  },

  isDirty(id) {
    const current = get().themes.find((theme) => theme.id === id);
    const original = get().originals.find((theme) => theme.id === id);
    if (!current || !original) return current !== original;
    return JSON.stringify(current) !== JSON.stringify(original);
  },

  dirtyThemeIds() {
    const ids = new Set([
      ...get().themes.map((theme) => theme.id),
      ...get().originals.map((theme) => theme.id),
    ]);
    return Array.from(ids).filter((id) => get().isDirty(id));
  },

  saveAll() {
    const dirtyBefore = get().dirtyThemeIds();
    set({ originals: normalizeThemes(get().themes) });
    return dirtyBefore.length;
  },

  discardAll() {
    const dirtyBefore = get().dirtyThemeIds();
    const restored = normalizeThemes(get().originals);
    persist(restored);
    set({
      themes: restored,
      activeThemeId: restored.some((theme) => theme.id === get().activeThemeId)
        ? get().activeThemeId
        : restored[0]?.id ?? null,
    });
    return dirtyBefore.length;
  },
}));
