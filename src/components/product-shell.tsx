"use client";

import { type CSSProperties, useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { AppSidebar } from "@/components/app-sidebar";
import { TokensProvider } from "@/components/tokens-provider";

const AiPanel = dynamic(
  () => import("@/components/ai/ai-panel").then((mod) => ({ default: mod.AiPanel })),
  { ssr: false }
);
const TokenEditorSheet = dynamic(
  () =>
    import("@/components/tokens/token-editor-sheet").then((mod) => ({
      default: mod.TokenEditorSheet,
    })),
  { ssr: false }
);
const ExportSheet = dynamic(
  () =>
    import("@/components/tokens/export-sheet").then((mod) => ({ default: mod.ExportSheet })),
  { ssr: false }
);
const UploadSheet = dynamic(
  () =>
    import("@/components/tokens/upload-sheet").then((mod) => ({ default: mod.UploadSheet })),
  { ssr: false }
);
const FigmaIncomingSheet = dynamic(
  () =>
    import("@/components/figma-sync/figma-incoming-sheet").then((mod) => ({
      default: mod.FigmaIncomingSheet,
    })),
  { ssr: false }
);
const BranchSwitchOverlay = dynamic(
  () =>
    import("@/components/branches/branch-switch-overlay").then((mod) => ({
      default: mod.BranchSwitchOverlay,
    })),
  { ssr: false }
);
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import type { DtcgGroup, TokenSet } from "@/lib/dtcg/types";
import { useDesignSystemStore } from "@/lib/design-system/store";
import { useThemesStore } from "@/lib/themes/store";
import type { Brand, DesignSystemComponent, GitStatusSummary } from "@/lib/workspace/types";
import type { Theme, ThemeGroup } from "@/lib/themes/types";
import type { WorkspaceBranch } from "@/lib/branches/types";
import type {
  AuthUserProfile,
  WorkspaceContext,
  WorkspaceSwitcherOption,
} from "@/lib/auth/types";

interface ProductShellProps {
  initialSets: TokenSet[];
  initialOriginalRoots?: Record<string, DtcgGroup>;
  initialThemes?: Theme[];
  initialThemeOriginals?: Theme[];
  initialThemeGroups?: ThemeGroup[];
  initialWorkspaceBranches?: WorkspaceBranch[];
  activeWorkspaceBranch?: WorkspaceBranch;
  themesFileExists?: boolean;
  initialBrands?: Brand[];
  initialComponents?: DesignSystemComponent[];
  aiBaselineSets?: TokenSet[];
  aiGit?: GitStatusSummary;
  userProfile?: AuthUserProfile;
  workspaceContext?: WorkspaceContext;
  workspaceOptions?: WorkspaceSwitcherOption[];
  children: React.ReactNode;
}

function RegistryHydrator({
  themes,
  themesFileExists,
  themeOriginals,
  themeGroups,
  brands,
  components,
}: {
  themes: Theme[];
  themeOriginals: Theme[];
  themesFileExists: boolean;
  themeGroups: ThemeGroup[];
  brands: Brand[];
  components: DesignSystemComponent[];
}) {
  const hydrate = useThemesStore((state) => state.hydrate);
  const setThemeGroups = useThemesStore((state) => state.setThemeGroups);
  const hydrateDesignSystem = useDesignSystemStore((state) => state.hydrate);
  useEffect(() => {
    hydrate(themes, themesFileExists, themeOriginals);
    setThemeGroups(themeGroups);
    hydrateDesignSystem({ brands, components });
  }, [
    brands,
    components,
    hydrate,
    hydrateDesignSystem,
    setThemeGroups,
    themeGroups,
    themeOriginals,
    themes,
    themesFileExists,
  ]);
  return null;
}

export function ProductShell({
  initialSets,
  initialOriginalRoots,
  initialThemes = [],
  initialThemeOriginals = [],
  initialThemeGroups = [],
  initialWorkspaceBranches = [],
  activeWorkspaceBranch,
  themesFileExists = true,
  initialBrands = [],
  initialComponents = [],
  aiBaselineSets,
  aiGit,
  userProfile,
  workspaceContext,
  workspaceOptions = [],
  children,
}: ProductShellProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <TokensProvider initialSets={initialSets} initialOriginalRoots={initialOriginalRoots}>
      <RegistryHydrator
        themes={initialThemes}
        themeOriginals={initialThemeOriginals}
        themeGroups={initialThemeGroups}
        themesFileExists={themesFileExists}
        brands={initialBrands}
        components={initialComponents}
      />
      <SidebarProvider
        className="bg-muted"
        style={{ "--sidebar-width": "15rem" } as CSSProperties}
      >
        <AppSidebar
          userProfile={userProfile}
          workspaceContext={workspaceContext}
          workspaceOptions={workspaceOptions}
          activeWorkspaceBranch={activeWorkspaceBranch}
          workspaceBranches={initialWorkspaceBranches}
          onOpenExport={() => setExportOpen(true)}
          onOpenUpload={() => setUploadOpen(true)}
          onOpenAi={() => setAiOpen(true)}
        />
        <SidebarInset className="bg-muted flex h-svh flex-col gap-2 overflow-hidden p-2 pl-0">
          <div className="bg-background flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border shadow-sm">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
      <TokenEditorSheet />
      <ExportSheet open={exportOpen} onOpenChange={setExportOpen} />
      <UploadSheet open={uploadOpen} onOpenChange={setUploadOpen} />
      <AiPanel
        open={aiOpen}
        onOpenChange={setAiOpen}
        baselineSets={aiBaselineSets}
        git={aiGit}
      />
      <FigmaIncomingSheet />
      <BranchSwitchOverlay />
      <Toaster />
    </TokensProvider>
  );
}
