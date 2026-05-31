"use client";

import type { LucideIcon } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type SettingsCategoryId =
  | "workspace"
  | "ai-providers"
  | "bridge"
  | "storage"
  | "about";

export interface SettingsCategoryItem {
  id: SettingsCategoryId;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface SettingsCategoriesProps {
  categories: readonly SettingsCategoryItem[];
  activeId: SettingsCategoryId;
  onSelect: (id: SettingsCategoryId) => void;
}

/**
 * Left rail for `/settings`. Mirrors the shape of `TokenSetsPane` and
 * `ThemeGroupsPane`: header + scrollable list of selectable items. Selection
 * is plain useState in the parent — there's no store for settings because we
 * never persist which category was last open.
 */
export function SettingsCategories({
  categories,
  activeId,
  onSelect,
}: SettingsCategoriesProps) {
  return (
    <aside
      aria-label="Settings categories"
      className="flex w-64 shrink-0 flex-col border-r"
    >
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Settings
        </h2>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="flex flex-col gap-0.5 p-2">
          {categories.map((category) => {
            const Icon = category.icon;
            const isActive = category.id === activeId;
            return (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() => onSelect(category.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/60"
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{category.label}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {category.description}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </aside>
  );
}
