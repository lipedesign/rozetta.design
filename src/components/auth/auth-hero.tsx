"use client";

import { GrainGradient } from "@paper-design/shaders-react";

export function AuthHero() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <GrainGradient
        colors={["#7300ff", "#eba8ff", "#00bfff", "#2a00ff"]}
        colorBack="#0a0a0a"
        softness={0.7}
        intensity={0.55}
        noise={0.3}
        speed={0.35}
        shape="corners"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
      <div className="absolute right-12 bottom-12 left-12">
        <div className="text-2xl font-semibold tracking-tight text-white">
          Design System OS
        </div>
        <p className="mt-3 max-w-md text-sm leading-6 text-white/75">
          Manage tokens, themes, Figma sync, releases and AI-reviewed changes
          from one secure workspace.
        </p>
      </div>
    </div>
  );
}
