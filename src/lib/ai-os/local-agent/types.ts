import "server-only";

import type { AiCommandInput, AiProviderConfig } from "@/lib/workspace/types";

export type AiLocalProviderReadiness =
  | "ready"
  | "missing"
  | "unauthenticated"
  | "disabled-runtime"
  | "misconfigured"
  | "unknown";

export type LocalProviderId = "claude-code-local" | "codex-local";

export type LocalProviderKind = LocalProviderId;

export interface LocalAgentRunInput {
  kind: LocalProviderKind;
  command: AiCommandInput;
  providerExecutablePath?: string;
  prompt: string;
  system: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type LocalAgentRunOutput =
  | { ok: true; text: string; raw: string }
  | { ok: false; error: string; readiness?: AiLocalProviderReadiness };

export interface LocalAgentReadinessResult {
  readiness: AiLocalProviderReadiness;
  detail?: string;
}

export interface LocalProviderRuntimeContext {
  provider: AiProviderConfig;
  command: AiCommandInput;
}

export function isLocalProviderKind(value: unknown): value is LocalProviderKind {
  return value === "claude-code-local" || value === "codex-local";
}
