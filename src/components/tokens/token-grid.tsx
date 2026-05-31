"use client";

import { useMemo } from "react";

import { useTokensStore } from "@/lib/stores/tokens-store";

import { TokenSwatch } from "./token-swatch";
import { TokenValue } from "./token-value";

import type { DtcgToken, DtcgType, DtcgValue } from "@/lib/dtcg/types";

export interface TokenGridItem {
  setId: string;
  path: string;
  name: string;
  $type: DtcgType;
  $value: DtcgValue;
  $description?: string;
  isAlias: boolean;
  /** Original token, useful for Figma alias detection. */
  token?: DtcgToken;
}

interface TokenGridProps {
  items: TokenGridItem[];
}

export function TokenGrid({ items }: TokenGridProps) {
  const selectToken = useTokensStore((s) => s.selectToken);
  const groups = useMemo(() => groupItems(items), [items]);

  return (
    <div className="flex flex-col">
      {groups.map(([groupKey, groupItems]) => (
        <section key={groupKey}>
          <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-3 backdrop-blur-md">
            <h2 className="font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {groupKey}
            </h2>
          </header>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 [&>*]:border-b [&>*]:border-r [&>*:nth-child(2n)]:border-r-0 sm:[&>*:nth-child(2n)]:border-r sm:[&>*:nth-child(3n)]:border-r-0 lg:[&>*:nth-child(3n)]:border-r lg:[&>*:nth-child(4n)]:border-r-0 xl:[&>*:nth-child(4n)]:border-r xl:[&>*:nth-child(5n)]:border-r-0 2xl:[&>*:nth-child(5n)]:border-r 2xl:[&>*:nth-child(6n)]:border-r-0">
            {groupItems.map((item) => (
              <button
                key={`${item.setId}-${item.path}`}
                type="button"
                onClick={() => selectToken(item.setId, item.path)}
                className="group flex cursor-pointer flex-col gap-3 px-5 py-5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
              >
                <TokenSwatch
                  setId={item.setId}
                  path={item.path}
                  $type={item.$type}
                  $value={item.$value}
                  token={item.token}
                  className="h-24 transition-colors group-hover:border-foreground/25"
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-sm">{item.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.$type}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    <TokenValue
                      setId={item.setId}
                      path={item.path}
                      $type={item.$type}
                      $value={item.$value}
                      token={item.token}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupItems(items: TokenGridItem[]): Array<[string, TokenGridItem[]]> {
  const groups = new Map<string, TokenGridItem[]>();
  for (const item of items) {
    const segments = item.path.split(".");
    const groupKey = segments.length > 1 ? segments.slice(0, -1).join(".") : "(root)";
    const bucket = groups.get(groupKey);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(groupKey, [item]);
    }
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}
