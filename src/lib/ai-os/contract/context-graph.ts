import "server-only";

import { flattenTokens, isAliasValue, aliasPath, getNodeAtPath } from "@/lib/dtcg/parser";
import { resolveToken } from "@/lib/dtcg/resolver";
import { isDtcgToken } from "@/lib/dtcg/types";
import type { DtcgToken, DtcgValue, TokenSet } from "@/lib/dtcg/types";
import {
  ROZETTA_SEMANTIC_EXT_KEY,
  resolveTier,
  type SemanticInferenceContext,
  type SemanticTier,
} from "@/lib/dtcg/semantic";
import { resolveTheme } from "@/lib/themes/resolver";
import type { Theme } from "@/lib/themes/types";
import type {
  DesignSystemComponent,
  ValidationIssue,
} from "@/lib/workspace/types";

export interface TokenNode {
  setId: string;
  path: string;
  type?: string;
  value: unknown;
  resolvedValue?: unknown;
  tier: SemanticTier;
  aliasOf?: string;
  referencedBy: string[];
  consumedBy: string[];
  description?: string;
  hasSemanticMetadata: boolean;
}

export interface ThemeNode {
  id: string;
  name: string;
  effectiveValues: Record<string, unknown>;
  conflictPaths: string[];
}

export interface AliasEdge {
  from: string;
  to: string;
  via: "dtcg" | "figma";
}

export interface ComponentUsage {
  componentId: string;
  tokenPath: string;
}

export interface AiContextGraph {
  generatedAt: string;
  tokens: TokenNode[];
  themes: ThemeNode[];
  aliasEdges: AliasEdge[];
  componentUsages: ComponentUsage[];
  issues: ValidationIssue[];
}

export interface BuildContextGraphInput {
  sets: TokenSet[];
  themes: Theme[];
  components: DesignSystemComponent[];
  issues: ValidationIssue[];
}

const tokenKey = (setId: string, path: string) => `${setId}:${path}`;

function readFigmaAliasTarget(token: DtcgToken): string | undefined {
  const ext = token.$extensions?.["com.figma.aliasData"];
  if (!ext || typeof ext !== "object") return undefined;
  const target = (ext as { targetVariableName?: unknown }).targetVariableName;
  if (typeof target !== "string" || target.length === 0) return undefined;
  return target.replaceAll("/", ".");
}

function locateTokenSetForPath(
  path: string,
  preferredSetId: string,
  sets: TokenSet[]
): string | undefined {
  const ordered = [
    sets.find((s) => s.id === preferredSetId),
    ...sets.filter((s) => s.id !== preferredSetId),
  ].filter(Boolean) as TokenSet[];
  for (const set of ordered) {
    const node = getNodeAtPath(set.root, path);
    if (node && isDtcgToken(node)) return set.id;
  }
  return undefined;
}

function collectEffectiveValues(
  root: ReturnType<typeof resolveTheme>["merged"]["root"]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  function walk(node: Record<string, unknown>, prefix: string) {
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith("$")) continue;
      const next = prefix ? `${prefix}.${key}` : key;
      if (isDtcgToken(child)) {
        out[next] = (child as DtcgToken).$value;
      } else if (child && typeof child === "object") {
        walk(child as Record<string, unknown>, next);
      }
    }
  }
  walk(root as unknown as Record<string, unknown>, "");
  return out;
}

