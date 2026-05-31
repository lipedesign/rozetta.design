import "server-only";

import {
  getCurrentUser,
  getWorkspaceContext,
  listWorkspaceSwitcherOptions,
} from "@/lib/auth/workspace-context";
import { getBrands, getComponents } from "@/lib/design-system/actions";
import { getThemes, listThemeGroups } from "@/lib/themes/actions";
import { getInitialState } from "@/lib/tokens/actions";
import { listWorkspaceBranches } from "@/lib/branches/actions";
import { measureAsync } from "@/lib/perf/measure";

export interface ShellChrome {
  userProfile: Awaited<ReturnType<typeof getCurrentUser>>;
  workspaceContext: Awaited<ReturnType<typeof getWorkspaceContext>>;
  workspaceOptions: Awaited<ReturnType<typeof listWorkspaceSwitcherOptions>>;
}

export async function getShellChrome(): Promise<ShellChrome> {
  return measureAsync("shell.chrome", async () => {
    const [userProfile, workspaceContext, workspaceOptions] = await Promise.all([
      measureAsync("shell.chrome.user", getCurrentUser),
      measureAsync("shell.chrome.workspaceContext", getWorkspaceContext),
      measureAsync("shell.chrome.workspaceOptions", listWorkspaceSwitcherOptions),
    ]);
    return { userProfile, workspaceContext, workspaceOptions };
  });
}

export async function getStudioShellData() {
  return measureAsync("shell.studio", async () => {
    const [tokens, themes, themeGroupsResult, branchesResult, brands, components, chrome] =
      await Promise.all([
        measureAsync("shell.tokens", getInitialState),
        measureAsync("shell.themes", getThemes),
        measureAsync("shell.themeGroups", listThemeGroups),
        measureAsync("shell.branches", listWorkspaceBranches),
        measureAsync("shell.brands", getBrands),
        measureAsync("shell.components", getComponents),
        getShellChrome(),
      ]);
    const themeGroups = themeGroupsResult.ok ? themeGroupsResult.themeGroups : [];
    const workspaceBranches = branchesResult.ok ? branchesResult.branches : [];
    const activeWorkspaceBranch =
      workspaceBranches.find((branch) => branch.isActive) ?? workspaceBranches[0];

    return {
      initialSets: tokens.sets,
      initialOriginalRoots: tokens.originalRoots,
      initialThemes: themes.themes,
      initialThemeOriginals: themes.originalThemes,
      initialThemeGroups: themeGroups,
      initialWorkspaceBranches: workspaceBranches,
      activeWorkspaceBranch,
      themesFileExists: themes.exists,
      initialBrands: brands.brands,
      initialComponents: components.components,
      userProfile: chrome.userProfile,
      workspaceContext: chrome.workspaceContext,
      workspaceOptions: chrome.workspaceOptions,
    };
  });
}

/**
 * Legacy alias retained for `/brands` (paused) and other call sites that still
 * mount their own `<ProductShell>` instead of relying on the persistent
 * `(studio)` layout.
 */
export const getProductShellData = getStudioShellData;
