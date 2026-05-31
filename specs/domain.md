# Domain model

The DTCG (Design Tokens Community Group) type system as implemented in *src/lib/dtcg/types.ts*.

This is the contract every other layer depends on. Changes here propagate everywhere; treat them as breaking.

---

## 1. Vocabulary

| Term | Definition |
|---|---|
| **Token** | A leaf node with a `$value`. May also carry `$type`, `$description`, `$extensions`. |
| **Group** | An object node without `$value`. Contains other tokens or groups. May carry `$type`, `$description`, `$extensions`. |
| **Collection** | A token namespace equivalent to a Figma Variable Collection. Identified by a slug-like `id` (`"primitives"`, `"semantic"`, …). |
| **Mode** | A named DTCG root inside a Collection. Equivalent to a Figma Variable Mode (`"Default"`, `"Consumer"`, `"Dark"`, …). |
| **Set** | Legacy alias for Collection while older store/action names migrate. Public UI and specs use Collection. |
| **Path** | Dot-separated string from a Collection Mode's root to a token: `"color.bg.primary"`. |
| **Alias** | A `$value` of the form `"{group.token.path}"` that references another token. |
| **Resolution** | Walking an alias chain to its literal value. Reports cycles and unresolved refs. |
| **Theme** | Named, ordered list of Collection/Mode references. Resolves to a virtual merged Collection. |
| **Conflict** | A path defined by 2+ enabled Collection Modes in a theme. The last reference in order wins. |
| **Dirty** | A Collection whose current Mode roots differ from its baseline `originals`. |

## 2. Types (canonical)

Defined in *src/lib/dtcg/types.ts*.

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
  filename: string;    // legacy/default artifact filename
  root: DtcgGroup;     // active/default mode root for legacy consumers
  modes?: CollectionMode[];
  modeRoots?: Record<string, DtcgGroup>;
  activeModeId?: string;
}

type TokenSet = TokenCollection; // legacy alias
```

### 2.4 Flat representations (derived, for tables/search)

```ts
interface FlatToken {
  collectionId: string;
  modeId?: string;
  setId: string;
  path: string;
  name: string;
  $type: DtcgType;
  $value: DtcgValue;
  $description?: string;
  $extensions?: Record<string, unknown>;
  isAlias: boolean;
  resolvedValue?: DtcgValue;
  aliasChain?: string[];
}

interface FlatGroup {
  collectionId: string;
  modeId?: string;
  setId: string;
  path: string;     // "" for root
  name: string;
  $type?: DtcgType;
  $description?: string;
  tokenCount: number;
}
```

### 2.4 Semantic tier

A token MAY carry a Rozetta-specific semantic-tier declaration under `$extensions["com.rozetta.semantic"]`. The shape:

```ts
type SemanticTier = "primitive" | "semantic" | "component";

