/**
 * Theme resolver.
 *
 * Merges the token sets listed in a Theme into a single virtual TokenSet
 * that exporters can consume as if it were a real set.
 *
 * Merge strategy: last-wins. Sets are applied in list order (index 0 first,
 * last index on top) so a token defined in two sets ends up with the value
 * from the set closest to the end of the theme's `sets` array.
 *
 * Disabled sets are skipped entirely.
 *
 * Returns both the merged TokenSet and a conflict map so the UI can surface
 * which paths were overridden and by which set.
 */

import { flattenTokens } from "@/lib/dtcg/parser";
import { materializeCollectionMode } from "@/lib/dtcg/collections";
import type { DtcgGroup, DtcgToken, TokenSet } from "@/lib/dtcg/types";
import type { Theme } from "./types";

export interface ConflictEntry {
  /** Path that appears in more than one enabled set. */
  path: string;
  /** All sets that define this path, in merge order. */
  setIds: string[];
  /** The winning set (last one). */
  winnerId: string;
}

export interface ThemeResolveResult {
  /** A virtual TokenSet containing the merged token tree. */
  merged: TokenSet;
  /** Paths that were overridden by later sets. */
  conflicts: ConflictEntry[];
}

/**
 * Inserts a flat list of DTCG tokens into a group tree, creating intermediate
 * group nodes as needed. Used to reconstruct a DtcgGroup from a flat path list.
 */
function buildTree(
  entries: Array<{ path: string; token: DtcgToken }>
): DtcgGroup {
  const root: DtcgGroup = {};
  for (const { path, token } of entries) {
    const segments = path.split(".");
    let cursor: DtcgGroup = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i]!;
      if (!cursor[seg] || typeof cursor[seg] !== "object" || "$value" in (cursor[seg] as object)) {
        cursor[seg] = {} as DtcgGroup;
      }
      cursor = cursor[seg] as DtcgGroup;
    }
    const last = segments[segments.length - 1]!;
    cursor[last] = token;
  }
  return root;
}

export function resolveTheme(
  theme: Theme,
  allSets: TokenSet[]
): ThemeResolveResult {
  const enabledRefs = theme.sets.filter((ref) => (ref.state ?? ref.mode) !== "disabled");

  // Map path → { token, setId } — populated in order so last write wins.
  const tokenMap = new Map<string, { token: DtcgToken; setId: string }>();
  // Track all setIds that defined each path (for conflict detection).
  const pathSetIds = new Map<string, string[]>();

  for (const ref of enabledRefs) {
    const collection = allSets.find((s) => s.id === (ref.collectionId ?? ref.setId));
    if (!collection) continue;
    const set = ref.modeId ? materializeCollectionMode(collection, ref.modeId) : collection;
    const flat = flattenTokens(set);
    for (const ft of flat) {
      const existing = pathSetIds.get(ft.path);
      if (existing) {
        existing.push(ref.setId);
      } else {
        pathSetIds.set(ft.path, [ref.setId]);
      }
      tokenMap.set(ft.path, {
        token: {
          $type: ft.$type,
          $value: ft.$value,
          ...(ft.$description ? { $description: ft.$description } : {}),
          ...(ft.$extensions ? { $extensions: ft.$extensions } : {}),
        },
        setId: ref.setId,
      });
    }
  }

  // Build conflict list: paths seen in 2+ sets.
  const conflicts: ConflictEntry[] = [];
  for (const [path, setIds] of pathSetIds) {
    if (setIds.length < 2) continue;
    conflicts.push({
      path,
      setIds,
      winnerId: tokenMap.get(path)!.setId,
    });
  }
  conflicts.sort((a, b) => a.path.localeCompare(b.path));

  // Reconstruct a TokenSet from the flat map.
  const entries = Array.from(tokenMap.entries()).map(([path, { token }]) => ({
    path,
    token,
  }));
  const mergedRoot = buildTree(entries);

  const merged: TokenSet = {
    id: `__theme__${theme.id}`,
    name: theme.name,
    filename: `${theme.id}.tokens.json`,
    root: mergedRoot,
  };

  return { merged, conflicts };
}
