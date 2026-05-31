import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { TokenSet } from "@/lib/dtcg/types";
import type { Theme } from "@/lib/themes/types";
import { ROZETTA_SEMANTIC_EXT_KEY } from "@/lib/dtcg/semantic";
import type {
  DesignSystemComponent,
  ValidationIssue,
} from "@/lib/workspace/types";

import { buildAiContextGraph } from "./context-graph";

const baseComponent: Omit<DesignSystemComponent, "id" | "name" | "slug" | "tokenRefs"> = {
  category: "core",
  status: "ready",
  variants: [],
  props: [],
  states: [],
  bindings: { code: [], figma: [] },
  brandIds: [],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function makeComponent(id: string, tokenRefs: string[]): DesignSystemComponent {
  return {
    ...baseComponent,
    id,
    name: id,
    slug: id,
    tokenRefs,
  };
}

describe("buildAiContextGraph", () => {
  it("returns an empty graph when input is empty", () => {
    const graph = buildAiContextGraph({
      sets: [],
      themes: [],
      components: [],
      issues: [],
    });
    expect(graph.tokens).toEqual([]);
    expect(graph.themes).toEqual([]);
    expect(graph.aliasEdges).toEqual([]);
    expect(graph.componentUsages).toEqual([]);
    expect(graph.issues).toEqual([]);
    expect(typeof graph.generatedAt).toBe("string");
  });

  it("captures literal, alias-to-existing, and alias-to-nonexistent tokens", () => {
    const sets: TokenSet[] = [
      {
        id: "core",
        name: "Core",
        filename: "core.tokens.json",
        root: {
          color: {
            $type: "color",
            primary: { $value: "#ff0000" },
            accent: { $value: "{color.primary}" },
            broken: { $value: "{color.missing}" },
          },
        },
      },
    ];

    const graph = buildAiContextGraph({
      sets,
      themes: [],
      components: [],
      issues: [],
    });

    const primary = graph.tokens.find((t) => t.path === "color.primary")!;
    const accent = graph.tokens.find((t) => t.path === "color.accent")!;
    const broken = graph.tokens.find((t) => t.path === "color.broken")!;

    expect(primary.aliasOf).toBeUndefined();
    expect(primary.tier).toBe("primitive");
    expect(primary.referencedBy).toEqual(["core:color.accent"]);

    expect(accent.aliasOf).toBe("core:color.primary");
    expect(accent.tier).toBe("semantic");
    expect(accent.resolvedValue).toBe("#ff0000");

    expect(broken.aliasOf).toBe("core:color.missing");
    expect(broken.tier).toBe("semantic");
    expect(broken.resolvedValue).toBeUndefined();

    expect(
      graph.aliasEdges.some(
        (e) => e.from === "core:color.accent" && e.to === "core:color.primary" && e.via === "dtcg"
      )
    ).toBe(true);
  });

  it("populates theme effectiveValues and conflictPaths", () => {
    const sets: TokenSet[] = [
      {
        id: "base",
        name: "Base",
        filename: "base.tokens.json",
        root: {
          color: {
            $type: "color",
            primary: { $value: "#000000" },
            extra: { $value: "#aaaaaa" },
          },
        },
      },
      {
        id: "brand",
        name: "Brand",
        filename: "brand.tokens.json",
        root: {
          color: {
            $type: "color",
            primary: { $value: "#ff00ff" },
          },
        },
      },
    ];
    const themes: Theme[] = [
      {
        id: "light",
        name: "Light",
        sets: [
          { setId: "base", mode: "enabled" },
          { setId: "brand", mode: "enabled" },
        ],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const graph = buildAiContextGraph({
      sets,
      themes,
      components: [],
      issues: [],
    });

    expect(graph.themes).toHaveLength(1);
    const theme = graph.themes[0]!;
    expect(theme.effectiveValues["color.primary"]).toBe("#ff00ff");
    expect(theme.effectiveValues["color.extra"]).toBe("#aaaaaa");
    expect(theme.conflictPaths).toContain("color.primary");
  });

  it("sets consumedBy and tier=component for tokens referenced by components", () => {
    const sets: TokenSet[] = [
      {
        id: "semantic",
        name: "Semantic",
        filename: "semantic.tokens.json",
        root: {
          color: {
            $type: "color",
            primary: { $value: "#0066ff" },
          },
        },
      },
    ];
    const components = [makeComponent("button", ["semantic:color.primary"])];

    const graph = buildAiContextGraph({
      sets,
      themes: [],
      components,
      issues: [],
    });

    const node = graph.tokens.find((t) => t.path === "color.primary")!;
    expect(node.consumedBy).toEqual(["button"]);
    expect(node.tier).toBe("component");

    expect(graph.componentUsages).toEqual([
      { componentId: "button", tokenPath: "semantic:color.primary" },
    ]);
  });

  it("is deterministic for the same input", () => {
    const sets: TokenSet[] = [
      {
        id: "core",
        name: "Core",
        filename: "core.tokens.json",
        root: {
          color: {
            $type: "color",
            primary: { $value: "#ff0000" },
            accent: { $value: "{color.primary}" },
          },
        },
      },
    ];

    const a = buildAiContextGraph({ sets, themes: [], components: [], issues: [] });
    const b = buildAiContextGraph({ sets, themes: [], components: [], issues: [] });

    expect(a.tokens).toEqual(b.tokens);
    expect(a.aliasEdges).toEqual(b.aliasEdges);
    expect(a.componentUsages).toEqual(b.componentUsages);
  });

  it("respects explicit semantic metadata over inference", () => {
    const sets: TokenSet[] = [
      {
        id: "core",
        name: "Core",
        filename: "core.tokens.json",
        root: {
          color: {
            $type: "color",
            primary: {
              $value: "#ff0000",
              $extensions: {
                [ROZETTA_SEMANTIC_EXT_KEY]: { tier: "semantic", role: "brand.primary" },
              },
            },
          },
        },
      },
    ];

    const graph = buildAiContextGraph({
      sets,
      themes: [],
      components: [],
      issues: [],
    });

    const node = graph.tokens.find((t) => t.path === "color.primary")!;
    expect(node.tier).toBe("semantic");
    expect(node.hasSemanticMetadata).toBe(true);
  });

  it("forwards issues without modification", () => {
    const issues: ValidationIssue[] = [
      {
        id: "issue-1",
        severity: "error",
        source: { kind: "token", setId: "core", path: "color.primary" },
        title: "Broken token",
        detail: "Value is invalid",
        action: "Fix value",
      },
    ];
    const graph = buildAiContextGraph({
      sets: [],
      themes: [],
      components: [],
      issues,
    });
    expect(graph.issues).toEqual(issues);
  });
});
