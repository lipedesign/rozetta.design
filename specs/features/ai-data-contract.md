# Feature: AI Data Contract

## Status
planned

## Purpose
Bind the data the AI sees and the output it produces into a single, typed, end-to-end contract.

Today the AI receives only summaries — `health.summary` plus the first 12 issues, a `semanticDiff.summary` string, `mentions[]`, `attachments[]`, and a release/Figma/GitHub digest. The token tree itself never crosses the prompt boundary. The model output is free text. Zod is installed but `generateObject` is never called; `validateAiPatch` only runs at apply time, so any hallucination is caught at the last possible moment. There is no semantic-tier metadata, no reverse usage index (token → components/themes that consume it), and no retrieval API the AI can call.

This feature wires four cooperating layers — operation schema, semantic-tier metadata, in-memory context graph, and read-only retrieval tools — so the AI works against structured, deterministic, reviewable data. All four are server-only. None of them weaken the constitution's review-first invariant: AI still only proposes, never writes.

## User stories
- As a design system maintainer, I can trust that AI proposals are typed structured operations, not free text I have to parse.
- As an AI agent, I can call deterministic retrieval tools to pull the specific token, theme, or recent change I need, instead of being fed a fixed summary.
- As a token author, I can tag a token with its semantic tier (`primitive` / `semantic` / `component`) and have the AI respect that role.
- As a security reviewer, I can prove the AI surface is read-only: every retrieval tool is server-only, logged to `aiContextEvents`, and never mutates workspace state.

## Layer 1 — Operation Schema (Zod)
- `AiPatchOperationSchema` is a `z.discriminatedUnion("type", [...])` covering the 8 supported operation kinds:
  - `token.patch`
  - `theme.upsert`
  - `brand.upsert` (compatibility while Brands is paused)
  - `component.upsert`
  - `release-note.generate`
  - `export-profile.upsert`
  - `figma.apply-to-rozetta`
  - `github.pr.create`
- The schema is the single source of truth for AI output shape. The TypeScript type is derived via `z.infer<typeof AiPatchOperationSchema>` — there is no separate hand-written union.
- `AiPatchProposalSchema` wraps `AiPatchOperationSchema[]` plus the existing proposal envelope (`id`, `title`, `summary`, `status`, `operations`, `source`, `createdAt`, `updatedAt`). `operations` is capped at ≤50 items.
- `validateAiPatch` MUST `safeParse` the proposal against `AiPatchProposalSchema` before running existing semantic checks. Zod errors are converted to human-readable strings; the existing workspace-aware validation runs afterwards against the parsed value.
- Provider wiring (model adapters and local-agent adapters) MUST treat `AiPatchProposalSchema` as the canonical structured output. Hosted adapters use `generateObject({ schema })`; local-agent adapters describe the schema in the system prompt and `safeParse` the raw output (falling back to chat-only when parsing fails — never silently coercing).

## Layer 2 — Semantic tier metadata
- A token MAY carry semantic-tier metadata under `$extensions["com.rozetta.semantic"]`:

  ```ts
  type SemanticTier = "primitive" | "semantic" | "component";
  interface SemanticTokenMetadata {
    tier: SemanticTier;
    role?: string;        // e.g. "background.surface", "text.muted"
    deprecated?: boolean;
    replacedBy?: string;  // dot path
  }
  ```

- The extension is **opt-in**. Tokens without it receive a runtime-inferred tier from `inferSemanticTier(token, context)`:
  - `$value` is an alias (`{group.token}`) → `"semantic"`.
  - `$value` is a literal scalar and `$type` is a DTCG primitive (`color`, `dimension`, `number`, `string`, `fontFamily`, `fontWeight`, `duration`, `cubicBezier`) → `"primitive"`.
  - Token is referenced by at least one `DesignSystemComponent.tokenRefs[]` entry → `"component"`.
  - Otherwise → `"semantic"` (least-surprising default).
- The semantic metadata MUST be preserved through serializer round-trips. This is invariant I4 (`$extensions` preservation) plus new invariant I11 (semantic metadata preserved).
- A new workspace validation rule MAY surface an `info`-severity issue when a token has no explicit tier and no tier can be inferred — non-blocking, never a build break.

