import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe("Figma writeback draft repository", () => {
  it("creates a new draft and increments seq when the payload changes", async () => {
    prepareTestDatabase();
    const runtime = await import("@/lib/db/runtime");
    const migration = await import("@/lib/db/migrate");
    const repo = await import("@/lib/db/repositories/figma-writeback");

    await migration.migrateRuntimeDatabase();

    const first = await repo.upsertFigmaWritebackDraft({ payloadJson: JSON.stringify({ v: 1 }) });
    expect(first.changed).toBe(true);
    expect(first.draft.seq).toBe(1);

    const second = await repo.upsertFigmaWritebackDraft({ payloadJson: JSON.stringify({ v: 2 }) });
    expect(second.changed).toBe(true);
    expect(second.draft.seq).toBe(2);

    await runtime.closeDbForTests();
  });

  it("is idempotent: identical payloads do not bump seq", async () => {
    prepareTestDatabase();
    const runtime = await import("@/lib/db/runtime");
    const migration = await import("@/lib/db/migrate");
    const repo = await import("@/lib/db/repositories/figma-writeback");

    await migration.migrateRuntimeDatabase();

    const payloadJson = JSON.stringify({ v: 1, items: ["a", "b"] });
    const first = await repo.upsertFigmaWritebackDraft({ payloadJson });
    const second = await repo.upsertFigmaWritebackDraft({ payloadJson });

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.draft.seq).toBe(first.draft.seq);

    await runtime.closeDbForTests();
  });

  it("rejects apply with a stale ackSeq", async () => {
    prepareTestDatabase();
    const runtime = await import("@/lib/db/runtime");
    const migration = await import("@/lib/db/migrate");
    const repo = await import("@/lib/db/repositories/figma-writeback");

    await migration.migrateRuntimeDatabase();

    const v1 = await repo.upsertFigmaWritebackDraft({ payloadJson: JSON.stringify({ v: 1 }) });
    const v2 = await repo.upsertFigmaWritebackDraft({ payloadJson: JSON.stringify({ v: 2 }) });

    const staleApply = await repo.applyFigmaWritebackResultToDb({
      syncRunId: v1.draft.syncRunId ?? "",
      ackSeq: v1.draft.seq,
      status: "applied",
      summary: "stale ack",
      operations: [],
    });
    expect(staleApply.ok).toBe(false);

    const freshApply = await repo.applyFigmaWritebackResultToDb({
      syncRunId: v2.draft.syncRunId ?? "",
      ackSeq: v2.draft.seq,
      status: "applied",
      summary: "fresh ack",
      operations: [],
    });
    expect(freshApply.ok).toBe(true);

    const after = await repo.getFigmaWritebackDraft();
    expect(after?.deliveredSeq).toBe(v2.draft.seq);

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
