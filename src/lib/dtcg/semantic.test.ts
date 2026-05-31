import { describe, expect, it } from "vitest";

import { setTokenAtPath } from "./serializer";
import type { DtcgGroup, DtcgToken } from "./types";
import {
  ROZETTA_SEMANTIC_EXT_KEY,
  getSemanticMeta,
  inferSemanticTier,
  resolveTier,
  setSemanticMeta,
  type SemanticTokenMetadata,
} from "./semantic";

describe("getSemanticMeta", () => {
  it("returns null when $extensions is absent", () => {
    const token: DtcgToken = { $type: "color", $value: "#fff" };
    expect(getSemanticMeta(token)).toBeNull();
  });

  it("returns null when the rozetta key is missing", () => {
    const token: DtcgToken = {
      $type: "color",
      $value: "#fff",
      $extensions: { "com.figma": { variableId: "abc" } },
    };
    expect(getSemanticMeta(token)).toBeNull();
  });

  it("returns null when payload is malformed (not an object)", () => {
    const token: DtcgToken = {
      $type: "color",
      $value: "#fff",
      $extensions: { [ROZETTA_SEMANTIC_EXT_KEY]: "primitive" },
    };
    expect(getSemanticMeta(token)).toBeNull();
  });

  it("returns null when tier is invalid", () => {
    const token: DtcgToken = {
      $type: "color",
      $value: "#fff",
      $extensions: { [ROZETTA_SEMANTIC_EXT_KEY]: { tier: "atomic" } },
    };
    expect(getSemanticMeta(token)).toBeNull();
  });

  it("returns the metadata when valid", () => {
    const token: DtcgToken = {
      $type: "color",
      $value: "#fff",
      $extensions: {
        [ROZETTA_SEMANTIC_EXT_KEY]: {
          tier: "semantic",
          role: "surface.bg",
          deprecated: true,
          replacedBy: "color.surface.body",
        },
      },
    };
    expect(getSemanticMeta(token)).toEqual({
      tier: "semantic",
      role: "surface.bg",
      deprecated: true,
      replacedBy: "color.surface.body",
    });
  });

  it("drops fields with wrong primitive types", () => {
    const token: DtcgToken = {
      $type: "color",
      $value: "#fff",
      $extensions: {
        [ROZETTA_SEMANTIC_EXT_KEY]: {
          tier: "primitive",
          role: 42,
          deprecated: "yes",
          replacedBy: null,
        },
      },
    };
    expect(getSemanticMeta(token)).toEqual({
      tier: "primitive",
      role: undefined,
      deprecated: undefined,
      replacedBy: undefined,
    });
  });
});

describe("setSemanticMeta", () => {
  it("round-trips through getSemanticMeta", () => {
    const token: DtcgToken = { $type: "color", $value: "#fff" };
    const meta: SemanticTokenMetadata = {
      tier: "semantic",
      role: "surface",
      deprecated: false,
    };
    const next = setSemanticMeta(token, meta);
    expect(getSemanticMeta(next)).toEqual(meta);
  });

  it("preserves other $extensions keys when merging", () => {
    const token: DtcgToken = {
      $type: "color",
      $value: "#fff",
      $extensions: { "com.figma": { variableId: "abc", scopes: ["FILL"] } },
    };
    const next = setSemanticMeta(token, { tier: "primitive" });
    expect(next.$extensions?.["com.figma"]).toEqual({
      variableId: "abc",
      scopes: ["FILL"],
    });
    expect(getSemanticMeta(next)?.tier).toBe("primitive");
  });

  it("overwrites a prior tier value", () => {
    const token: DtcgToken = {
      $type: "color",
      $value: "#fff",
      $extensions: {
        [ROZETTA_SEMANTIC_EXT_KEY]: { tier: "primitive", role: "old" },
      },
    };
    const next = setSemanticMeta(token, { tier: "component", role: "new" });
    expect(getSemanticMeta(next)).toEqual({
      tier: "component",
      role: "new",
      deprecated: undefined,
      replacedBy: undefined,
    });
  });

  it("strips empty optional fields", () => {
    const token: DtcgToken = { $type: "color", $value: "#fff" };
    const next = setSemanticMeta(token, { tier: "primitive" });
    const stored = next.$extensions?.[ROZETTA_SEMANTIC_EXT_KEY] as Record<
      string,
      unknown
    >;
    expect(stored).toEqual({ tier: "primitive" });
  });
});