## Layer 3 — AI Context Graph
- `buildAiContextGraph(ctx) → AiContextGraph` computes a typed, deterministic snapshot of the workspace for AI consumption. Server-only, no DB cache, sub-second on typical workspaces.

  ```ts
  interface TokenNode {
    setId: string;          // legacy alias for Collection id
    modeId?: string;
    path: string;
    type: DtcgType;
    value: DtcgValue;
    resolvedValue?: DtcgValue;
    tier: SemanticTier;
    aliasOf?: string;        // target path, when this token is an alias
    referencedBy: string[];  // reverse alias edges (paths that alias INTO this token)
    consumedBy: string[];    // component ids that include this token in tokenRefs
  }

  interface AiContextGraph {
    generatedAt: string;
    tokens: TokenNode[];
    themes: Array<{
      id: string;
      name: string;
      effectiveValues: Record<string, DtcgValue>;
    }>;
    aliasEdges: Array<{ from: string; to: string; via: "dtcg" | "figma" }>;
    componentUsages: Array<{ componentId: string; tokenPath: string }>;
    issues: ValidationIssue[];
  }
  ```

- The builder reuses existing pure helpers — `flattenTokens`, `resolveToken`, `resolveTheme`, `getSemanticMeta`, `inferSemanticTier` — and walks `DesignSystemComponent.tokenRefs[]` to construct the reverse `consumedBy` index. It does not call the serializer or any DB write.
- `serializeContextForPrompt(graph, focus) → string` produces the actual prompt text. Output is deterministic JSON capped at ≤200 tokens, ordered by relevance:
  1. Tokens listed in `focus.mentions[]`
  2. Tokens that are the source of an open issue
  3. Tokens that appear in `focus.semanticDiff.changes[]`
  4. Tokens with `consumedBy.length > 0` (semantic/component tier)
  5. Remainder sorted by path
- The serializer is snapshot-testable: the same `(graph, focus)` MUST produce byte-identical output.

## Layer 4 — Retrieval Tools
- Three tools are registered via `tool()` from the `ai` package and exposed to provider adapters that support tool-use:

  | Tool | Purpose | Input | Output |
  |---|---|---|---|
  | `rozetta_search_tokens` | Find tokens by name, tier, or Collection | `{ query?, tier?, setId?, limit? }` | `TokenNode[]` |
  | `rozetta_get_token` | Full detail for one token, including alias chain and reverse usage | `{ setId, path, modeId? }` | `TokenNode \| null` |
  | `rozetta_recent_changes` | Recently modified tokens since `since` | `{ since?, limit? }` | `Array<{ token: TokenNode; change: TokenChangeKind }>` |

- All three are read-only. They MUST NOT call serializers, write to the DB, or touch the filesystem.
- Each `execute` resolves `WorkspaceContext` and reads from the same DB tables that back the live workspace (`token_index`, `token_sets`, theme tables). When DB context is unavailable, tools fall back to the in-memory graph.
- Each `execute` logs to the existing `aiContextEvents` table with `kind: "tool-call"` and payload `{ tool, input, durationMs, resultCount }`. No raw secrets are logged.
- Tools MUST NOT appear in providers that do not support native tool-use. Local-agent adapters get the same retrieval surface via the prompt + JSON-parse path, and SHOULD NOT attempt to forge tool calls.

## Data
- `AiPatchOperation` and `AiPatchProposal` are exported as `z.infer` types from the contract module; the existing hand-written union in *src/lib/workspace/types.ts* is replaced with these inferred types.
- `SemanticTokenMetadata` and `SemanticTier` live in *src/lib/dtcg/semantic.ts*.
- `AiContextGraph`, `TokenNode`, and the serializer focus shape live in *src/lib/ai-os/contract/context-graph.ts*.
- `aiContextEvents.payload` gains a `tool-call` variant alongside existing kinds; the table schema is unchanged.

