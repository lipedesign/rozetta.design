import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { TokenSet } from "@/lib/dtcg/types";
import type { Theme } from "@/lib/themes/types";
import type {
  AiMentionContext,
  AiTaskContext,
  DesignSystemComponent,
  ValidationIssue,
} from "@/lib/workspace/types";

import { buildAiContextGraph, type AiContextGraph } from "./context-graph";
import { serializeContextForPrompt } from "./serialize";

const defaultTask: AiTaskContext = {
  sets: true,
  themes: true,
  brands: false,
  components: true,
  releases: false,
  git: false,
};

function emptyGraph(): AiContextGraph {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    tokens: [],
    themes: [],
    aliasEdges: [],
    componentUsages: [],
    issues: [],
  };
}

function manyTokensGraph(count: number): AiContextGraph {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    tokens: Array.from({ length: count }, (_, i) => ({
      setId: "core",
      path: `color.token-${String(i).padStart(4, "0")}`,
      type: "color",
      value: "#000000",
      tier: "primitive" as const,
      referencedBy: [],
      consumedBy: [],
      hasSemanticMetadata: false,
    })),
    themes: [],
    aliasEdges: [],
    componentUsages: [],
    issues: [],
  };
}

describe("serializeContextForPrompt", () => {
  it("returns valid JSON with summary for empty graph", () => {
    const out = serializeContextForPrompt(emptyGraph(), { task: defaultTask });
    const payload = JSON.parse(out);
    expect(payload.summary.totalTokens).toBe(0);
    expect(payload.summary.rendered).toBe(0);
    expect(payload.tokens).toEqual([]);
    expect(payload.schemaVersion).toBe(1);
  });

  it("caps at 200 tokens by default", () => {
    const graph = manyTokensGraph(300);
    const out = serializeContextForPrompt(graph, { task: defaultTask });
    const payload = JSON.parse(out);
    expect(payload.summary.totalTokens).toBe(300);
    expect(payload.summary.rendered).toBe(200);
    expect(payload.tokens).toHaveLength(200);
  });

  it("respects an explicit maxTokens option", () => {
    const graph = manyTokensGraph(50);
    const out = serializeContextForPrompt(
      graph,
      { task: defaultTask },
      { maxTokens: 5 }
    );
    const payload = JSON.parse(out);
    expect(payload.tokens).toHaveLength(5);
  });

  it("ranks mentioned primitives above semantic/component tokens", () => {
    const graph: AiContextGraph = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      tokens: [
        {
          setId: "core",
          path: "color.primitive-mentioned",
          tier: "primitive",
          value: "#fff",
          referencedBy: [],
          consumedBy: [],
          hasSemanticMetadata: false,
        },
        {
          setId: "core",
          path: "color.semantic-unmentioned",
          tier: "semantic",
          value: "{color.brand}",
          referencedBy: [],
          consumedBy: ["button"],
          hasSemanticMetadata: false,
        },
        {
          setId: "core",
          path: "color.component-unmentioned",
          tier: "component",
          value: "#000",
          referencedBy: [],
          consumedBy: ["badge"],
          hasSemanticMetadata: false,
        },
      ],
      themes: [],
      aliasEdges: [],
      componentUsages: [],
      issues: [],
    };
    const mentions: AiMentionContext[] = [
      {
        id: "core:color.primitive-mentioned",
        kind: "token",
        label: "color.primitive-mentioned",
        description: "",
        path: "core:color.primitive-mentioned",
        payloadPreview: "",
      },
    ];

    const out = serializeContextForPrompt(graph, { task: defaultTask, mentions });
    const payload = JSON.parse(out);
    expect(payload.tokens[0].id).toBe("core:color.primitive-mentioned");
  });

  it("bumps recent-change paths above non-mentioned consumed-by tokens", () => {
    const graph: AiContextGraph = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      tokens: [
        {
          setId: "core",
          path: "color.recent",
          tier: "primitive",
          value: "#111",
          referencedBy: [],
          consumedBy: [],
          hasSemanticMetadata: false,
        },
        {
          setId: "core",
          path: "color.consumed",
          tier: "primitive",
          value: "#222",
          referencedBy: [],
          consumedBy: ["button"],
          hasSemanticMetadata: false,
        },
      ],
      themes: [],
      aliasEdges: [],
      componentUsages: [],
      issues: [],
    };

    const out = serializeContextForPrompt(graph, {
      task: defaultTask,
      recentChangePaths: ["core:color.recent"],
    });
    const payload = JSON.parse(out);
    expect(payload.tokens[0].id).toBe("core:color.recent");
    expect(payload.tokens[1].id).toBe("core:color.consumed");
  });

  it("scores issue sources above plain consumed-by tokens", () => {
    const graph: AiContextGraph = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      tokens: [
        {
          setId: "core",
          path: "color.with-issue",
          tier: "primitive",
          value: "broken",
          referencedBy: [],
          consumedBy: [],
          hasSemanticMetadata: false,
        },
        {
          setId: "core",
          path: "color.with-consumer",
          tier: "primitive",
          value: "#fff",
          referencedBy: [],
          consumedBy: ["button"],
          hasSemanticMetadata: false,
        },
      ],
      themes: [],
      aliasEdges: [],
      componentUsages: [],
      issues: [
        {
          id: "i-1",
          severity: "error",
          title: "Invalid",
          detail: "x",
          action: "y",
          source: { kind: "token", setId: "core", path: "color.with-issue" },
        },
      ],
    };

    const out = serializeContextForPrompt(graph, { task: defaultTask });
    const payload = JSON.parse(out);
    expect(payload.tokens[0].id).toBe("core:color.with-issue");
  });

  it("snapshot — small fixture renders stable output", () => {
    const sets: TokenSet[] = [
      {
        id: "primitives",
        name: "Primitives",
        filename: "primitives.tokens.json",
        root: {
          color: {
            $type: "color",
            brand: { $value: "#0066FF" },
            ink: { $value: "#111111" },
          },
        },
      },
      {
        id: "semantic",
        name: "Semantic",
        filename: "semantic.tokens.json",
        root: {
          color: {
            $type: "color",
            primary: { $value: "{color.brand}" },
            text: { $value: "{color.ink}" },
          },
        },
      },
      {
        id: "spacing",
        name: "Spacing",
        filename: "spacing.tokens.json",
        root: {
          space: {
            $type: "dimension",
            sm: { $value: "4px" },
          },
        },
      },
    ];
    const themes: Theme[] = [
      {
        id: "light",
        name: "Light",
        sets: [
          { setId: "primitives", mode: "enabled" },
          { setId: "semantic", mode: "enabled" },
        ],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const components: DesignSystemComponent[] = [
      {
        id: "button",
        name: "Button",
        slug: "button",
        category: "core",
        status: "ready",
        tokenRefs: ["semantic:color.primary"],
        variants: [],
        props: [],
        states: [],
        bindings: { code: [], figma: [] },
        brandIds: [],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "badge",
        name: "Badge",
        slug: "badge",
        category: "core",
        status: "ready",
        tokenRefs: ["semantic:color.text"],
        variants: [],
        props: [],
        states: [],
        bindings: { code: [], figma: [] },
        brandIds: [],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const issues: ValidationIssue[] = [
      {
        id: "issue-1",
        severity: "warning",
        title: "Unused primitive",
        detail: "color.ink is not referenced",
        action: "Consider removing",
        source: { kind: "token", setId: "primitives", path: "color.ink" },
      },
    ];

    const graph = buildAiContextGraph({ sets, themes, components, issues });
    // Pin generatedAt for snapshot stability.
    const stable: AiContextGraph = { ...graph, generatedAt: "2026-01-01T00:00:00.000Z" };
    const out = serializeContextForPrompt(stable, {
      task: defaultTask,
      mentions: [
        {
          id: "semantic:color.primary",
          kind: "token",
          label: "color.primary",
          description: "Primary brand color",
          path: "semantic:color.primary",
          payloadPreview: "",
        },
      ],
    });
    expect(out).toMatchSnapshot();
  });
});
