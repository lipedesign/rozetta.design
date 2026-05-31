import { describe, expect, it } from "vitest";

import type { TokenSet } from "@/lib/dtcg/types";
import type { Theme } from "@/lib/themes/types";
import { buildSyncDiff, createFigmaSyncPayload, parseFigmaSyncPayload } from "./figma-sync";

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
    id: "web",
    name: "Web",
    sets: [{ setId: "core", mode: "enabled" }],
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("Figma sync contracts", () => {
  it("creates and parses a v1 payload", () => {
    const payload = createFigmaSyncPayload(sets, themes);
    const parsed = parseFigmaSyncPayload(JSON.stringify(payload));

    expect(payload.version).toBe("rozetta-figma-sync/v1");
    expect(payload.collections[0]).toMatchObject({ collectionId: "core", setId: "core" });
    expect(payload.modes[0]).toMatchObject({ modeId: "default", setIds: ["core"] });
    expect(parsed.ok).toBe(true);
  });

  it("builds a semantic diff for incoming payloads", () => {
    const incoming = createFigmaSyncPayload(
      [
        {
          ...sets[0]!,
          root: {
            color: {
              brand: {
                $type: "color",
                $value: "#000000",
              },
            },
          },
        },
      ],
      themes
    );
    const syncDiff = buildSyncDiff(sets, incoming);

    expect(syncDiff.incomingSets).toBe(1);
    expect(syncDiff.incomingThemes).toBe(1);
    expect(syncDiff.tokenDiff.summary["value-changed"]).toBe(1);
  });
});