interface SemanticTokenMetadata {
  tier: SemanticTier;
  role?: string;        // e.g. "background.surface", "text.muted"
  deprecated?: boolean;
  replacedBy?: string;  // dot path of the replacement
}
```

- The extension is **opt-in**. Tokens without it receive a runtime-inferred tier via `inferSemanticTier(token, context)`:
  - `$value` is an alias (`{group.token}`) → `"semantic"`.
  - `$value` is a literal scalar and `$type` is a DTCG primitive → `"primitive"`.
  - Token appears in at least one `DesignSystemComponent.tokenRefs[]` entry → `"component"`.
  - Otherwise → `"semantic"`.
- When both an explicit `tier` and an inferred tier are available, the explicit value wins.
- Inference is read-only and never mutates the token. It feeds the AI Context Graph (see [`features/ai-data-contract.md`](./features/ai-data-contract.md)).
- Preservation is guaranteed by invariants I4 (`$extensions` preserved verbatim) and I11 (semantic metadata preserved through serializer round-trips).

## 3. Invariants

These MUST hold at all times. Violations are bugs.

| # | Invariant | Enforced by |
|---|---|---|
| I1 | A node has `$value` ⟺ it is a token. Otherwise it is a group. | `isDtcgToken`, `isDtcgGroup` |
| I2 | Children of a token are not allowed. Composite values live inside `$value`, not as siblings. | `insertTokenAtPath` rejects insertion under a token ancestor |
| I3 | Every Collection has a unique `id`; every Mode is unique inside its Collection. | `importSet` slugifies + de-dupes; Figma import normalizes modes |
| I4 | `$extensions` is preserved verbatim across all edits. | `setTokenAtPath` spreads the existing token before applying the patch |
| I5 | A path is unique within a Collection Mode. Two tokens cannot share the same path in the same Mode. | `moveToken` collision check |
| I6 | Selection state never points to a non-existent path. | `deleteToken`, `deleteSelected`, `moveToken`, `discardSet` reconcile selection |
| I7 | `originals[id]` is updated only by `hydrate`, `markClean`, or `saveAll`. | Store contract |
| I8 | After `saveAll`, every Collection is clean (`isDirty(id) === false`). | `saveAll` rebuilds `originals` from current Collection Modes |
| I9 | After `discardSet(id)`, every restored Mode root deep-equals its `originals` entry. | `discardSet` clones Collection Mode originals |
| I10 | A theme MUST NOT reference a Collection id that doesn't exist. The theme remains valid; the resolver simply skips missing refs. | `resolveTheme` filters unknown refs |
| I11 | When a token has `$extensions["com.rozetta.semantic"]`, every serializer mutation MUST preserve it on the surviving token. | `setTokenAtPath`, `insertTokenAtPath`, `deleteTokenAtPath` preserve `$extensions`; tests confirm round-trip |

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

- Themes are an ordered list of `ThemeSetRef[]`. Each ref has `collectionId`/legacy `setId`, optional `modeId`, and `state`/legacy `mode` (`"enabled" | "source" | "disabled"`).
- **Merge**: `resolveTheme` walks the list in order; for each enabled / source ref, every token in that Collection Mode is written to a `path → token` map. Later writes overwrite earlier ones (last-wins).
- **Disabled** refs are skipped entirely.
- **Source** refs are stored separately but currently behave like `enabled`. The mode is reserved for a future "fallback only" semantics.
- **Conflicts**: any path written more than once during the merge is reported in `result.conflicts[]` with all contributing Collection ids and the winner.
- The merged result is materialized as a virtual `TokenCollection`/legacy `TokenSet` with id `__theme__<themeId>` so exporters consume it the same way they consume a real Collection.

## 8. Design System OS semantics

- **Brand** is the white-label unit. It groups token Collections, themes, export profiles, and components.
- A brand MAY reference one `baseBrandId`. The resolved package merges base references first, then brand references.
- Brand inheritance cycles are invalid and surfaced as workspace health errors.
- **DesignSystemComponent** is metadata only. Rozetta stores component identity, category, status, props, variants, states, token refs, brand scopes, and manual Figma/code bindings.
- Component `tokenRefs` currently use the legacy `setId:path` shape, where `setId` means Collection id. Mode-aware component bindings are planned.
- Figma/code bindings are advisory metadata in v1 and MUST NOT trigger writes to Figma or code.

## 9. Disk format

- Legacy files in `tokens/` matching `*.tokens.json` are imported as single-mode Collections.
- Legacy files in `tokens/` matching `*.edited.tokens.json` remain importable for compatibility.
- New DB-first Git artifacts are written as `tokens/<collection-id>/<mode-id>.tokens.json`.
- File contents MUST be a valid `DtcgGroup` per the Zod schema in *src/lib/dtcg/schema.ts*.
- Files are written with 2-space indentation and a trailing newline.

## 10. Collection and mode id derivation

For files: `default.tokens.json` → id `"default"`, name `"Default"`. The lowercase id is the canonical form; the capitalized name is a presentation detail.

For new layout files: `tokens/semantic/consumer.tokens.json` → Collection id `"semantic"`, Mode id `"consumer"`.

For imports: the import name is slugified (`/[^a-z0-9]+/g → "-"`); collisions append `-2`, `-3`, …
