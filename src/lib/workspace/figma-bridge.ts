import { DEFAULT_COLLECTION_MODE_ID, DEFAULT_COLLECTION_MODE_NAME } from "@/lib/dtcg/collections";
import { diffTokenSets } from "@/lib/workspace/diff";
import { insertTokenAtPath } from "@/lib/dtcg/serializer";
import type { CollectionMode, DtcgGroup, DtcgToken, DtcgType, DtcgValue, TokenSet } from "@/lib/dtcg/types";
import type { Theme } from "@/lib/themes/types";
import type {
  FigmaFileSnapshot,
  FigmaVariableBinding,
  FigmaVariableResolvedType,
  FigmaVariableSnapshot,
  FigmaVariableValue,
  SyncOperation,
  SyncRun,
} from "@/lib/workspace/types";

export interface FigmaToRozettaResult {
  sets: TokenSet[];
  themes: Theme[];
  bindings: FigmaVariableBinding[];
}

export function figmaSnapshotToRozetta(snapshot: FigmaFileSnapshot): FigmaToRozettaResult {
  const now = snapshot.createdAt || new Date().toISOString();
  const sets: TokenSet[] = [];
  const bindings: FigmaVariableBinding[] = [];
  const variablesByCollection = new Map<string, FigmaVariableSnapshot[]>();

  for (const variable of snapshot.variables) {
    const current = variablesByCollection.get(variable.collectionId) ?? [];
    current.push(variable);
    variablesByCollection.set(variable.collectionId, current);
  }

  const variablePathById = new Map<string, string>();
  for (const variable of snapshot.variables) {
    variablePathById.set(variable.id, figmaVariableNameToTokenPath(variable.name));
  }

  for (const collection of snapshot.collections) {
    const collectionVariables = variablesByCollection.get(collection.collectionId) ?? [];
    const collectionId = slugify(collection.name.trim() || collection.collectionId || "collection");
    const modes: CollectionMode[] = collection.modes.length > 0
      ? collection.modes.map((mode, index) => ({
          id: slugify(mode.name || mode.modeId || DEFAULT_COLLECTION_MODE_ID),
          name: mode.name.trim() || "Default",
          figmaModeId: mode.modeId,
          isDefault: index === 0,
          position: index,
        }))
      : [
          {
            id: DEFAULT_COLLECTION_MODE_ID,
            name: "Default",
            isDefault: true,
            position: 0,
          },
        ];
    const modeRoots: Record<string, DtcgGroup> = {};

    const figmaModes = collection.modes.length > 0
      ? collection.modes
      : [{ modeId: DEFAULT_COLLECTION_MODE_ID, name: DEFAULT_COLLECTION_MODE_NAME }];

    for (const mode of figmaModes) {
      const collectionMode = modes.find((item) => item.figmaModeId === mode.modeId) ?? modes[0]!;
      const modeId = collectionMode.id;
      const root: DtcgGroup = {};

      for (const variable of collectionVariables) {
        if (!(mode.modeId in variable.valuesByMode)) continue;
        const path = figmaVariableNameToTokenPath(variable.name);
        const token: DtcgToken = {
          $type: figmaTypeToDtcg(variable.resolvedType),
          $value: figmaValueToDtcgValue(variable.valuesByMode[mode.modeId], variablePathById),
          ...(variable.description ? { $description: variable.description } : {}),
          $extensions: {
            figma: {
              variableId: variable.id,
              key: variable.key,
              collectionId: variable.collectionId,
              collectionName: variable.collectionName,
              modeId: mode.modeId,
              modeName: mode.name,
              scopes: variable.scopes ?? [],
              codeSyntax: variable.codeSyntax ?? {},
              source: snapshot.source,
            },
          },
        };
        insertOrOverwriteToken(root, path, token);
        bindings.push({
          id: `figma-binding:${snapshot.fileKey}:${variable.id}:${mode.modeId}`,
          figmaFileId: `figma:${snapshot.fileKey}`,
          variableId: variable.id,
          collectionId: variable.collectionId,
          modeId: mode.modeId,
          rozettaCollectionId: collectionId,
          rozettaModeId: modeId,
          setId: collectionId,
          tokenPath: path,
          metadata: {
            collectionName: variable.collectionName,
            modeName: mode.name,
            rozettaCollectionId: collectionId,
            rozettaModeId: modeId,
            variableName: variable.name,
          },
          createdAt: now,
          updatedAt: now,
          lastSyncedAt: now,
        });
      }

      modeRoots[modeId] = root;
      // NOTE: Figma modes are translated into `CollectionMode` entries on the
      // TokenSet above, NOT into Rozetta Themes. A Theme in Rozetta is a
      // user-authored composition ("for this product, use mode X of collection
      // A and mode Y of collection B"). Auto-creating one Theme per Figma mode
      // conflates the two concepts and pollutes /themes with placeholder rows.
    }

    const defaultMode = modes.find((mode) => mode.isDefault) ?? modes[0]!;
    sets.push({
      id: collectionId,
      name: collection.name.trim() || collectionId,
      filename: `${filenamePart(collection.name.trim() || collectionId)}.tokens.json`,
      root: modeRoots[defaultMode.id] ?? {},
      modes,
      modeRoots,
      activeModeId: defaultMode.id,
    });
  }

  return {
    sets,
    // Themes are intentionally empty: Rozetta Themes are user-authored
    // compositions that reference Collections+modes. They are not derived from
    // Figma modes (those become CollectionMode entries on the TokenSets above).
    themes: [],
    bindings,
  };
}

