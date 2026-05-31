import { flattenTokens } from "@/lib/dtcg/parser";
import { resolveToken } from "@/lib/dtcg/resolver";
import { getCollectionModes, materializeCollectionMode } from "@/lib/dtcg/collections";
import {
  buildAiWorkspaceContext,
  createDeterministicAiProposal,
  listSyncConnectors,
  previewAiPatch,
  validateAiPatch,
  DEFAULT_AI_CONTEXT,
} from "@/lib/ai-os/registry";
import type {
  AiCommandInput,
  AiPatchProposal,
  AiTaskKind,
  AiWorkspaceDraft,
} from "@/lib/workspace/types";
import {
  diffDesignSystemRegistry,
  proposeDesignSystemPatch,
  validateDesignSystem,
} from "@/lib/design-system/registry";
import type { ExportProfile, ExportProfileFormat, ExportProfileTargetKind } from "@/lib/workspace/types";
import { diffTokenSets } from "@/lib/workspace/diff";
import { previewExportProfile } from "@/lib/workspace/export-profiles";
import { buildWorkspaceHealth } from "@/lib/workspace/validation";
import {
  loadGitBaselineDesignSystemRegistryForMcp,
  loadGitBaselineTokenSetsForMcp,
  loadFigmaBridgeStateForMcp,
  loadGitStatusSummaryForMcp,
  loadGitHubPrDraftsForMcp,
  loadWorkspaceAiPatches,
  loadWorkspaceBrands,
  loadWorkspaceComponents,
  loadWorkspaceExportProfiles,
  loadWorkspaceThemes,
  loadWorkspaceTokenSets,
} from "./workspace";

export async function listCollectionsTool() {
  const collections = await loadWorkspaceTokenSets();
  return collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    filename: collection.filename,
    modes: getCollectionModes(collection).map((mode) => ({
      id: mode.id,
      name: mode.name,
      isDefault: mode.isDefault,
      tokens: flattenTokens(materializeCollectionMode(collection, mode.id)).length,
    })),
    tokens: getCollectionModes(collection).reduce(
      (total, mode) => total + flattenTokens(materializeCollectionMode(collection, mode.id)).length,
      0
    ),
  }));
}

export async function listCollectionModesTool(collectionId: string) {
  const collection = (await loadWorkspaceTokenSets()).find((item) => item.id === collectionId);
  if (!collection) return { error: `Collection ${collectionId} not found.` };
  return getCollectionModes(collection).map((mode) => ({
    id: mode.id,
    name: mode.name,
    isDefault: mode.isDefault,
    tokens: flattenTokens(materializeCollectionMode(collection, mode.id)).length,
  }));
}

export async function listSetsTool() {
  return listCollectionsTool();
}

export async function listThemesTool() {
  return loadWorkspaceThemes();
}

export async function listBrandsTool() {
  return loadWorkspaceBrands();
}

export async function listComponentsTool() {
  return loadWorkspaceComponents();
}

export async function searchTokensTool(query: string, limit = 25) {
  const collections = await loadWorkspaceTokenSets();
  const normalized = query.trim().toLowerCase();
  return collections
    .flatMap((collection) =>
      getCollectionModes(collection).flatMap((mode) =>
        flattenTokens(materializeCollectionMode(collection, mode.id)).map((token) => ({
        collectionId: collection.id,
        collectionName: collection.name,
        modeId: mode.id,
        modeName: mode.name,
        setId: collection.id,
        setName: collection.name,
        path: token.path,
        type: token.$type,
        value: token.$value,
        }))
      )
    )
    .filter((token) => token.path.toLowerCase().includes(normalized))
    .slice(0, limit);
}

export async function resolveAliasTool(collectionId: string, path: string, modeId?: string) {
  const collections = await loadWorkspaceTokenSets();
  const scopedCollections = collections.map((collection) =>
    collection.id === collectionId && modeId ? materializeCollectionMode(collection, modeId) : collection
  );
  return resolveToken(collectionId, path, { currentSetId: collectionId, sets: scopedCollections });
}

export async function validateWorkspaceTool() {
  const [sets, themes, brands, components, git] = await Promise.all([
    loadWorkspaceTokenSets(),
    loadWorkspaceThemes(),
    loadWorkspaceBrands(),
    loadWorkspaceComponents(),
    loadGitStatusSummaryForMcp(),
  ]);
  return buildWorkspaceHealth({ sets, themes, brands, components, git });
}

export async function semanticDiffTool(ref = "HEAD") {
  const [baseline, current] = await Promise.all([
    loadGitBaselineTokenSetsForMcp(ref),
    loadWorkspaceTokenSets(),
  ]);
  return diffTokenSets(baseline, current);
}

export async function validateDesignSystemTool() {
  const [sets, themes, brands, components] = await Promise.all([
    loadWorkspaceTokenSets(),
    loadWorkspaceThemes(),
    loadWorkspaceBrands(),
    loadWorkspaceComponents(),
  ]);
  return validateDesignSystem({ sets, themes, brands, components, exportProfiles: [] });
}

export async function designSystemDiffTool(ref = "HEAD") {
  const [baseline, themes, brands, components] = await Promise.all([
    loadGitBaselineDesignSystemRegistryForMcp(ref),
    loadWorkspaceThemes(),
    loadWorkspaceBrands(),
    loadWorkspaceComponents(),
  ]);
  return diffDesignSystemRegistry(baseline, { themes, brands, components });
}

