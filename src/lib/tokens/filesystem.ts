/**
 * Server/MCP-only filesystem helpers for token collections.
 *
 * Reads both the legacy `<workspace>/tokens/*.tokens.json` layout and the
 * collection-mode layout `<workspace>/tokens/<collection>/<mode>.tokens.json`.
 *
 * Legacy originals are never overwritten. DB-first collection/mode artifacts
 * are generated from the live workspace on Save/PR.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { parseTokenFile } from "@/lib/dtcg/schema";
import {
  DEFAULT_COLLECTION_MODE_ID,
  DEFAULT_COLLECTION_MODE_NAME,
} from "@/lib/dtcg/collections";
import type { CollectionMode, DtcgGroup, TokenSet } from "@/lib/dtcg/types";

const TOKENS_DIR = path.join(process.cwd(), "tokens");
const EDITED_SUFFIX = ".edited.tokens.json";
const ORIGINAL_SUFFIX = ".tokens.json";

interface DiscoveredFile {
  filename: string;
  /** Stable id ("default", "consumer", ...) derived from the original name. */
  id: string;
  /** Display name ("Default", "Consumer", ...). */
  name: string;
  /** True when an `<id>.edited.tokens.json` companion exists. */
  hasEdits: boolean;
}

function toId(filename: string): string {
  return filename
    .replace(EDITED_SUFFIX, "")
    .replace(ORIGINAL_SUFFIX, "")
    .toLowerCase();
}

