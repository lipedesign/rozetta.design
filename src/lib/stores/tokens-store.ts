"use client";

/**
 * Client-side store for the Rozetta editor.
 *
 * Holds the in-memory representation of every token collection, plus selection
 * state (active set, active group) and dirty tracking (which sets have
 * unsaved edits). All edits go through `setTokenAtPath` so `$extensions`
 * are preserved.
 */

import { create } from "zustand";

import {
  getActiveCollectionMode,
  getCollectionModeRoot,
  getCollectionModes,
  withCollectionModeRoot,
} from "@/lib/dtcg/collections";
import { getNodeAtPath } from "@/lib/dtcg/parser";
import {
  cloneGroup,
  deleteTokenAtPath,
  insertTokenAtPath,
  setTokenAtPath,
} from "@/lib/dtcg/serializer";
import {
  isDtcgToken,
  type DtcgGroup,
  type DtcgToken,
  type DtcgValue,
  type TokenSet,
} from "@/lib/dtcg/types";
import { deleteTokenSetDraft, saveTokenSetDraft } from "@/lib/tokens/actions";

interface TokenPatch {
  $value?: DtcgValue;
  $type?: DtcgToken["$type"];
  $description?: string;
  $extensions?: Record<string, unknown>;
}

/**
 * `activeSetId` semantics:
 *   - a real set id (eg. "default") → workspace shows that set
 *   - "*" (ALL_SETS_ID) → workspace shows tokens from every loaded set
 *   - undefined → no selection (initial state)
 */
export const ALL_SETS_ID = "*";

/**
 * Multi-selection key. We encode (setId, path) into a single string so
 * the selection set can live in plain JS Sets without nested structures.
 */
export type SelectionKey = `${string}::${string}`;

export const toSelectionKey = (setId: string, path: string): SelectionKey =>
  `${setId}::${path}` as SelectionKey;

export const fromSelectionKey = (
  key: SelectionKey
): { setId: string; path: string } => {
  const idx = key.indexOf("::");
  return { setId: key.slice(0, idx), path: key.slice(idx + 2) };
};

interface TokensState {
  sets: TokenSet[];
  /** Map of original (server-provided) snapshots, used to detect dirty state. */
  originals: Record<string, DtcgGroup>;
  activeSetId: string | undefined;
  activeGroupPath: string;
  /** Free-text search applied to token name/path. */
  searchQuery: string;
  /** Currently selected token (for the editor sheet). */
  selectedToken: { setId: string; path: string; isNew?: boolean } | undefined;
  /** Set of `<setId>::<path>` keys currently bulk-selected. */
  multiSelection: Set<SelectionKey>;