## Server modules
- *src/lib/ai-os/contract/operation-schema.ts*: Zod schemas for the 8 op kinds and the discriminated union.
- *src/lib/ai-os/contract/proposal-schema.ts*: `AiPatchProposalSchema` (envelope + capped `operations`).
- *src/lib/ai-os/contract/context-graph.ts*: `buildAiContextGraph`, `TokenNode`, `AiContextGraph`.
- *src/lib/ai-os/contract/serialize.ts*: `serializeContextForPrompt` with the relevance-ranked, ≤200-token budget.
- *src/lib/ai-os/contract/tools.ts*: tool registry, `aiContextEvents` logging, workspace-context binding.
- *src/lib/dtcg/semantic.ts*: `getSemanticMeta`, `setSemanticMeta`, `inferSemanticTier`, `ROZETTA_SEMANTIC_EXT_KEY`.

These modules MUST stay server-only. Client components MUST NOT import any of them. See [architecture §1](../architecture.md#1-layers).

## Invariants
- Preserves I1 (token tree validity): proposals only flow through existing serializer helpers when applied.
- Preserves I4 (`$extensions` preserved verbatim): semantic metadata is stored inside `$extensions["com.rozetta.semantic"]` and rides the existing preservation path.
- Adds I11 (semantic metadata preserved through serializer round-trips). See [`domain.md §3`](../domain.md#3-invariants).
- Enforces the constitution's review-first principle: retrieval tools are read-only, schema validation is input-side (not output-side), and AI still requires explicit user action to apply.

## Wire-up
- *src/lib/ai-os/model.ts* SHOULD call `generateObject({ schema: AiPatchProposalSchema, tools: rozettaTools })` for hosted providers (OpenAI, Anthropic) and pass the serialized graph as prompt context.
- *src/lib/ai-os/local-agent/prompt.ts* SHOULD use `serializeContextForPrompt` in place of the current ad-hoc context block.
- *src/lib/ai-os/local-agent/proposal.ts* SHOULD attempt `AiPatchProposalSchema.safeParse` on the raw output and fall back to chat-only on failure (preserves v1 local-agent behavior).
- *src/lib/ai-os/registry.ts*: `validateAiPatch` runs `AiPatchProposalSchema.safeParse` first; existing semantic checks run against the parsed value.

## UI
No new routes. The existing AI Assistant (`/ai`) and Review Queue surface the structured operations directly. Tier badges on `TokenTable` are out of scope for this feature.

## Testing
Unit tests SHOULD cover:
1. Operation schema round-trips for all 8 op kinds.
2. Operation schema rejects unknown `type` discriminants with a Zod-readable error.
3. Proposal schema enforces `operations.length ≤ 50`.
4. `getSemanticMeta` / `setSemanticMeta` round-trip via `setTokenAtPath`.
5. `inferSemanticTier` returns the expected tier for alias, literal-primitive, and component-referenced tokens.
6. `buildAiContextGraph` produces deterministic output; alias edges face the correct direction; `referencedBy` and `consumedBy` are populated.
7. Theme `effectiveValues` match `resolveTheme` output.
8. `serializeContextForPrompt` enforces the ≤200-token cap and respects relevance ordering. Snapshot test pins byte-identical output.
9. Each retrieval tool: declared shape, `limit` respected, `aiContextEvents` row inserted on execute (mock DB).
10. `validateAiPatch` rejects a payload missing a valid `type` with a human-readable error before any semantic check runs.

## Out of scope
- Code-file indexing (parsing `.tsx`/`.ts` for token references). Tracked separately.
- Automatic tier migration of existing tokens. Opt-in only in v1.
- WCAG contrast checker. Separate feature.
- DB cache of the context graph. On-demand compute is sufficient for workspaces under ~5k tokens.
- Streaming structured output. `generateObject` v1 is non-streaming.
- Native tool-use in local CLI providers (`claude-code-local`, `codex-local`). v1 ships prompt + JSON parse only.
- Autonomous AI writes. Review-first invariant is non-negotiable.

## Open questions
- Should `aiContextEvents` retain tool-call logs indefinitely, or roll up after N days?
- Should the relevance ranker expose its scoring as a typed `FocusScore` so UI can show "AI looked at these tokens"?
- When `consumedBy` and explicit `tier` disagree (e.g. a token tagged `"primitive"` is also in a component's `tokenRefs[]`), does the explicit tier always win? Current proposal: yes.
