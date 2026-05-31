/**
 * Semantic tier metadata (opt-in) for DTCG tokens.
 *
 * Stored under `$extensions["com.rozetta.semantic"]`. Survives serializer
 * round-trips because `setTokenAtPath` merges `$extensions` shallowly
 * (invariant I4/I9).
 */

import type { DtcgToken } from "./types";
import { isAliasValue } from "./parser";

export const ROZETTA_SEMANTIC_EXT_KEY = "com.rozetta.semantic";

export type SemanticTier = "primitive" | "semantic" | "component";

export interface SemanticTokenMetadata {
  tier: SemanticTier;
  role?: string;
  deprecated?: boolean;
  replacedBy?: string;
}

export function getSemanticMeta(token: DtcgToken): SemanticTokenMetadata | null {
  const raw = token.$extensions?.[ROZETTA_SEMANTIC_EXT_KEY];
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<SemanticTokenMetadata>;
  if (
    candidate.tier !== "primitive" &&
    candidate.tier !== "semantic" &&
    candidate.tier !== "component"
  ) {
    return null;
  }
  return {
    tier: candidate.tier,
    role: typeof candidate.role === "string" ? candidate.role : undefined,
    deprecated:
      typeof candidate.deprecated === "boolean" ? candidate.deprecated : undefined,
    replacedBy:
      typeof candidate.replacedBy === "string" ? candidate.replacedBy : undefined,
  };
}

export function setSemanticMeta(
  token: DtcgToken,
  meta: SemanticTokenMetadata
): DtcgToken {
  const cleaned: SemanticTokenMetadata = { tier: meta.tier };
  if (meta.role) cleaned.role = meta.role;
  if (meta.deprecated !== undefined) cleaned.deprecated = meta.deprecated;
  if (meta.replacedBy) cleaned.replacedBy = meta.replacedBy;
  return {
    ...token,
    $extensions: {
      ...(token.$extensions ?? {}),
      [ROZETTA_SEMANTIC_EXT_KEY]: cleaned,
    },
  };
}

export interface SemanticInferenceContext {
  /** Set of "setId:path" strings referenced by any component. */
  componentReferencedPaths?: Set<string>;
  setId?: string;
  path?: string;
}

export function inferSemanticTier(
  token: DtcgToken,
  ctx?: SemanticInferenceContext
): SemanticTier {
  if (ctx?.componentReferencedPaths && ctx.setId && ctx.path) {
    if (ctx.componentReferencedPaths.has(`${ctx.setId}:${ctx.path}`)) {
      return "component";
    }
  }
  if (typeof token.$value === "string" && isAliasValue(token.$value)) {
    return "semantic";
  }
  return "primitive";
}

export function resolveTier(
  token: DtcgToken,
  ctx?: SemanticInferenceContext
): SemanticTier {
  const explicit = getSemanticMeta(token);
  if (explicit) return explicit.tier;
  return inferSemanticTier(token, ctx);
}
