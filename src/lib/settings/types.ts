import type {
  AuthUserProfile,
  WorkspaceContext,
  WorkspaceSwitcherOption,
} from "@/lib/auth/types";
import type { AiSettings } from "@/lib/workspace/types";
import type { FigmaBridgeState } from "@/lib/workspace/types";

export type SettingsRuntimeDriver = "pglite" | "postgres";

export interface SettingsStorageStatus {
  databaseConfigured: boolean;
  driver: SettingsRuntimeDriver;
  artifactPath: string;
  databaseLabel: string;
}

export interface SettingsRuntimeInfo {
  appVersion: string;
  nodeVersion: string;
  nextRuntime: "nodejs" | "edge" | "unknown";
}

export interface SettingsAboutLink {
  label: string;
  href: string;
}

export interface SettingsWorkspaceSummary {
  workspaceId: string;
  name: string;
  slug: string;
  organizationId: string;
  organizationName: string;
  role: WorkspaceContext["role"];
  source: WorkspaceContext["source"];
}

export interface SettingsOverview {
  workspace: SettingsWorkspaceSummary;
  workspaceOptions: WorkspaceSwitcherOption[];
  userProfile?: AuthUserProfile;
  aiSettings: AiSettings;
  figma: FigmaBridgeState;
  storage: SettingsStorageStatus;
  runtime: SettingsRuntimeInfo;
  aboutLinks: SettingsAboutLink[];
}

export type UpdateWorkspaceMetaResult =
  | { ok: true; workspace: SettingsWorkspaceSummary }
  | { ok: false; error: string };

export type RegenerateBridgePairingResult =
  | { ok: true; code: string; expiresAt: string }
  | { ok: false; error: string };

export const WORKSPACE_NAME_PATTERN = /^.{1,80}$/;
