import { describe, expect, it } from "vitest";

import type { TokenSet } from "@/lib/dtcg/types";
import type { Theme } from "@/lib/themes/types";
import { normalizeExportProfiles, previewExportProfile, resolveExportProfileStatus } from "./export-profiles";
import type { ExportProfile } from "./types";

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
  {
    id: "semantic",
    name: "Semantic",
    filename: "semantic.tokens.json",
    root: {
      color: {
        surface: {
          $type: "color",
          $value: "{color.brand}",
        },
      },
    },
  },
];

const themes: Theme[] = [
  {
    id: "web",
    name: "Web",
    sets: [
      { setId: "core", mode: "enabled" },
      { setId: "semantic", mode: "enabled" },
    ],
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

function profile(patch: Partial<ExportProfile>): ExportProfile {
  return {
    id: "profile",
    name: "Profile",
    targetKind: "set",
    targetId: "core",
    format: "css",
    destination: "preview/download",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("export profiles", () => {
  it("normalizes only valid versioned profiles", () => {
    const normalized = normalizeExportProfiles([
      profile({ id: "valid" }),
      { id: "broken", targetKind: "set" },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.id).toBe("valid");
  });

  it("migrates legacy profiles missing targetKind to a collection target", () => {
    const legacy = {
      id: "legacy-1",
      name: "Legacy CSS",
      targetId: "core",
      format: "css",
      destination: "preview/download",
      updatedAt: "2025-12-01T00:00:00.000Z",
    };
    const normalized = normalizeExportProfiles([legacy]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.targetKind).toBe("collection");
    expect(normalized[0]?.targetId).toBe("core");
  });

  it("previews a set export", () => {
    const preview = previewExportProfile(profile({}), sets, themes);

    expect(preview.status).toBe("valid");
    expect(preview.filename).toBe("core.css");
    expect(preview.output).toContain("--color-brand");
    expect(preview.conflicts).toBe(0);
  });

  it("previews a theme export with the merged theme scope", () => {
    const preview = previewExportProfile(
      profile({ targetKind: "theme", targetId: "web", format: "json" }),
      sets,
      themes
    );

    expect(preview.status).toBe("valid");
    expect(preview.filename).toBe("web.flat.json");
    expect(preview.output).toContain('"color.surface": "#ffcc00"');
  });

  it("surfaces conflict counts for theme exports with overlapping paths", () => {
    const overlapping: TokenSet[] = [
      {
        id: "a",
        name: "A",
        filename: "a.tokens.json",
        root: { color: { fg: { $type: "color", $value: "#000000" } } },
      },
      {
        id: "b",
        name: "B",
        filename: "b.tokens.json",
        root: { color: { fg: { $type: "color", $value: "#ffffff" } } },
      },
    ];
    const conflictTheme: Theme = {
      id: "overlap",
      name: "Overlap",
      sets: [
        { setId: "a", mode: "enabled" },
        { setId: "b", mode: "enabled" },
      ],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const preview = previewExportProfile(
      profile({ targetKind: "theme", targetId: "overlap", format: "css" }),
      overlapping,
      [conflictTheme]
    );

    expect(preview.status).toBe("valid");
    expect(preview.conflicts).toBe(1);
  });

  it("marks missing targets and planned formats", () => {
    expect(resolveExportProfileStatus(profile({ targetId: "missing" }), sets, themes)).toBe("missing-target");
    expect(resolveExportProfileStatus(profile({ format: "style-dictionary" }), sets, themes)).toBe("planned-format");
  });

  it("treats targetKind=\"collection\" identically to the legacy \"set\" variant", () => {
    const preview = previewExportProfile(
      profile({ targetKind: "collection" }),
      sets,
      themes
    );
    expect(preview.status).toBe("valid");
    expect(preview.filename).toBe("core.css");
    expect(preview.conflicts).toBe(0);
  });

  it("never reports conflicts for collection-targeted profiles", () => {
    const overlapping: TokenSet[] = [
      {
        id: "a",
        name: "A",
        filename: "a.tokens.json",
        root: { color: { fg: { $type: "color", $value: "#000000" } } },
      },
      {
        id: "b",
        name: "B",
        filename: "b.tokens.json",
        root: { color: { fg: { $type: "color", $value: "#ffffff" } } },
      },
    ];
    const preview = previewExportProfile(
      profile({ targetKind: "collection", targetId: "a" }),
      overlapping,
      []
    );
    expect(preview.conflicts).toBe(0);
  });

  it("flags missing themes with the missing-target status", () => {
    const status = resolveExportProfileStatus(
      profile({ targetKind: "theme", targetId: "ghost" }),
      sets,
      themes
    );
    expect(status).toBe("missing-target");
  });

  it("renders a planned-format preview for style-dictionary without crashing", () => {
    const preview = previewExportProfile(
      profile({ format: "style-dictionary" }),
      sets,
      themes
    );
    expect(preview.status).toBe("planned-format");
    expect(preview.output).toBe("");
    expect(preview.message).toMatch(/Style Dictionary/i);
  });

  it("previews a theme target whose theme has zero enabled sets without crashing", () => {
    const emptyTheme: Theme = {
      id: "empty",
      name: "Empty",
      sets: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const preview = previewExportProfile(
      profile({ targetKind: "theme", targetId: "empty", format: "json" }),
      sets,
      [emptyTheme]
    );
    expect(preview.status).toBe("valid");
    expect(preview.conflicts).toBe(0);
    // Empty themes resolve to an empty JSON object.
    expect(preview.output).toContain("{");
  });
});
