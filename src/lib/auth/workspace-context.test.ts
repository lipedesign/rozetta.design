import { describe, expect, it, vi } from "vitest";

import {
  canManageWorkspace,
  canReadWorkspace,
  canWriteWorkspace,
  requireWorkspaceRole,
} from "@/lib/auth/workspace-context";
import type { WorkspaceContext } from "@/lib/auth/types";

vi.mock("server-only", () => ({}));

const baseContext: WorkspaceContext = {
  userId: "user",
  organizationId: "org",
  workspaceId: "workspace",
  role: "viewer",
  source: "test",
};

describe("workspace authorization guards", () => {
  it("allows read access for every workspace member role", () => {
    expect(canReadWorkspace(baseContext)).toBe(true);
  });

  it("allows writes only for editor and above", () => {
    expect(canWriteWorkspace({ ...baseContext, role: "viewer" })).toBe(false);
    expect(canWriteWorkspace({ ...baseContext, role: "editor" })).toBe(true);
    expect(canWriteWorkspace({ ...baseContext, role: "admin" })).toBe(true);
    expect(canWriteWorkspace({ ...baseContext, role: "owner" })).toBe(true);
  });

  it("allows management only for admin and owner", () => {
    expect(canManageWorkspace({ ...baseContext, role: "editor" })).toBe(false);
    expect(canManageWorkspace({ ...baseContext, role: "admin" })).toBe(true);
    expect(canManageWorkspace({ ...baseContext, role: "owner" })).toBe(true);
  });

  it("throws when the active role is below the required role", () => {
    expect(() => requireWorkspaceRole(baseContext, "editor")).toThrow(/editor required/i);
  });
});
