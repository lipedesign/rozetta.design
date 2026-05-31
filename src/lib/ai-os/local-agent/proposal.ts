import "server-only";

import { AiPatchProposalSchema } from "../contract/proposal-schema";
import type { AiCommandInput, AiPatchProposal, AiProviderConfig } from "@/lib/workspace/types";

export interface ConvertLocalOutputInput {
  rawOutput: string;
  provider: AiProviderConfig;
  command: AiCommandInput;
  baseProposal: AiPatchProposal;
}

interface ParsedLocalMessage {
  message?: string;
  operations?: unknown;
}

function tryParseStructured(text: string): ParsedLocalMessage | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const value = JSON.parse(trimmed) as ParsedLocalMessage;
    if (!value || typeof value !== "object") return null;
    return value;
  } catch {
    return null;
  }
}

function extractJsonFromMaybeFenced(text: string): unknown | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const candidate = fenceMatch ? fenceMatch[1] ?? text : text;
  const trimmed = candidate.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

// v1.1: try Zod parse first (full structured proposal). On failure, fall back
// to chat-only message preserved as `summary`. Existing chat-only behavior is
// untouched when the model returns free text.
export function convertLocalOutputToProposal(input: ConvertLocalOutputInput): AiPatchProposal {
  const now = new Date().toISOString();

  const maybeJson = extractJsonFromMaybeFenced(input.rawOutput);
  if (maybeJson) {
    const parsed = AiPatchProposalSchema.safeParse(maybeJson);
    if (parsed.success) {
      return {
        ...parsed.data,
        source: {
          taskKind: parsed.data.source.taskKind,
          providerKind: input.provider.kind,
          modelId: input.provider.model.id,
        },
        updatedAt: now,
      };
    }
  }

  const parsed = tryParseStructured(input.rawOutput);
  const message =
    parsed && typeof parsed.message === "string" && parsed.message.trim().length > 0
      ? parsed.message.trim()
      : input.rawOutput.trim();
  const summary = message || input.baseProposal.summary;

  return {
    ...input.baseProposal,
    id: `${input.baseProposal.id}-local`,
    title: `${input.baseProposal.title} · ${input.provider.label}`,
    summary,
    status: "pending",
    operations: input.baseProposal.operations,
    source: {
      taskKind: input.baseProposal.source.taskKind,
      providerKind: input.provider.kind,
      modelId: input.provider.model.id,
    },
    createdAt: now,
    updatedAt: now,
  };
}