  hydrate: (sets: TokenSet[], originalRoots?: Record<string, DtcgGroup>) => void;
  selectSet: (setId: string) => void;
  selectCollectionMode: (collectionId: string, modeId: string) => void;
  selectGroup: (groupPath: string) => void;
  setSearchQuery: (query: string) => void;
  selectToken: (setId: string, path: string) => void;
  clearSelectedToken: () => void;
  toggleMultiSelection: (setId: string, path: string) => void;
  setMultiSelection: (keys: SelectionKey[]) => void;
  clearMultiSelection: () => void;
  deleteSelected: () => number;
  patchToken: (setId: string, path: string, patch: TokenPatch) => void;
  deleteToken: (setId: string, path: string) => void;
  /**
   * Duplicates a token in-place under the same parent group, appending
   * "-copy" (and "-copy-2", "-copy-3"…) to disambiguate. Returns the new
   * path so callers can immediately select/edit the clone.
   */
  duplicateToken: (setId: string, path: string) => string | undefined;
  /**
   * Renames or relocates a token. Supports three flavours of motion:
   *
   *   - rename in place        (same set, sibling rename → `path` differs only in last segment)
   *   - move within a set      (same set, different group)
   *   - move across sets       (`fromSetId !== toSetId`)
   *
   * Returns `{ ok, error }` because there are several user-visible failure
   * modes (collision with an existing path, missing source token, target
   * group is itself a token, …) and we want the editor sheet to surface
   * them inline rather than silently no-op.
   */
  moveToken: (input: {
    fromSetId: string;
    fromPath: string;
    toSetId: string;
    toPath: string;
  }) => { ok: true; newPath: string } | { ok: false; error: string };
  replaceSetRoot: (setId: string, root: DtcgGroup) => void;
  /**
   * Imports a token tree as a new set, OR replaces the existing set when
   * one with the same id already exists. Returns the imported set's id so
   * the caller can immediately switch the workspace to it. The new (or
   * replaced) set is marked dirty so the user has to explicitly "Save"
   * to persist it across reloads.
   */
  importSet: (
    name: string,
    root: DtcgGroup,
    options?: Pick<TokenSet, "modes" | "modeRoots" | "activeModeId"> & {
      replaceId?: string;
      id?: string;
      filename?: string;
    }
  ) => string;
  /**
   * Creates a new token placeholder inside the active set (or the first
   * available set when nothing is active). The token is inserted at the
   * given path and immediately selected for editing in the sheet.
   * Returns the new token path, or undefined when no set is available.
   */
  createToken: (setId?: string) => string | undefined;
  markClean: (setId: string) => void;
  isDirty: (setId: string) => boolean;
  dirtySetIds: () => string[];
  /**
   * Snapshots all current set roots into `originals` after the DB workspace
   * has been exported to Git-native artifacts. Returns the count of sets that
   * were dirty before save.
   */
  saveAll: () => number;
  /**
   * Reverts a single set back to its `originals` snapshot. Returns true if
   * the set was found and a revert actually happened.
   */
  discardSet: (setId: string) => boolean;
  /** Reverts every dirty set. Returns the count of reverted sets. */
  discardAll: () => number;
}

