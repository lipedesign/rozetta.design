import "server-only";

import type { AiContextGraph, TokenNode } from "./context-graph";
import type {
  AiMentionContext,
  AiTaskContext,
} from "@/lib/workspace/types";

export interface SerializeFocusInput {
  task: AiTaskContext;
  mentions?: AiMentionContext[];
  recentChangePaths?: string[];
}

export interface SerializeOptions {
  maxTokens?: number;
}

const DEFAULT_MAX_TOKENS = 200;

// WHY: scoring weights are tier-ordered so a mentioned token always beats any
// non-mentioned candidate, an issue source always beats a recent change, and so
// on. Keeping each higher tier > sum of all lower tiers would over-engineer it;
// the relevance buckets are disjoint in practice for the prompt size we care
// about (≤200 tokens) and ties only matter inside one bucket, where we tie-
// break deterministically on setId:path.
const SCORE_MENTION = 1000;
const SCORE_ISSUE = 500;
const SCORE_RECENT_CHANGE = 250;
const SCORE_CONSUMED = 100;
const SCORE_TIER_SEMANTIC_OR_COMPONENT = 50;
const SCORE_TIER_PRIMITIVE = 10;

const tokenKey = (setId: string, path: string) => `${setId}:${path}`;

function buildMentionKeys(mentions: AiMentionContext[] | undefined): Set<string> {
  if (!mentions) return new Set();
  const keys = new Set<string>();
  for (const m of mentions) {
    if (m.path) keys.add(m.path);
    if (m.id) keys.add(m.id);
    if (m.label) keys.add(m.label);
  }
  return keys;
}

function buildIssueKeys(graph: AiContextGraph): Set<string> {
  const keys = new Set<string>();
  for (const issue of graph.issues) {
    const setId = issue.source.setId ?? issue.source.collectionId;
    const path = issue.source.path;
    if (setId && path) keys.add(tokenKey(setId, path));
  }
  return keys;
}

function tokenMatchesKey(node: TokenNode, key: string): boolean {
  const full = tokenKey(node.setId, node.path);
  if (full === key) return true;
  if (node.path === key) return true;
  return false;
}

function score(
  node: TokenNode,
  mentionKeys: Set<string>,
  issueKeys: Set<string>,
  recentChangeKeys: Set<string>
): number {
  let s = 0;
  const full = tokenKey(node.setId, node.path);
  if (
    mentionKeys.has(full) ||
    mentionKeys.has(node.path) ||
    Array.from(mentionKeys).some((k) => tokenMatchesKey(node, k))
  ) {
    s += SCORE_MENTION;
  }
  if (issueKeys.has(full)) s += SCORE_ISSUE;
  if (
    recentChangeKeys.has(full) ||
    recentChangeKeys.has(node.path)
  ) {
    s += SCORE_RECENT_CHANGE;
  }
  if (node.consumedBy.length > 0) s += SCORE_CONSUMED;
  if (node.tier === "semantic" || node.tier === "component") {
    s += SCORE_TIER_SEMANTIC_OR_COMPONENT;
  } else if (node.tier === "primitive") {
    s += SCORE_TIER_PRIMITIVE;
  }
  return s;
}

// WHY stableStringify: JSON.stringify ordering of object keys is insertion-
// order in V8. We sort keys recursively so two graphs that contain logically
// equal data produce byte-identical output (snapshot-safe, prompt-cache-safe).
function stableStringify(value: unknown, indent = 2): string {
  function canonical(v: unknown): unknown {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(canonical);
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, val] of entries) out[k] = canonical(val);
    return out;
  }
  return JSON.stringify(canonical(value), null, indent);
}

export function serializeContextForPrompt(
  graph: AiContextGraph,
  focus: SerializeFocusInput,
  options?: SerializeOptions
): string {
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const mentionKeys = buildMentionKeys(focus.mentions);
  const issueKeys = buildIssueKeys(graph);
  const recentChangeKeys = new Set(focus.recentChangePaths ?? []);

  const ranked = graph.tokens
    .map((node) => ({
      node,
      score: score(node, mentionKeys, issueKeys, recentChangeKeys),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ka = tokenKey(a.node.setId, a.node.path);
      const kb = tokenKey(b.node.setId, b.node.path);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

  const top = ranked.slice(0, maxTokens);

  const renderedTokens = top.map(({ node }) => {
    const out: Record<string, unknown> = {
      id: tokenKey(node.setId, node.path),
      tier: node.tier,
    };
    if (node.type) out.type = node.type;
    if (node.value !== undefined) out.value = node.value;
    if (node.resolvedValue !== undefined) out.resolved = node.resolvedValue;
    if (node.aliasOf) out.aliasOf = node.aliasOf;
    if (node.consumedBy.length > 0) out.consumedBy = node.consumedBy;
    if (node.referencedBy.length > 0) out.referencedBy = node.referencedBy;
    if (node.description) out.description = node.description;
    return out;
  });

  const renderedThemes = graph.themes.map((theme) => {
    const out: Record<string, unknown> = {
      id: theme.id,
      name: theme.name,
    };
    if (theme.conflictPaths.length > 0) out.conflicts = theme.conflictPaths;
    return out;
  });

  const renderedIssues = graph.issues.slice(0, 12).map((issue) => ({
    id: issue.id,
    severity: issue.severity,
    title: issue.title,
    detail: issue.detail,
    source: issue.source,
  }));

  const payload = {
    schemaVersion: 1,
    generatedAt: graph.generatedAt,
    summary: {
      totalTokens: graph.tokens.length,
      rendered: renderedTokens.length,
      themes: graph.themes.length,
      issues: graph.issues.length,
    },
    tokens: renderedTokens,
    themes: renderedThemes,
    issues: renderedIssues,
  };

  return stableStringify(payload);
}
