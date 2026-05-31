import { parseTokenFile } from "@/lib/dtcg/schema";
import { getCollectionModes } from "@/lib/dtcg/collections";
import type { TokenSet } from "@/lib/dtcg/types";
import type { Theme } from "@/lib/themes/types";
import { diffTokenSets } from "./diff";
import type { FigmaSyncPayload, SyncDiff } from "./types";

export type FigmaSyncParseResult =
  | { ok: true; payload: FigmaSyncPayload }
  | { ok: false; error: string };

export function createFigmaSyncPayload(
  sets: TokenSet[],
  themes: Theme[],
  generatedAt = new Date().toISOString()
): FigmaSyncPayload {
  return {
    version: "rozetta-figma-sync/v1",
    generatedAt,
    sets,
    themes,
    collections: sets.map((set) => ({
      collectionId: set.id,
      collectionName: set.name,
      setId: set.id,
    })),
    modes: sets.flatMap((set) =>
      getCollectionModes(set).map((mode) => ({
        collectionId: set.id,
        modeId: mode.id,
        modeName: mode.name,
        collectionIds: [set.id],
        setIds: [set.id],
      }))
    ),
  };
}

export function parseFigmaSyncPayload(raw: string): FigmaSyncParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Payload is not valid JSON." };
  }

  if (!isFigmaSyncPayloadLike(parsed)) {
    return { ok: false, error: "Payload is not a Rozetta Figma Sync v1 payload." };
  }

  for (const set of parsed.sets) {
    const roots = set.modeRoots && Object.keys(set.modeRoots).length > 0
      ? Object.values(set.modeRoots)
      : [set.root];
    for (const root of roots) {
      const result = parseTokenFile(JSON.stringify(root));
      if (!result.ok) {
        return { ok: false, error: `${set.name} is not a valid DTCG token collection.` };
      }
    }
  }

  return { ok: true, payload: parsed };
}

export function buildSyncDiff(
  currentSets: TokenSet[],
  incomingPayload: FigmaSyncPayload
): SyncDiff {
  return {
    generatedAt: new Date().toISOString(),
    incomingSets: incomingPayload.sets.length,
    incomingThemes: incomingPayload.themes.length,
    tokenDiff: diffTokenSets(currentSets, incomingPayload.sets),
  };
}

function isFigmaSyncPayloadLike(value: unknown): value is FigmaSyncPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.version === "rozetta-figma-sync/v1" &&
    typeof payload.generatedAt === "string" &&
    Array.isArray(payload.sets) &&
    payload.sets.every(isTokenSetLike) &&
    Array.isArray(payload.themes) &&
    payload.themes.every(isThemeLike) &&
    Array.isArray(payload.collections) &&
    Array.isArray(payload.modes)
  );
}

function isTokenSetLike(value: unknown): value is TokenSet {
  if (!value || typeof value !== "object") return false;
  const set = value as Record<string, unknown>;
  return (
    typeof set.id === "string" &&
    typeof set.name === "string" &&
    typeof set.filename === "string" &&
    Boolean(set.root) &&
    typeof set.root === "object"
  );
}

function isThemeLike(value: unknown): value is Theme {
  if (!value || typeof value !== "object") return false;
  const theme = value as Record<string, unknown>;
  return (
    typeof theme.id === "string" &&
    typeof theme.name === "string" &&
    Array.isArray(theme.sets) &&
    theme.sets.every(isThemeSetRefLike) &&
    typeof theme.updatedAt === "string"
  );
}

function isThemeSetRefLike(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const ref = value as Record<string, unknown>;
  return (
    typeof ref.setId === "string" &&
    (ref.mode === "enabled" || ref.mode === "source" || ref.mode === "disabled")
  );
}
