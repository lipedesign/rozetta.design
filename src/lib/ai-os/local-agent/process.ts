import "server-only";

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import os from "node:os";

import { redactSecrets, truncateForLog } from "./redaction";

const MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const ENV_ALLOWLIST = ["PATH", "HOME", "SHELL", "TMPDIR", "LANG", "LC_ALL"] as const;

export interface RunLocalCommandOptions {
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  input?: string;
}

export type RunLocalCommandResult =
  | { ok: true; stdout: string; stderr: string; exitCode: number }
  | { ok: false; error: string; stdout?: string; stderr?: string; exitCode?: number };

export async function runLocalCommand(opts: RunLocalCommandOptions): Promise<RunLocalCommandResult> {
  if (typeof opts.command !== "string" || opts.command.trim() === "") {
    return { ok: false, error: "Local command name is required." };
  }
  if (!Array.isArray(opts.args)) {
    return { ok: false, error: "Local command arguments must be an array." };
  }

  const env: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    const value = process.env[key];
    if (typeof value === "string") env[key] = value;
  }

  const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs! > 0
    ? opts.timeoutMs!
    : DEFAULT_TIMEOUT_MS;
  const cwd = opts.cwd && opts.cwd.length > 0 ? opts.cwd : os.tmpdir();

  return new Promise<RunLocalCommandResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let overflow: "stdout" | "stderr" | null = null;

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(opts.command, opts.args, {
        cwd,
        env: env as NodeJS.ProcessEnv,
        stdio: ["pipe", "pipe", "pipe"],
        // Never use shell: true. Never pass shell.
      });
    } catch (err) {
      resolve({
        ok: false,
        error: redactSecrets(truncateForLog(err instanceof Error ? err.message : String(err), 1024)),
      });
      return;
    }

    const finish = (result: RunLocalCommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, timeoutMs);

    const onAbort = () => {
      aborted = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    };
    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort();
      } else {
        opts.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > MAX_BUFFER_BYTES) {
        overflow = "stdout";
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        return;
      }
      stdout += chunk.toString("utf8");
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > MAX_BUFFER_BYTES) {
        overflow = "stderr";
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        return;
      }
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      finish({
        ok: false,
        error: redactSecrets(truncateForLog(err instanceof Error ? err.message : String(err), 1024)),
      });
    });

    child.on("close", (code) => {
      if (overflow) {
        finish({
          ok: false,
          error: `Local process output exceeded ${MAX_BUFFER_BYTES} bytes on ${overflow}.`,
          stdout,
          stderr,
          exitCode: typeof code === "number" ? code : undefined,
        });
        return;
      }
      if (aborted) {
        finish({ ok: false, error: "Local process was aborted." });
        return;
      }
      if (timedOut) {
        finish({ ok: false, error: `Local process timed out after ${timeoutMs}ms.` });
        return;
      }
      if (typeof code === "number" && code !== 0) {
        finish({
          ok: false,
          error: redactSecrets(truncateForLog(stderr.trim() || `Local process exited with code ${code}.`, 1024)),
          stdout,
          stderr,
          exitCode: code,
        });
        return;
      }
      finish({ ok: true, stdout, stderr, exitCode: typeof code === "number" ? code : 0 });
    });

    if (opts.input !== undefined) {
      try {
        child.stdin?.end(opts.input);
      } catch (err) {
        finish({
          ok: false,
          error: redactSecrets(truncateForLog(err instanceof Error ? err.message : String(err), 1024)),
        });
      }
    } else {
      try {
        child.stdin?.end();
      } catch {
        // ignore
      }
    }
  });
}
