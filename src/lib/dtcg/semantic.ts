/**
 * Semantic intent metadata (opt-in) for DTCG tokens.
 *
 * Stored under `$extensions["com.rozetta.semantic"]`. Survives serializer
 * round-trips because `setTokenAtPath` merges `$extensions` shallowly
 * (invariant I4/I11). Carries the token's tier, a structured machine-readable
 * description, and typed relationships beyond value-level aliases — the layer
 * that lets an agent understand *which token to use for what* (domain §2.5).
 */

import { aliasPath, isAliasValue } from "./parser";
import { isDtcgGroup, isDtcgToken } from "./types";
import type { DtcgGroup, DtcgToken, TokenSet } from "./types";

export const ROZETTA_SEMANTIC_EXT_KEY = "com.rozetta.semantic";

export type SemanticTier = "primitive" | "semantic" | "component";

/** Machine-readable enrichment complementing the plain DTCG `$description`. */
export interface SemanticDescription {
  /** What this token is for, e.g. "error surface background". */
  intent?: string;
  /** When to reach for it. */
  usage?: string;
  /** Anti-uses — the research weighs don'ts more than do's. */
  donts?: string[];
}

export type TokenRelationKind = "backs" | "variant-of" | "pairs-with" | "replaces";

/** A typed relationship to another token (target = dot path), beyond an alias. */
export interface TokenRelation {
  kind: TokenRelationKind;
  target: string;
}

const TOKEN_RELATION_KINDS: readonly TokenRelationKind[] = [
  "backs",
  "variant-of",
  "pairs-with",
  "replaces",
];

export interface SemanticTokenMetadata {
  tier: SemanticTier;
  role?: string;
  /** Structured intent; complements (never replaces) the plain `$description`. */
  description?: SemanticDescription;
  /** Typed relationships beyond value-level aliases. */
  relations?: TokenRelation[];
  deprecated?: boolean;
  replacedBy?: string;
}

function readDescription(value: unknown): SemanticDescription | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<SemanticDescription>;
  const description: SemanticDescription = {};
  if (typeof raw.intent === "string") description.intent = raw.intent;
  if (typeof raw.usage === "string") description.usage = raw.usage;
  if (Array.isArray(raw.donts)) {
    const donts = raw.donts.filter((item): item is string => typeof item === "string");
    if (donts.length > 0) description.donts = donts;
  }
  return description.intent || description.usage || description.donts
    ? description
    : undefined;
}

function readRelations(value: unknown): TokenRelation[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const relations = value.filter(
    (item): item is TokenRelation =>
      !!item &&
      typeof item === "object" &&
      TOKEN_RELATION_KINDS.includes((item as TokenRelation).kind) &&
      typeof (item as TokenRelation).target === "string"
  );
  return relations.length > 0 ? relations : undefined;
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
  const meta: SemanticTokenMetadata = { tier: candidate.tier };
  if (typeof candidate.role === "string") meta.role = candidate.role;
  const description = readDescription(candidate.description);
  if (description) meta.description = description;
  const relations = readRelations(candidate.relations);
  if (relations) meta.relations = relations;
  if (typeof candidate.deprecated === "boolean") meta.deprecated = candidate.deprecated;
  if (typeof candidate.replacedBy === "string") meta.replacedBy = candidate.replacedBy;
  return meta;
}

export function setSemanticMeta(
  token: DtcgToken,
  meta: SemanticTokenMetadata
): DtcgToken {
  const cleaned: SemanticTokenMetadata = { tier: meta.tier };
  if (meta.role) cleaned.role = meta.role;
  const description = meta.description ? readDescription(meta.description) : undefined;
  if (description) cleaned.description = description;
  const relations = readRelations(meta.relations);
  if (relations) cleaned.relations = relations;
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

/**
 * Infer `backs` relationships from the collection's alias graph, read-only.
 *
 * When a token aliases another (`$value: "{color.red.6}"`), the aliased token
 * (a primitive) `backs` the aliasing token (a semantic). Returns a map of
 * `path -> inferred relations`; the token's own explicit `relations`
 * (`getSemanticMeta(token).relations`) take precedence over these. Never
 * mutates a token — promotion to explicit relations is a reviewed action.
 */
export function deriveRelations(set: TokenSet): Record<string, TokenRelation[]> {
  const relations: Record<string, TokenRelation[]> = {};
  // Walk the default mode root directly (not flattenTokens, which skips tokens
  // with no resolvable $type — alias tokens often omit it).
  const visit = (node: DtcgGroup, prefix: string): void => {
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith("$")) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      if (isDtcgToken(child)) {
        if (typeof child.$value === "string" && isAliasValue(child.$value)) {
          const target = aliasPath(child.$value);
          if (target) (relations[target] ??= []).push({ kind: "backs", target: path });
        }
      } else if (isDtcgGroup(child)) {
        visit(child, path);
      }
    }
  };
  visit(set.root, "");
  return relations;
}
