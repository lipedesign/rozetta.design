import "server-only";

import { runLocalCommand } from "./process";
import { redactSecrets, truncateForLog } from "./redaction";
import type { LocalAgentReadinessResult, LocalAgentRunInput, LocalAgentRunOutput } from "./types";

const DEFAULT_BINARY = "claude";
const READINESS_TIMEOUT_MS = 8_000;
const RUN_TIMEOUT_MS = 120_000;

function resolveBinary(executablePath?: string): string {
  if (typeof executablePath === "string") {
    const trimmed = executablePath.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return DEFAULT_BINARY;
}

export async function checkClaudeCodeReadiness(
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
      return { readiness: "missing", detail: "claude binary not found on PATH." };
    }
    return {
      readiness: "misconfigured",
      detail: redactSecrets(truncateForLog(version.error, 512)),
    };
  }

  const auth = await runLocalCommand({
    command: binary,
    args: ["auth", "status", "--json"],
    timeoutMs: READINESS_TIMEOUT_MS,
  });
  if (!auth.ok) {
    return {
      readiness: "unauthenticated",
      detail: redactSecrets(truncateForLog(auth.error || "claude auth status failed", 512)),
    };
  }

  // Auth output is JSON. Look for loggedIn=true. Do not surface raw output.
  try {
    const parsed = JSON.parse(auth.stdout.trim()) as { loggedIn?: boolean };
    if (parsed && parsed.loggedIn === true) {
      return { readiness: "ready" };
    }
    return { readiness: "unauthenticated", detail: "Run `claude auth login` to sign in." };
  } catch {
    // If JSON parse fails, fall back to a loose match without exposing the body.
    if (/loggedIn"\s*:\s*true/.test(auth.stdout)) {
      return { readiness: "ready" };
    }
    return { readiness: "unknown", detail: "Could not parse claude auth status output." };
  }
}

export async function runClaudeCode(input: LocalAgentRunInput): Promise<LocalAgentRunOutput> {
  const binary = resolveBinary(input.providerExecutablePath);
  const combinedPrompt = `${input.system.trim()}\n\n---\n\n${input.prompt.trim()}`.trim();
  const result = await runLocalCommand({
    command: binary,
    args: ["--print", "--output-format", "text"],
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
