import "server-only";

import { tool } from "ai";
import { and, desc, eq, gte, ilike, like } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getDb } from "@/lib/db/runtime";
import {
  aiContextEvents,
  auditEvents,
  tokenIndex,
} from "@/lib/db/schema";
import { isAliasValue, aliasPath } from "@/lib/dtcg/parser";

const TIER_VALUES = ["primitive", "semantic", "component"] as const;
const CHANGE_KINDS = ["token", "theme", "component"] as const;

// WHY ≤50: matches AiPatchProposalSchema.operations cap; bounds DB scan cost.
const LIMIT_MAX = 50;

const SearchTokensInputSchema = z.object({
  query: z.string().min(1).max(200).optional(),
  tier: z.enum(TIER_VALUES).optional(),
  setId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(LIMIT_MAX).default(20),
});

const GetTokenInputSchema = z.object({
  path: z.string().min(1),
  setId: z.string().min(1).optional(),
  modeId: z.string().min(1).optional(),
});

const RecentChangesInputSchema = z.object({
  since: z.string().min(1).optional(),
  kind: z.enum(CHANGE_KINDS).optional(),
  limit: z.number().int().min(1).max(LIMIT_MAX).default(20),
});

export interface RozettaToolContext {
  workspaceId: string;
}

export interface SearchTokensResultRow {
  setId: string;
  modeId: string;
  path: string;
  type: string;
  value: unknown;
  isAlias: boolean;
  description?: string;
  tier: (typeof TIER_VALUES)[number];
}

export interface GetTokenResult {
  setId: string;
  modeId: string;
  path: string;
  type: string;
  value: unknown;
  isAlias: boolean;
  description?: string;
  tier: (typeof TIER_VALUES)[number];
  aliasChain: Array<{ setId: string; path: string; value: unknown }>;
}

export interface RecentChangeRow {
  kind: (typeof CHANGE_KINDS)[number];
  summary: string;
  resourceType: string | null;
  resourceId: string | null;
  actorType: string;
  occurredAt: string;
}

// WHY auditEvents (not syncRuns / aiContextEvents): auditEvents is the
// canonical workspace mutation log. Every token/theme/component upsert,
// delete, and replace writes here with resourceType + createdAt. syncRuns is
// Figma-direction-specific; aiContextEvents tracks AI plumbing only.
const KIND_TO_AUDIT_PREFIX: Record<(typeof CHANGE_KINDS)[number], string> = {
  token: "token",
  theme: "theme",
  component: "component",
};

function parseStoredValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function inferTier(value: unknown, isAlias: boolean): (typeof TIER_VALUES)[number] {
  if (isAlias) return "semantic";
  if (typeof value === "string" && isAliasValue(value)) return "semantic";
  return "primitive";
}

async function logToolCall(
  workspaceId: string,
  toolName: string,
  input: unknown,
  durationMs: number,
  resultCount: number
): Promise<void> {
  const now = new Date().toISOString();
  await getDb()
    .insert(aiContextEvents)
    .values({
      id: `ai-context:${randomUUID()}`,
      workspaceId,
      kind: "tool-call",
      sourceId: toolName,
      summary: `${toolName} returned ${resultCount} result(s) in ${durationMs}ms`,
      payload: JSON.stringify({ tool: toolName, input, durationMs, resultCount }),
      createdAt: now,
    });
}

async function executeSearchTokens(
  input: z.infer<typeof SearchTokensInputSchema>,
  ctx: RozettaToolContext
): Promise<{ tokens: SearchTokensResultRow[] }> {
  const start = Date.now();
  const db = getDb();
  const conditions = [eq(tokenIndex.workspaceId, ctx.workspaceId)];
  if (input.setId) {
    conditions.push(eq(tokenIndex.setId, input.setId));
  }
  if (input.query) {
    conditions.push(ilike(tokenIndex.path, `%${input.query}%`));
  }

  const overscan = input.tier ? Math.min(LIMIT_MAX * 4, input.limit * 4) : input.limit;
  const rows = await db
    .select()
    .from(tokenIndex)
    .where(and(...conditions))
    .limit(overscan);

  const enriched: SearchTokensResultRow[] = rows.map((row) => {
    const value = parseStoredValue(row.value);
    return {
      setId: row.setId,
      modeId: row.modeId,
      path: row.path,
      type: row.type,
      value,
      isAlias: row.isAlias,
      description: row.description ?? undefined,
      tier: inferTier(value, row.isAlias),
    };
  });

  const filtered = input.tier
    ? enriched.filter((row) => row.tier === input.tier)
    : enriched;
  const trimmed = filtered.slice(0, input.limit);

  await logToolCall(
    ctx.workspaceId,
    "rozetta_search_tokens",
    input,
    Date.now() - start,
    trimmed.length
  );
  return { tokens: trimmed };
}

