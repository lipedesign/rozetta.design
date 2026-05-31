import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import type {
  GetTokenResult,
  RecentChangeRow,
  SearchTokensResultRow,
} from "./tools";

vi.mock("server-only", () => ({}));

const callTool = async <T>(promise: unknown): Promise<T> => (await promise) as T;

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function prepareTestDatabase() {
  vi.resetModules();
  process.env.ROZETTA_DB_DRIVER = "pglite";
  cleanup = () => {
    delete process.env.ROZETTA_DB_DRIVER;
    vi.resetModules();
  };
}

async function seedWorkspaceRow(
  runtime: typeof import("@/lib/db/runtime"),
  schema: typeof import("@/lib/db/schema"),
  workspaceId: string
) {
  const now = new Date().toISOString();
  const db = runtime.getDb();
  await db.insert(schema.organizations).values({
    id: `org-${workspaceId}`,
    name: `Org ${workspaceId}`,
    slug: `org-${workspaceId}`,
    createdBy: "test",
    updatedBy: "test",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.workspaces).values({
    id: workspaceId,
    organizationId: `org-${workspaceId}`,
    name: `Workspace ${workspaceId}`,
    slug: workspaceId,
    createdBy: "test",
    updatedBy: "test",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.tokenSets).values({
    id: `${workspaceId}:core`,
    workspaceId,
    name: "Core",
    filename: "core.tokens.json",
    root: "{}",
    source: "import",
    createdAt: now,
    updatedAt: now,
  });
}

async function seedTokenRow(
  runtime: typeof import("@/lib/db/runtime"),
  schema: typeof import("@/lib/db/schema"),
  workspaceId: string,
  fields: {
    id: string;
    setId: string;
    modeId?: string;
    path: string;
    name: string;
    type: string;
    value: unknown;
    isAlias?: boolean;
  }
) {
  await runtime.getDb().insert(schema.tokenIndex).values({
    id: fields.id,
    workspaceId,
    setId: fields.setId,
    modeId: fields.modeId ?? "default",
    path: fields.path,
    name: fields.name,
    type: fields.type,
    value: JSON.stringify(fields.value),
    isAlias: fields.isAlias ?? false,
    updatedAt: new Date().toISOString(),
  });
}

async function seedAuditRow(
  runtime: typeof import("@/lib/db/runtime"),
  schema: typeof import("@/lib/db/schema"),
  workspaceId: string,
  fields: {
    id: string;
    kind: string;
    summary: string;
    createdAt: string;
    resourceType?: string;
    resourceId?: string;
  }
) {
  await runtime.getDb().insert(schema.auditEvents).values({
    id: fields.id,
    organizationId: `org-${workspaceId}`,
    workspaceId,
    actorType: "user",
    actorId: "test",
    resourceType: fields.resourceType,
    resourceId: fields.resourceId,
    kind: fields.kind,
    summary: fields.summary,
    payload: "{}",
    createdAt: fields.createdAt,
  });
}

describe("retrieval tool registry", () => {
  it("registers tools under the exact contract names", async () => {
    prepareTestDatabase();
    const migration = await import("@/lib/db/migrate");
    const runtime = await import("@/lib/db/runtime");
    const { buildRozettaTools, ROZETTA_TOOL_SCHEMAS } = await import("./tools");

    await migration.migrateRuntimeDatabase();
    const tools = buildRozettaTools({ workspaceId: "wA" });

    expect(Object.keys(tools).sort()).toEqual([
      "rozetta_get_token",
      "rozetta_recent_changes",
      "rozetta_search_tokens",
    ]);
    expect(Object.keys(ROZETTA_TOOL_SCHEMAS).sort()).toEqual([
      "rozetta_get_token",
      "rozetta_recent_changes",
      "rozetta_search_tokens",
    ]);

    await runtime.closeDbForTests();
  });

  it("rejects out-of-range limits via Zod input schemas", async () => {
    prepareTestDatabase();
    const migration = await import("@/lib/db/migrate");
    const runtime = await import("@/lib/db/runtime");
    const { ROZETTA_TOOL_SCHEMAS } = await import("./tools");

    await migration.migrateRuntimeDatabase();
    const result = ROZETTA_TOOL_SCHEMAS.rozetta_search_tokens.safeParse({ limit: 999 });
    expect(result.success).toBe(false);

    const empty = ROZETTA_TOOL_SCHEMAS.rozetta_get_token.safeParse({ path: "" });
    expect(empty.success).toBe(false);

    await runtime.closeDbForTests();
  });
});

describe("rozetta_search_tokens", () => {
  it("filters by query substring and respects limit", async () => {
    prepareTestDatabase();
    const migration = await import("@/lib/db/migrate");
    const runtime = await import("@/lib/db/runtime");
    const schema = await import("@/lib/db/schema");
    const { buildRozettaTools } = await import("./tools");

    await migration.migrateRuntimeDatabase();
    await seedWorkspaceRow(runtime, schema, "wA");
    await seedTokenRow(runtime, schema, "wA", {
      id: "t1",
      setId: "wA:core",
      path: "color.brand.primary",
      name: "primary",
      type: "color",
      value: "#ff0000",
    });
    await seedTokenRow(runtime, schema, "wA", {
      id: "t2",
      setId: "wA:core",
      path: "color.brand.secondary",
      name: "secondary",
      type: "color",
      value: "#00ff00",
    });
    await seedTokenRow(runtime, schema, "wA", {
      id: "t3",
      setId: "wA:core",
      path: "spacing.md",
      name: "md",
      type: "dimension",
      value: "8px",
    });

    const tools = buildRozettaTools({ workspaceId: "wA" });
    const out = await callTool<{ tokens: SearchTokensResultRow[] }>(
      tools.rozetta_search_tokens.execute!(
        { query: "color", limit: 2 },
        { toolCallId: "c1", messages: [] }
      )
    );

    expect(out.tokens.length).toBe(2);
    expect(out.tokens.every((t) => t.path.includes("color"))).toBe(true);

    const events = await runtime
      .getDb()
      .select()
      .from(schema.aiContextEvents)
      .where(eq(schema.aiContextEvents.workspaceId, "wA"));
    const calls = events.filter((row) => row.kind === "tool-call");
    expect(calls.length).toBe(1);
    expect(calls[0]?.sourceId).toBe("rozetta_search_tokens");

    await runtime.closeDbForTests();
  });

  it("filters by semantic tier (alias values surface as semantic)", async () => {
    prepareTestDatabase();
    const migration = await import("@/lib/db/migrate");
    const runtime = await import("@/lib/db/runtime");
    const schema = await import("@/lib/db/schema");
    const { buildRozettaTools } = await import("./tools");

    await migration.migrateRuntimeDatabase();
    await seedWorkspaceRow(runtime, schema, "wA");
    await seedTokenRow(runtime, schema, "wA", {
      id: "t-prim",
      setId: "wA:core",
      path: "color.primitive.red500",
      name: "red500",
      type: "color",
      value: "#ff0000",
    });
    await seedTokenRow(runtime, schema, "wA", {
      id: "t-sem",
      setId: "wA:core",
      path: "color.brand.primary",
      name: "primary",
      type: "color",
      value: "{color.primitive.red500}",
      isAlias: true,
    });

    const tools = buildRozettaTools({ workspaceId: "wA" });
    const semantics = await callTool<{ tokens: SearchTokensResultRow[] }>(
      tools.rozetta_search_tokens.execute!(
        { tier: "semantic", limit: 20 },
        { toolCallId: "c1", messages: [] }
      )
    );
    expect(semantics.tokens.map((t) => t.path)).toEqual([
      "color.brand.primary",
    ]);

    const primitives = await callTool<{ tokens: SearchTokensResultRow[] }>(
      tools.rozetta_search_tokens.execute!(
        { tier: "primitive", limit: 20 },
        { toolCallId: "c2", messages: [] }
      )
    );
    expect(primitives.tokens.map((t) => t.path)).toEqual([
      "color.primitive.red500",
    ]);

    await runtime.closeDbForTests();
  });

  it("scopes results to the calling workspace", async () => {
    prepareTestDatabase();
    const migration = await import("@/lib/db/migrate");
    const runtime = await import("@/lib/db/runtime");
    const schema = await import("@/lib/db/schema");
    const { buildRozettaTools } = await import("./tools");

    await migration.migrateRuntimeDatabase();
    await seedWorkspaceRow(runtime, schema, "wA");
    await seedWorkspaceRow(runtime, schema, "wB");
    await seedTokenRow(runtime, schema, "wA", {
      id: "t-a",
      setId: "wA:core",
      path: "color.a",
      name: "a",
      type: "color",
      value: "#000",
    });
    await seedTokenRow(runtime, schema, "wB", {
      id: "t-b",
      setId: "wB:core",
      path: "color.b",
      name: "b",
      type: "color",
      value: "#fff",
    });

    const toolsA = buildRozettaTools({ workspaceId: "wA" });
    const outA = await callTool<{ tokens: SearchTokensResultRow[] }>(
      toolsA.rozetta_search_tokens.execute!(
        { limit: 20 },
        { toolCallId: "c1", messages: [] }
      )
    );
    expect(outA.tokens.map((t) => t.path)).toEqual(["color.a"]);

    await runtime.closeDbForTests();
  });
});

describe("rozetta_get_token", () => {
  it("returns the token plus its full alias chain", async () => {
    prepareTestDatabase();
    const migration = await import("@/lib/db/migrate");
    const runtime = await import("@/lib/db/runtime");
    const schema = await import("@/lib/db/schema");
    const { buildRozettaTools } = await import("./tools");

    await migration.migrateRuntimeDatabase();
    await seedWorkspaceRow(runtime, schema, "wA");
    await seedTokenRow(runtime, schema, "wA", {
      id: "t-leaf",
      setId: "wA:core",
      path: "color.primitive.red500",
      name: "red500",
      type: "color",
      value: "#ff0000",
    });
    await seedTokenRow(runtime, schema, "wA", {
      id: "t-mid",
      setId: "wA:core",
      path: "color.brand.primary",
      name: "primary",
      type: "color",
      value: "{color.primitive.red500}",
      isAlias: true,
    });
    await seedTokenRow(runtime, schema, "wA", {
      id: "t-top",
      setId: "wA:core",
      path: "color.button.background",
      name: "background",
      type: "color",
      value: "{color.brand.primary}",
      isAlias: true,
    });

    const tools = buildRozettaTools({ workspaceId: "wA" });
    const out = await callTool<{ token: GetTokenResult | null }>(
      tools.rozetta_get_token.execute!(
        { path: "color.button.background" },
        { toolCallId: "c1", messages: [] }
      )
    );
    expect(out.token).not.toBeNull();
    expect(out.token!.tier).toBe("semantic");
    expect(out.token!.aliasChain.map((step) => step.path)).toEqual([
      "color.brand.primary",
      "color.primitive.red500",
    ]);
    expect(out.token!.aliasChain[1]?.value).toBe("#ff0000");

    const events = await runtime
      .getDb()
      .select()
      .from(schema.aiContextEvents)
      .where(eq(schema.aiContextEvents.workspaceId, "wA"));
    expect(events.find((e) => e.sourceId === "rozetta_get_token")).toBeTruthy();

    await runtime.closeDbForTests();
  });

  it("returns null when no token matches", async () => {
    prepareTestDatabase();
    const migration = await import("@/lib/db/migrate");
    const runtime = await import("@/lib/db/runtime");
    const schema = await import("@/lib/db/schema");
    const { buildRozettaTools } = await import("./tools");

    await migration.migrateRuntimeDatabase();
    await seedWorkspaceRow(runtime, schema, "wA");

    const tools = buildRozettaTools({ workspaceId: "wA" });
    const out = await callTool<{ token: GetTokenResult | null }>(
      tools.rozetta_get_token.execute!(
        { path: "missing.token" },
        { toolCallId: "c1", messages: [] }
      )
    );
    expect(out.token).toBeNull();

    await runtime.closeDbForTests();
  });
});

describe("rozetta_recent_changes", () => {
  it("orders changes by recency and respects kind + limit", async () => {
    prepareTestDatabase();
    const migration = await import("@/lib/db/migrate");
    const runtime = await import("@/lib/db/runtime");
    const schema = await import("@/lib/db/schema");
    const { buildRozettaTools } = await import("./tools");

    await migration.migrateRuntimeDatabase();
    await seedWorkspaceRow(runtime, schema, "wA");

    await seedAuditRow(runtime, schema, "wA", {
      id: "a1",
      kind: "token-collection.upsert",
      summary: "Updated core",
      createdAt: "2026-01-01T00:00:00.000Z",
      resourceType: "token-collection",
      resourceId: "core",
    });
    await seedAuditRow(runtime, schema, "wA", {
      id: "a2",
      kind: "theme.upsert",
      summary: "Updated light theme",
      createdAt: "2026-01-02T00:00:00.000Z",
      resourceType: "theme",
      resourceId: "light",
    });
    await seedAuditRow(runtime, schema, "wA", {
      id: "a3",
      kind: "component.upsert",
      summary: "Updated Button",
      createdAt: "2026-01-03T00:00:00.000Z",
      resourceType: "component",
      resourceId: "button",
    });

    const tools = buildRozettaTools({ workspaceId: "wA" });
    const all = await callTool<{ changes: RecentChangeRow[] }>(
      tools.rozetta_recent_changes.execute!(
        { limit: 10 },
        { toolCallId: "c1", messages: [] }
      )
    );
    expect(all.changes.map((c) => c.summary)).toEqual([
      "Updated Button",
      "Updated light theme",
      "Updated core",
    ]);

    const tokensOnly = await callTool<{ changes: RecentChangeRow[] }>(
      tools.rozetta_recent_changes.execute!(
        { kind: "token", limit: 10 },
        { toolCallId: "c2", messages: [] }
      )
    );
    expect(tokensOnly.changes.map((c) => c.kind)).toEqual(["token"]);

    const sinceMid = await callTool<{ changes: RecentChangeRow[] }>(
      tools.rozetta_recent_changes.execute!(
        { since: "2026-01-02T00:00:00.000Z", limit: 10 },
        { toolCallId: "c3", messages: [] }
      )
    );
    expect(sinceMid.changes.map((c) => c.summary)).toEqual([
      "Updated Button",
      "Updated light theme",
    ]);

    const limited = await callTool<{ changes: RecentChangeRow[] }>(
      tools.rozetta_recent_changes.execute!(
        { limit: 1 },
        { toolCallId: "c4", messages: [] }
      )
    );
    expect(limited.changes.length).toBe(1);

    const events = await runtime
      .getDb()
      .select()
      .from(schema.aiContextEvents)
      .where(eq(schema.aiContextEvents.workspaceId, "wA"));
    const calls = events.filter((row) => row.sourceId === "rozetta_recent_changes");
    expect(calls.length).toBe(4);

    await runtime.closeDbForTests();
  });
});
