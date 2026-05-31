import "server-only";

import { cache } from "react";
import { and, asc, eq, or } from "drizzle-orm";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

import {
  DEFAULT_ORGANIZATION_ID,
  DEFAULT_WORKSPACE_ID,
  getDb,
} from "@/lib/db/runtime";
import {
  organizationMembers,
  organizations,
  profiles,
  workspaceMemberships,
  workspaces,
} from "@/lib/db/schema";
import { isAuthDisabledForRuntime } from "@/lib/auth/config";
import { createServerSupabaseClient } from "@/lib/auth/supabase/server";
import type {
  AuthUserProfile,
  WorkspaceContext,
  WorkspaceRole,
  WorkspaceSwitcherOption,
} from "@/lib/auth/types";

const ACTIVE_WORKSPACE_COOKIE = "rozetta-active-workspace";

const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export class WorkspaceAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceAuthError";
  }
}

export const getCurrentUser = cache(async (): Promise<AuthUserProfile | undefined> => {
  const context = await getWorkspaceContext();
  if (context.source !== "supabase") {
    return {
      id: context.userId,
      email: "dev@rozetta.local",
      name: "User",
      plan: "Free",
    };
  }

  const row = await getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.id, context.userId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!row) return undefined;
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? row.email,
    avatarUrl: row.avatarUrl ?? undefined,
    plan: row.plan,
  };
});

export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext> => {
  if (isAuthDisabledForRuntime()) {
    return {
      userId: "dev-user",
      organizationId: DEFAULT_ORGANIZATION_ID,
      workspaceId: DEFAULT_WORKSPACE_ID,
      role: "owner",
      source: process.env.NODE_ENV === "test" ? "test" : "dev",
    };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new WorkspaceAuthError("Authentication required.");
  }

  await ensureUserWorkspace(user);
  const options = await listUserWorkspaces(user.id);
  const cookieStore = await cookies();
  const activeWorkspaceId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const active =
    options.find((option) => option.id === activeWorkspaceId) ?? options[0];

  if (!active) {
    throw new WorkspaceAuthError("No workspace membership found.");
  }

  return {
    userId: user.id,
    organizationId: active.organizationId,
    workspaceId: active.id,
    role: active.role,
    source: "supabase",
  };
});

export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  return getWorkspaceContext();
}

export const listWorkspaceSwitcherOptions = cache(async (): Promise<WorkspaceSwitcherOption[]> => {
  const context = await getWorkspaceContext();
  if (context.source !== "supabase") {
    return [
      {
        id: DEFAULT_WORKSPACE_ID,
        name: "My workspace",
        slug: "workspace",
        organizationId: DEFAULT_ORGANIZATION_ID,
        organizationName: "Local organization",
        role: "owner",
        isActive: true,
      },
    ];
  }

  const options = await listUserWorkspaces(context.userId);
  return options.map((option) => ({
    ...option,
    isActive: option.id === context.workspaceId,
  }));
});

export async function switchWorkspace(workspaceId: string): Promise<WorkspaceContext> {
  const context = await getWorkspaceContext();
  if (context.source !== "supabase") return context;

  const options = await listUserWorkspaces(context.userId);
  const next = options.find((option) => option.id === workspaceId);
  if (!next) {
    throw new WorkspaceAuthError("Workspace not available for this user.");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, next.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return {
    userId: context.userId,
    organizationId: next.organizationId,
    workspaceId: next.id,
    role: next.role,
    source: "supabase",
  };
}

export function canReadWorkspace(context: WorkspaceContext) {
  return ROLE_RANK[context.role] >= ROLE_RANK.viewer;
}

export function canWriteWorkspace(context: WorkspaceContext) {
  return ROLE_RANK[context.role] >= ROLE_RANK.editor;
}

export function canManageWorkspace(context: WorkspaceContext) {
  return ROLE_RANK[context.role] >= ROLE_RANK.admin;
}

export function requireWorkspaceRole(
  context: WorkspaceContext,
  minimumRole: WorkspaceRole
) {
  if (ROLE_RANK[context.role] < ROLE_RANK[minimumRole]) {
    throw new WorkspaceAuthError(`Workspace role ${minimumRole} required.`);
  }
}

export async function ensureUserWorkspace(user: User) {
  const db = getDb();
  const now = new Date().toISOString();
  const email = user.email ?? `${user.id}@rozetta.local`;
  const name =
    stringMeta(user, "full_name") ||
    stringMeta(user, "name") ||
    email.split("@")[0] ||
    "Rozetta user";
  const avatarUrl = stringMeta(user, "avatar_url") || stringMeta(user, "picture");

  await db
    .insert(profiles)
    .values({
      id: user.id,
      email,
      name,
      avatarUrl,
      plan: "free",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        email,
        name,
        avatarUrl,
        updatedAt: now,
      },
    });

  const existingMembership = await db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (existingMembership) return;

  const orgId = `org:${user.id}`;
  const workspaceId = `workspace:${user.id}`;
  const slug = slugify(name);

  await db.insert(organizations).values({
    id: orgId,
    name: `${name}'s organization`,
    slug: uniqueSlug("org", slug, user.id),
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(workspaces).values({
    id: workspaceId,
    organizationId: orgId,
    name: `${name}'s workspace`,
    slug: uniqueSlug("workspace", slug, user.id),
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(organizationMembers).values({
    id: `org-member:${orgId}:${user.id}`,
    organizationId: orgId,
    userId: user.id,
    role: "owner",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(workspaceMemberships).values({
    id: `workspace-member:${workspaceId}:${user.id}`,
    workspaceId,
    userId: user.id,
    role: "owner",
    createdAt: now,
    updatedAt: now,
  });
}

async function listUserWorkspaces(userId: string): Promise<WorkspaceSwitcherOption[]> {
  const rows = await getDb()
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationRole: organizationMembers.role,
      workspaceRole: workspaceMemberships.role,
    })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .innerJoin(
      organizationMembers,
      and(
        eq(organizationMembers.organizationId, organizations.id),
        eq(organizationMembers.userId, userId)
      )
    )
    .leftJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.workspaceId, workspaces.id),
        eq(workspaceMemberships.userId, userId)
      )
    )
    .where(
      or(
        eq(organizationMembers.userId, userId),
        eq(workspaceMemberships.userId, userId)
      )
    )
    .orderBy(asc(organizations.name), asc(workspaces.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    role: normalizeRole(row.workspaceRole ?? row.organizationRole),
    isActive: false,
  }));
}

function normalizeRole(value: string): WorkspaceRole {
  return value === "owner" || value === "admin" || value === "editor" || value === "viewer"
    ? value
    : "viewer";
}

function stringMeta(user: User, key: string) {
  const value = user.user_metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "workspace";
}

function uniqueSlug(prefix: string, slug: string, userId: string) {
  return `${prefix}-${slug}-${userId.slice(0, 8)}`;
}
