/**
 * Design Tokens Community Group (DTCG) types.
 *
 * Spec reference: https://www.designtokens.org/tr/drafts/format/
 *
 * Files in /tokens currently use the primitive types `color`, `number` and
 * `string`. The full type set is declared here to keep the engine ready for
 * composite types (typography, shadow, gradient, border, transition) without
 * a future refactor.
 */

export const DTCG_PRIMITIVE_TYPES = [
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "duration",
  "cubicBezier",
  "number",
  "string",
] as const;

export const DTCG_COMPOSITE_TYPES = [
  "shadow",
  "gradient",
  "typography",
  "border",
  "transition",
  "strokeStyle",
] as const;

export const DTCG_TYPES = [
  ...DTCG_PRIMITIVE_TYPES,
  ...DTCG_COMPOSITE_TYPES,
] as const;

export type DtcgPrimitiveType = (typeof DTCG_PRIMITIVE_TYPES)[number];
export type DtcgCompositeType = (typeof DTCG_COMPOSITE_TYPES)[number];
export type DtcgType = (typeof DTCG_TYPES)[number];

/** Composite token value structures (declared loosely to mirror the spec). */
export interface DtcgShadowValue {
  color: string;
  offsetX: string | number;
  offsetY: string | number;
  blur: string | number;
  spread?: string | number;
  inset?: boolean;
}

export interface DtcgTypographyValue {
  fontFamily: string | string[];
  fontSize: string | number;
  fontWeight: string | number;
  lineHeight?: string | number;
  letterSpacing?: string | number;
}

export interface DtcgBorderValue {
  color: string;
  width: string | number;
  style: string;
}

export interface DtcgTransitionValue {
  duration: string | number;
  delay?: string | number;
  timingFunction: number[] | string;
}

export interface DtcgGradientStop {
  color: string;
  position: number;
}

export type DtcgValue =
  | string
  | number
  | boolean
  | DtcgShadowValue
  | DtcgShadowValue[]
  | DtcgTypographyValue
  | DtcgBorderValue
  | DtcgTransitionValue
  | DtcgGradientStop[]
  | Record<string, unknown>;

/**
 * A DTCG token. The presence of `$value` is what distinguishes a token from a
 * group in the JSON tree.
 */
export interface DtcgToken {
  $type?: DtcgType;
  $value: DtcgValue;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

/**
 * A DTCG group. Groups can hold tokens, nested groups and shared metadata
 * (`$type`, `$description`). Any property whose key does not start with `$` is
 * either a child token or a child group.
 */
export interface DtcgGroup {
  $type?: DtcgType;
  $description?: string;
  $extensions?: Record<string, unknown>;
  [childKey: string]: DtcgToken | DtcgGroup | DtcgType | string | Record<string, unknown> | undefined;
}

/** Type guard: is this node a token (has $value)? */
export function isDtcgToken(node: unknown): node is DtcgToken {
  return (
    typeof node === "object" &&
    node !== null &&
    "$value" in (node as Record<string, unknown>)
  );
}

/** Type guard: is this node a group (object without $value)? */
export function isDtcgGroup(node: unknown): node is DtcgGroup {
  return (
    typeof node === "object" &&
    node !== null &&
    !Array.isArray(node) &&
    !("$value" in (node as Record<string, unknown>))
  );
}

/**
 * Higher-level data structures used inside the editor. These are derived from
 * the raw DTCG JSON and carry computed metadata (path, set id, resolved
 * values).
 */

/** A mode inside a token collection, matching Figma Variables modes. */
export interface CollectionMode {
  /** stable id, slug-like inside the collection */
  id: string;
  /** display name, e.g. "Default", "Consumer", "Dark" */
  name: string;
  /** original Figma mode id when imported from Figma */
  figmaModeId?: string;
  /** true when this mode should be used as the default materialized root */
  isDefault?: boolean;
  /** stable UI/order position */
  position: number;
}

/**
 * A token collection, i.e. the Rozetta unit matching a Figma Variables
 * Collection. Collections may contain one or more modes; `root` is the
 * materialized active/default mode for backwards compatibility with the
 * existing DTCG engine.
 */
export interface TokenCollection {
  /** stable id, slug-like (eg. "primitives", "semantic") */
  id: string;
  /** display name */
  name: string;
  /** primary/default artifact filename */
  filename: string;
  /** raw DTCG tree for the active/default mode */
  root: DtcgGroup;
  /** modes available inside this collection */
  modes?: CollectionMode[];
  /** raw DTCG trees keyed by mode id */
  modeRoots?: Record<string, DtcgGroup>;
  /** selected/materialized mode id */
  activeModeId?: string;
}

/**
 * Legacy alias kept during the Collections migration. New public contracts
 * should use TokenCollection, but most of the editor still consumes TokenSet
 * while the codebase is being renamed.
 */
export type TokenSet = TokenCollection;

/** Flat representation of a token, used for tables, search and editing. */
export interface FlatToken {
  collectionId: string;
  setId: string;
  modeId?: string;
  /** dot-separated path inside the set, eg. "color.bg.primary" */
  path: string;
  /** name displayed in lists (last segment of path) */
  name: string;
  $type: DtcgType;
  $value: DtcgValue;
  $description?: string;
  $extensions?: Record<string, unknown>;
  /** True when $value is a DTCG alias `{path.to.token}`. */
  isAlias: boolean;
  /**
   * For tokens whose value is an alias, `resolvedValue` holds the final
   * literal value found by walking the alias chain. `undefined` if the chain
   * could not be resolved.
   */
  resolvedValue?: DtcgValue;
  /** Chain of paths walked while resolving (excluding self). */
  aliasChain?: string[];
}

/** Flat representation of a group node in a tree (used by sidebar). */
export interface FlatGroup {
  collectionId: string;
  setId: string;
  modeId?: string;
  /** "" for root */
  path: string;
  name: string;
  $type?: DtcgType;
  $description?: string;
  /** number of tokens at any depth below this group */
  tokenCount: number;
}
