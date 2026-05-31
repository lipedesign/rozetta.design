"use client";

import { useEffect } from "react";

import { useTokensStore } from "@/lib/stores/tokens-store";
import type { DtcgGroup, TokenSet } from "@/lib/dtcg/types";

interface TokensProviderProps {
  initialSets: TokenSet[];
  initialOriginalRoots?: Record<string, DtcgGroup>;
  children: React.ReactNode;
}

export function TokensProvider({
  initialSets,
  initialOriginalRoots,
  children,
}: TokensProviderProps) {
  const hydrate = useTokensStore((s) => s.hydrate);

  useEffect(() => {
    hydrate(initialSets, initialOriginalRoots);
  }, [hydrate, initialOriginalRoots, initialSets]);

  return <>{children}</>;
}
