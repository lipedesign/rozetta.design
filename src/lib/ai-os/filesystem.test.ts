import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultAiConversation } from "./registry";

vi.mock("server-only", () => ({}));

const originalCwd = process.cwd();
let tempDir: string;

describe("AI OS filesystem", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "rozetta-ai-"));
    process.chdir(tempDir);
    vi.resetModules();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { force: true, recursive: true });
    vi.resetModules();
  });

  it("reads, writes, and clears the persisted AI conversation file", async () => {
    const {
      clearAiConversationFile,
      loadAiConversationFile,
      writeAiConversationFile,
    } = await import("./filesystem");

    const missing = await loadAiConversationFile();
    expect(missing.exists).toBe(false);
    expect(missing.conversation.messages).toEqual([]);

    const conversation = createDefaultAiConversation("2026-01-01T00:00:00.000Z");
    conversation.messages.push({
      id: "message",
      role: "user",
      content: "Hello Rozetta",
      createdAt: "2026-01-01T00:00:01.000Z",
      status: "ready",
    });
    await writeAiConversationFile(conversation);

    const saved = await loadAiConversationFile();
    expect(saved.exists).toBe(true);
    expect(saved.conversation.messages[0]?.content).toBe("Hello Rozetta");

    const cleared = await clearAiConversationFile();
    expect(cleared.conversation.messages).toEqual([]);
  });
});