export async function proposeBrandTool(name: string, baseBrandId?: string) {
  const brands = await loadWorkspaceBrands();
  return {
    appliesAutomatically: false,
    proposal: {
      name,
      baseBrandId,
      status: "draft",
      reason: `Create a white-label brand package for ${name}.`,
      suggestedTokenSetIds: [],
      suggestedThemeIds: [],
      suggestedExportProfileIds: [],
      suggestedComponentIds: [],
      existingBrandCount: brands.length,
    },
  };
}

export async function proposeComponentTool(name: string, category = "Core") {
  const components = await loadWorkspaceComponents();
  return {
    appliesAutomatically: false,
    proposal: {
      name,
      category,
      status: "draft",
      tokenRefs: [],
      variants: ["Default"],
      props: [],
      states: ["default", "hover", "disabled"],
      existingComponentCount: components.length,
    },
  };
}

export async function proposeDesignSystemPatchTool() {
  return proposeDesignSystemPatch(await validateDesignSystemTool());
}

export async function previewExportTool(input: {
  targetKind: ExportProfileTargetKind;
  targetId: string;
  format: ExportProfileFormat;
}) {
  const [sets, themes] = await Promise.all([loadWorkspaceTokenSets(), loadWorkspaceThemes()]);
  const profile: ExportProfile = {
    id: "mcp-preview",
    name: "MCP preview",
    targetKind: input.targetKind,
    targetId: input.targetId,
    format: input.format,
    destination: "mcp",
    updatedAt: new Date().toISOString(),
  };
  return previewExportProfile(profile, sets, themes);
}

export async function proposePatchTool() {
  const health = await validateWorkspaceTool();
  return {
    appliesAutomatically: false,
    proposals: health.issues.map((issue) => ({
      issueId: issue.id,
      severity: issue.severity,
      source: issue.source,
      proposedAction: issue.action,
    })),
  };
}

export async function getWorkspaceContextTool() {
  const [sets, themes, brands, components, exportProfiles, git, baselineSets, figma, githubPrDrafts] = await Promise.all([
    loadWorkspaceTokenSets(),
    loadWorkspaceThemes(),
    loadWorkspaceBrands(),
    loadWorkspaceComponents(),
    loadWorkspaceExportProfiles(),
    loadGitStatusSummaryForMcp(),
    loadGitBaselineTokenSetsForMcp(),
    loadFigmaBridgeStateForMcp(),
    loadGitHubPrDraftsForMcp(),
  ]);
  return buildAiWorkspaceContext({
    sets,
    baselineSets,
    themes,
    brands,
    components,
    exportProfiles,
    git,
    operational: {
      figma,
      githubPrDrafts,
      syncRuns: figma.recentSyncRuns,
    },
    focus: DEFAULT_AI_CONTEXT,
  });
}

export async function runAiProposalTool(kind: AiTaskKind, prompt = "") {
  const [sets, themes, brands, components, exportProfiles, git, baselineSets, figma, githubPrDrafts] = await Promise.all([
    loadWorkspaceTokenSets(),
    loadWorkspaceThemes(),
    loadWorkspaceBrands(),
    loadWorkspaceComponents(),
    loadWorkspaceExportProfiles(),
    loadGitStatusSummaryForMcp(),
    loadGitBaselineTokenSetsForMcp(),
    loadFigmaBridgeStateForMcp(),
    loadGitHubPrDraftsForMcp(),
  ]);
  const operational = {
    figma,
    githubPrDrafts,
    syncRuns: figma.recentSyncRuns,
  };
  const command: AiCommandInput = {
    kind,
    prompt,
    context: DEFAULT_AI_CONTEXT,
    workspace: { sets, baselineSets, themes, brands, components, exportProfiles, git, operational },
  };
  return createDeterministicAiProposal(command);
}

export async function figmaBridgeStateTool() {
  return loadFigmaBridgeStateForMcp();
}

export async function listGitHubPrDraftsTool() {
  return loadGitHubPrDraftsForMcp();
}

export async function listAiPatchesTool() {
  return loadWorkspaceAiPatches();
}

export async function previewAiPatchTool(proposal: AiPatchProposal) {
  return previewAiPatch(proposal, await loadAiWorkspaceDraftForMcp());
}

export async function validateAiPatchTool(proposal: AiPatchProposal) {
  return validateAiPatch(proposal, await loadAiWorkspaceDraftForMcp());
}

export async function listSyncConnectorsTool() {
  return listSyncConnectors();
}

export async function connectorReadinessTool(connectorId: string) {
  const connector = listSyncConnectors().find((item) => item.id === connectorId);
  return connector ?? { error: `Connector ${connectorId} not found.` };
}

async function loadAiWorkspaceDraftForMcp(): Promise<AiWorkspaceDraft> {
  const [sets, themes, brands, components, exportProfiles] = await Promise.all([
    loadWorkspaceTokenSets(),
    loadWorkspaceThemes(),
    loadWorkspaceBrands(),
    loadWorkspaceComponents(),
    loadWorkspaceExportProfiles(),
  ]);
  return { sets, themes, brands, components, exportProfiles };
}

export function toMcpText(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}
