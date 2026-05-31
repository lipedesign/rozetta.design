import { describe, expect, it } from "vitest";

import type { TokenSet } from "@/lib/dtcg/types";
import type { Theme } from "@/lib/themes/types";
import { buildWorkspaceHealth } from "./validation";

const sets: TokenSet[] = [
  {
    id: "core",
    name: "Core",
    filename: "core.tokens.json",
    root: {
      color: {
        valid: {
          $type: "color",
          $value: "#ffffff",
        },
        broken: {
          $type: "color",
          $value: "{color.missing}",
        },
        invalid: {
          $type: "color",
          $value: 12,
        },
      },
      missingType: {
        $value: "loose",
      },
    },
  },
];

const themes: Theme[] = [
  {
    id: "web",
    name: "Web",
    sets: [{ setId: "missing-set", mode: "enabled" }],
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("buildWorkspaceHealth", () => {
  it("reports local-only collections, invalid tokens, broken aliases, missing theme collections, and git state", () => {
    const health = buildWorkspaceHealth({
      sets,
      themes,
      localOnlySetIds: ["core"],
      dirtySetIds: ["core"],
      git: {
        available: true,
        branch: "main",
        ahead: 0,
        behind: 0,
        clean: false,
        files: [
          {
            path: "tokens/core.tokens.json",
            indexStatus: " ",
            worktreeStatus: "M",
            kind: "modified",
          },
        ],
        tokenFiles: [],
        designSystemFiles: [],
      },
    });

    expect(health.summary).toMatchObject({
      sets: 1,
      tokens: 4,
      themes: 1,
      brands: 0,
      components: 0,
      dirtySets: 1,
      localOnlySets: 1,
    });
    expect(health.issues.map((issue) => issue.id)).toEqual(
      expect.arrayContaining([
        "local-only:core",
        "missing-type:core:default:missingType",
        "invalid-value:core:default:color.invalid",
        "alias-not-found:core:default:color.broken",
        "missing-theme-collection:web:missing-set",
        "git-dirty-worktree",
      ])
    );
    expect(health.summary.errors).toBeGreaterThanOrEqual(2);
    expect(health.summary.warnings).toBeGreaterThanOrEqual(1);
    expect(health.summary.infos).toBeGreaterThanOrEqual(2);
  });
});