describe("inferSemanticTier", () => {
  it("returns 'semantic' when $value is an alias", () => {
    const token: DtcgToken = { $type: "color", $value: "{color.brand.primary}" };
    expect(inferSemanticTier(token)).toBe("semantic");
  });

  it("returns 'primitive' for literal scalar values", () => {
    const token: DtcgToken = { $type: "color", $value: "#ff0000" };
    expect(inferSemanticTier(token)).toBe("primitive");
  });

  it("returns 'component' when path is in the componentReferencedPaths set", () => {
    const token: DtcgToken = { $type: "color", $value: "#ff0000" };
    const referenced = new Set(["primitives:color.button.bg"]);
    expect(
      inferSemanticTier(token, {
        componentReferencedPaths: referenced,
        setId: "primitives",
        path: "color.button.bg",
      })
    ).toBe("component");
  });

  it("component beats alias-derived semantic when both could apply", () => {
    const token: DtcgToken = {
      $type: "color",
      $value: "{color.brand.primary}",
    };
    const referenced = new Set(["semantic:color.button.bg"]);
    expect(
      inferSemanticTier(token, {
        componentReferencedPaths: referenced,
        setId: "semantic",
        path: "color.button.bg",
      })
    ).toBe("component");
  });

  it("falls back to primitive when ctx is missing", () => {
    const token: DtcgToken = { $type: "number", $value: 16 };
    expect(inferSemanticTier(token)).toBe("primitive");
  });
});

describe("resolveTier", () => {
  it("prefers explicit metadata over inference", () => {
    const token: DtcgToken = {
      $type: "color",
      $value: "{color.brand.primary}",
      $extensions: {
        [ROZETTA_SEMANTIC_EXT_KEY]: { tier: "primitive" },
      },
    };
    expect(resolveTier(token)).toBe("primitive");
  });

  it("falls back to inference when explicit is missing", () => {
    const token: DtcgToken = {
      $type: "color",
      $value: "{color.brand.primary}",
    };
    expect(resolveTier(token)).toBe("semantic");
  });
});

describe("semantic metadata survives serializer round-trip (invariant I9)", () => {
  it("setTokenAtPath preserves $extensions[com.rozetta.semantic] when patching other fields", () => {
    const tokenWithMeta = setSemanticMeta(
      {
        $type: "color",
        $value: "#ff0000",
        $description: "initial",
      },
      { tier: "semantic", role: "surface.bg" }
    );

    const root: DtcgGroup = {
      color: {
        brand: {
          primary: tokenWithMeta,
        },
      },
    };

    const next = setTokenAtPath(root, "color.brand.primary", {
      $description: "updated",
    });

    const updated = (next as Record<string, unknown>).color as Record<
      string,
      unknown
    >;
    const brand = updated.brand as Record<string, unknown>;
    const primary = brand.primary as DtcgToken;

    expect(primary.$description).toBe("updated");
    expect(getSemanticMeta(primary)).toEqual({
      tier: "semantic",
      role: "surface.bg",
      deprecated: undefined,
      replacedBy: undefined,
    });
  });

  it("setTokenAtPath preserves semantic metadata when patching $value", () => {
    const tokenWithMeta = setSemanticMeta(
      {
        $type: "color",
        $value: "#ff0000",
      },
      { tier: "primitive" }
    );
    const root: DtcgGroup = {
      color: {
        red: tokenWithMeta,
      },
    };

    const next = setTokenAtPath(root, "color.red", { $value: "#00ff00" });
    const updated = (next as Record<string, unknown>).color as Record<
      string,
      unknown
    >;
    const red = updated.red as DtcgToken;

    expect(red.$value).toBe("#00ff00");
    expect(getSemanticMeta(red)?.tier).toBe("primitive");
  });

  it("setTokenAtPath with an $extensions patch merges instead of clobbering semantic metadata", () => {
    const tokenWithMeta = setSemanticMeta(
      {
        $type: "color",
        $value: "#ff0000",
      },
      { tier: "semantic" }
    );
    const root: DtcgGroup = {
      color: {
        brand: tokenWithMeta,
      },
    };

    const next = setTokenAtPath(root, "color.brand", {
      $extensions: { "com.figma": { variableId: "fig:1" } },
    });
    const updated = (next as Record<string, unknown>).color as Record<
      string,
      unknown
    >;
    const brand = updated.brand as DtcgToken;

    expect(brand.$extensions?.["com.figma"]).toEqual({ variableId: "fig:1" });
    expect(getSemanticMeta(brand)?.tier).toBe("semantic");
  });
});
