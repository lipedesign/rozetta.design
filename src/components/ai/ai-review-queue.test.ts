import { describe, expect, it } from "vitest";

import {
  archivePatchGroup,
  getPatchGroupKey,
  groupPatchQueue,
} from "./ai-review-queue";
import type { AiPatchOperation, AiPatchProposal } from "@/lib/workspace/types";

describe("AI review queue grouping", () => {
  it("collapses duplicate release-note suggestions into one newest-first group", () => {
    const older = patch("older", releaseNotes(), "2026-05-11T01:00:00.000Z");
    const newer = patch("newer", releaseNotes(), "2026-05-11T02:00:00.000Z");

    const groups = groupPatchQueue([older, newer]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.patches).toHaveLength(2);
    expect(groups[0]?.activePatch.id).toBe("newer");
  });

  it("keeps suggestions with different operation labels in separate groups", () => {
    const release = patch("release", releaseNotes(), "2026-05-11T01:00:00.000Z");
    const token = patch(
      "token",
      { type: "token.patch", setId: "core", path: "color.brand", patch: {} },
      "2026-05-11T02:00:00.000Z"
    );

    const groups = groupPatchQueue([release, token]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.activePatch.id)).toEqual(["token", "release"]);
  });

  it("archives every active patch in the selected group only", () => {
    const first = patch("first", releaseNotes(), "2026-05-11T01:00:00.000Z");
    const second = patch("second", releaseNotes(), "2026-05-11T02:00:00.000Z");
    const unrelated = patch(
      "unrelated",
      { type: "token.patch", setId: "core", path: "color.brand", patch: {} },
      "2026-05-11T03:00:00.000Z"
    );

    const archived = archivePatchGroup(
      [first, second, unrelated],
      getPatchGroupKey(first),
      "2026-05-11T04:00:00.000Z"
    );

    expect(archived.find((item) => item.id === "first")?.status).toBe("dismissed");
    expect(archived.find((item) => item.id === "second")?.status).toBe("dismissed");
    expect(archived.find((item) => item.id === "unrelated")?.status).toBe("pending");
  });
});

function patch(
  id: string,
  operation: AiPatchOperation,
  createdAt: string
): AiPatchProposal {
  return {
    id,
    title: "Propose safe fixes",
    summary: "1 reviewable operation generated from 1 workspace issue.",
    status: "pending",
    operations: [operation],
    source: {
      taskKind: "propose-fixes",
      providerKind: "deterministic",
      modelId: "rozetta-deterministic-v1",
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function releaseNotes(): AiPatchOperation {
  return {
    type: "release-note.generate",
    notes: "Workspace issues to review.",
  };
}
