import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db/runtime";
import { githubPrDrafts } from "@/lib/db/schema";
import type { GitHubPrDraft } from "@/lib/workspace/types";
import { ensureWorkspaceImportedFromFiles } from "./workspace";
import type { WorkspaceContext } from "@/lib/auth/types";
import { getWorkspaceContext, requireWorkspaceRole } from "@/lib/auth/workspace-context";

const draftsCache = new Map<string, GitHubPrDraft[]>();

export async function saveGitHubPrDraftToDb(
  draft: GitHubPrDraft,
  context?: WorkspaceContext
): Promise<GitHubPrDraft> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  await ensureWorkspaceImportedFromFiles(resolvedContext);
  await getDb()
    .insert(githubPrDrafts)
    .values({
      id: draft.id,
      workspaceId: resolvedContext.workspaceId,
      branchName: draft.branchName,
      baseBranch: draft.baseBranch,
      headBranch: draft.headBranch,
      title: draft.title,
      body: draft.body,
      status: draft.status,
      url: draft.url,
      payload: JSON.stringify(draft.payload),
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    })
    .onConflictDoUpdate({
      target: githubPrDrafts.id,
      set: {
        branchName: draft.branchName,
        baseBranch: draft.baseBranch,
        headBranch: draft.headBranch,
        title: draft.title,
        body: draft.body,
        status: draft.status,
        url: draft.url,
        payload: JSON.stringify(draft.payload),
        updatedAt: draft.updatedAt,
      },
    });
  invalidateGitHubPrDraftsCache(resolvedContext);
  return draft;
}

export async function loadGitHubPrDraftsFromDb(
  limit = 10,
  context?: WorkspaceContext
): Promise<GitHubPrDraft[]> {
  const resolvedContext = await resolveWorkspaceContext(context);
  const cacheKey = `${resolvedContext.workspaceId}:${limit}`;
  const cached = draftsCache.get(cacheKey);
  if (cached) return cloneDrafts(cached);
  await ensureWorkspaceImportedFromFiles(resolvedContext);
  const rows = await getDb()
    .select()
    .from(githubPrDrafts)
    .where(eq(githubPrDrafts.workspaceId, resolvedContext.workspaceId))
    .orderBy(desc(githubPrDrafts.createdAt))
    .limit(limit);
  const drafts = rows.map((row) => ({
    id: row.id,
    branchName: row.branchName,
    baseBranch: row.baseBranch,
    headBranch: row.headBranch,
    title: row.title,
    body: row.body,
    status: row.status as GitHubPrDraft["status"],
    url: row.url ?? undefined,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
  draftsCache.set(cacheKey, drafts);
  return cloneDrafts(drafts);
}

export async function loadGitHubPrDraftFromDb(
  id: string,
  context?: WorkspaceContext
): Promise<GitHubPrDraft | undefined> {
  const resolvedContext = await resolveWorkspaceContext(context);
  await ensureWorkspaceImportedFromFiles(resolvedContext);
  const row = (await getDb()
    .select()
    .from(githubPrDrafts)
    .where(and(eq(githubPrDrafts.workspaceId, resolvedContext.workspaceId), eq(githubPrDrafts.id, id)))
    .limit(1))[0];
  if (!row) return undefined;
  return {
    id: row.id,
    branchName: row.branchName,
    baseBranch: row.baseBranch,
    headBranch: row.headBranch,
    title: row.title,
    body: row.body,
    status: row.status as GitHubPrDraft["status"],
    url: row.url ?? undefined,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createGitHubPrDraftId() {
  return `github-pr:${randomUUID()}`;
}

export function invalidateGitHubPrDraftsCache(context?: WorkspaceContext) {
  if (!context) {
    draftsCache.clear();
    return;
  }
  for (const key of draftsCache.keys()) {
    if (key.startsWith(`${context.workspaceId}:`)) draftsCache.delete(key);
  }
}

function cloneDrafts(drafts: GitHubPrDraft[]): GitHubPrDraft[] {
  return JSON.parse(JSON.stringify(drafts)) as GitHubPrDraft[];
}

async function resolveWorkspaceContext(context?: WorkspaceContext) {
  return context ?? (await getWorkspaceContext());
}