export function buildFigmaToRozettaSyncRun(input: {
  currentSets: TokenSet[];
  snapshot: FigmaFileSnapshot;
  snapshotId?: string;
  now?: string;
}): { result: FigmaToRozettaResult; run: SyncRun } {
  const now = input.now ?? new Date().toISOString();
  const result = figmaSnapshotToRozetta(input.snapshot);
  const diff = diffTokenSets(input.currentSets, result.sets);
  const runId = `sync-run:figma-to-rozetta:${Date.parse(now)}`;
  const operations: SyncOperation[] = diff.changes.map((change, index) => ({
    id: `${runId}:op:${index}`,
    runId,
    kind:
      change.kind === "token-removed" || change.kind === "set-removed"
        ? "token.remove"
        : change.kind === "token-created" || change.kind === "set-created"
          ? "token.create"
          : "token.update",
    status: "pending",
    targetKind: "token",
    targetId: `${change.setId}:${change.path ?? change.kind}`,
    summary: `${change.kind} in ${change.setName}${change.path ? ` / ${change.path}` : ""}`,
    payload: { change },
    createdAt: now,
  }));

  return {
    result,
    run: {
      id: runId,
      connectorId: "figma",
      direction: "figma-to-rozetta",
      status: "draft",
      sourceSnapshotId: input.snapshotId,
      summary:
        operations.length === 0
          ? "Figma snapshot matches the current Rozetta collections."
          : `${operations.length} reviewed Figma → Rozetta operation${operations.length === 1 ? "" : "s"} prepared.`,
      operations,
      createdAt: now,
    },
  };
}

export function createRozettaToFigmaPayload(input: {
  sets: TokenSet[];
  themes: Theme[];
  bindings: FigmaVariableBinding[];
}) {
  return {
    version: "rozetta-figma-writeback/v1",
    generatedAt: new Date().toISOString(),
    sets: input.sets,
    themes: input.themes,
    bindings: input.bindings,
    safety: {
      destructiveDeletes: false,
      requiresPluginReview: true,
    },
  };
}

export function figmaVariableNameToTokenPath(name: string) {
  const segments = name
    .split(/[/.]/g)
    .map((segment) => figmaNameSegmentToTokenSegment(segment))
    .filter(Boolean);
  return segments.length > 0 ? segments.join(".") : "unnamed";
}

function figmaNameSegmentToTokenSegment(segment: string) {
  const trimmed = segment.trim();
  if (!trimmed) return "";
  if (trimmed === "None") return "None";
  if (/[a-z][A-Z]/.test(trimmed)) {
    return `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`.replace(/[^A-Za-z0-9_-]+/g, "-");
  }
  return slugify(trimmed);
}

function insertOrOverwriteToken(root: DtcgGroup, path: string, token: DtcgToken) {
  try {
    const next = insertTokenAtPath(root, path, token);
    Object.assign(root, next);
  } catch {
    const segments = path.split(".");
    let cursor: DtcgGroup = root;
    for (const segment of segments.slice(0, -1)) {
      const current = cursor[segment];
      if (!current || typeof current !== "object" || "$value" in current) {
        cursor[segment] = {};
      }
      cursor = cursor[segment] as DtcgGroup;
    }
    cursor[segments[segments.length - 1]!] = token;
  }
}

function figmaTypeToDtcg(type: FigmaVariableResolvedType): DtcgType {
  if (type === "COLOR") return "color";
  if (type === "FLOAT") return "number";
  return "string";
}

function figmaValueToDtcgValue(
  value: FigmaVariableValue,
  variablePathById: Map<string, string>
): DtcgValue {
  if (isFigmaAlias(value)) {
    const path = variablePathById.get(value.id);
    return path ? `{${path}}` : { figmaAlias: value.id };
  }
  if (isFigmaColor(value)) return figmaColorToCss(value);
  return value as DtcgValue;
}

function isFigmaAlias(value: FigmaVariableValue): value is { type: "VARIABLE_ALIAS"; id: string } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).type === "VARIABLE_ALIAS" &&
    typeof (value as Record<string, unknown>).id === "string"
  );
}

function isFigmaColor(value: FigmaVariableValue): value is { r: number; g: number; b: number; a?: number } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).r === "number" &&
    typeof (value as Record<string, unknown>).g === "number" &&
    typeof (value as Record<string, unknown>).b === "number"
  );
}

function figmaColorToCss(color: { r: number; g: number; b: number; a?: number }) {
  const r = clamp01(color.r);
  const g = clamp01(color.g);
  const b = clamp01(color.b);
  const alpha = clamp01(color.a ?? 1);
  return {
    colorSpace: "srgb",
    components: [r, g, b],
    alpha,
    hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase(),
  };
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function toHex(value: number) {
  return Math.round(value * 255)
    .toString(16)
    .padStart(2, "0");
}

function filenamePart(value: string) {
  return value
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ")
    || "Untitled";
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "untitled";
}
