import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (
      err: NodeJS.ErrnoException | null,
      out: { stdout: string; stderr: string }
    ) => void
  ) => {
    cb(null, {
      stdout: "https://github.com/example/repo/releases/tag/v1.2.3\n",
      stderr: "",
    });
  },
}));

describe("createGitHubRelease", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.VERCEL;
    delete process.env.NEXT_RUNTIME;
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("refuses to run on hosted runtime", async () => {
    process.env.VERCEL = "1";
    const { createGitHubRelease } = await import("./releases");
    const result = await createGitHubRelease({
      tag: "v1.2.3",
      name: "Release",
      body: "notes",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/hosted runtime/i);
    }
  });

  it("refuses to run on edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const { createGitHubRelease } = await import("./releases");
    const result = await createGitHubRelease({
      tag: "v1.2.3",
      name: "Release",
      body: "notes",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid tags", async () => {
    const { createGitHubRelease } = await import("./releases");
    for (const tag of [
      "",
      "not-a-version",
      "1.2",
      "1.2.3.4",
      "v1.2.3-rc 1",
      "v1.2.3;rm -rf /",
    ]) {
      const result = await createGitHubRelease({
        tag,
        name: "Release",
        body: "notes",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/tag/i);
      }
    }
  });

  it("accepts semver-ish tags", async () => {
    const { createGitHubRelease } = await import("./releases");
    for (const tag of ["1.2.3", "v1.2.3", "v1.2.3-rc.1", "v1.2.3+build.5"]) {
      const result = await createGitHubRelease({
        tag,
        name: "Release",
        body: "notes",
      });
      expect(result.ok, `tag ${tag} should be accepted`).toBe(true);
      if (result.ok) {
        expect(result.url).toMatch(/^https?:\/\//);
      }
    }
  });

  it("rejects invalid release names", async () => {
    const { createGitHubRelease } = await import("./releases");
    const result = await createGitHubRelease({
      tag: "v1.2.3",
      name: "",
      body: "notes",
    });
    expect(result.ok).toBe(false);
  });

  it("accepts the default release name with an em dash", async () => {
    const { createGitHubRelease } = await import("./releases");
    const result = await createGitHubRelease({
      tag: "v1.2.3",
      name: "Design tokens — 2026-05-12",
      body: "notes",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects invalid target refs", async () => {
    const { createGitHubRelease } = await import("./releases");
    const result = await createGitHubRelease({
      tag: "v1.2.3",
      name: "Release",
      body: "notes",
      target: "bad ref name",
    });
    expect(result.ok).toBe(false);
  });
});

describe("checkGhReleaseReadiness", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.VERCEL;
    delete process.env.NEXT_RUNTIME;
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("reports hosted runtime as not ready", async () => {
    process.env.VERCEL = "1";
    const { checkGhReleaseReadiness } = await import("./releases");
    const result = await checkGhReleaseReadiness();
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.reason).toMatch(/hosted runtime/i);
    }
  });
});
