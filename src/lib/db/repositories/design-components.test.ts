import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceContext } from "@/lib/auth/types";
import type { DesignSystemComponent } from "@/lib/workspace/types";

vi.mock("server-only", () => ({}));

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function makeComponent(overrides: Partial<DesignSystemComponent> = {}): DesignSystemComponent {
  return {
    id: "button",
    name: "Button",
    slug: "button",
    category: "Actions",
    status: "draft",
    tokenRefs: [],
    variants: [],
    props: [],
    states: [],
    bindings: { code: [], figma: [] },
    brandIds: [],
    updatedAt: "2026-06-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("design-components repository", () => {
  it("round-trips an editor upsert within the workspace", async () => {
    prepareTestDatabase();
    const runtime = await import("@/lib/db/runtime");
    const migration = await import("@/lib/db/migrate");
    const schema = await import("@/lib/db/schema");
    const repository = await import("@/lib/db/repositories/design-components");

    const editor: WorkspaceContext = {
      userId: "user-editor",
      organizationId: "org-1",
      workspaceId: "workspace-1",
      role: "editor",
      source: "test",
    };

    await migration.migrateRuntimeDatabase();
    await seedWorkspace(runtime, schema, editor, "Org 1", "Workspace 1");

    await repository.upsertComponent(makeComponent({ name: "Button" }), editor);
    const components = await repository.listComponents(editor);

    expect(components).toHaveLength(1);
    expect(components[0]?.id).toBe("button");
    expect(components[0]?.name).toBe("Button");

    await runtime.closeDbForTests();
  });

  it("rejects component writes for viewers", async () => {
    prepareTestDatabase();
    const runtime = await import("@/lib/db/runtime");
    const migration = await import("@/lib/db/migrate");
    const schema = await import("@/lib/db/schema");
    const repository = await import("@/lib/db/repositories/design-components");

    const viewer: WorkspaceContext = {
      userId: "user-viewer",
      organizationId: "org-viewer",
      workspaceId: "workspace-viewer",
      role: "viewer",
      source: "test",
    };

    await migration.migrateRuntimeDatabase();
    await seedWorkspace(runtime, schema, viewer, "Viewer Org", "Viewer Workspace");

    await expect(
      repository.upsertComponent(makeComponent(), viewer)
    ).rejects.toThrow(/editor required/i);

    await runtime.closeDbForTests();
  });

  it("keeps components isolated by workspace context", async () => {
    prepareTestDatabase();
    const runtime = await import("@/lib/db/runtime");
    const migration = await import("@/lib/db/migrate");
    const schema = await import("@/lib/db/schema");
    const repository = await import("@/lib/db/repositories/design-components");

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

    await repository.upsertComponent(makeComponent({ name: "Button A" }), workspaceA);
    await repository.upsertComponent(makeComponent({ name: "Button B" }), workspaceB);

    const componentsA = await repository.listComponents(workspaceA);
    const componentsB = await repository.listComponents(workspaceB);

    expect(componentsA).toHaveLength(1);
    expect(componentsA[0]?.name).toBe("Button A");
    expect(componentsB).toHaveLength(1);
    expect(componentsB[0]?.name).toBe("Button B");

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
