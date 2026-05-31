import { afterEach, describe, expect, it, vi } from "vitest";

import type { FigmaFileSnapshot } from "@/lib/workspace/types";
import { figmaSnapshotToRozetta, buildFigmaToRozettaSyncRun } from "@/lib/workspace/figma-bridge";

vi.mock("server-only", () => ({}));

let cleanup: (() => void) | undefined;

const snapshot: FigmaFileSnapshot = {
  fileKey: "runtime-figma-file",
  name: "Runtime Figma File",
  source: "fixture",
  createdAt: "2026-05-11T00:00:00.000Z",
  collections: [
    {
      collectionId: "collection-spacing",
      name: "Spacing",
      modes: [{ modeId: "mode-default", name: "Default" }],
      variableIds: ["spacing-sm"],
    },
  ],
  variables: [
    {
      id: "spacing-sm",
      name: "spacing/sm",
      collectionId: "collection-spacing",
      collectionName: "Spacing",
      resolvedType: "FLOAT",
      valuesByMode: { "mode-default": 8 },
    },
  ],
};

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe("runtime database", () => {
  it("migrates the Postgres schema and persists Figma bridge state", async () => {
    prepareTestDatabase();
    const runtime = await import("@/lib/db/runtime");
    const migration = await import("@/lib/db/migrate");
    const repository = await import("@/lib/db/repositories/figma-bridge");
    const converted = figmaSnapshotToRozetta(snapshot);
    const preview = buildFigmaToRozettaSyncRun({
      currentSets: [],
      snapshot,
      now: "2026-05-11T01:00:00.000Z",
    });

    await migration.migrateRuntimeDatabase();
    await repository.saveFigmaSnapshotToDb(snapshot, converted.bindings);
    await repository.saveSyncRunToDb(preview.run);
    const state = await repository.loadFigmaBridgeStateFromDb();

    expect(state.latestSnapshot?.fileKey).toBe("runtime-figma-file");
    expect(state.bindings).toHaveLength(1);
    expect(state.recentSyncRuns[0]?.operations.length).toBeGreaterThan(0);

    await runtime.closeDbForTests();
  });

  it("uses PGlite only when explicitly selected for tests", async () => {
    prepareTestDatabase();
    const runtime = await import("@/lib/db/runtime");
    expect(runtime.isUsingPglite()).toBe(true);
    await runtime.closeDbForTests();
  });
});

function prepareTestDatabase() {
  vi.resetModules();
  process.env.ROZETTA_DB_DRIVER = "pglite";
  cleanup = () => {
    delete process.env.ROZETTA_DB_DRIVER;
    vi.resetModules();
  };
}
