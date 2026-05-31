import { describe, expect, it } from "vitest";

import type { TokenSet } from "@/lib/dtcg/types";
import { diffTokenSets } from "./diff";

const baseline: TokenSet[] = [
  {
    id: "core",
    name: "Core",
    filename: "core.tokens.json",
    root: {
      color: {
        primary: {
          $type: "color",
          $value: "#ffffff",
          $description: "Primary color",
        },
      },
      spacing: {
        sm: {
          $type: "number",
          $value: 4,
        },
      },
      alias: {
        surface: {
          $type: "color",
          $value: "{color.primary}",
        },
      },
    },
  },
];

const current: TokenSet[] = [
  {
    id: "core",
    name: "Core",
    filename: "core.tokens.json",
    root: {
      color: {
        primary: {
          $type: "color",
          $value: "#000000",
          $description: "Brand primary color",
        },
      },
      spacing: {
        sm: {
          $type: "dimension",
          $value: "4px",
        },
        md: {
          $type: "number",
          $value: 8,
        },
      },
      alias: {
        surface: {
          $type: "color",
          $value: "{color.secondary}",
        },
      },
    },
  },
  {
    id: "brand",
    name: "Brand",
    filename: "brand.tokens.json",
    root: {
      color: {
        accent: {
          $type: "color",
          $value: "#ffcc00",
        },
      },
    },
  },
];

describe("diffTokenSets", () => {
  it("classifies semantic token and set changes", () => {
    const diff = diffTokenSets(baseline, current);
    const changes = diff.changes.map((change) => `${change.kind}:${change.setId}:${change.path ?? ""}`);

    expect(changes).toContain("set-created:brand:");
    expect(changes).toContain("value-changed:core:color.primary");
    expect(changes).toContain("description-changed:core:color.primary");
    expect(changes).toContain("type-changed:core:spacing.sm");
    expect(changes).toContain("value-changed:core:spacing.sm");
    expect(changes).toContain("token-created:core:spacing.md");
    expect(changes).toContain("alias-changed:core:alias.surface");
    expect(diff.summary.total).toBe(diff.changes.length);
  });

  it("treats Figma alias metadata and DTCG aliases to the same target as equivalent", () => {
    const diff = diffTokenSets(
      [
        {
          id: "consumer",
          name: "Consumer",
          filename: "Consumer.tokens.json",
          root: {
            border: {
              radius: {
                sm: {
                  $type: "number",
                  $value: 4,
                  $extensions: {
                    "com.figma.aliasData": {
                      targetVariableName: "unit/scale/sm",
                    },
                  },
                },
              },
            },
          },
        },
      ],
      [
        {
          id: "consumer",
          name: "Consumer",
          filename: "Consumer.tokens.json",
          root: {
            border: {
              radius: {
                sm: {
                  $type: "number",
                  $value: "{unit.scale.sm}",
                },
              },
            },
          },
        },
      ]
    );

    expect(diff.changes).toHaveLength(0);
  });
});
