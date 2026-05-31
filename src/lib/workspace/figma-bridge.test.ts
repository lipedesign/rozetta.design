import { describe, expect, it } from "vitest";

import type { TokenSet } from "@/lib/dtcg/types";
import type { FigmaFileSnapshot } from "@/lib/workspace/types";
import {
  buildFigmaToRozettaSyncRun,
  createRozettaToFigmaPayload,
  figmaSnapshotToRozetta,
  figmaVariableNameToTokenPath,
} from "./figma-bridge";

const snapshot: FigmaFileSnapshot = {
  fileKey: "figma-file-1",
  name: "Rozetta Variables",
  source: "fixture",
  createdAt: "2026-05-11T00:00:00.000Z",
  collections: [
    {
      collectionId: "collection-colors",
      name: "Colors",
      modes: [
        { modeId: "mode-light", name: "Light" },
        { modeId: "mode-dark", name: "Dark" },
      ],
      variableIds: ["variable-brand", "variable-alias"],
    },
  ],
  variables: [
    {
      id: "variable-brand",
      key: "brand-key",
      name: "color/brand/default",
      collectionId: "collection-colors",
      collectionName: "Colors",
      resolvedType: "COLOR",
      valuesByMode: {
        "mode-light": { r: 1, g: 0.8, b: 0, a: 1 },
        "mode-dark": { r: 0.1, g: 0.1, b: 0.1, a: 1 },
      },
      description: "Primary brand color",
      scopes: ["ALL_SCOPES"],
      codeSyntax: { WEB: "--color-brand-default" },
    },
    {
      id: "variable-alias",
      name: "color/background/default",
      collectionId: "collection-colors",
      collectionName: "Colors",
      resolvedType: "COLOR",
      valuesByMode: {
        "mode-light": { type: "VARIABLE_ALIAS", id: "variable-brand" },
        "mode-dark": { type: "VARIABLE_ALIAS", id: "variable-brand" },
      },
    },
  ],
};

describe("Figma bridge domain", () => {
  it("normalizes Figma variable paths into DTCG token paths", () => {
    expect(figmaVariableNameToTokenPath("Color/Surface Neutral/Default")).toBe(
      "color.surface-neutral.default"
    );
    expect(figmaVariableNameToTokenPath("color/textIcon/info/default")).toBe(
      "color.textIcon.info.default"
    );
    expect(figmaVariableNameToTokenPath("typography/letterSpacing/None")).toBe(
      "typography.letterSpacing.None"
    );
  });

  it("converts a Figma snapshot into sets and bindings", () => {
    const result = figmaSnapshotToRozetta(snapshot);

    expect(result.sets).toHaveLength(1);
    expect(result.sets.map((set) => set.id)).toEqual(["colors"]);
    // Themes are not auto-derived from Figma modes — modes become
    // `CollectionMode` entries on the TokenSet; Themes stay user-authored.
    expect(result.themes).toEqual([]);
    expect(result.bindings).toHaveLength(4);
    expect(result.sets[0]!.modes?.map((mode) => mode.id)).toEqual(["light", "dark"]);
    expect(result.sets[0]!.modeRoots?.light).toMatchObject({
      color: {
        brand: {
          default: {
            $type: "color",
            $value: {
              colorSpace: "srgb",
              components: [1, 0.8, 0],
              alpha: 1,
              hex: "#FFCC00",
            },
          },
        },
        background: {
          default: {
            $value: "{color.brand.default}",
          },
        },
      },
    });
  });

  it("uses unique single-mode names as stable Rozetta set identities", () => {
    const result = figmaSnapshotToRozetta({
      ...snapshot,
      collections: [
        {
          collectionId: "collection-primitives",
          name: "Primitives",
          modes: [{ modeId: "mode-default", name: "Default" }],
          variableIds: ["variable-brand"],
        },
        {
          collectionId: "collection-semantic",
          name: "Semantic",
          modes: [{ modeId: "mode-consumer", name: "Consumer" }],
          variableIds: ["variable-alias"],
        },
      ],
      variables: [
        {
          ...snapshot.variables[0]!,
          collectionId: "collection-primitives",
          collectionName: "Primitives",
          valuesByMode: { "mode-default": "#ffcc00" },
        },
        {
          ...snapshot.variables[1]!,
          collectionId: "collection-semantic",
          collectionName: "Semantic",
          valuesByMode: { "mode-consumer": { type: "VARIABLE_ALIAS", id: "variable-brand" } },
        },
      ],
    });

    expect(result.sets.map((set) => ({ id: set.id, name: set.name, filename: set.filename }))).toEqual([
      { id: "primitives", name: "Primitives", filename: "Primitives.tokens.json" },
      { id: "semantic", name: "Semantic", filename: "Semantic.tokens.json" },
    ]);
  });

  it("builds reviewed operations from a semantic diff", () => {
    const currentSets: TokenSet[] = [
      {
        id: "colors",
        name: "Colors",
        filename: "Colors.tokens.json",
        root: {
          color: {
            brand: {
              default: {
                $type: "color",
                $value: "#000000",
              },
            },
          },
        },
      },
    ];

    const preview = buildFigmaToRozettaSyncRun({ currentSets, snapshot });

    expect(preview.run.connectorId).toBe("figma");
    expect(preview.run.direction).toBe("figma-to-rozetta");
    expect(preview.run.operations.length).toBeGreaterThan(0);
    expect(preview.run.operations.every((operation) => operation.status === "pending")).toBe(true);
  });

  it("creates a plugin writeback payload without destructive deletes", () => {
    const result = figmaSnapshotToRozetta(snapshot);
    const payload = createRozettaToFigmaPayload(result);

    expect(payload.version).toBe("rozetta-figma-writeback/v1");
    expect(payload.sets[0]!.modeRoots?.dark).toMatchObject({
      color: {
        brand: {
          default: {
            $value: {
              hex: "#1A1A1A",
            },
          },
        },
      },
    });
    expect(payload.bindings.some((binding) => binding.rozettaModeId === "dark")).toBe(true);
    expect(payload.safety).toMatchObject({
      destructiveDeletes: false,
      requiresPluginReview: true,
    });
  });
});
