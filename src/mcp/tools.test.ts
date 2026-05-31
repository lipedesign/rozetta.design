import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type McpTools = typeof import("./tools");

let tools: McpTools;

beforeAll(async () => {
  process.env.ROZETTA_DB_DRIVER = "pglite";
  const migration = await import("@/lib/db/migrate");
  await migration.migrateRuntimeDatabase();
  tools = await import("./tools");
});

afterAll(async () => {
  const runtime = await import("@/lib/db/runtime");
  await runtime.closeDbForTests();
  delete process.env.ROZETTA_DB_DRIVER;
});

describe("MCP tools", () => {
  it("reads sets and searches tokens through domain helpers", async () => {
    const sets = await tools.listSetsTool();
    const results = await tools.searchTokensTool("color", 5);

    expect(sets.length).toBeGreaterThan(0);
    expect(results.length).toBeGreaterThan(0);
  });

  it("previews exports without importing React or Zustand", async () => {
    const preview = await tools.previewExportTool({
      targetKind: "set",
      targetId: "default",
      format: "css",
    });

    expect(preview.status).toBe("valid");
    expect(preview.output).toContain(":root");
  });

  it("validates, diffs, and proposes non-applying patches", async () => {
    const health = await tools.validateWorkspaceTool();
    const diff = await tools.semanticDiffTool();
    const patch = await tools.proposePatchTool();

    expect(health.summary.sets).toBeGreaterThan(0);
    expect(diff.summary.total).toBeGreaterThanOrEqual(0);
    expect(patch.appliesAutomatically).toBe(false);
  });

  it("exposes design system registry tools without mutating files", async () => {
    const brands = await tools.listBrandsTool();
    const components = await tools.listComponentsTool();
    const issues = await tools.validateDesignSystemTool();
    const diff = await tools.designSystemDiffTool();
    const patch = await tools.proposeDesignSystemPatchTool();

    expect(Array.isArray(brands)).toBe(true);
    expect(Array.isArray(components)).toBe(true);
    expect(Array.isArray(issues)).toBe(true);
    expect(diff.summary.total).toBeGreaterThanOrEqual(0);
    expect(patch.appliesAutomatically).toBe(false);
  });

  it("exposes AI-first context and sync connectors without mutating files", async () => {
    const context = await tools.getWorkspaceContextTool();
    const proposal = await tools.runAiProposalTool("propose-fixes", "review workspace");
    const patches = await tools.listAiPatchesTool();
    const connectors = await tools.listSyncConnectorsTool();
    const figma = await tools.connectorReadinessTool("figma");
    const figmaBridge = await tools.figmaBridgeStateTool();
    const prDrafts = await tools.listGitHubPrDraftsTool();

    expect(context.health.summary.sets).toBeGreaterThan(0);
    expect(context.operational?.syncRuns).toBeDefined();
    expect(proposal.source.providerKind).toBe("deterministic");
    expect(Array.isArray(patches)).toBe(true);
    expect(connectors.map((connector) => connector.id)).toContain("figma");
    expect(figma).toHaveProperty("readiness", "active");
    expect(figma).toHaveProperty("route", "/sync/figma");
    expect(Array.isArray(figmaBridge.recentSyncRuns)).toBe(true);
    expect(Array.isArray(prDrafts)).toBe(true);
  });
});
