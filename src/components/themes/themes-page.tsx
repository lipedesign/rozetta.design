"use client";

import { ThemeGroupsPane } from "./theme-groups-pane";
import { ThemeWorkspace } from "./theme-workspace";

/**
 * `/themes` mirrors `/` (Tokens) in structure:
 *
 *   <ThemeGroupsPane />          <ThemeWorkspace />
 *   ┌──────────────┐  ┌─────────────────────────┐
 *   │ Theme Groups │  │  selected Theme editor   │
 *   │  ▼ Brand     │  │  · meta header           │
 *   │    Acme      │  │  · Collection→Mode picker│
 *   │  ▼ Surface   │  │  · conflicts             │
 *   │    Light     │  │                          │
 *   │    Dark      │  │                          │
 *   └──────────────┘  └─────────────────────────┘
 *
 * The persistent `(studio)` layout already provides the rounded card wrapper;
 * this component returns its two panes as siblings so they flex side-by-side
 * inside that card — same approach as `StudioEditor` for the Tokens page.
 */
export function ThemesPage() {
  return (
    <>
      <ThemeGroupsPane />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ThemeWorkspace />
      </div>
    </>
  );
}
