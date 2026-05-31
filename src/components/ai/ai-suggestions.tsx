"use client";

import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import type { AiShortcut } from "@/components/ai/ai-types";

interface AiSuggestionsProps {
  activeValue: AiShortcut["value"];
  className?: string;
  onSelect: (shortcut: AiShortcut) => void;
  shortcuts: AiShortcut[];
}

export function AiSuggestions({
  activeValue,
  className,
  onSelect,
  shortcuts,
}: AiSuggestionsProps) {
  return (
    <Suggestions className={className}>
      {shortcuts.map((shortcut) => {
        const Icon = shortcut.icon;
        const isActive = shortcut.value === activeValue;

        return (
          <Suggestion
            key={shortcut.value}
            suggestion={shortcut.title}
            size="sm"
            variant={isActive ? "default" : "outline"}
            onClick={() => onSelect(shortcut)}
            aria-label={`${shortcut.title}: ${shortcut.description}`}
            className="h-8 px-2.5 text-xs"
          >
            <Icon className="size-3.5" />
            {shortcut.title}
          </Suggestion>
        );
      })}
    </Suggestions>
  );
}
