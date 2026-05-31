"use client";

import { ArrowRightIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { resolveToken, type ResolutionStep } from "@/lib/dtcg/resolver";
import { useTokensStore } from "@/lib/stores/tokens-store";

interface AliasBadgeProps {
  setId: string;
  path: string;
  /** Optional className applied to the trigger badge. */
  className?: string;
}

/**
 * Visual badge for tokens whose value is an alias. Shows the immediate target
 * label and the full resolution chain in a tooltip.
 */
export function AliasBadge({ setId, path, className }: AliasBadgeProps) {
  const sets = useTokensStore((s) => s.sets);
  const result = resolveToken(setId, path, { currentSetId: setId, sets });

  const finalStep = result.chain[result.chain.length - 1];
  const targetLabel = finalStep
    ? `${finalStep.setId}.${finalStep.path}`
    : "unresolved";

  return (
    <Tooltip>
      <TooltipTrigger render={<span className={className} />}>
        <Badge variant="outline" className="font-mono text-xs">
          <ArrowRightIcon className="size-3" />
          {targetLabel}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {result.error ? (
          <span>Failed to resolve: {result.error}</span>
        ) : (
          <ChainDisplay chain={result.chain} />
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function ChainDisplay({ chain }: { chain: ResolutionStep[] }) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">Resolution chain</span>
      {chain.map((step, index) => (
        <div key={`${step.setId}-${step.path}-${index}`} className="font-mono">
          {step.setId}.{step.path}
          {step.source !== "literal" ? (
            <span className="text-muted-foreground ml-1">
              ({step.source.replace("-alias", " alias")})
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
