import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("isLocalRuntimeAllowed", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.NEXT_RUNTIME;
    delete process.env.ROZETTA_HOSTED;
  });

  afterEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it("allows local Node runtime by default", async () => {
    const { isLocalRuntimeAllowed } = await import("./runtime");
    expect(isLocalRuntimeAllowed()).toBe(true);
  });

  it("rejects Vercel runtime", async () => {
    process.env.VERCEL = "1";
    const { isLocalRuntimeAllowed } = await import("./runtime");
    expect(isLocalRuntimeAllowed()).toBe(false);
  });

  it("rejects Vercel preview/prod via VERCEL_ENV", async () => {
    process.env.VERCEL_ENV = "production";
    const { isLocalRuntimeAllowed } = await import("./runtime");
    expect(isLocalRuntimeAllowed()).toBe(false);
  });

  it("rejects Edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const { isLocalRuntimeAllowed } = await import("./runtime");
    expect(isLocalRuntimeAllowed()).toBe(false);
  });

  it("rejects future hosted flag", async () => {
    process.env.ROZETTA_HOSTED = "1";
    const { isLocalRuntimeAllowed } = await import("./runtime");
    expect(isLocalRuntimeAllowed()).toBe(false);
  });
});
