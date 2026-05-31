import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

interface SpawnCall {
  command: string;
  args: string[];
  options: { cwd?: string; env?: Record<string, string>; shell?: unknown; stdio?: unknown };
}

const spawnCalls: SpawnCall[] = [];

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = {
    end: vi.fn(),
  };
  killed = false;
  killSignal: string | undefined;
  kill = vi.fn((signal?: string) => {
    this.killed = true;
    this.killSignal = signal;
    return true;
  });
}

let currentChild: FakeChild | null = null;

vi.mock("node:child_process", () => ({
  spawn: (command: string, args: string[], options: SpawnCall["options"]) => {
    spawnCalls.push({ command, args, options });
    currentChild = new FakeChild();
    return currentChild;
  },
}));

describe("runLocalCommand", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    spawnCalls.length = 0;
    currentChild = null;
    process.env.PATH = "/usr/bin";
    process.env.HOME = "/home/test";
    process.env.OPENAI_API_KEY = "should-not-leak";
    process.env.SOME_SECRET = "should-not-leak";
  });

  afterEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it("passes args as an array and never uses shell:true", async () => {
    const { runLocalCommand } = await import("./process");
    const promise = runLocalCommand({ command: "claude", args: ["--version"], timeoutMs: 1000 });
    // Trigger successful close.
    setImmediate(() => {
      currentChild!.stdout.emit("data", Buffer.from("2.1.132\n"));
      currentChild!.emit("close", 0);
    });
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(spawnCalls).toHaveLength(1);
    expect(Array.isArray(spawnCalls[0]!.args)).toBe(true);
    expect(spawnCalls[0]!.options.shell).toBeUndefined();
  });

  it("only passes the env allowlist, never API keys", async () => {
    const { runLocalCommand } = await import("./process");
    const promise = runLocalCommand({ command: "claude", args: [], timeoutMs: 1000 });
    setImmediate(() => currentChild!.emit("close", 0));
    await promise;
    const env = spawnCalls[0]!.options.env ?? {};
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/home/test");
    expect("OPENAI_API_KEY" in env).toBe(false);
    expect("SOME_SECRET" in env).toBe(false);
  });

  it("rejects empty command", async () => {
    const { runLocalCommand } = await import("./process");
    const result = await runLocalCommand({ command: "", args: [], timeoutMs: 1000 });
    expect(result.ok).toBe(false);
  });

  it("rejects non-array args", async () => {
    const { runLocalCommand } = await import("./process");
    // @ts-expect-error testing runtime validation
    const result = await runLocalCommand({ command: "claude", args: "--version" });
    expect(result.ok).toBe(false);
  });

  it("kills the child on timeout and surfaces error", async () => {
    const { runLocalCommand } = await import("./process");
    const promise = runLocalCommand({ command: "claude", args: [], timeoutMs: 10 });
    // Don't emit close — let it timeout.
    setTimeout(() => {
      // The timer fires kill; we need to emit close to settle the promise
      if (currentChild?.killed) {
        currentChild.emit("close", null);
      }
    }, 30);
    const result = await promise;
    expect(currentChild!.kill).toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/timed out/i);
    }
  });

  it("kills the child on abort signal", async () => {
    const { runLocalCommand } = await import("./process");
    const controller = new AbortController();
    const promise = runLocalCommand({
      command: "claude",
      args: [],
      timeoutMs: 5000,
      signal: controller.signal,
    });
    setImmediate(() => {
      controller.abort();
      setImmediate(() => currentChild!.emit("close", null));
    });
    const result = await promise;
    expect(currentChild!.kill).toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/abort/i);
    }
  });
});
