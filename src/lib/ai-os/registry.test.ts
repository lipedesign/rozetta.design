import { describe, expect, it } from "vitest";

import type { TokenSet } from "@/lib/dtcg/types";
import type { Theme } from "@/lib/themes/types";
import type {
  AiPatchProposal,
  AiWorkspaceDraft,
  Brand,
  DesignSystemComponent,
  ExportProfile,
} from "@/lib/workspace/types";
import {
  appendAiConversationMessages,
  applyAiPatchToWorkspaceDraft,
  createAssistantConversationMessage,
  createDefaultAiSettings,
  createDefaultAiConversation,
  createDeterministicAiProposal,
  createModelAiProposal,
  createUserConversationMessage,
  buildAiReasoningSteps,
  buildAiToolCalls,
  listAiSlashCommands,
  listSyncConnectors,
  mergeAiSettings,
  normalizeAiConversation,
  previewAiPatch,
  redactAiSettings,
  searchAiMentions,
  shouldQueueAiProposal,
} from "./registry";

const sets: TokenSet[] = [
  {
    id: "core",
    name: "Core",
    filename: "core.tokens.json",
    root: {
      color: {
        $type: "color",
        brand: {
          $value: "#ffcc00",
        },
      },
    },
  },
];

const themes: Theme[] = [
  {
    id: "light",
    name: "Light",
    sets: [{ setId: "core", mode: "enabled" }],
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const brands: Brand[] = [
  {
    id: "acme",
    name: "Acme",
    slug: "acme",
    status: "draft",
    tokenSetIds: ["missing"],
    themeIds: ["light"],
    exportProfileIds: [],
    componentIds: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const components: DesignSystemComponent[] = [
  {
    id: "button",
    name: "Button",
    slug: "button",
    category: "Core",
    status: "ready",
    tokenRefs: ["core:color.brand", "core:missing"],
    variants: [],
    props: [],
    states: [],
    bindings: { code: [{ source: "" }], figma: [] },
    brandIds: ["missing-brand"],
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const profiles: ExportProfile[] = [];

function draft(): AiWorkspaceDraft {
  return {
    sets: JSON.parse(JSON.stringify(sets)) as TokenSet[],
    themes: JSON.parse(JSON.stringify(themes)) as Theme[],
    brands: JSON.parse(JSON.stringify(brands)) as Brand[],
    components: JSON.parse(JSON.stringify(components)) as DesignSystemComponent[],
    exportProfiles: [],
  };
}

function proposal(operations: AiPatchProposal["operations"]): AiPatchProposal {
  return {
    id: "patch",
    title: "Patch",
    summary: "Patch summary",
    status: "pending",
    operations,
    source: {
      taskKind: "propose-fixes",
      providerKind: "deterministic",
      modelId: "rozetta-deterministic-v1",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("AI OS registry", () => {
  it("falls back to deterministic proposals without a provider key", () => {
    const patch = createDeterministicAiProposal({
      kind: "propose-fixes",
      prompt: "fix workspace",
      context: {
        sets: true,
        themes: true,
        brands: true,
        components: true,
        releases: true,
        git: true,
      },
      workspace: { sets, themes, brands, components, exportProfiles: profiles },
    });

    expect(patch.source.providerKind).toBe("deterministic");
    expect(patch.operations.length).toBeGreaterThan(0);
  });

  it("redacts and preserves local provider keys", () => {
    const existing = createDefaultAiSettings();
    existing.providers = existing.providers.map((provider) =>
      provider.id === "openai" ? { ...provider, apiKey: "secret", hasApiKey: true } : provider
    );
    const incoming = redactAiSettings(existing);
    const merged = mergeAiSettings(existing, incoming);

    expect(redactAiSettings(existing).providers.find((provider) => provider.id === "openai")?.apiKey).toBeUndefined();
    expect(merged.providers.find((provider) => provider.id === "openai")?.apiKey).toBe("secret");
  });

  it("validates missing patch targets", () => {
    const review = previewAiPatch(
      proposal([{ type: "token.patch", setId: "missing", path: "color.brand", patch: { $type: "color" } }]),
      draft()
    );

    expect(review.ok).toBe(false);
    expect(review.issues[0]?.title).toBe("Token target is missing");
  });

  it("applies token, theme, brand, component, export profile and release note patches", () => {
    const result = applyAiPatchToWorkspaceDraft(
      proposal([
        { type: "token.patch", setId: "core", path: "color.brand", patch: { $type: "color" } },
        {
          type: "theme.upsert",
          theme: { id: "dark", name: "Dark", sets: [], updatedAt: "2026-01-01T00:00:00.000Z" },
        },
        { type: "brand.upsert", brand: { ...brands[0]!, tokenSetIds: ["core"] } },
        { type: "component.upsert", component: { ...components[0]!, brandIds: [] } },
        {
          type: "export-profile.upsert",
          profile: {
            id: "css",
            name: "CSS",
            targetKind: "set",
            targetId: "core",
            format: "css",
            destination: "preview/download",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        { type: "release-note.generate", notes: "Release notes" },
      ]),
      draft()
    );

    expect(result.ok).toBe(true);
    expect(result.draft?.sets[0]?.root.color).toHaveProperty("brand.$type", "color");
    expect(result.draft?.themes.map((theme) => theme.id)).toContain("dark");
    expect(result.draft?.brands[0]?.tokenSetIds).toEqual(["core"]);
    expect(result.draft?.components[0]?.brandIds).toEqual([]);
    expect(result.draft?.exportProfiles[0]?.id).toBe("css");
    expect(result.draft?.releaseNotes).toBe("Release notes");
  });

  it("lists active and planned sync connectors", () => {
    const connectors = listSyncConnectors();

    expect(connectors.map((connector) => connector.id)).toEqual(
      expect.arrayContaining(["figma", "dtcg-file", "code", "generic-design-tool"])
    );
    expect(connectors.find((connector) => connector.id === "figma")?.readiness).toBe("active");
    expect(connectors.find((connector) => connector.id === "figma")?.route).toBe("/sync/figma");
  });

  it("searches structured AI mentions across workspace entities", () => {
    const mentions = searchAiMentions(
      {
        sets,
        themes,
        brands,
        components,
        exportProfiles: profiles,
        git: {
          available: true,
          branch: "main",
          ahead: 0,
          behind: 0,
          clean: false,
          files: [
            {
              path: "tokens/core.tokens.json",
              indexStatus: "M",
              worktreeStatus: "M",
              kind: "modified",
            },
          ],
          tokenFiles: [],
          designSystemFiles: [],
        },
      },
      "button"
    );

    expect(mentions.map((mention) => mention.kind)).toContain("component");
    expect(mentions.find((mention) => mention.kind === "component")?.label).toBe("Button");
  });

  it("maps slash commands to task kinds", () => {
    const commands = listAiSlashCommands();

    expect(commands.find((command) => command.id === "semantic-diff")?.taskKind).toBe(
      "workspace-question"
    );
    expect(commands.find((command) => command.id === "propose-fixes")?.taskKind).toBe(
      "propose-fixes"
    );
  });

  it("builds read-only AI tools and reasoning steps without mutating workspace", () => {
    const command = {
      kind: "propose-fixes" as const,
      prompt: "fix this",
      context: {
        sets: true,
        themes: true,
        brands: true,
        components: true,
        releases: true,
        git: true,
      },
      mentions: searchAiMentions({ sets, themes, brands, components, exportProfiles: profiles }, "core"),
      toolPreference: "read-only" as const,
      workspace: { sets, themes, brands, components, exportProfiles: profiles },
    };

    const tools = buildAiToolCalls(command);
    const steps = buildAiReasoningSteps(command);

    expect(tools[0]?.name).toBe("validate_workspace");
    expect(steps.map((step) => step.title)).toContain("Run read-only tools");
    expect(sets[0]?.root.color).toHaveProperty("brand.$value", "#ffcc00");
  });

  it("normalizes and limits persisted AI conversation messages", () => {
    const base = createDefaultAiConversation("2026-01-01T00:00:00.000Z");
    const messages = Array.from({ length: 105 }, (_, index) => ({
      id: `message-${index}`,
      role: "user" as const,
      content: `Message ${index}`,
      createdAt: `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`,
      status: "ready" as const,
    }));

    const conversation = appendAiConversationMessages(base, messages);
    const normalized = normalizeAiConversation(conversation);

    expect(normalized.messages).toHaveLength(100);
    expect(normalized.messages[0]?.id).toBe("message-5");
    expect(normalizeAiConversation({}).messages).toEqual([]);
  });

  it("creates user and assistant conversation messages with structured metadata", () => {
    const command = {
      kind: "propose-fixes" as const,
      prompt: "Fix missing token metadata",
      context: {
        sets: true,
        themes: true,
        brands: true,
        components: true,
        releases: true,
        git: true,
      },
      workspace: { sets, themes, brands, components, exportProfiles: profiles },
    };
    const patch = proposal([
      { type: "token.patch", setId: "core", path: "color.brand", patch: { $type: "color" } },
    ]);
    const user = createUserConversationMessage({
      command,
      now: "2026-01-01T00:00:00.000Z",
    });
    const assistant = createAssistantConversationMessage({
      command,
      proposal: patch,
      patchQueued: shouldQueueAiProposal(patch),
      now: "2026-01-01T00:00:01.000Z",
    });

    expect(user.role).toBe("user");
    expect(user.content).toBe("Fix missing token metadata");
    expect(assistant.role).toBe("assistant");
    expect(assistant.patchId).toBe("patch");
    expect(assistant.content).toContain("queued");
  });

  it("keeps explanatory AI output out of the review queue", () => {
    const explanatory = createDeterministicAiProposal({
      kind: "workspace-question",
      prompt: "What changed?",
      context: {
        sets: true,
        themes: true,
        brands: true,
        components: true,
        releases: true,
        git: true,
      },
      workspace: { sets, themes, brands, components: [], exportProfiles: profiles },
    });
    const modelAssisted = createModelAiProposal({
      baseProposal: explanatory,
      provider: {
        kind: "openai",
        model: { id: "gpt-test", label: "GPT test" },
      },
      modelText: "Nothing to apply.",
    });

    expect(explanatory.operations).toHaveLength(0);
    expect(shouldQueueAiProposal(explanatory)).toBe(false);
    expect(modelAssisted.operations).toHaveLength(0);
    expect(shouldQueueAiProposal(modelAssisted)).toBe(false);
  });
});
