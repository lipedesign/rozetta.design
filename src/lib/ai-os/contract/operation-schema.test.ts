import { describe, expect, it } from "vitest";

import {
  AiPatchOperationSchema,
  BrandUpsertOpSchema,
  ComponentUpsertOpSchema,
  ExportProfileUpsertOpSchema,
  FigmaApplyToRozettaOpSchema,
  FigmaPushToFigmaOpSchema,
  GithubPrCreateOpSchema,
  ReleaseNoteGenerateOpSchema,
  ThemeUpsertOpSchema,
  TokenPatchOpSchema,
  type AiPatchOperation,
} from "./operation-schema";

const tokenPatch: AiPatchOperation = {
  type: "token.patch",
  setId: "core",
  path: "color.brand",
  patch: { $value: "#ffcc00", $type: "color" },
};

const themeUpsert: AiPatchOperation = {
  type: "theme.upsert",
  theme: {
    id: "light",
    name: "Light",
    sets: [{ setId: "core", mode: "enabled" }],
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
};

const brandUpsert: AiPatchOperation = {
  type: "brand.upsert",
  brand: {
    id: "acme",
    name: "Acme",
    slug: "acme",
    status: "draft",
    tokenSetIds: [],
    themeIds: [],
    exportProfileIds: [],
    componentIds: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
};

const componentUpsert: AiPatchOperation = {
  type: "component.upsert",
  component: {
    id: "button",
    name: "Button",
    slug: "button",
    category: "Core",
    status: "ready",
    tokenRefs: [],
    variants: [],
    props: [],
    states: [],
    bindings: { code: [], figma: [] },
    brandIds: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
};

const releaseNote: AiPatchOperation = {
  type: "release-note.generate",
  notes: "Bumped brand palette.",
};

const exportProfileUpsert: AiPatchOperation = {
  type: "export-profile.upsert",
  profile: {
    id: "css-out",
    name: "CSS output",
    targetKind: "theme",
    targetId: "light",
    format: "css",
    destination: "dist/tokens.css",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
};

const figmaApply: AiPatchOperation = {
  type: "figma.apply-to-rozetta",
  syncRunId: "run-1",
};

const figmaPush: AiPatchOperation = {
  type: "figma.push-to-figma",
  syncRunId: "run-2",
};

const githubPr: AiPatchOperation = {
  type: "github.pr.create",
  draftId: "draft-1",
};

describe("AiPatchOperationSchema", () => {
  const cases: Array<[string, AiPatchOperation]> = [
    ["token.patch", tokenPatch],
    ["theme.upsert", themeUpsert],
    ["brand.upsert", brandUpsert],
    ["component.upsert", componentUpsert],
    ["release-note.generate", releaseNote],
    ["export-profile.upsert", exportProfileUpsert],
    ["figma.apply-to-rozetta", figmaApply],
    ["figma.push-to-figma", figmaPush],
    ["github.pr.create", githubPr],
  ];

  for (const [name, op] of cases) {
    it(`accepts ${name} and round-trips via JSON`, () => {
      const parsed = AiPatchOperationSchema.parse(op);
      expect(parsed).toEqual(op);
      const roundTrip = AiPatchOperationSchema.parse(JSON.parse(JSON.stringify(op)));
      expect(roundTrip).toEqual(op);
    });
  }

  it("rejects an operation missing `type`", () => {
    const result = AiPatchOperationSchema.safeParse({ setId: "core", path: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects an operation with an invalid `type`", () => {
    const result = AiPatchOperationSchema.safeParse({
      type: "token.delete",
      setId: "core",
      path: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects token.patch missing setId", () => {
    const result = TokenPatchOpSchema.safeParse({
      type: "token.patch",
      path: "color.brand",
      patch: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects token.patch missing path", () => {
    const result = TokenPatchOpSchema.safeParse({
      type: "token.patch",
      setId: "core",
      patch: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects token.patch with empty setId or path", () => {
    const emptySet = TokenPatchOpSchema.safeParse({
      type: "token.patch",
      setId: "",
      path: "color.brand",
      patch: {},
    });
    expect(emptySet.success).toBe(false);

    const emptyPath = TokenPatchOpSchema.safeParse({
      type: "token.patch",
      setId: "core",
      path: "",
      patch: {},
    });
    expect(emptyPath.success).toBe(false);
  });

  it("rejects an array of ops where one entry is malformed", () => {
    const ops = [tokenPatch, { type: "token.patch", setId: "core" }];
    const schema = AiPatchOperationSchema.array();
    expect(schema.safeParse(ops).success).toBe(false);
  });

  it("rejects theme.upsert with a non-string id", () => {
    const result = ThemeUpsertOpSchema.safeParse({
      type: "theme.upsert",
      theme: { ...themeUpsert.theme, id: 123 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects brand.upsert with an unknown status", () => {
    const result = BrandUpsertOpSchema.safeParse({
      type: "brand.upsert",
      brand: { ...brandUpsert.brand, status: "archived" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects component.upsert missing bindings", () => {
    const result = ComponentUpsertOpSchema.safeParse({
      type: "component.upsert",
      component: { ...componentUpsert.component, bindings: undefined },
    });
    expect(result.success).toBe(false);
  });

  it("rejects export-profile.upsert with an invalid format", () => {
    const result = ExportProfileUpsertOpSchema.safeParse({
      type: "export-profile.upsert",
      profile: { ...exportProfileUpsert.profile, format: "yaml" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects release-note.generate with non-string notes", () => {
    const result = ReleaseNoteGenerateOpSchema.safeParse({
      type: "release-note.generate",
      notes: 42,
    });
    expect(result.success).toBe(false);
  });

  it("rejects figma ops with missing syncRunId", () => {
    expect(
      FigmaApplyToRozettaOpSchema.safeParse({ type: "figma.apply-to-rozetta" }).success
    ).toBe(false);
    expect(
      FigmaPushToFigmaOpSchema.safeParse({ type: "figma.push-to-figma" }).success
    ).toBe(false);
  });

  it("rejects github.pr.create missing draftId", () => {
    expect(GithubPrCreateOpSchema.safeParse({ type: "github.pr.create" }).success).toBe(false);
  });
});
