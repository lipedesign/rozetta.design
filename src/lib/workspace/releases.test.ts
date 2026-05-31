import { describe, expect, it } from "vitest";

import type { TokenSemanticDiff } from "./types";
import { generateReleaseDraft } from "./releases";

const diff: TokenSemanticDiff = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  baselineSets: 1,
  currentSets: 1,
  changes: [
    {
      id: "token-removed:core::color.old",
      kind: "token-removed",
      setId: "core",
      setName: "Core",
      path: "color.old",
      before: "#ffffff",
    },
    {
      id: "value-changed:core::color.brand",
      kind: "value-changed",
      setId: "core",
      setName: "Core",
      path: "color.brand",
      before: "#000000",
      after: "#ffcc00",
    },
  ],
  summary: {
    total: 2,
    "set-created": 0,
    "set-removed": 0,
    "token-created": 0,
    "token-removed": 1,
    "value-changed": 1,
    "type-changed": 0,
    "description-changed": 0,
    "alias-changed": 0,
  },
};

describe("generateReleaseDraft", () => {
  it("builds editable release notes and artifact previews from a semantic diff", () => {
    const draft = generateReleaseDraft(diff, "minor");

    expect(draft.versionKind).toBe("minor");
    expect(draft.title).toBe("Minor design system release");
    expect(draft.summary).toContain("2 token changes");
    expect(draft.notes).toContain("Breaking-risk changes: 1 removal/type change.");
    expect(draft.notes).toContain("### Core");
    expect(draft.notes).toContain("Tokens removed: color.old");
    expect(draft.notes).toContain("Values changed: color.brand");
    expect(draft.designSystemChanges).toEqual([]);
    expect(draft.artifacts.map((artifact) => artifact.id)).toEqual([
      "tokens-json",
      "css",
      "style-dictionary",
    ]);
  });

  it("groups design system registry changes into release notes", () => {
    const draft = generateReleaseDraft(diff, "patch", {
      generatedAt: "2026-01-01T00:00:00.000Z",
      changes: [
        {
          id: "brand-created:acme",
          kind: "brand-created",
          area: "brands",
          name: "Acme",
          after: "Acme",
        },
      ],
      summary: {
        total: 1,
        "theme-created": 0,
        "theme-removed": 0,
        "theme-updated": 0,
        "brand-created": 1,
        "brand-removed": 0,
        "brand-updated": 0,
        "component-created": 0,
        "component-removed": 0,
        "component-updated": 0,
      },
    });

    expect(draft.designSystemChanges).toHaveLength(1);
    expect(draft.notes).toContain("## Brands");
    expect(draft.notes).toContain("brand-created: Acme");
  });
});
