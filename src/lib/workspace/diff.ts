import {
  getActiveCollectionMode,
  getCollectionModes,
  materializeCollectionMode,
} from "@/lib/dtcg/collections";
import { getNodeAtPath } from "@/lib/dtcg/parser";
import { flattenTokens } from "@/lib/dtcg/parser";
import { figmaPathToDtcg, readFigmaAlias } from "@/lib/dtcg/resolver";
import { formatTokenValue } from "@/lib/dtcg/format";
import { isDtcgToken, type DtcgType, type DtcgValue, type TokenSet } from "@/lib/dtcg/types";
import type { TokenChange, TokenChangeKind, TokenSemanticDiff } from "./types";

const CHANGE_KINDS: TokenChangeKind[] = [
  "set-created",
  "set-removed",
  "token-created",
  "token-removed",
  "value-changed",
  "type-changed",
  "description-changed",
  "alias-changed",
];

interface TokenSnapshot {
  setId: string;
  setName: string;
  path: string;
  type: DtcgType;
  value: DtcgValue;
  valueLabel: string;
  description: string;
  aliasLabel: string;
  aliasTarget: string;
  modeId?: string;
  modeName?: string;
}

export function diffTokenSets(
  baselineSets: TokenSet[],
  currentSets: TokenSet[]
): TokenSemanticDiff {
  const changes: TokenChange[] = [];
  const baselineById = new Map(baselineSets.map((set) => [set.id, set]));
  const currentById = new Map(currentSets.map((set) => [set.id, set]));

  for (const set of currentSets) {
    if (!baselineById.has(set.id)) {
      changes.push({
        id: `set-created:${set.id}`,
        kind: "set-created",
        setId: set.id,
        setName: set.name,
        after: `${set.name} (${countCollectionTokens(set)} tokens)`,
      });
    }
  }

  for (const set of baselineSets) {
    if (!currentById.has(set.id)) {
      changes.push({
        id: `set-removed:${set.id}`,
        kind: "set-removed",
        setId: set.id,
        setName: set.name,
        before: `${set.name} (${countCollectionTokens(set)} tokens)`,
      });
    }
  }

  const baselineTokens = flattenSetTokens(baselineSets);
  const currentTokens = flattenSetTokens(currentSets);
  const keys = new Set([...baselineTokens.keys(), ...currentTokens.keys()]);

  for (const key of Array.from(keys).sort()) {
    const before = baselineTokens.get(key);
    const after = currentTokens.get(key);

    if (!before && after) {
      changes.push({
        id: `token-created:${key}`,
        kind: "token-created",
        setId: after.setId,
        setName: after.setName,
        path: after.path,
        after: after.valueLabel,
      });
      continue;
    }

    if (before && !after) {
      changes.push({
        id: `token-removed:${key}`,
        kind: "token-removed",
        setId: before.setId,
        setName: before.setName,
        path: before.path,
        before: before.valueLabel,
      });
      continue;
    }

    if (!before || !after) continue;

    if (before.type !== after.type) {
      changes.push({
        id: `type-changed:${key}`,
        kind: "type-changed",
        setId: after.setId,
        setName: after.setName,
        path: after.path,
        before: before.type,
        after: after.type,
      });
    }

    if (before.aliasTarget !== after.aliasTarget) {
      changes.push({
        id: `alias-changed:${key}`,
        kind: "alias-changed",
        setId: after.setId,
        setName: after.setName,
        path: after.path,
        before: before.aliasLabel || "literal",
        after: after.aliasLabel || "literal",
      });
    }

    const sameAliasTarget = Boolean(before.aliasTarget && before.aliasTarget === after.aliasTarget);
    if (!sameAliasTarget && stableStringify(before.value) !== stableStringify(after.value)) {
      changes.push({
        id: `value-changed:${key}`,
        kind: "value-changed",
        setId: after.setId,
        setName: after.setName,
        path: after.path,
        before: before.valueLabel,
        after: after.valueLabel,
      });
    }

    if (before.description !== after.description) {
      changes.push({
        id: `description-changed:${key}`,
        kind: "description-changed",
        setId: after.setId,
        setName: after.setName,
        path: after.path,
        before: before.description || "No description",
        after: after.description || "No description",
      });
    }
  }

  changes.sort((a, b) => {
    const setCompare = a.setName.localeCompare(b.setName);
    if (setCompare !== 0) return setCompare;
    return (a.path ?? "").localeCompare(b.path ?? "") || a.kind.localeCompare(b.kind);
  });

  return {
    generatedAt: new Date().toISOString(),
    baselineSets: baselineSets.length,
    currentSets: currentSets.length,
    changes,
    summary: summarizeChanges(changes),
  };
}

function flattenSetTokens(sets: TokenSet[]): Map<string, TokenSnapshot> {
  const map = new Map<string, TokenSnapshot>();

  for (const set of sets) {
    const modes = getCollectionModes(set);
    for (const mode of modes) {
      const modeSet = materializeCollectionMode(set, mode.id);
      for (const token of flattenTokens(modeSet)) {
        const node = getNodeAtPath(modeSet.root, token.path);
        const figmaAlias =
          node && isDtcgToken(node) ? readFigmaAlias(node)?.targetVariableName : undefined;
        const aliasTarget = readAliasTarget(token.$value, figmaAlias);
        const aliasLabel = aliasTarget ? `{${aliasTarget}}` : "";

        map.set(`${set.id}::${mode.id}::${token.path}`, {
          setId: set.id,
          setName: `${set.name} / ${mode.name}`,
          path: token.path,
          type: token.$type,
          value: token.$value,
          valueLabel: formatTokenValue(token.$value, token.$type),
          description: token.$description ?? "",
          aliasLabel,
          aliasTarget,
          modeId: mode.id,
          modeName: mode.name,
        });
      }
    }
  }

  return map;
}

function countCollectionTokens(set: TokenSet) {
  const mode = getActiveCollectionMode(set);
  return flattenTokens(materializeCollectionMode(set, mode.id)).length;
}

function readAliasTarget(value: DtcgValue, figmaAlias?: string) {
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    return readAliasPath(value);
  }
  if (figmaAlias) return figmaPathToDtcg(figmaAlias);
  return "";
}

function readAliasPath(value: string) {
  return value.slice(1, -1).trim();
}

function summarizeChanges(changes: TokenChange[]): TokenSemanticDiff["summary"] {
  const summary = Object.fromEntries(CHANGE_KINDS.map((kind) => [kind, 0])) as Record<
    TokenChangeKind,
    number
  >;
  for (const change of changes) summary[change.kind] += 1;
  return { ...summary, total: changes.length };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}
