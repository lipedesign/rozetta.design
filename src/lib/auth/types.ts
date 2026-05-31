export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

export type AuthSource = "supabase" | "dev" | "test";

export interface AuthUserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  plan: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: WorkspaceRole;
}

export interface WorkspaceMembership {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}

export interface WorkspaceContext {
  userId: string;
  organizationId: string;
  workspaceId: string;
  role: WorkspaceRole;
  source: AuthSource;
}

export interface WorkspaceSwitcherOption {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  organizationName: string;
  role: WorkspaceRole;
  isActive: boolean;
}

export type AuditActorType = "user" | "ai" | "sync" | "system" | "mcp";

export type AuditResourceType =
  | "workspace"
  | "token-collection"
  | "token-set"
  | "token"
  | "theme"
  | "brand"
  | "component"
  | "figma-snapshot"
  | "ai-patch"
  | "github-pr"
  | "export-profile";