async function executeGetToken(
  input: z.infer<typeof GetTokenInputSchema>,
  ctx: RozettaToolContext
): Promise<{ token: GetTokenResult | null }> {
  const start = Date.now();
  const db = getDb();
  const conditions = [
    eq(tokenIndex.workspaceId, ctx.workspaceId),
    eq(tokenIndex.path, input.path),
  ];
  if (input.setId) conditions.push(eq(tokenIndex.setId, input.setId));
  if (input.modeId) conditions.push(eq(tokenIndex.modeId, input.modeId));

  const rows = await db
    .select()
    .from(tokenIndex)
    .where(and(...conditions))
    .limit(1);
  const row = rows[0];
  if (!row) {
    await logToolCall(ctx.workspaceId, "rozetta_get_token", input, Date.now() - start, 0);
    return { token: null };
  }

  const value = parseStoredValue(row.value);
  const aliasChain: GetTokenResult["aliasChain"] = [];
  // WHY DB walk (not buildAiContextGraph): full-graph compute is workspace-wide
  // and ~O(N) per call. For a single-token lookup the per-step alias walk is
  // O(chain length), bounded by `MAX_CHAIN` to defend against cycles.
  const MAX_CHAIN = 16;
  const visited = new Set<string>([row.path]);
  let cursorValue: unknown = value;
  for (let step = 0; step < MAX_CHAIN; step += 1) {
    if (typeof cursorValue !== "string" || !isAliasValue(cursorValue)) break;
    const target = aliasPath(cursorValue);
    if (visited.has(target)) break;
    visited.add(target);
    const next = await db
      .select()
      .from(tokenIndex)
      .where(
        and(
          eq(tokenIndex.workspaceId, ctx.workspaceId),
          eq(tokenIndex.path, target),
          ...(row.modeId ? [eq(tokenIndex.modeId, row.modeId)] : [])
        )
      )
      .limit(1);
    const targetRow = next[0];
    if (!targetRow) break;
    const targetValue = parseStoredValue(targetRow.value);
    aliasChain.push({
      setId: targetRow.setId,
      path: targetRow.path,
      value: targetValue,
    });
    cursorValue = targetValue;
  }

  const result: GetTokenResult = {
    setId: row.setId,
    modeId: row.modeId,
    path: row.path,
    type: row.type,
    value,
    isAlias: row.isAlias,
    description: row.description ?? undefined,
    tier: inferTier(value, row.isAlias),
    aliasChain,
  };

  await logToolCall(ctx.workspaceId, "rozetta_get_token", input, Date.now() - start, 1);
  return { token: result };
}

async function executeRecentChanges(
  input: z.infer<typeof RecentChangesInputSchema>,
  ctx: RozettaToolContext
): Promise<{ changes: RecentChangeRow[] }> {
  const start = Date.now();
  const db = getDb();
  const conditions = [eq(auditEvents.workspaceId, ctx.workspaceId)];
  if (input.since) {
    conditions.push(gte(auditEvents.createdAt, input.since));
  }
  if (input.kind) {
    conditions.push(like(auditEvents.kind, `${KIND_TO_AUDIT_PREFIX[input.kind]}%`));
  }

  const rows = await db
    .select()
    .from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt))
    .limit(input.limit);

  const changes: RecentChangeRow[] = rows.map((row) => ({
    kind: mapAuditKindToChangeKind(row.kind),
    summary: row.summary,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    actorType: row.actorType,
    occurredAt: row.createdAt,
  }));

  await logToolCall(
    ctx.workspaceId,
    "rozetta_recent_changes",
    input,
    Date.now() - start,
    changes.length
  );
  return { changes };
}

function mapAuditKindToChangeKind(kind: string): (typeof CHANGE_KINDS)[number] {
  if (kind.startsWith("token")) return "token";
  if (kind.startsWith("theme")) return "theme";
  if (kind.startsWith("component")) return "component";
  return "token";
}

export function buildRozettaTools(ctx: RozettaToolContext) {
  return {
    rozetta_search_tokens: tool({
      description:
        "Search tokens in the current workspace by name substring, semantic tier, or set id. Returns up to `limit` token rows with path, type, value, alias flag, and inferred tier.",
      inputSchema: SearchTokensInputSchema,
      execute: async (input) => executeSearchTokens(input, ctx),
    }),
    rozetta_get_token: tool({
      description:
        "Fetch a single token by path (optionally narrowed by setId / modeId). Returns the token row plus its resolved alias chain.",
      inputSchema: GetTokenInputSchema,
      execute: async (input) => executeGetToken(input, ctx),
    }),
    rozetta_recent_changes: tool({
      description:
        "List recently changed resources in this workspace from the audit log. Filter by `kind` (token | theme | component) and ISO `since` timestamp.",
      inputSchema: RecentChangesInputSchema,
      execute: async (input) => executeRecentChanges(input, ctx),
    }),
  };
}

export const ROZETTA_TOOL_SCHEMAS = {
  rozetta_search_tokens: SearchTokensInputSchema,
  rozetta_get_token: GetTokenInputSchema,
  rozetta_recent_changes: RecentChangesInputSchema,
} as const;

export type RozettaToolName = keyof typeof ROZETTA_TOOL_SCHEMAS;
