import "server-only";

import type { WorkspaceContext } from "@/lib/auth/types";
import { getWorkspaceContext } from "@/lib/auth/workspace-context";
import { DEFAULT_WORKSPACE_ID } from "@/lib/db/runtime";

/**
 * Resolve a `WorkspaceContext` for a repository call.
 *
 * Repos accept an already-resolved context from the action layer (the trusted
 * server caller) and otherwise derive it from the authenticated session. They
 * never receive a context from the client — browser-facing Server Actions
 * resolve it server-side first (constitution §7).
 */
export async function resolveWorkspaceContext(
  context?: WorkspaceContext
): Promise<WorkspaceContext> {
  return context ?? (await getWorkspaceContext());
}

/** Prefix an entity id with the workspace id so ids are unique per workspace. */
export function toDbScopedId(context: WorkspaceContext, id: string): string {
  if (context.workspaceId === DEFAULT_WORKSPACE_ID) return id;
  return `${context.workspaceId}:${id}`;
}

/** Inverse of {@link toDbScopedId}. */
export function fromDbScopedId(context: WorkspaceContext, id: string): string {
  const prefix = `${context.workspaceId}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

/** Parse a JSON column, returning `undefined` (never throwing) on bad input. */
export function parseJson<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}
