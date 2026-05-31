/**
 * Alias resolver.
 *
 * Token files in this project use TWO alias formats simultaneously:
 *
 * 1. DTCG canonical alias — `$value: "{color.surface.rewards.default}"`. The
 *    path is resolved against any of the loaded sets (current set first,
 *    then the rest).
 *
 * 2. Figma extension alias — the literal `$value` is set, AND
 *    `$extensions["com.figma.aliasData"].targetVariableName` carries the
 *    canonical Figma path with `/` separators (eg. `"unit/scale/zero"` →
 *    `unit.scale.zero`). When the literal value is unhelpful (eg. `0`), the
 *    Figma path is used to find the upstream token across sets.
 *
 * The resolver returns the chain of paths walked to reach the final value,
 * which the UI uses to render breadcrumbs ("consumer.color.bg.primary →
 * default.color.gray.100"). Cycles are detected via a Set guard.
 */

import { aliasPath, isAliasValue } from "./parser";
import { getNodeAtPath } from "./parser";
import {
  isDtcgToken,
  type DtcgToken,
  type DtcgValue,
  type TokenSet,
} from "./types";

export interface FigmaAliasData {
  targetVariableId?: string;
  targetVariableName?: string;
  targetVariableSetId?: string;
  targetVariableSetName?: string;
}

/** Reads `com.figma.aliasData` from a token, if present. */
export function readFigmaAlias(token: DtcgToken): FigmaAliasData | undefined {
  const ext = token.$extensions?.["com.figma.aliasData"];
  if (!ext || typeof ext !== "object") return undefined;
  return ext as FigmaAliasData;
}

/** `unit/scale/zero` → `unit.scale.zero`. */
export function figmaPathToDtcg(path: string): string {
  return path.replaceAll("/", ".");
}

export interface ResolveOptions {
  /** Current set being inspected. Searched first. */
  currentSetId: string;
  /** All loaded sets, including the current one. */
  sets: TokenSet[];
}

export interface ResolutionStep {
  setId: string;
  path: string;
  source: "dtcg-alias" | "figma-alias" | "literal";
}

export interface ResolvedToken {
  /** Final literal value, or undefined when resolution fails. */
  value?: DtcgValue;
  /** Walked path, oldest-first (start = origin token, last = literal source). */
  chain: ResolutionStep[];
  /** Failure reason when value is undefined. */
  error?: "cycle" | "not-found" | "invalid";
}

/**
 * Resolve a token reference (path inside a set) to its literal value. The
 * function follows aliases recursively across sets until it reaches a literal
 * `$value` that is not itself an alias.
 */
export function resolveToken(
  startSetId: string,
  startPath: string,
  options: ResolveOptions
): ResolvedToken {
  const visited = new Set<string>();
  const chain: ResolutionStep[] = [];

  let setId = startSetId;
  let path = startPath;

  while (true) {
    const stepKey = `${setId}::${path}`;
    if (visited.has(stepKey)) {
      return { chain, error: "cycle" };
    }
    visited.add(stepKey);

    const set = options.sets.find((s) => s.id === setId);
    if (!set) {
      return { chain, error: "not-found" };
    }

    const node = getNodeAtPath(set.root, path);
    if (!node || !isDtcgToken(node)) {
      return { chain, error: "not-found" };
    }

    if (isAliasValue(node.$value)) {
      const targetPath = aliasPath(node.$value);
      chain.push({ setId, path, source: "dtcg-alias" });
      const next = locatePath(targetPath, setId, options);
      if (!next) return { chain, error: "not-found" };
      setId = next.setId;
      path = next.path;
      continue;
    }

    const figmaAlias = readFigmaAlias(node);
    if (figmaAlias?.targetVariableName) {
      const targetPath = figmaPathToDtcg(figmaAlias.targetVariableName);
      chain.push({ setId, path, source: "figma-alias" });
      const next = locatePath(targetPath, setId, options);
      if (next) {
        setId = next.setId;
        path = next.path;
        continue;
      }
    }

    chain.push({ setId, path, source: "literal" });
    return { value: node.$value, chain };
  }
}

/**
 * Find which set a path belongs to. Tries the current set first, then walks
 * the others in declaration order.
 */
function locatePath(
  path: string,
  preferredSetId: string,
  options: ResolveOptions
): { setId: string; path: string } | undefined {
  const ordered = [
    options.sets.find((s) => s.id === preferredSetId),
    ...options.sets.filter((s) => s.id !== preferredSetId),
  ].filter(Boolean) as TokenSet[];

  for (const set of ordered) {
    const node = getNodeAtPath(set.root, path);
    if (node && isDtcgToken(node)) {
      return { setId: set.id, path };
    }
  }
  return undefined;
}