export function buildAiContextGraph(input: BuildContextGraphInput): AiContextGraph {
  const { sets, themes, components, issues } = input;

  const componentReferencedPaths = new Set<string>();
  const consumedByMap = new Map<string, Set<string>>();
  for (const component of components) {
    for (const ref of component.tokenRefs) {
      componentReferencedPaths.add(ref);
      const existing = consumedByMap.get(ref);
      if (existing) {
        existing.add(component.id);
      } else {
        consumedByMap.set(ref, new Set([component.id]));
      }
    }
  }

  const tokens: TokenNode[] = [];
  const aliasEdges: AliasEdge[] = [];

  for (const set of sets) {
    const flat = flattenTokens(set);
    for (const ft of flat) {
      const node = getNodeAtPath(set.root, ft.path);
      const dtcgToken: DtcgToken | undefined =
        node && isDtcgToken(node) ? (node as DtcgToken) : undefined;
      const hasSemanticMetadata = Boolean(
        dtcgToken?.$extensions?.[ROZETTA_SEMANTIC_EXT_KEY]
      );

      const inferCtx: SemanticInferenceContext = {
        componentReferencedPaths,
        setId: set.id,
        path: ft.path,
      };
      const tier = dtcgToken
        ? resolveTier(dtcgToken, inferCtx)
        : ("primitive" as SemanticTier);

      let aliasOf: string | undefined;
      let resolvedValue: DtcgValue | undefined;

      if (typeof ft.$value === "string" && isAliasValue(ft.$value)) {
        const targetPath = aliasPath(ft.$value);
        const targetSetId =
          locateTokenSetForPath(targetPath, set.id, sets) ?? set.id;
        aliasOf = tokenKey(targetSetId, targetPath);
        aliasEdges.push({
          from: tokenKey(set.id, ft.path),
          to: tokenKey(targetSetId, targetPath),
          via: "dtcg",
        });
        const resolved = resolveToken(set.id, ft.path, {
          currentSetId: set.id,
          sets,
        });
        if (resolved.value !== undefined) resolvedValue = resolved.value;
      }

      if (dtcgToken) {
        const figmaTarget = readFigmaAliasTarget(dtcgToken);
        if (figmaTarget) {
          const figmaSetId =
            locateTokenSetForPath(figmaTarget, set.id, sets) ?? set.id;
          aliasEdges.push({
            from: tokenKey(set.id, ft.path),
            to: tokenKey(figmaSetId, figmaTarget),
            via: "figma",
          });
        }
      }

      tokens.push({
        setId: set.id,
        path: ft.path,
        type: ft.$type,
        value: ft.$value,
        resolvedValue,
        tier,
        aliasOf,
        referencedBy: [],
        consumedBy: Array.from(consumedByMap.get(tokenKey(set.id, ft.path)) ?? []).sort(),
        description: ft.$description,
        hasSemanticMetadata,
      });
    }
  }

  // Reverse-index aliasOf to build referencedBy.
  const referencedByMap = new Map<string, Set<string>>();
  for (const node of tokens) {
    if (!node.aliasOf) continue;
    const set = referencedByMap.get(node.aliasOf);
    const fromKey = tokenKey(node.setId, node.path);
    if (set) {
      set.add(fromKey);
    } else {
      referencedByMap.set(node.aliasOf, new Set([fromKey]));
    }
  }
  for (const node of tokens) {
    const key = tokenKey(node.setId, node.path);
    const set = referencedByMap.get(key);
    if (set) node.referencedBy = Array.from(set).sort();
  }

  tokens.sort((a, b) => {
    if (a.setId !== b.setId) return a.setId < b.setId ? -1 : 1;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });

  aliasEdges.sort((a, b) => {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    if (a.to !== b.to) return a.to < b.to ? -1 : 1;
    return a.via < b.via ? -1 : a.via > b.via ? 1 : 0;
  });

  const themeNodes: ThemeNode[] = themes.map((theme) => {
    const result = resolveTheme(theme, sets);
    return {
      id: theme.id,
      name: theme.name,
      effectiveValues: collectEffectiveValues(result.merged.root),
      conflictPaths: result.conflicts.map((c) => c.path).sort(),
    };
  });
  themeNodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const componentUsages: ComponentUsage[] = [];
  for (const component of components) {
    for (const ref of component.tokenRefs) {
      componentUsages.push({ componentId: component.id, tokenPath: ref });
    }
  }
  componentUsages.sort((a, b) => {
    if (a.componentId !== b.componentId)
      return a.componentId < b.componentId ? -1 : 1;
    return a.tokenPath < b.tokenPath ? -1 : a.tokenPath > b.tokenPath ? 1 : 0;
  });

  return {
    generatedAt: new Date().toISOString(),
    tokens,
    themes: themeNodes,
    aliasEdges,
    componentUsages,
    issues,
  };
}
