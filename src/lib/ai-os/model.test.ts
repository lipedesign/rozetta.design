import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AiCommandInput,
  AiPatchProposal,
  AiProviderConfig,
} from "@/lib/workspace/types";

vi.mock("server-only", () => ({}));

const generateObjectMock = vi.fn();

vi.mock("ai", () => ({
  generateObject: generateObjectMock,
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: () => ({ languageModel: () => ({ id: "anthropic-mock" }) }),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => ({ languageModel: () => ({ id: "openai-mock" }) }),
}));

function buildCommand(): AiCommandInput {
  return {
    kind: "propose-fixes",
    prompt: "Suggest fixes for the workspace.",
    context: {
      sets: true,
      themes: true,
      brands: true,
      components: true,
      releases: true,
      git: true,
    },
    gitScope: "none",
    outputMode: "explain-only",
    targetScope: "workspace",
    workspace: {
      sets: [],
      baselineSets: [],
      themes: [],
      brands: [],
      components: [],
      exportProfiles: [],
    },
  };
}

function buildProvider(): AiProviderConfig {
  return {
    id: "provider-1",
    kind: "anthropic",
    label: "Anthropic test",
    enabled: true,
    model: { id: "claude-test", label: "Claude (test)" },
    hasApiKey: true,
    apiKey: "test-key",
    updatedAt: new Date().toISOString(),
  };
}

function validProposal(): AiPatchProposal {
  const now = new Date().toISOString();
  return {
    id: "proposal-test-1",
    title: "Test proposal",
    summary: "All good.",
    status: "pending",
    operations: [
      {
        type: "release-note.generate",
        notes: "Test release notes from mock.",
      },
    ],
    source: {
      taskKind: "propose-fixes",
      providerKind: "anthropic",
      modelId: "claude-test",
    },
    createdAt: now,
    updatedAt: now,
  };
}

describe("createModelAiProposal", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns the validated proposal from generateObject", async () => {
    const proposal = validProposal();
    generateObjectMock.mockResolvedValueOnce({ object: proposal });

    const { createModelAiProposal } = await import("./model");
    const result = await createModelAiProposal({
      command: buildCommand(),
      provider: buildProvider(),
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(proposal);
  });

  it("falls back to the deterministic proposal and surfaces the error on SDK failure", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("schema parse failed"));

    const { createModelAiProposal } = await import("./model");
    const result = await createModelAiProposal({
      command: buildCommand(),
      provider: buildProvider(),
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(result.source.providerKind).toBe("deterministic");
    expect(result.summary).toMatch(/schema parse failed/);
  });
});
