"use client";

import { create } from "zustand";

import {
  switchToWorkspaceBranch,
  type WorkspaceBranchSwitchResult,
} from "./actions";

interface BranchSwitchState {
  switching: boolean;
  targetName: string | null;
  begin: (targetName: string) => void;
  end: () => void;
}

/**
 * Tiny global store for the "branch switching" overlay. Server-side switches
 * take a few hundred ms while the workspace tables get rewritten from the
 * target snapshot — without an overlay the UI just blinks. Any call site that
 * triggers a switch goes through `runBranchSwitch` so the overlay is
 * orchestrated centrally.
 */
export const useBranchSwitchState = create<BranchSwitchState>((set) => ({
  switching: false,
  targetName: null,
  begin(targetName) {
    set({ switching: true, targetName });
  },
  end() {
    set({ switching: false, targetName: null });
  },
}));

const MIN_OVERLAY_MS = 400;

/**
 * Runs `switchToWorkspaceBranch` while showing the global overlay. The overlay
 * is guaranteed to be visible for at least `MIN_OVERLAY_MS` so the animation
 * never flashes on/off for sub-100ms server responses.
 */
export async function runBranchSwitch(
  branchId: string,
  targetName: string
): Promise<WorkspaceBranchSwitchResult> {
  const { begin, end } = useBranchSwitchState.getState();
  begin(targetName);
  const startedAt = Date.now();
  try {
    const result = await switchToWorkspaceBranch(branchId);
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_OVERLAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_OVERLAY_MS - elapsed));
    }
    return result;
  } finally {
    end();
  }
}
