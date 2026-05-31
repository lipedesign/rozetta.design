import { describe, expect, it } from "vitest";

import type { TokenSet } from "@/lib/dtcg/types";
import type { Theme } from "@/lib/themes/types";
import type { Brand, DesignSystemComponent } from "@/lib/workspace/types";
import {
  diffDesignSystemRegistry,
  normalizeBrands,
  normalizeComponents,
  proposeDesignSystemPatch,
  resolveBrandPackage,
  validateDesignSystem,
} from "./registry";

const sets: TokenSet[] = [
  {
    id: "core",
    name: "Core",
    filename: "core.tokens.json",
    root: {
      color: {
        brand: {
          $type: "color",
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
    id: "base",
    name: "Base",
    slug: "base",
    status: "active",
    tokenSetIds: ["core"],
    themeIds: ["light"],
    exportProfileIds: [],
    componentIds: ["button"],
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "acme",
    name: "Acme",
    slug: "acme",
    status: "draft",
    baseBrandId: "base",
    tokenSetIds: ["missing-set"],
    themeIds: [],
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
    tokenRefs: ["core:color.brand", "core:color.missing"],
    variants: [],
    props: [],
    states: [],
    bindings: { code: [{ source: "" }], figma: [] },
    brandIds: ["missing-brand"],
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("design system registry", () => {
  it("normalizes brand and component arrays", () => {
    expect(normalizeBrands(brands)).toHaveLength(2);
    expect(normalizeComponents(components)).toHaveLength(1);
  });

  it("resolves a brand package with base inheritance and missing refs", () => {
    const resolved = resolveBrandPackage("acme", {
      sets,
      themes,
      brands,
      components,
      exportProfiles: [],
    });

    expect(resolved?.inheritedBrandIds).toEqual(["base"]);
    expect(resolved?.tokenSetIds).toEqual(["core", "missing-set"]);
    expect(resolved?.missing.tokenSetIds).toEqual(["missing-set"]);
  });

  it("validates missing references and returns non-applying proposals", () => {
    const issues = validateDesignSystem({
      sets,
      themes,
      brands,
      components,
      exportProfiles: [],
    });
    const proposal = proposeDesignSystemPatch(issues);

    expect(issues.map((issue) => issue.id)).toEqual(
      expect.arrayContaining([
        "brand-missing-token-set:acme:missing-set",
        "component-missing-brand:button:missing-brand",
        "component-missing-token:button:core:color.missing",
        "component-code-binding:button:0",
      ])
    );
    expect(proposal.appliesAutomatically).toBe(false);
    expect(proposal.proposals.length).toBeGreaterThan(0);
  });

  it("diffs brands and components semantically", () => {
    const diff = diffDesignSystemRegistry(
      { themes, brands: [], components: [] },
      { themes, brands, components }
    );

    expect(diff.summary["brand-created"]).toBe(2);
    expect(diff.summary["component-created"]).toBe(1);
    expect(diff.summary.total).toBeGreaterThanOrEqual(3);
  });
});
