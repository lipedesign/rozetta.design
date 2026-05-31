"use server";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getDb } from "@/lib/db/runtime";
import {
  workspaceMemberships,
  workspaces,
} from "@/lib/db/schema";
import type { WorkspaceSwitcherOption } from "@/lib/auth/types";
import {
  getWorkspaceContext,
  listWorkspaceSwitcherOptions,
  requireWorkspaceRole,
  WorkspaceAuthError,
} from "@/lib/auth/workspace-context";

const NAME_MIN = 1;
const NAME_MAX = 80;

export type ListMyWorkspacesResult =
  | { ok: true; workspaces: WorkspaceSwitcherOption[] }
  | { ok: false; error: string };

export type RenameWorkspaceResult =
  | { ok: true; workspace: WorkspaceSwitcherOption }
  | { ok: false; error: string };

export type CreateWorkspaceResult =
  | { ok: true; workspace: WorkspaceSwitcherOption }
  | { ok: false; error: string };

export async function listMyWorkspaces(): Promise<ListMyWorkspacesResult> {
  try {
    const options = await listWorkspaceSwitcherOptions();
    return { ok: true, workspaces: options };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Unable to list workspaces.") };
  }
}

export async function renameWorkspace(input: {
  workspaceId: string;
  name: string;
}): Promise<RenameWorkspaceResult> {
  try {
    const trimmed = (input.name ?? "").trim();
    const validation = validateName(trimmed);
    if (!validation.ok) return validation;

    const context = await getWorkspaceContext();
    const options = await listWorkspaceSwitcherOptions();
    const target = options.find((option) => option.id === input.workspaceId);
    if (!target) {
      return {
        ok: false,
        error: "Workspace not available for this user.",
      };
    }

    // Build a context that reflects the user's role on the *target* workspace
    // rather than the currently-active workspace, then require admin+.
    requireWorkspaceRole({ ...context, role: target.role }, "admin");

    const db = getDb();
    const now = new Date().toISOString();
    const slug = await uniqueWorkspaceSlug({
      organizationId: target.organizationId,
      desiredSlug: slugify(trimmed),
      excludeWorkspaceId: input.workspaceId,
    });

    const updated = await db
      .update(workspaces)
      .set({
        name: trimmed,
        slug,
        updatedBy: context.userId,
        updatedAt: now,
      })
      .where(eq(workspaces.id, input.workspaceId))
      .returning();

    const row = updated[0];
    if (!row) return { ok: false, error: "Workspace not found." };

    revalidatePath("/", "layout");
    revalidatePath("/workspaces");

    return {
      ok: true,
      workspace: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        organizationId: target.organizationId,
        organizationName: target.organizationName,
        role: target.role,
        isActive: target.isActive,
      },
    };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Unable to rename workspace.") };
  }
}

export async function createWorkspace(input: {
  name: string;
}): Promise<CreateWorkspaceResult> {
  try {
    const trimmed = (input.name ?? "").trim();
    const validation = validateName(trimmed);
    if (!validation.ok) return validation;

    const context = await getWorkspaceContext();
    if (!context.organizationId) {
      return { ok: false, error: "You must belong to an organization first." };
    }

    const db = getDb();
    const now = new Date().toISOString();
    const workspaceId = `workspace:${randomUUID()}`;
    const slug = await uniqueWorkspaceSlug({
      organizationId: context.organizationId,
      desiredSlug: slugify(trimmed),
    });

    await db.insert(workspaces).values({
      id: workspaceId,
      organizationId: context.organizationId,
      name: trimmed,
      slug,
      createdBy: context.userId,
      updatedBy: context.userId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(workspaceMemberships).values({
      id: `workspace-member:${workspaceId}:${context.userId}`,
      workspaceId,
      userId: context.userId,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });

    revalidatePath("/", "layout");
    revalidatePath("/workspaces");

    // Re-read switcher options to discover the freshly created workspace with
    // its fully-resolved organization name and role, keeping the return shape
    // consistent with listMyWorkspaces.
    const refreshed = await listWorkspaceSwitcherOptions();
    const created = refreshed.find((option) => option.id === workspaceId);
    if (!created) {
      return { ok: false, error: "Workspace was created but could not be loaded." };
    }

    return { ok: true, workspace: created };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Unable to create workspace.") };
  }
}

function validateName(value: string):
  | { ok: true }
  | { ok: false; error: string } {
  if (value.length < NAME_MIN) return { ok: false, error: "Workspace name is required." };
  if (value.length > NAME_MAX) {
    return { ok: false, error: `Workspace name must be ${NAME_MAX} characters or fewer.` };
  }
  return { ok: true };
}

async function uniqueWorkspaceSlug(params: {
  organizationId: string;
  desiredSlug: string;
  excludeWorkspaceId?: string;
}): Promise<string> {
  const base = params.desiredSlug || "workspace";
  const db = getDb();

  // Try the desired slug first, then progressively suffix it until we find one
  // that is free within this organization. Bounded to avoid pathological loops.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.organizationId, params.organizationId),
          eq(workspaces.slug, candidate)
        )
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!existing) return candidate;
    if (params.excludeWorkspaceId && existing.id === params.excludeWorkspaceId) {
      return candidate;
    }
  }

  return `${base}-${randomUUID().slice(0, 8)}`;
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "workspace"
  );
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof WorkspaceAuthError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
