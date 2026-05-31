#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import {
  connectorReadinessTool,
  designSystemDiffTool,
  figmaBridgeStateTool,
  getWorkspaceContextTool,
  listAiPatchesTool,
  listBrandsTool,
  listComponentsTool,
  listGitHubPrDraftsTool,
  listCollectionModesTool,
  listCollectionsTool,
  listSetsTool,
  listSyncConnectorsTool,
  listThemesTool,
  previewExportTool,
  previewAiPatchTool,
  proposeBrandTool,
  proposeComponentTool,
  proposeDesignSystemPatchTool,
  proposePatchTool,
  resolveAliasTool,
  runAiProposalTool,
  searchTokensTool,
  semanticDiffTool,
  toMcpText,
  validateAiPatchTool,
  validateDesignSystemTool,
  validateWorkspaceTool,
} from "./tools";

const server = new McpServer({
  name: "rozetta-studio",
  version: "0.2.0",
});

server.registerTool(
  "list_collections",
  {
    description: "List token collections and their modes in the local Rozetta workspace.",
  },
  async () => toMcpText(await listCollectionsTool())
);

server.registerTool(
  "list_collection_modes",
  {
    description: "List modes for a token collection in the local Rozetta workspace.",
    inputSchema: {
      collectionId: z.string(),
    },
  },
  async ({ collectionId }) => toMcpText(await listCollectionModesTool(collectionId))
);

server.registerTool(
  "list_sets",
  {
    description: "Legacy alias for list_collections.",
  },
  async () => toMcpText(await listSetsTool())
);

server.registerTool(
  "list_themes",
  {
    description: "List versioned themes when available in the local Rozetta workspace.",
  },
  async () => toMcpText(await listThemesTool())
);

server.registerTool(
  "list_brands",
  {
    description: "List Git-versioned white-label brands in the local Rozetta workspace.",
  },
  async () => toMcpText(await listBrandsTool())
);

server.registerTool(
  "list_components",
  {
    description: "List Git-versioned design system component registry entries.",
  },
  async () => toMcpText(await listComponentsTool())
);

server.registerTool(
  "search_tokens",
  {
    description: "Search tokens by path.",
    inputSchema: {
      query: z.string(),
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ query, limit }) => toMcpText(await searchTokensTool(query, limit))
);

server.registerTool(
  "resolve_alias",
  {
    description: "Resolve a token alias or literal token value.",
    inputSchema: {
      collectionId: z.string().optional(),
      setId: z.string().optional(),
      modeId: z.string().optional(),
      path: z.string(),
    },
  },
  async ({ collectionId, setId, modeId, path }) =>
    toMcpText(await resolveAliasTool(collectionId ?? setId ?? "", path, modeId))
);

server.registerTool(
  "validate_workspace",
  {
    description: "Validate the workspace for missing types, broken aliases, theme issues, and Git state.",
  },
  async () => toMcpText(await validateWorkspaceTool())
);

server.registerTool(
  "semantic_diff",
  {
    description: "Generate a semantic token diff against a Git ref.",
    inputSchema: {
      ref: z.string().optional(),
    },
  },
  async ({ ref }) => toMcpText(await semanticDiffTool(ref))
);

server.registerTool(
  "validate_design_system",
  {
    description: "Validate brands and components without mutating files.",
  },
  async () => toMcpText(await validateDesignSystemTool())
);

server.registerTool(
  "design_system_diff",
  {
    description: "Generate a semantic diff for themes, brands, and components against a Git ref.",
    inputSchema: {
      ref: z.string().optional(),
    },
  },
  async ({ ref }) => toMcpText(await designSystemDiffTool(ref))
);

server.registerTool(
  "propose_brand",
  {
    description: "Return a structured white-label brand proposal without writing files.",
    inputSchema: {
      name: z.string(),
      baseBrandId: z.string().optional(),
    },
  },
  async ({ name, baseBrandId }) => toMcpText(await proposeBrandTool(name, baseBrandId))
);

server.registerTool(
  "propose_component",
  {
    description: "Return a structured component registry proposal without writing files.",
    inputSchema: {
      name: z.string(),
      category: z.string().optional(),
    },
  },
  async ({ name, category }) => toMcpText(await proposeComponentTool(name, category))
);

server.registerTool(
  "propose_design_system_patch",
  {
    description: "Propose safe design system registry fixes without applying them.",
  },
  async () => toMcpText(await proposeDesignSystemPatchTool())
);

server.registerTool(
  "preview_export",
  {
    description: "Preview an export artifact for a collection, legacy set, or theme.",
    inputSchema: {
      targetKind: z.enum(["collection", "set", "theme"]),
      targetId: z.string(),
      format: z.enum(["css", "tailwind", "json", "style-dictionary"]),
    },
  },
  async (input) => toMcpText(await previewExportTool(input))
);

server.registerTool(
  "propose_patch",
  {
    description: "Propose safe workspace fixes without applying them.",
  },
  async () => toMcpText(await proposePatchTool())
);

server.registerTool(
  "get_workspace_context",
  {
    description: "Return the AI-ready workspace context without mutating files.",
  },
  async () => toMcpText(await getWorkspaceContextTool())
);

server.registerTool(
  "run_ai_proposal",
  {
    description: "Generate a deterministic AI proposal without storing or applying it.",
    inputSchema: {
      kind: z.enum([
        "explain-issues",
        "suggest-names",
        "propose-fixes",
        "design-system",
        "release-notes",
        "workspace-question",
      ]),
      prompt: z.string().optional(),
    },
  },
  async ({ kind, prompt }) => toMcpText(await runAiProposalTool(kind, prompt))
);

server.registerTool(
  "list_ai_patches",
  {
    description: "List persisted AI patch proposals without applying them.",
  },
  async () => toMcpText(await listAiPatchesTool())
);

server.registerTool(
  "preview_ai_patch",
  {
    description: "Preview a supplied AI patch proposal against the current workspace.",
    inputSchema: {
      proposal: z.any(),
    },
  },
  async ({ proposal }) => toMcpText(await previewAiPatchTool(proposal))
);

server.registerTool(
  "validate_ai_patch",
  {
    description: "Validate a supplied AI patch proposal against the current workspace.",
    inputSchema: {
      proposal: z.any(),
    },
  },
  async ({ proposal }) => toMcpText(await validateAiPatchTool(proposal))
);

server.registerTool(
  "list_sync_connectors",
  {
    description: "List agnostic sync connectors and capabilities.",
  },
  async () => toMcpText(await listSyncConnectorsTool())
);

server.registerTool(
  "connector_readiness",
  {
    description: "Return readiness and capabilities for a sync connector.",
    inputSchema: {
      connectorId: z.string(),
    },
  },
  async ({ connectorId }) => toMcpText(await connectorReadinessTool(connectorId))
);

server.registerTool(
  "figma_bridge_state",
  {
    description: "Return local Figma bridge snapshots, bindings, and sync runs from the runtime database.",
  },
  async () => toMcpText(await figmaBridgeStateTool())
);

server.registerTool(
  "list_github_pr_drafts",
  {
    description: "List GitHub PR drafts prepared by Rozetta without publishing them.",
  },
  async () => toMcpText(await listGitHubPrDraftsTool())
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Rozetta MCP server running on stdio.");
}

main().catch((err) => {
  console.error("Rozetta MCP server failed:", err);
  process.exit(1);
});
