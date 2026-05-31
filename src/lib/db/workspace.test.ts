import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import type { TokenSet } from "@/lib/dtcg/types";
import type { Theme } from "@/lib/themes/types";
import type { WorkspaceContext } from "@/lib/auth/types";

vi.mock("server-only", () => ({}));

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe("DB-first workspace repository", () => {
  it("imports filesystem tokens and themes into an empty Supabase-compatible database", async () => {
    prepareTestDatabase();
    const runtime = await import("@/lib/db/runtime");
    const migration = await import("@/lib/db/migrate");
    const repository = await import("@/lib/db/repositories/workspace");

    await migration.migrateRuntimeDatabase();
    const workspace = await repository.getWorkspaceFromDb();

    expect(workspace.sets.length).toBeGreaterThan(0);
    expect(Object.keys(workspace.originalRoots).length).toBeGreaterThan(0);

    await runtime.closeDbForTests();
  });

  it("upserts token sets and refreshes the search index", async () => {
    prepareTestDatabase();
    const runtime = await import("@/lib/db/runtime");
    const migration = await import("@/lib/db/migrate");
    const repository = await import("@/lib/db/repositories/workspace");
    const schema = await import("@/lib/db/schema");

    const set: TokenSet = {
      id: "unit",
      name: "Unit",
      filename: "unit.tokens.json",
      root: {
        color: {
          $type: "color",
          brand: { $value: "#000000" },
        },
      },
    };

    await migration.migrateRuntimeDatabase();
    await repository.upsertTokenSetInDb(set, { audit: false });
    const indexed = await runtime
      .getDb()
      .select()
      .from(schema.tokenIndex)
      .where(eq(schema.tokenIndex.setId, "unit"));

    expect(indexed).toHaveLength(1);
    expect(indexed[0]?.path).toBe("color.brand");
    expect(indexed[0]?.type).toBe("color");

    await runtime.closeDbForTests();
  });

  it("stores themes and their ordered set refs structurally", async () => {
    prepareTestDatabase();
    const runtime = await import("@/lib/db/runtime");
    const migration = await import("@/lib/db/migrate");
    const repository = await import("@/lib/db/repositories/workspace");

    const theme: Theme = {
      id: "theme-light",
      name: "Light",
      description: "Default light theme",
      updatedAt: "2026-05-11T00:00:00.000Z",
      sets: [
        { setId: "core", mode: "source" },
        { setId: "semantic", mode: "enabled" },
      ],
    };

    await migration.migrateRuntimeDatabase();
    await repository.replaceThemesInDb([theme], { audit: false });
    const themes = await repository.listThemesFromDb();

    expect(themes).toHaveLength(1);
    expect(themes[0]?.sets.map((ref) => ref.setId)).toEqual(["core", "semantic"]);
    expect(themes[0]?.sets.map((ref) => ref.mode)).toEqual(["source", "enabled"]);

    await runtime.closeDbForTests();
  });

  it("keeps token data isolated by workspace context", async () => {
    prepareTestDatabase();
    const runtime = await import("@/lib/db/runtime");
    const migration = await import("@/lib/db/migrate");
    const repository = await import("@/lib/db/repositories/workspace");
    const schema = await import("@/lib/db/schema");

    const workspaceA: WorkspaceContext = {
      userId: "user-a",
      organizationId: "org-a",
      workspaceId: "workspace-a",
      role: "owner",
      source: "test",
    };
    const workspaceB: WorkspaceContext = {
      userId: "user-b",
      organizationId: "org-b",
      workspaceId: "workspace-b",
      role: "owner",
      source: "test",
    };

    await migration.migrateRuntimeDatabase();
    await seedWorkspace(runtime, schema, workspaceA, "Org A", "Workspace A");
    await seedWorkspace(runtime, schema, workspaceB, "Org B", "Workspace B");

    await repository.upsertTokenSetInDb(
      {
        id: "shared",
        name: "Shared A",
        filename: "shared.tokens.json",
        root: { color: { $type: "color", a: { $value: "#000000" } } },
      },
      { audit: false },
      workspaceA
    );
    await repository.upsertTokenSetInDb(
      {
        id: "shared",
        name: "Shared B",
        filename: "shared.tokens.json",
        root: { color: { $type: "color", b: { $value: "#ffffff" } } },
      },
      { audit: false },
      workspaceB
    );

    const setsA = await repository.listTokenSetsFromDb(workspaceA);
    const setsB = await repository.listTokenSetsFromDb(workspaceB);

    expect(setsA[0]?.name).toBe("Shared A");
    expect(setsB[0]?.name).toBe("Shared B");

    await runtime.closeDbForTests();
  });

  it("rejects workspace writes for viewers", async () => {
    prepareTestDatabase();
    const runtime = await import("@/lib/db/runtime");
    const migration = await import("@/lib/db/migrate");
    const repository = await import("@/lib/db/repositories/workspace");
    const schema = await import("@/lib/db/schema");

    const viewer: WorkspaceContext = {
      userId: "viewer",
      organizationId: "org-viewer",
      workspaceId: "workspace-viewer",
      role: "viewer",
      source: "test",
    };

    await migration.migrateRuntimeDatabase();
    await seedWorkspace(runtime, schema, viewer, "Viewer Org", "Viewer Workspace");

    await expect(
      repository.upsertTokenSetInDb(
        {
          id: "blocked",
          name: "Blocked",
          filename: "blocked.tokens.json",
          root: {},
        },
        { audit: false },
        viewer
      )
    ).rejects.toThrow(/editor required/i);

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

async function seedWorkspace(
  runtime: typeof import("@/lib/db/runtime"),
  schema: typeof import("@/lib/db/schema"),
  context: WorkspaceContext,
  organizationName: string,
  workspaceName: string
) {
  const now = new Date().toISOString();
  await runtime.getDb().insert(schema.organizations).values({
    id: context.organizationId,
    name: organizationName,
    slug: context.organizationId,
    createdBy: context.userId,
    updatedBy: context.userId,
    createdAt: now,
    updatedAt: now,
  });
  await runtime.getDb().insert(schema.workspaces).values({
    id: context.workspaceId,
    organizationId: context.organizationId,
    name: workspaceName,
    slug: context.workspaceId,
    createdBy: context.userId,
    updatedBy: context.userId,
    createdAt: now,
    updatedAt: now,
  });
}
