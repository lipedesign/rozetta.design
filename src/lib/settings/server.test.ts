import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ORIGINAL_ENV = { ...process.env };

describe("settings server helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("redacts the password from a postgres connection URL", async () => {
    const { redactDatabaseUrl } = await import("./server");
    const out = redactDatabaseUrl(
      "postgresql://user:s3cret@db.example.com:5432/postgres"
    );
    expect(out).toContain("user:***@db.example.com");
    expect(out).not.toContain("s3cret");
  });

  it("returns 'Configured' when the URL is unparseable", async () => {
    const { redactDatabaseUrl } = await import("./server");
    expect(redactDatabaseUrl("not a url")).toBe("Configured");
  });

  it("reports pglite as configured when ROZETTA_DB_DRIVER=pglite", async () => {
    process.env.ROZETTA_DB_DRIVER = "pglite";
    delete process.env.DATABASE_URL;
    delete process.env.SUPABASE_DB_PASSWORD;
    const { isWorkspaceDbConfigured, readStorageStatus } = await import("./server");
    expect(isWorkspaceDbConfigured()).toBe(true);
    const status = readStorageStatus();
    expect(status.driver).toBe("pglite");
    expect(status.databaseLabel).toContain("PGlite");
  });

  it("reports not configured when no DATABASE_URL or password is set", async () => {
    delete process.env.ROZETTA_DB_DRIVER;
    delete process.env.DATABASE_URL;
    delete process.env.SUPABASE_DB_PASSWORD;
    const { isWorkspaceDbConfigured, readStorageStatus } = await import("./server");
    expect(isWorkspaceDbConfigured()).toBe(false);
    expect(readStorageStatus().databaseLabel).toBe("Not configured");
  });

  it("rejects DATABASE_URL placeholders as not configured", async () => {
    delete process.env.ROZETTA_DB_DRIVER;
    process.env.DATABASE_URL =
      "postgresql://postgres:[YOUR-PASSWORD]@host.example.com:5432/postgres";
    delete process.env.SUPABASE_DB_PASSWORD;
    const { isWorkspaceDbConfigured } = await import("./server");
    expect(isWorkspaceDbConfigured()).toBe(false);
  });

  it("reads the app version from package.json", async () => {
    const { readRuntimeInfo } = await import("./server");
    const info = await readRuntimeInfo();
    expect(info.appVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(info.nodeVersion).toBe(process.versions.node);
    expect(info.nextRuntime).toBe("nodejs");
  });
});
