import { describe, expect, it } from "vitest";

import {
  AiPatchProposalSchema,
  AiPatchStatusSchema,
  type AiPatchProposal,
} from "./proposal-schema";

const baseProposal: AiPatchProposal = {
  id: "patch-1",
  title: "Rename brand color",
  summary: "Propose renaming color.primary to color.brand.primary.",
  status: "pending",
  operations: [
    {
      type: "token.patch",
      setId: "core",
      path: "color.primary",
      patch: { $value: "#ffcc00", $type: "color" },
    },
  ],
  source: {
    taskKind: "propose-fixes",
    providerKind: "deterministic",
    modelId: "rozetta-deterministic-v1",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("AiPatchProposalSchema", () => {
  for (const status of AiPatchStatusSchema.options) {
    it(`accepts proposal with status=${status}`, () => {
      const parsed = AiPatchProposalSchema.parse({ ...baseProposal, status });
      expect(parsed.status).toBe(status);
    });
  }

  it("round-trips through JSON", () => {
    const round = AiPatchProposalSchema.parse(JSON.parse(JSON.stringify(baseProposal)));
    expect(round).toEqual(baseProposal);
  });

  it("rejects when operations exceed cap of 50", () => {
    const op = baseProposal.operations[0]!;
    const big = Array.from({ length: 51 }, () => op);
    const result = AiPatchProposalSchema.safeParse({ ...baseProposal, operations: big });
    expect(result.success).toBe(false);
  });

  it("accepts an empty operations array (still <= 50)", () => {
    const result = AiPatchProposalSchema.safeParse({ ...baseProposal, operations: [] });
    expect(result.success).toBe(true);
  });

  it("accepts exactly 50 operations", () => {
    const op = baseProposal.operations[0]!;
    const ops = Array.from({ length: 50 }, () => op);
    const result = AiPatchProposalSchema.safeParse({ ...baseProposal, operations: ops });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const { id: _id, ...rest } = baseProposal;
    void _id;
    const result = AiPatchProposalSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty id", () => {
    const result = AiPatchProposalSchema.safeParse({ ...baseProposal, id: "" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown status", () => {
    const result = AiPatchProposalSchema.safeParse({ ...baseProposal, status: "archived" });
    expect(result.success).toBe(false);
  });

  it("rejects missing source fields", () => {
    const result = AiPatchProposalSchema.safeParse({
      ...baseProposal,
      source: { taskKind: "propose-fixes" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown providerKind", () => {
    const result = AiPatchProposalSchema.safeParse({
      ...baseProposal,
      source: { ...baseProposal.source, providerKind: "gemini" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when nested operation is malformed", () => {
    const result = AiPatchProposalSchema.safeParse({
      ...baseProposal,
      operations: [{ type: "token.patch", setId: "core" }],
    });
    expect(result.success).toBe(false);
  });
});
