"use client";

import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";
import { ProgressiveBlur } from "@/components/ui/progressive-blur";

const DEFAULT_SURFACE = "var(--popover)";

export interface FrostedEdgeBlurProps {
  blurLevels?: number[];
  className?: string;
  height?: string;
  position: "top" | "bottom";
  surface?: string;
}

export function FrostedEdgeBlur({
  blurLevels,
  className,
  height = "30%",
  position,
  surface = DEFAULT_SURFACE,
}: FrostedEdgeBlurProps) {
  const isTop = position === "top";
  const gradientDirection = isTop ? "to bottom" : "to top";
  const edgeClassName = isTop ? "top-0" : "bottom-0";
  const overlayStyle = {
    [isTop ? "top" : "bottom"]: 0,
    background: `linear-gradient(${gradientDirection}, ${surface} 0%, color-mix(in oklab, ${surface} 85%, transparent) 50%, color-mix(in oklab, ${surface} 30%, transparent) 85%, transparent 100%)`,
    height,
  } satisfies CSSProperties;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 z-20 isolate overflow-hidden rounded-[inherit]",
        edgeClassName,
        className
      )}
      style={{ height }}
    >
      <ProgressiveBlur
        blurLevels={blurLevels}
        height={height}
        position={position}
      />
      <div className="absolute inset-x-0 z-30" style={overlayStyle} />
    </div>
  );
}