export const useTokensStore = create<TokensState>((set, get) => ({
  sets: [],
  originals: {},
  activeSetId: undefined,
  activeGroupPath: "",
  searchQuery: "",
  selectedToken: undefined,
  multiSelection: new Set<SelectionKey>(),

  hydrate(sets, originalRoots = {}) {
    const originals: Record<string, DtcgGroup> = {};
    for (const s of sets) {
      originals[s.id] = cloneRoot(originalRoots[s.id] ?? s.root);
    }
    set({
      sets,
      originals,
      activeSetId: ALL_SETS_ID,
      activeGroupPath: "",
      searchQuery: "",
      selectedToken: undefined,
      multiSelection: new Set<SelectionKey>(),
    });
  },

  selectSet(setId) {
    set({
      activeSetId: setId,
      activeGroupPath: "",
      multiSelection: new Set<SelectionKey>(),
    });
  },

  selectCollectionMode(collectionId, modeId) {
    const target = get().sets.find((s) => s.id === collectionId);
    if (!target) return;
    const root = getCollectionModeRoot(target, modeId);
    const nextSet = {
      ...target,
      root,
      activeModeId: modeId,
    };
    set({
      sets: get().sets.map((s) => (s.id === collectionId ? nextSet : s)),
      activeSetId: collectionId,
      activeGroupPath: "",
      selectedToken:
        get().selectedToken?.setId === collectionId
          ? undefined
          : get().selectedToken,
      multiSelection: new Set<SelectionKey>(),
    });
  },

  selectGroup(groupPath) {
    set({ activeGroupPath: groupPath, multiSelection: new Set<SelectionKey>() });
  },

  setSearchQuery(query) {
    set({ searchQuery: query });
  },

  selectToken(setId, path) {
    set({ selectedToken: { setId, path } });
  },

  clearSelectedToken() {
    set({ selectedToken: undefined });
  },

  toggleMultiSelection(setId, path) {
    const key = toSelectionKey(setId, path);
    const next = new Set(get().multiSelection);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    set({ multiSelection: next });
  },

  setMultiSelection(keys) {
    set({ multiSelection: new Set(keys) });
  },

  clearMultiSelection() {
    set({ multiSelection: new Set<SelectionKey>() });
  },

  /**
   * Bulk-deletes every token in `multiSelection`. We group by setId and
   * apply `deleteTokenAtPath` once per token, all on the same cloned tree
   * for that set, so each set's tree is only rebuilt once. Returns the
   * count of deleted tokens so callers can show a confirmation toast.
   */
  deleteSelected() {
    const selection = get().multiSelection;
    if (selection.size === 0) return 0;

    const bySet = new Map<string, string[]>();
    for (const key of selection) {
      const { setId, path } = fromSelectionKey(key);
      if (!bySet.has(setId)) bySet.set(setId, []);
      bySet.get(setId)!.push(path);
    }

    const changedSets: TokenSet[] = [];
    const nextSets = get().sets.map((s) => {
      const paths = bySet.get(s.id);
      if (!paths) return s;
      let root = getEditableRoot(s);
      for (const p of paths) root = deleteTokenAtPath(root, p);
      const nextSet = applyEditableRoot(s, root);
      changedSets.push(nextSet);
      return nextSet;
    });

    const sel = get().selectedToken;
    const editorWasDeleted =
      sel !== undefined && selection.has(toSelectionKey(sel.setId, sel.path));

    set({
      sets: nextSets,
      multiSelection: new Set<SelectionKey>(),
      selectedToken: editorWasDeleted ? undefined : sel,
    });
    persistTokenSets(changedSets);
    return selection.size;
  },

  patchToken(setId, path, patch) {
    const target = get().sets.find((s) => s.id === setId);
    if (!target) return;
    const nextRoot = setTokenAtPath(getEditableRoot(target), path, patch);
    const nextSet = applyEditableRoot(target, nextRoot);
    set({
      sets: get().sets.map((s) =>
        s.id === setId ? nextSet : s
      ),
    });
    persistTokenSet(nextSet);
  },

  deleteToken(setId, path) {
    const target = get().sets.find((s) => s.id === setId);
    if (!target || !path) return;
    const nextRoot = deleteTokenAtPath(getEditableRoot(target), path);
    const nextSet = applyEditableRoot(target, nextRoot);
    set({
      sets: get().sets.map((s) =>
        s.id === setId ? nextSet : s
      ),
      // If the deleted token was the one being edited in the sheet, close it.
      selectedToken:
        get().selectedToken?.setId === setId &&
        get().selectedToken?.path === path
          ? undefined
          : get().selectedToken,
    });
    persistTokenSet(nextSet);
  },

  duplicateToken(setId, path) {
    const target = get().sets.find((s) => s.id === setId);
    if (!target || !path) return undefined;
    const targetRoot = getEditableRoot(target);
    const node = getNodeAtPath(targetRoot, path);
    if (!node || !isDtcgToken(node)) return undefined;

    /**
     * Find a unique sibling name. Try `${original}-copy`, then
     * `${original}-copy-2`, `-3`, … until we find a slot that doesn't
     * collide with an existing key in the parent group. We then write
     * the cloned token into the new path inside a fresh tree clone —
     * `setTokenAtPath` only patches existing tokens, so for "create"
     * we mutate the cloned tree directly.
     */
    const segments = path.split(".");
    const tokenName = segments[segments.length - 1]!;
    const parentPath = segments.slice(0, -1).join(".");
    const parent = getNodeAtPath(targetRoot, parentPath);
    if (!parent) return undefined;

    let suffix = 1;
    let candidate = `${tokenName}-copy`;
    while ((parent as Record<string, unknown>)[candidate] !== undefined) {
      suffix += 1;
      candidate = `${tokenName}-copy-${suffix}`;
    }

    const nextRoot = cloneGroup(targetRoot);
    let cursor: DtcgGroup | DtcgToken = nextRoot;
    if (parentPath) {
      for (const seg of parentPath.split(".")) {
        cursor = (cursor as Record<string, unknown>)[seg] as
          | DtcgGroup
          | DtcgToken;
      }
    }
    const cloned: DtcgToken = {
      $type: node.$type,
      $value: JSON.parse(JSON.stringify(node.$value)) as DtcgValue,
      ...(node.$description !== undefined
        ? { $description: node.$description }
        : {}),
      ...(node.$extensions !== undefined
        ? {
            $extensions: JSON.parse(
              JSON.stringify(node.$extensions)
            ) as Record<string, unknown>,
          }
        : {}),
    };
    (cursor as Record<string, unknown>)[candidate] = cloned;

    const nextSet = applyEditableRoot(target, nextRoot);
    set({
      sets: get().sets.map((s) =>
        s.id === setId ? nextSet : s
      ),
    });
    persistTokenSet(nextSet);
    return parentPath ? `${parentPath}.${candidate}` : candidate;
  },

  moveToken({ fromSetId, fromPath, toSetId, toPath }) {
    if (!fromPath || !toPath) {
      return { ok: false, error: "Path cannot be empty." };
    }
    if (fromSetId === toSetId && fromPath === toPath) {
      // No-op rename. Treat as success so the UI can close the editor
      // without complaining.
      return { ok: true, newPath: toPath };
    }

    const sets = get().sets;
    const fromSet = sets.find((s) => s.id === fromSetId);
    const toSet = sets.find((s) => s.id === toSetId);
    if (!fromSet) return { ok: false, error: "Source set not found." };
    if (!toSet) return { ok: false, error: "Target set not found." };

    const fromRootCurrent = getEditableRoot(fromSet);
    const toRootCurrent = getEditableRoot(toSet);
    const sourceNode = getNodeAtPath(fromRootCurrent, fromPath);
    if (!sourceNode || !isDtcgToken(sourceNode)) {
      return { ok: false, error: "Source token not found." };
    }

    // Collision check on the destination, against the live tree (or, if
    // this is an intra-set move, against a tree where the source has
    // already been removed — otherwise renaming `a.b` to `a.b.c` would
    // false-positive itself).
    const collisionRoot =
      fromSetId === toSetId
        ? deleteTokenAtPath(toRootCurrent, fromPath)
        : toRootCurrent;
    const existing = getNodeAtPath(collisionRoot, toPath);
    if (existing !== undefined) {
      return {
        ok: false,
        error: `A token or group already exists at "${toPath}".`,
      };
    }

    // Make sure no ancestor of the destination is itself a token (would
    // mean we'd be writing token children inside a leaf, which is not a
    // legal DTCG shape).
    const segs = toPath.split(".");
    for (let i = 1; i < segs.length; i++) {
      const ancestorPath = segs.slice(0, i).join(".");
      const ancestor = getNodeAtPath(collisionRoot, ancestorPath);
      if (ancestor !== undefined && isDtcgToken(ancestor)) {
        return {
          ok: false,
          error: `Cannot place a token under "${ancestorPath}" — that path is already a token, not a group.`,
        };
      }
    }

    // Deep-clone the source so the moved token is detached from the
    // original tree — important because both source and destination
    // might be the same set (intra-set move) and `setTokenAtPath`
    // structure-shares unaffected branches.
    const cloned: DtcgToken = JSON.parse(JSON.stringify(sourceNode));

    // Apply: delete from source, insert at destination. When source
    // and destination are the same set we have to chain both operations
    // on the same intermediate tree, otherwise the second `set` overwrites
    // the first.
    let nextSets = sets;
    const changedSets: TokenSet[] = [];
    try {
      if (fromSetId === toSetId) {
        const intermediate = deleteTokenAtPath(fromRootCurrent, fromPath);
        const finalRoot = insertTokenAtPath(intermediate, toPath, cloned);
        const nextSet = applyEditableRoot(fromSet, finalRoot);
        changedSets.push(nextSet);
        nextSets = sets.map((s) =>
          s.id === fromSetId ? nextSet : s
        );
      } else {
        const fromRoot = deleteTokenAtPath(fromRootCurrent, fromPath);
        const toRoot = insertTokenAtPath(toRootCurrent, toPath, cloned);
        const nextFromSet = applyEditableRoot(fromSet, fromRoot);
        const nextToSet = applyEditableRoot(toSet, toRoot);
        changedSets.push(nextFromSet, nextToSet);
        nextSets = sets.map((s) => {
          if (s.id === fromSetId) return nextFromSet;
          if (s.id === toSetId) return nextToSet;
          return s;
        });
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Move failed.",
      };
    }

    // Reconcile selection state: editor sheet follows the token to its
    // new home; bulk selection drops the old key (the user can re-select
    // explicitly if they care).
    const sel = get().selectedToken;
    const movedSelection =
      sel && sel.setId === fromSetId && sel.path === fromPath
        ? { setId: toSetId, path: toPath }
        : sel;

    const oldKey = toSelectionKey(fromSetId, fromPath);
    const multi = get().multiSelection;
    let nextMulti = multi;
    if (multi.has(oldKey)) {
      nextMulti = new Set(multi);
      nextMulti.delete(oldKey);
      nextMulti.add(toSelectionKey(toSetId, toPath));
    }

    set({
      sets: nextSets,
      selectedToken: movedSelection,
      multiSelection: nextMulti,
    });
    persistTokenSets(changedSets);

    return { ok: true, newPath: toPath };
  },

  replaceSetRoot(setId, root) {
    const target = get().sets.find((s) => s.id === setId);
    if (!target) return;
    const nextSet = applyEditableRoot(target, root);
    set({
      sets: get().sets.map((s) => (s.id === setId ? nextSet : s)),
    });
    persistTokenSet(nextSet);
  },

  importSet(name, root, options) {
    const sets = get().sets;
    if (options?.replaceId) {
      const target = sets.find((s) => s.id === options.replaceId);
      if (target) {
        const nextSet: TokenSet = {
          ...target,
          root,
          modes: options?.modes ?? target.modes,
          modeRoots: options?.modeRoots ?? target.modeRoots,
          activeModeId: options?.activeModeId ?? target.activeModeId,
        };
        // Keep the existing id/name so dependent state (selection, dirty
        // tracking via `originals[setId]`, exported filenames…) doesn't
        // need any extra cleanup.
        set({
          sets: sets.map((s) =>
            s.id === target.id ? nextSet : s
          ),
          activeSetId: target.id,
          activeGroupPath: "",
        });
        persistTokenSet(nextSet);
        return target.id;
      }
    }
    // Fresh import. Slugify the name into an id and de-dupe by appending
    // a numeric suffix when needed.
    const fallbackId =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "imported";
    const baseId = options?.id ?? fallbackId;
    let id = baseId;
    let n = 2;
    while (sets.some((s) => s.id === id)) {
      id = `${baseId}-${n++}`;
    }
    const newSet: TokenSet = {
      id,
      name,
      filename: options?.filename ?? `${id}.tokens.json`,
      root,
      modes: options?.modes,
      modeRoots: options?.modeRoots,
      activeModeId: options?.activeModeId,
    };
    set({
      sets: [...sets, newSet],
      activeSetId: id,
      activeGroupPath: "",
    });
    persistTokenSet(newSet);
    return id;
  },

  createToken(setId) {
    const sets = get().sets;
    const activeId = setId ?? get().activeSetId;
    // Resolve target set: prefer explicitly passed id, then active set
    // (skipping the ALL_SETS_ID sentinel), then the first available set.
    const targetSet =
      sets.find((s) => s.id === activeId && activeId !== ALL_SETS_ID) ??
      sets.find((s) => s.id !== ALL_SETS_ID) ??
      sets[0];
    if (!targetSet) return undefined;

    // Generate a unique placeholder path like "new-token", "new-token-2"…
    let candidate = "new-token";
    let n = 2;
    while (true) {
      try {
        const root = insertTokenAtPath(getEditableRoot(targetSet), candidate, {
          $type: "color",
          $value: "#000000",
        });
        const nextSet = applyEditableRoot(targetSet, root);
        set({
          sets: get().sets.map((s) =>
            s.id === targetSet.id ? nextSet : s
          ),
          selectedToken: { setId: targetSet.id, path: candidate, isNew: true },
          activeSetId: targetSet.id,
        });
        persistTokenSet(nextSet);
        return candidate;
      } catch {
        candidate = `new-token-${n++}`;
        if (n > 100) return undefined;
      }
    }
  },

  markClean(setId) {
    const target = get().sets.find((s) => s.id === setId);
    if (!target) return;
    set({
      originals: {
        ...get().originals,
        ...snapshotOriginalRoots(target),
      },
    });
  },

  isDirty(setId) {
    const current = get().sets.find((s) => s.id === setId);
    const original = get().originals[setId];
    if (!current) return false;
    if (!original) return true;
    for (const mode of getCollectionModes(current)) {
      const currentRoot = getCollectionModeRoot(current, mode.id);
      const originalRoot = get().originals[`${setId}:${mode.id}`] ?? (mode.isDefault ? original : undefined);
      if (!originalRoot) return true;
      if (JSON.stringify(currentRoot) !== JSON.stringify(originalRoot)) return true;
    }
    return false;
  },

  dirtySetIds() {
    return get()
      .sets.filter((s) => get().isDirty(s.id))
      .map((s) => s.id);
  },

  saveAll() {
    const dirtyBefore = get().dirtySetIds();
    const sets = get().sets;
    const nextOriginals: Record<string, DtcgGroup> = {};
    for (const s of sets) {
      Object.assign(nextOriginals, snapshotOriginalRoots(s));
    }
    set({ originals: nextOriginals });
    return dirtyBefore.length;
  },

  discardSet(setId) {
    const original = get().originals[setId];
    const target = get().sets.find((s) => s.id === setId);
    if (!target) return false;

    if (!original) {
      const nextSets = get().sets.filter((s) => s.id !== setId);
      const selectedToken =
        get().selectedToken?.setId === setId ? undefined : get().selectedToken;
      const nextActiveSetId =
        get().activeSetId === setId
          ? (nextSets.length > 0 ? ALL_SETS_ID : undefined)
          : get().activeSetId;

      set({
        sets: nextSets,
        activeSetId: nextActiveSetId,
        activeGroupPath: get().activeSetId === setId ? "" : get().activeGroupPath,
        selectedToken,
        multiSelection: new Set(
          Array.from(get().multiSelection).filter(
            (k) => fromSelectionKey(k).setId !== setId
          )
        ),
      });
      void deleteTokenSetDraft(setId);
      return true;
    }

    const restoredSet = restoreCollectionFromOriginals(target, get().originals);
    set({
      sets: get().sets.map((s) =>
        s.id === setId ? restoredSet : s
      ),
      // Clear stale selections inside the discarded set since the paths
      // they pointed at may no longer exist after the revert.
      selectedToken:
        get().selectedToken?.setId === setId ? undefined : get().selectedToken,
      multiSelection: new Set(
        Array.from(get().multiSelection).filter(
          (k) => fromSelectionKey(k).setId !== setId
        )
      ),
    });
    persistTokenSet(restoredSet);
    return true;
  },

  discardAll() {
    const dirty = get().dirtySetIds();
    for (const id of dirty) {
      get().discardSet(id);
    }
    return dirty.length;
  },
}));

