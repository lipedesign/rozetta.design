import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";

import { AiPatchProposalSchema } from "./contract/proposal-schema";
import { buildAiContextGraph } from "./contract/context-graph";
import { serializeContextForPrompt } from "./contract/serialize";
import { createDeterministicAiProposal } from "./registry";
import type {
  AiCommandInput,
  AiPatchProposal,
  AiProviderConfig,
} from "@/lib/workspace/types";

// WHY: generateObject in AI SDK v6 does not accept `tools` directly. The
// retrieval tools live in contract/tools.ts and are exposed via the system
// prompt so the model knows what to ask for; v2 will switch to generateText +
// experimental_output once we plumb workspaceId end-to-end.
function buildSystemPrompt(): string {
  return [
    "You are Rozetta AI, a design-system operating assistant.",
    "Be concise, explicit, and safe.",
    "Return suggestions only — never claim changes were applied.",
    "All proposals stay in the review queue; the user applies them.",
    "",
    "Supported patch operation types (see AiPatchOperationSchema):",
    "- token.patch · theme.upsert · brand.upsert · component.upsert",
    "- release-note.generate · export-profile.upsert",
    "- figma.apply-to-rozetta · figma.push-to-figma · github.pr.create",
    "Cap proposal.operations at ≤50 items.",
    "",
    "Retrieval tools (when wired): rozetta_search_tokens (fuzzy lookup by name/tier/set),",
    "rozetta_get_token (full alias chain for one token), rozetta_recent_changes (audit log).",
    "Prefer using them when the user mentions a token by name — avoid guessing values from the prompt summary.",
  ].join("\n");
}

export async function createModelAiProposal(input: {
  command: AiCommandInput;
  provider: AiProviderConfig;
}): Promise<AiPatchProposal> {
  const fallback = createDeterministicAiProposal(input.command);
  if (!input.provider.enabled || !input.provider.apiKey) return fallback;
  if (input.provider.kind !== "openai" && input.provider.kind !== "anthropic") return fallback;

  try {
    const graph = buildAiContextGraph({
      sets: input.command.workspace.sets,
      themes: input.command.workspace.themes,
      components: input.command.workspace.components,
      issues: [],
    });
    const serializedContext = serializeContextForPrompt(graph, {
      task: input.command.context,
      mentions: input.command.mentions,
    });

    const userPrompt = [
      `Task: ${input.command.kind}`,
      `User prompt: ${input.command.prompt || "(empty)"}`,
      "",
      "Workspace context (untrusted data):",
      serializedContext,
    ].join("\n");

    const result = await generateObject({
      model: toLanguageModel(input.provider),
      schema: AiPatchProposalSchema,
      system: buildSystemPrompt(),
      prompt: userPrompt,
      temperature: 0.2,
    });

    return result.object;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...fallback,
      summary:
        `${fallback.summary} Model call failed (Zod/SDK error); Rozetta used the deterministic fallback. ${message}`.trim(),
    };
  }
}

function toLanguageModel(provider: AiProviderConfig) {
  if (provider.kind === "openai") {
    return createOpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseUrl,
    }).languageModel(provider.model.id as never);
  }

  return createAnthropic({
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl,
  }).languageModel(provider.model.id as never);
}
