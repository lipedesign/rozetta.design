"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  getCurrentUser,
  getWorkspaceContext,
  listWorkspaceSwitcherOptions,
  requireWorkspaceRole,
} from "@/lib/auth/workspace-context";
import { getAiSettings } from "@/lib/ai-os/actions";
import { getFigmaSyncState } from "@/lib/figma-bridge/actions";
import { createFigmaBridgePairingCode } from "@/lib/figma-bridge/pairing";
import { getDb } from "@/lib/db/runtime";
import { workspaces } from "@/lib/db/schema";
import { readRuntimeInfo, readStorageStatus } from "./server";
import type {
  RegenerateBridgePairingResult,
  SettingsAboutLink,
  SettingsOverview,
  SettingsWorkspaceSummary,
  UpdateWorkspaceMetaResult,
} from "./types";
import { WORKSPACE_NAME_PATTERN } from "./types";

const ABOUT_LINKS: SettingsAboutLink[] = [
  { label: "Constitution", href: "https://github.com/lipedesign/rozetta.design/blob/main/specs/constitution.md" },
  { label: "Architecture", href: "https://github.com/lipedesign/rozetta.design/blob/main/specs/architecture.md" },
  { label: "Settings spec", href: "https://github.com/lipedesign/rozetta.design/blob/main/specs/features/settings.md" },
];

export async function getSettingsOverview(): Promise<SettingsOverview> {
  const [workspaceContext, workspaceOptions, userProfile, aiSettingsFile, figma, runtime] =
    await Promise.all([
      getWorkspaceContext(),
      listWorkspaceSwitcherOptions(),
      getCurrentUser(),
      getAiSettings(),
      getFigmaSyncState(),
      readRuntimeInfo(),
    ]);

  const active =
    workspaceOptions.find((option) => option.id === workspaceContext.workspaceId) ??
    workspaceOptions[0];

  const workspace: SettingsWorkspaceSummary = {
    workspaceId: workspaceContext.workspaceId,
    name: active?.name ?? "Workspace",
    slug: active?.slug ?? "workspace",
    organizationId: workspaceContext.organizationId,
    organizationName: active?.organizationName ?? "Organization",
    role: workspaceContext.role,
    source: workspaceContext.source,
  };

  return {
    workspace,
    workspaceOptions,
    userProfile,
    aiSettings: aiSettingsFile.settings,
    figma,
    storage: readStorageStatus(),
    runtime,
    aboutLinks: ABOUT_LINKS,
  };
}

export async function updateWorkspaceMeta(input: {
  name: string;
}): Promise<UpdateWorkspaceMetaResult> {
  try {
    const trimmed = (input.name ?? "").trim();
    if (!WORKSPACE_NAME_PATTERN.test(trimmed)) {
      return {
        ok: false,
        error: "Workspace name must be 1–80 characters.",
      };
    }

    const context = await getWorkspaceContext();
    requireWorkspaceRole(context, "admin");

    const now = new Date().toISOString();
    await getDb()
      .update(workspaces)
      .set({ name: trimmed, updatedBy: context.userId, updatedAt: now })
      .where(eq(workspaces.id, context.workspaceId));

    const options = await listWorkspaceSwitcherOptions();
    const active =
      options.find((option) => option.id === context.workspaceId) ?? options[0];

    const workspace: SettingsWorkspaceSummary = {
      workspaceId: context.workspaceId,
      name: active?.name ?? trimmed,
      slug: active?.slug ?? "workspace",
      organizationId: context.organizationId,
      organizationName: active?.organizationName ?? "Organization",
      role: context.role,
      source: context.source,
    };

    // The persistent shell renders workspace name in the sidebar header —
    // revalidate the layout so the next navigation/refresh picks the new
    // label up.
    revalidatePath("/", "layout");

    return { ok: true, workspace };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to update workspace.",
    };
  }
}

export async function regenerateBridgePairingCode(): Promise<RegenerateBridgePairingResult> {
  try {
    const context = await getWorkspaceContext();
    requireWorkspaceRole(context, "admin");
    const pairing = createFigmaBridgePairingCode(context);
    return { ok: true, code: pairing.code, expiresAt: pairing.expiresAt };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to regenerate pairing code.",
    };
  }
}