function persistTokenSet(set: TokenSet): void {
  void saveTokenSetDraft(set);
}

function persistTokenSets(sets: TokenSet[]): void {
  for (const set of sets) persistTokenSet(set);
}

function cloneRoot(root: DtcgGroup): DtcgGroup {
  return JSON.parse(JSON.stringify(root)) as DtcgGroup;
}

function snapshotOriginalRoots(set: TokenSet): Record<string, DtcgGroup> {
  const snapshot: Record<string, DtcgGroup> = {
    [set.id]: cloneRoot(set.root),
  };
  for (const mode of getCollectionModes(set)) {
    snapshot[`${set.id}:${mode.id}`] = cloneRoot(getCollectionModeRoot(set, mode.id));
  }
  return snapshot;
}

function restoreCollectionFromOriginals(set: TokenSet, originals: Record<string, DtcgGroup>): TokenSet {
  let restored = { ...set, root: cloneRoot(originals[set.id] ?? set.root) };
  for (const mode of getCollectionModes(set)) {
    const originalRoot = originals[`${set.id}:${mode.id}`] ?? (mode.isDefault ? originals[set.id] : undefined);
    if (!originalRoot) continue;
    restored = withCollectionModeRoot(restored, mode.id, cloneRoot(originalRoot));
  }
  const activeMode = getActiveCollectionMode(restored);
  return {
    ...restored,
    root: getCollectionModeRoot(restored, activeMode.id),
  };
}

function getEditableRoot(set: TokenSet): DtcgGroup {
  const activeMode = getActiveCollectionMode(set);
  return getCollectionModeRoot(set, activeMode.id);
}

function applyEditableRoot(set: TokenSet, root: DtcgGroup): TokenSet {
  const activeMode = getActiveCollectionMode(set);
  return {
    ...withCollectionModeRoot(set, activeMode.id, root),
    activeModeId: activeMode.id,
  };
}
