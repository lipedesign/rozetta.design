# Domain model

The DTCG (Design Tokens Community Group) type system as implemented in the DTCG domain layer.

This is the contract every other layer depends on. Changes here propagate everywhere; treat them as breaking.

> **v2.** Naming is v2-canonical (Collection / Mode). **Semantic intent is first-class** (§2.5) — not opt-in metadata. The v1 `Set`/`setId`/`TokenSet` aliases are removed from the canonical surface; see [§ Migration from v1](#migration-from-v1).

---

## 1. Vocabulary

| Term | Definition |
|---|---|
| **Token** | A leaf node with a `$value`. May also carry `$type`, `$description`, `$extensions`. |
| **Group** | An object node without `$value`. Contains other tokens or groups. May carry `$type`, `$description`, `$extensions`. |
| **Collection** | A token namespace equivalent to a Figma Variable Collection. Identified by a slug-like `id` (`"primitives"`, `"semantic"`, …). |
| **Mode** | A named DTCG root inside a Collection. Equivalent to a Figma Variable Mode (`"Default"`, `"Consumer"`, `"Dark"`, …). |
| **Path** | Dot-separated string from a Collection Mode's root to a token: `"color.bg.primary"`. |
| **Alias** | A `$value` of the form `"{group.token.path}"` that references another token (a value-level reference). |
| **Intent** | A token's explicit semantic tier, structured description, and typed relationships (§2.5). |
| **Resolution** | Walking an alias chain to its literal value. Reports cycles and unresolved refs. |
| **Theme** | Named, ordered list of Collection/Mode references. Resolves to a virtual merged Collection. |
| **Conflict** | A path defined by 2+ enabled Collection Modes in a theme. The last reference in order wins. |
| **Dirty** | A Collection whose current Mode roots differ from its baseline. |

## 2. Types (canonical)

### 2.1 Primitive and composite type tags

```ts
DTCG_PRIMITIVE_TYPES = [
  "color", "dimension", "fontFamily", "fontWeight",
  "duration", "cubicBezier", "number", "string"
];
DTCG_COMPOSITE_TYPES = [
  "shadow", "gradient", "typography",
  "border", "transition", "strokeStyle"
];
type DtcgType = DtcgPrimitiveType | DtcgCompositeType;
```

### 2.2 Token / group

```ts
interface DtcgToken {
  $type?: DtcgType;
  $value: DtcgValue;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

interface DtcgGroup {
  $type?: DtcgType;
  $description?: string;
  $extensions?: Record<string, unknown>;
  [childKey: string]: DtcgToken | DtcgGroup | DtcgType
                    | string | Record<string, unknown> | undefined;
}
```

### 2.3 Collection and mode

```ts
interface CollectionMode {
  id: string;
  name: string;
  figmaModeId?: string;
  isDefault?: boolean;
  position: number;
}

interface TokenCollection {
  id: string;          // slug, lowercase, [a-z0-9-]
  name: string;        // display name
  filename: string;    // default artifact filename
  root: DtcgGroup;     // default mode root
  modes?: CollectionMode[];
  modeRoots?: Record<string, DtcgGroup>;
  activeModeId?: string;
}
```

### 2.4 Flat representations (derived, for tables/search)

```ts
interface FlatToken {
  collectionId: string;
  modeId?: string;
  path: string;
  name: string;
  $type: DtcgType;
  $value: DtcgValue;
  $description?: string;
  $extensions?: Record<string, unknown>;
  isAlias: boolean;
  resolvedValue?: DtcgValue;
  aliasChain?: string[];
  intent?: SemanticTokenMetadata;   // §2.5, when present or inferred
}

interface FlatGroup {
  collectionId: string;
  modeId?: string;
  path: string;     // "" for root
  name: string;
  $type?: DtcgType;
  $description?: string;
  tokenCount: number;
}
```

### 2.5 Semantic intent (first-class)

Every token has semantic intent. It is stored under the reserved extension `$extensions["com.rozetta.semantic"]` and is a **first-class DTCG concern** in v2 — the layer that lets agents, validators, and the Context Pack reason about *what a token means*, not just its value.

```ts
type SemanticTier = "primitive" | "semantic" | "component";

interface SemanticDescription {
  intent?: string;     // what this token means
  usage?: string;      // when to use it
  donts?: string[];    // when NOT to use it
}

type TokenRelationKind = "backs" | "variant-of" | "pairs-with" | "replaces";

interface TokenRelation {
  kind: TokenRelationKind;
  target: string;      // dot path of the related token
}

interface SemanticTokenMetadata {
  tier: SemanticTier;
  role?: string;                 // e.g. "background.surface", "text.muted"
  description?: SemanticDescription;  // structured, complements DTCG $description
  relations?: TokenRelation[];        // typed, complements value-level aliases
  deprecated?: boolean;
  replacedBy?: string;           // dot path of the replacement
}
```

- **Tier is first-class.** An explicit `tier` is preferred and surfaced in the editor. Tokens without an explicit declaration receive a read-only inferred tier via `inferSemanticTier(token, context)`:
  - `$value` is an alias (`{group.token}`) → `"semantic"`.
  - `$value` is a literal scalar and `$type` is a DTCG primitive → `"primitive"`.
  - Token appears in at least one `DesignSystemComponent.tokenRefs[]` entry → `"component"`.
  - Otherwise → `"semantic"`.
  When both an explicit and an inferred tier exist, the explicit value wins.
- **Structured description** (`intent`/`usage`/`donts`) complements — does not replace — DTCG `$description`. It is the agent-readable rationale.
- **Relationships** are typed and additive to alias `$value` references. The alias remains the value-level reference; relations express *design intent* (a `semantic` token `backs` a `primitive`; a `component` token is `variant-of` another). A relation `target` that does not resolve to an existing path is **not** an error (invariant I12) — it is surfaced as a health warning, mirroring theme refs (I10).
- Inference is read-only and never mutates the token. Intent feeds the AI Context Graph (see [`features/ai-data-contract.md`](./features/ai-data-contract.md)) and the deterministic intent resolver.
- Preservation is guaranteed by invariants I4 (`$extensions` preserved verbatim) and I11 (semantic intent preserved through serializer round-trips).

## 3. Invariants

These MUST hold at all times. Violations are bugs.

| # | Invariant | Enforced by |
|---|---|---|
| I1 | A node has `$value` ⟺ it is a token. Otherwise it is a group. | `isDtcgToken`, `isDtcgGroup` |
| I2 | Children of a token are not allowed. Composite values live inside `$value`, not as siblings. | `insertTokenAtPath` rejects insertion under a token ancestor |
| I3 | Every Collection has a unique `id`; every Mode is unique inside its Collection. | import slugifies + de-dupes; Figma import normalizes modes |
| I4 | `$extensions` is preserved verbatim across all edits. | `setTokenAtPath` spreads the existing token before applying the patch |
| I5 | A path is unique within a Collection Mode. | `moveToken` collision check |
| I6 | Selection state never points to a non-existent path. | `deleteToken`, `deleteSelected`, `moveToken`, `discardCollection` reconcile selection |
| I7 | A Collection's baseline is updated only by `hydrate`, `markClean`, or `saveAll`. | Store contract |
| I8 | After `saveAll`, every Collection is clean (`isDirty(id) === false`). | `saveAll` rebuilds baselines from current Collection Modes |
| I9 | After `discardCollection(id)`, every restored Mode root deep-equals its baseline. | `discardCollection` clones Mode baselines |
| I10 | A theme MAY reference a Collection id that does not exist; the theme stays valid and the resolver simply skips the missing ref. | `resolveTheme` filters unknown refs |
| I11 | When a token carries semantic intent (`$extensions["com.rozetta.semantic"]`), every serializer mutation MUST preserve it on the surviving token. | serializer preserves `$extensions`; tests confirm round-trip |
| I12 | A semantic `relation.target` SHOULD resolve to an existing path; a dangling relation does not invalidate the token — it is reported, not thrown. | intent resolver / health check surfaces dangling relations |

## 4. Type guards

```ts
function isDtcgToken(node: unknown): node is DtcgToken;
function isDtcgGroup(node: unknown): node is DtcgGroup;
```

Every traversal of a DTCG tree MUST gate on one of these. A property accessed without a guard is a type error in strict mode and a constitutional violation ([§4](./constitution.md#4-type-safety-end-to-end)).

## 5. Path semantics

- Paths use `.` as the delimiter.
- Empty string `""` is the root group's path. Tokens cannot live at `""` (the root is always a group).
- Path segments MUST NOT contain `.`, `$`, or whitespace. The editor sheet enforces this on rename.

## 6. Alias semantics

- Detected by `isAliasValue(value)`: a string matching `^\{[^{}]+\}$`.
- The reference is the inner content split by `.`: `"{color.bg}"` → path `"color.bg"`.
- Resolution (`resolveToken`) walks the chain, reporting:
  - `value` (the literal `$value` after walking)
  - `chain` (the paths visited, including the origin token and final literal source)
  - `error` (`"cycle"`, `"not-found"`, `"invalid"`)
- Resolution is **per-Collection Mode first, then cross-Collection** — references resolve within the same active/materialized Mode first; the resolver also accepts Figma-style aliases via `readFigmaAlias`.

## 7. Theme semantics

- Themes are an ordered list of `ThemeSetRef[]`. Each ref has a `collectionId`, optional `modeId`, and `state` (`"enabled" | "source" | "disabled"`).
- **Merge**: `resolveTheme` walks the list in order; for each enabled / source ref, every token in that Collection Mode is written to a `path → token` map. Later writes overwrite earlier ones (last-wins).
- **Disabled** refs are skipped entirely.
- **Source** refs are stored separately but currently behave like `enabled`. The state is reserved for a future "fallback only" semantics.
- **Conflicts**: any path written more than once during the merge is reported in `result.conflicts[]` with all contributing Collection ids and the winner.
- The merged result is materialized as a virtual `TokenCollection` with id `__theme__<themeId>` so exporters consume it the same way they consume a real Collection.

## 8. Design System OS semantics

- **DesignSystemComponent** is metadata only. Rozetta stores component identity, category, status, props, variants, states, token refs, and manual Figma/code bindings.
- Component `tokenRefs` use the `collectionId:path` shape. Mode-aware component bindings are planned.
- Figma/code bindings are advisory metadata and MUST NOT trigger writes to Figma or code.
- **Brand** (white-label) is **paused**. Its package-merge semantics (`baseBrandId` inheritance, cycle detection) are retained in the model but not an active workflow.

## 9. Disk format

- DB-first Git artifacts are written as `tokens/<collection-id>/<mode-id>.tokens.json`.
- File contents MUST be a valid `DtcgGroup` per the Zod schema in the DTCG schema module.
- Files are written with 2-space indentation and a trailing newline.
- Legacy single-mode files (`tokens/*.tokens.json`, `tokens/*.edited.tokens.json`) are import-only — see [§ Migration from v1](#migration-from-v1).

## 10. Collection and mode id derivation

- New layout files: `tokens/semantic/consumer.tokens.json` → Collection id `"semantic"`, Mode id `"consumer"`. The lowercase id is canonical; the capitalized name is presentation.
- For imports: the import name is slugified (`/[^a-z0-9]+/g → "-"`); collisions append `-2`, `-3`, …

---

## Migration from v1

One-time concerns for importing a v1 workspace; not part of the model above.

- **`Set` / `setId` / `TokenSet` are removed** from the canonical surface. v2 uses Collection / `collectionId` / `TokenCollection` everywhere. Any v1 artifact or API using the old names is mapped on import.
- Legacy single-mode artifacts `tokens/*.tokens.json` and `tokens/*.edited.tokens.json` are imported as single-mode Collections once, when a workspace has no Collections (and only in local runtime — see constitution §2).
- The v1 semantic-tier extension (`tier`/`role`/`deprecated`/`replacedBy`) is forward-compatible: v2 reads it and extends it with `description` and `relations`.

## What changed from v1

- **Semantic intent is first-class** (§2.5): tier + structured `description` + typed `relations`, with a new invariant **I12** for dangling relations. v1 had opt-in tier metadata only.
- **Legacy `Set`/`setId`/`TokenSet`** removed from vocabulary, types, flat representations, theme refs, and component refs → confined to [§ Migration from v1].
- **Fixed the duplicated `§2.4`** (v1 had two): flat representations is §2.4, semantic intent is §2.5.
- Invariant wording updated to v2-canonical store actions (`discardCollection`, baselines) and the disk format de-emphasizes legacy single-mode files (now import-only).
