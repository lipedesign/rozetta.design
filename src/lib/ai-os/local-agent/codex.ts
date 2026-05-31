import "server-only";

import { runLocalCommand } from "./process";
import { redactSecrets, truncateForLog } from "./redaction";
import type { LocalAgentReadinessResult, LocalAgentRunInput, LocalAgentRunOutput } from "./types";

const DEFAULT_BINARY = "codex";
const READINESS_TIMEOUT_MS = 8_000;
const RUN_TIMEOUT_MS = 120_000;

function resolveBinary(executablePath?: string): string {
  if (typeof executablePath === "string") {
    const trimmed = executablePath.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return DEFAULT_BINARY;
}

export async function checkCodexReadiness(
  executablePath?: string
): Promise<LocalAgentReadinessResult> {
  const binary = resolveBinary(executablePath);
  const version = await runLocalCommand({
    command: binary,
    args: ["--version"],
    timeoutMs: READINESS_TIMEOUT_MS,
  });
  if (!version.ok) {
    const lower = (version.error || "").toLowerCase();
    if (lower.includes("enoent") || lower.includes("not found") || lower.includes("no such")) {
      return { readiness: "missing", detail: "codex binary not found on PATH." };
    }
    return {
      readiness: "misconfigured",
      detail: redactSecrets(truncateForLog(version.error, 512)),
    };
  }

  const auth = await runLocalCommand({
    command: binary,
    args: ["login", "status"],
    timeoutMs: READINESS_TIMEOUT_MS,
  });
  if (!auth.ok) {
    return {
      readiness: "unauthenticated",
      detail: redactSecrets(truncateForLog(auth.error || "codex login status failed", 512)),
    };
  }

  const out = auth.stdout.trim();
  if (/logged in/i.test(out)) {
    return { readiness: "ready" };
  }
  return { readiness: "unauthenticated", detail: "Run `codex login` to sign in." };
}

export async function runCodex(input: LocalAgentRunInput): Promise<LocalAgentRunOutput> {
  const binary = resolveBinary(input.providerExecutablePath);
  const combinedPrompt = `${input.system.trim()}\n\n---\n\n${input.prompt.trim()}`.trim();
  const result = await runLocalCommand({
    command: binary,
    args: [
      "exec",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--ephemeral",
      "--color",
      "never",
      "-",
    ],
    timeoutMs: input.timeoutMs ?? RUN_TIMEOUT_MS,
    signal: input.signal,
    input: combinedPrompt,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: redactSecrets(truncateForLog(result.error, 2048)),
    };
  }
  const text = result.stdout.trim();
  return { ok: true, text, raw: result.stdout };
}
