import "server-only";

import { and, asc, eq } from "drizzle-orm";

import type { WorkspaceContext } from "@/lib/auth/types";
import { requireWorkspaceRole } from "@/lib/auth/workspace-context";
import {
  fromDbScopedId,
  parseJson,
  resolveWorkspaceContext,
  toDbScopedId,
} from "@/lib/db/repositories/scope";
import { getDb } from "@/lib/db/runtime";
import { designComponents } from "@/lib/db/schema";
import { normalizeComponents } from "@/lib/design-system/registry";
import type { DesignSystemComponent } from "@/lib/workspace/types";

/**
 * Workspace-scoped, DB-first repository for design-system components.
 *
 * This is the canonical v2 repository mold: every mutation resolves a
 * `WorkspaceContext` and calls `requireWorkspaceRole(context, "editor")` before
 * any write; reads are filtered by `workspaceId`. It mirrors the token-set
 * repository in `workspace.ts` and supersedes the legacy
 * `.rozetta/components.json` fire-and-forget write (now export-only).
 */

/** List the components for a workspace, normalized and ordered by name. */
export async function listComponents(
  context?: WorkspaceContext
): Promise<DesignSystemComponent[]> {
  const resolvedContext = await resolveWorkspaceContext(context);
  const rows = await getDb()
    .select()
    .from(designComponents)
    .where(eq(designComponents.workspaceId, resolvedContext.workspaceId))
    .orderBy(asc(designComponents.name));
  const components = rows.map((row) => {
    const data = parseJson<DesignSystemComponent>(row.data);
    return { ...data, id: fromDbScopedId(resolvedContext, row.id) } as DesignSystemComponent;
  });
  return normalizeComponents(components);
}

/** Create or update a component in the workspace (editor role required). */
export async function upsertComponent(
  component: DesignSystemComponent,
  context?: WorkspaceContext
): Promise<DesignSystemComponent> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  const db = getDb();
  const now = new Date().toISOString();
  const id = toDbScopedId(resolvedContext, component.id);
  const data = JSON.stringify(component);
  await db
    .insert(designComponents)
    .values({
      id,
      workspaceId: resolvedContext.workspaceId,
      name: component.name,
      data,
      createdBy: resolvedContext.userId,
      updatedBy: resolvedContext.userId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: designComponents.id,
      set: {
        name: component.name,
        data,
        updatedBy: resolvedContext.userId,
        updatedAt: now,
      },
    });
  return component;
}

/** Delete a component from the workspace (editor role required). */
export async function deleteComponent(
  id: string,
  context?: WorkspaceContext
): Promise<void> {
  const resolvedContext = await resolveWorkspaceContext(context);
  requireWorkspaceRole(resolvedContext, "editor");
  const db = getDb();
  const dbId = toDbScopedId(resolvedContext, id);
  await db
    .delete(designComponents)
    .where(
      and(
        eq(designComponents.workspaceId, resolvedContext.workspaceId),
        eq(designComponents.id, dbId)
      )
    );
}
