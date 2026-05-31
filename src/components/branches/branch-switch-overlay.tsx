"use client";

import { GitBranchIcon, LoaderCircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useBranchSwitchState } from "@/lib/branches/switch-state";

/**
 * Full-screen overlay shown while a Workspace Branch switch is in flight.
 * Mounted once in `ProductShell` and driven by `useBranchSwitchState` so any
 * trigger (AppSidebar dropdown, BranchesPane row, BranchesWorkspace button)
 * surfaces the same animation.
 */
export function BranchSwitchOverlay() {
  const switching = useBranchSwitchState((state) => state.switching);
  const targetName = useBranchSwitchState((state) => state.targetName);

  return (
    <div
      aria-hidden={!switching}
      className={cn(
        "pointer-events-none fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-200",
        switching
          ? "pointer-events-auto bg-background/70 opacity-100 backdrop-blur-sm"
          : "opacity-0"
      )}
    >
      <div
        className={cn(
          "flex flex-col items-center gap-4 rounded-2xl border bg-background px-8 py-6 shadow-2xl transition-transform duration-200",
          switching ? "scale-100" : "scale-95"
        )}
      >
        <div className="relative flex size-12 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/30" />
          <span className="absolute inset-1 rounded-full bg-emerald-500/10" />
          <GitBranchIcon className="relative size-5 text-emerald-600" />
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Switching branch
          </span>
          <span className="font-mono text-base font-semibold">
            {targetName ?? "…"}
          </span>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <LoaderCircleIcon className="size-3 animate-spin" />
            Applying workspace snapshot…
          </div>
        </div>
      </div>
    </div>
  );
}
