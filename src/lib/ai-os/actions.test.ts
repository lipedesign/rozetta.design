import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AiCommandInput, AiTaskKind } from "@/lib/workspace/types";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const originalCwd = process.cwd();
let tempDir: string;

function command(kind: AiTaskKind): AiCommandInput {
  return {
    kind,
    prompt:
      kind === "release-notes"
        ? "Prepare release notes from the current workspace."
        : "Explain the current workspace health.",
    context: {
      sets: true,
      themes: true,
      brands: true,
      components: true,
      releases: true,
      git: true,
    },
    gitScope: "semantic-diff",
    outputMode: kind === "release-notes" ? "release-notes" : "explain-only",
    targetScope: "workspace",
    slashCommandId: kind === "release-notes" ? "release-notes" : "ask-workspace",
    toolPreference: "read-only",
    workspace: {
      sets: [],
      baselineSets: [],
      themes: [],
      brands: [],
      components: [],
      exportProfiles: [],
    },
  };
}

describe("AI OS actions", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "rozetta-ai-actions-"));
    process.chdir(tempDir);
    vi.resetModules();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { force: true, recursive: true });
    vi.resetModules();
  });

  it("creates user and assistant messages without queueing explanatory proposals", async () => {
    const { runAiCommand } = await import("./actions");

    const result = await runAiCommand(command("workspace-question"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal).toBeUndefined();
    expect(result.patchQueue).toHaveLength(0);
    expect(result.conversation.messages).toHaveLength(2);
    expect(result.conversation.messages[0]?.role).toBe("user");
    expect(result.assistantMessage.role).toBe("assistant");
    expect(result.assistantMessage.patchId).toBeUndefined();
  });

  it("queues proposals with operations and links the assistant message to the patch", async () => {
    const { runAiCommand } = await import("./actions");

    const result = await runAiCommand(command("release-notes"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal?.operations.length).toBeGreaterThan(0);
    expect(result.patchQueue).toHaveLength(1);
    expect(result.assistantMessage.patchId).toBe(result.proposal?.id);
    expect(result.conversation.messages).toHaveLength(2);
  });

  it("clears only the conversation and preserves the patch queue", async () => {
    const { clearAiConversation, getAiPatchQueue, runAiCommand } = await import("./actions");

    const result = await runAiCommand(command("release-notes"));
    expect(result.ok).toBe(true);

    const cleared = await clearAiConversation();
    const queue = await getAiPatchQueue();

    expect(cleared.conversation.messages).toEqual([]);
    expect(queue.patches).toHaveLength(1);
  });
});
