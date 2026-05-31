import "server-only";

import { checkClaudeCodeReadiness, runClaudeCode } from "./claude-code";
import { checkCodexReadiness, runCodex } from "./codex";
import { buildLocalPrompt } from "./prompt";
import { convertLocalOutputToProposal } from "./proposal";
import { isLocalRuntimeAllowed } from "./runtime";
import {
  isLocalProviderKind,
  type AiLocalProviderReadiness,
  type LocalAgentReadinessResult,
} from "./types";
import type { AiCommandInput, AiPatchProposal, AiProviderConfig } from "@/lib/workspace/types";

export type RunLocalProviderResult =
  | { ok: true; proposal: AiPatchProposal }
  | { ok: false; error: string; readiness?: AiLocalProviderReadiness };

export interface RunLocalProviderInput {
  command: AiCommandInput;
  provider: AiProviderConfig;
  baseProposal: AiPatchProposal;
}

export async function runLocalProvider(
  input: RunLocalProviderInput
): Promise<RunLocalProviderResult> {
  if (!isLocalRuntimeAllowed()) {
    return {
      ok: false,
      error: "Local providers are disabled in this runtime.",
      readiness: "disabled-runtime",
    };
  }
  if (!isLocalProviderKind(input.provider.kind)) {
    return { ok: false, error: `Unsupported local provider kind: ${input.provider.kind}` };
  }

  const { system, user } = buildLocalPrompt({ command: input.command });

  const runner = input.provider.kind === "claude-code-local" ? runClaudeCode : runCodex;
  const result = await runner({
    kind: input.provider.kind,
    command: input.command,
    providerExecutablePath: input.provider.executablePath,
    prompt: user,
    system,
  });

  if (!result.ok) {
    return { ok: false, error: result.error, readiness: result.readiness };
  }

  const proposal = convertLocalOutputToProposal({
    rawOutput: result.text || result.raw,
    provider: input.provider,
    command: input.command,
    baseProposal: input.baseProposal,
  });

  return { ok: true, proposal };
}

export async function checkLocalReadiness(
  provider: AiProviderConfig
): Promise<LocalAgentReadinessResult> {
  if (!isLocalRuntimeAllowed()) {
    return { readiness: "disabled-runtime", detail: "Hosted/Edge runtime." };
  }
  if (!isLocalProviderKind(provider.kind)) {
    return { readiness: "unknown", detail: "Provider is not a local kind." };
  }
  if (provider.kind === "claude-code-local") {
    return checkClaudeCodeReadiness(provider.executablePath);
  }
  return checkCodexReadiness(provider.executablePath);
}

export type {
  AiLocalProviderReadiness,
  LocalAgentReadinessResult,
  LocalAgentRunInput,
  LocalAgentRunOutput,
  LocalProviderId,
} from "./types";
