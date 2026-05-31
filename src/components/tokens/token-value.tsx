"use client";

import { AliasBadge } from "@/components/tokens/alias-badge";
import { isAliasValue } from "@/lib/dtcg/parser";
import { resolveToken } from "@/lib/dtcg/resolver";
import { useTokensStore } from "@/lib/stores/tokens-store";
import { formatTokenValue } from "@/lib/dtcg/format";
import { readFigmaAlias } from "@/lib/dtcg/resolver";
import type { DtcgToken, DtcgType, DtcgValue } from "@/lib/dtcg/types";

interface TokenValueProps {
  setId: string;
  path: string;
  $type: DtcgType;
  $value: DtcgValue;
  /** Optional original token for Figma alias detection. */
  token?: DtcgToken;
}

/**
 * Renders the on-screen value of a token. When the token aliases another
 * token (DTCG path or Figma extension), the alias badge takes over.
 */
export function TokenValue({ setId, path, $type, $value, token }: TokenValueProps) {
  const sets = useTokensStore((s) => s.sets);

  const aliasByDtcg = isAliasValue($value);
  const aliasByFigma = token ? Boolean(readFigmaAlias(token)?.targetVariableName) : false;

  if (aliasByDtcg || aliasByFigma) {
    const resolution = resolveToken(setId, path, { currentSetId: setId, sets });
    const literal = resolution.value;
    const formatted = literal !== undefined ? formatTokenValue(literal, $type) : "—";

    return (
      <span className="inline-flex items-center gap-2">
        <AliasBadge setId={setId} path={path} />
        <span className="text-muted-foreground font-mono text-xs">{formatted}</span>
      </span>
    );
  }

  return (
    <span className="font-mono text-xs">{formatTokenValue($value, $type)}</span>
  );
}
