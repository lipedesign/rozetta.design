import type { LucideIcon } from "lucide-react";

import type { AiTaskKind } from "@/lib/workspace/types";

export interface AiShortcut {
  value: AiTaskKind;
  title: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
}
