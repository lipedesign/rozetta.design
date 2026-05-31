import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFigmaBridgePairingCode,
  resolveFigmaBridgePairingCode,
} from "./pairing";
import type { WorkspaceContext } from "@/lib/auth/types";

const context: WorkspaceContext = {
  userId: "user-1",
  organizationId: "org-1",
  workspaceId: "workspace-1",
  role: "editor",
  source: "test",
};

describe("Figma bridge pairing", () => {
  const originalSecret = process.env.FIGMA_BRIDGE_PAIRING_SECRET;

  beforeEach(() => {
    process.env.FIGMA_BRIDGE_PAIRING_SECRET = "test-figma-bridge-secret";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T12:00:00.000Z"));
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.FIGMA_BRIDGE_PAIRING_SECRET;
    } else {
      process.env.FIGMA_BRIDGE_PAIRING_SECRET = originalSecret;
    }
    vi.useRealTimers();
  });

  it("resolves a signed pairing code into a workspace context", () => {
    const pairing = createFigmaBridgePairingCode(context);

    expect(resolveFigmaBridgePairingCode(pairing.code)).toEqual(context);
  });

  it("rejects tampered pairing codes", () => {
    const pairing = createFigmaBridgePairingCode(context);
    const tampered = `${pairing.code.slice(0, -1)}x`;

    expect(() => resolveFigmaBridgePairingCode(tampered)).toThrow(
      "Invalid Figma Bridge pairing code."
    );
  });

  it("rejects expired pairing codes", () => {
    const pairing = createFigmaBridgePairingCode(context, 1_000);
    vi.setSystemTime(new Date("2026-05-11T12:00:02.000Z"));

    expect(() => resolveFigmaBridgePairingCode(pairing.code)).toThrow(
      "Expired Figma Bridge pairing code."
    );
  });
});