function toDisplayName(id: string): string {
  return id
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Lists the original token files available in /tokens. */
export async function listTokenFiles(): Promise<DiscoveredFile[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(TOKENS_DIR);
  } catch {
    return [];
  }

  const originals = entries.filter(
    (entry) => entry.endsWith(ORIGINAL_SUFFIX) && !entry.endsWith(EDITED_SUFFIX)
  );
  const originalIds = new Set(originals.map((filename) => toId(filename)));
  const editedOnly = entries.filter((entry) => {
    if (!entry.endsWith(EDITED_SUFFIX)) return false;
    return !originalIds.has(toId(entry));
  });

  return [
    ...originals.map((filename) => {
      const id = toId(filename);
      return {
        filename,
        id,
        name: toDisplayName(id),
        hasEdits: entries.includes(`${id}${EDITED_SUFFIX}`),
      };
    }),
    ...editedOnly.map((filename) => {
      const id = toId(filename);
      return {
        filename: `${id}${ORIGINAL_SUFFIX}`,
        id,
        name: toDisplayName(id),
        hasEdits: true,
      };
    }),
  ]
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Loads a token set, preferring the edited copy when it exists.
 * Returns `undefined` and logs a warning when validation fails.
 */
export async function loadTokenSet(file: DiscoveredFile): Promise<TokenSet | undefined> {
  const targetFilename = file.hasEdits
    ? `${file.id}${EDITED_SUFFIX}`
    : file.filename;
  const fullPath = path.join(TOKENS_DIR, targetFilename);

  let raw: string;
  try {
    raw = await fs.readFile(fullPath, "utf-8");
  } catch {
    return undefined;
  }

  const result = parseTokenFile(raw);
  if (!result.ok) {
    console.warn(`Failed to parse ${targetFilename}: ${result.error}`);
    return undefined;
  }

  return {
    id: file.id,
    name: file.name,
    filename: file.filename,
    root: result.data as DtcgGroup,
  };
}

/** Loads every token set in /tokens. */
export async function loadAllTokenSets(): Promise<TokenSet[]> {
  const files = await listTokenFiles();
  const legacySets = await Promise.all(files.map((file) => loadTokenSet(file)));
  const modeCollections = await loadTokenCollectionsFromModeLayout();
  const byId = new Map<string, TokenSet>();
  for (const set of legacySets) {
    if (set) byId.set(set.id, set);
  }
  for (const collection of modeCollections) {
    byId.set(collection.id, collection);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function loadTokenCollectionsFromModeLayout(): Promise<TokenSet[]> {
  let entries: Array<{ isDirectory(): boolean; name: string }>;
  try {
    entries = await fs.readdir(TOKENS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const collections: TokenSet[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const collectionId = entry.name;
    const collectionDir = path.join(TOKENS_DIR, collectionId);
    let files: string[];
    try {
      files = await fs.readdir(collectionDir);
    } catch {
      continue;
    }

    const modeIds = new Set<string>();
    for (const filename of files) {
      if (!filename.endsWith(ORIGINAL_SUFFIX)) continue;
      modeIds.add(toId(filename));
    }

    const modes: CollectionMode[] = [];
    const modeRoots: Record<string, DtcgGroup> = {};
    for (const [position, modeId] of [...modeIds].sort().entries()) {
      const editedFilename = `${modeId}${EDITED_SUFFIX}`;
      const originalFilename = `${modeId}${ORIGINAL_SUFFIX}`;
      const targetFilename = files.includes(editedFilename)
        ? editedFilename
        : originalFilename;
      const fullPath = path.join(collectionDir, targetFilename);
      let raw: string;
      try {
        raw = await fs.readFile(fullPath, "utf-8");
      } catch {
        continue;
      }
      const result = parseTokenFile(raw);
      if (!result.ok) {
        console.warn(`Failed to parse ${collectionId}/${targetFilename}: ${result.error}`);
        continue;
      }
      const isDefault =
        modeId === DEFAULT_COLLECTION_MODE_ID ||
        modeId.toLowerCase() === DEFAULT_COLLECTION_MODE_NAME.toLowerCase() ||
        position === 0;
      modes.push({
        id: modeId,
        name: toDisplayName(modeId),
        isDefault,
        position,
      });
      modeRoots[modeId] = result.data as DtcgGroup;
    }

    if (modes.length === 0) continue;
    const defaultMode =
      modes.find((mode) => mode.isDefault) ??
      modes.toSorted((a, b) => a.position - b.position)[0];
    collections.push({
      id: collectionId,
      name: toDisplayName(collectionId),
      filename: `${collectionId}/${defaultMode.id}${ORIGINAL_SUFFIX}`,
      root: modeRoots[defaultMode.id] ?? {},
      modes,
      modeRoots,
      activeModeId: defaultMode.id,
    });
  }
  return collections;
}

/**
 * Writes the edited copy of a set without touching the original. Returns the
 * absolute path written so the UI can show it in toasts.
 */
export async function writeEditedTokenSet(
  setId: string,
  root: DtcgGroup
): Promise<string> {
  await fs.mkdir(TOKENS_DIR, { recursive: true });
  const targetPath = path.join(TOKENS_DIR, `${setId}${EDITED_SUFFIX}`);
  const json = JSON.stringify(root, null, 2);
  await fs.writeFile(targetPath, `${json}\n`, "utf-8");
  return targetPath;
}

export async function writeEditedTokenCollectionMode(
  collectionId: string,
  modeId: string,
  root: DtcgGroup
): Promise<string> {
  return writeTokenCollectionModeArtifact(collectionId, modeId, root);
}

export async function writeTokenCollectionModeArtifact(
  collectionId: string,
  modeId: string,
  root: DtcgGroup
): Promise<string> {
  const collectionDir = path.join(TOKENS_DIR, collectionId);
  await fs.mkdir(collectionDir, { recursive: true });
  const targetPath = path.join(collectionDir, `${modeId}${ORIGINAL_SUFFIX}`);
  const json = JSON.stringify(root, null, 2);
  await fs.writeFile(targetPath, `${json}\n`, "utf-8");
  return targetPath;
}

/** Removes an edited copy, returning to the original. No-op if missing. */
export async function discardEditedTokenSet(setId: string): Promise<void> {
  const targetPath = path.join(TOKENS_DIR, `${setId}${EDITED_SUFFIX}`);
  try {
    await fs.unlink(targetPath);
  } catch {
    // best-effort
  }
}
