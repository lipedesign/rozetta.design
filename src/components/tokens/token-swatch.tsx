"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { formatColorForCss } from "@/lib/dtcg/format";
import { isAliasValue } from "@/lib/dtcg/parser";
import { resolveToken, readFigmaAlias } from "@/lib/dtcg/resolver";
import { useTokensStore } from "@/lib/stores/tokens-store";
import type { DtcgToken, DtcgType, DtcgValue } from "@/lib/dtcg/types";

interface TokenSwatchProps {
  setId: string;
  path: string;
  $type: DtcgType;
  $value: DtcgValue;
  /** Optional source token, used to detect Figma aliases. */
  token?: DtcgToken;
  className?: string;
  /**
   * When true, render a minimalist preview suitable for tight spaces (e.g.
   * the 20x20px swatch in the resolved-value column of the token table).
   * Compact mode skips inline numeric labels — the table already prints the
   * resolved value next to the swatch, so duplicating it inside the swatch
   * just produced visual noise on dimension/number tokens.
   */
  compact?: boolean;
}

/**
 * Compact preview of a token. Renders different visual cues per `$type` so
 * the user can scan a grid and immediately understand what each token does.
 */
export function TokenSwatch({
  setId,
  path,
  $type,
  $value,
  token,
  className,
  compact = false,
}: TokenSwatchProps) {
  const sets = useTokensStore((s) => s.sets);

  const literal = useMemo(() => {
    const aliasByDtcg = isAliasValue($value);
    const aliasByFigma = token ? Boolean(readFigmaAlias(token)?.targetVariableName) : false;
    if (aliasByDtcg || aliasByFigma) {
      const result = resolveToken(setId, path, { currentSetId: setId, sets });
      return result.value;
    }
    return $value;
  }, [$value, path, setId, sets, token]);

  return (
    <div
      className={cn(
        "bg-muted/50 flex h-20 w-full items-center justify-center overflow-hidden rounded-md border",
        className
      )}
    >
      {renderPreview($type, literal, path, compact)}
    </div>
  );
}

function renderPreview(
  type: DtcgType,
  value: DtcgValue | undefined,
  path: string,
  compact: boolean
) {
  if (value === undefined) {
    return <UnresolvedPreview />;
  }

  if (type === "color") {
    return <ColorPreview value={value} />;
  }

  if (type === "number" || type === "dimension") {
    return <DimensionPreview value={value} path={path} compact={compact} />;
  }

  if (type === "fontFamily") {
    return <FontFamilyPreview value={value} />;
  }

  if (type === "fontWeight") {
    return <FontWeightPreview value={value} compact={compact} />;
  }

  return <GenericPreview value={value} />;
}

function ColorPreview({ value }: { value: DtcgValue }) {
  const css = formatColorForCss(value);
  if (!css) return <UnresolvedPreview />;
  return (
    <div
      className="size-full"
      style={{
        backgroundColor: css,
        backgroundImage:
          "linear-gradient(45deg, oklch(0.92 0 0) 25%, transparent 25%), linear-gradient(-45deg, oklch(0.92 0 0) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, oklch(0.92 0 0) 75%), linear-gradient(-45deg, transparent 75%, oklch(0.92 0 0) 75%)",
        backgroundSize: "12px 12px",
        backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0",
        backgroundBlendMode: "normal",
      }}
    >
      <div className="size-full" style={{ backgroundColor: css }} />
    </div>
  );
}

function DimensionPreview({
  value,
  path,
  compact,
}: {
  value: DtcgValue;
  path: string;
  compact: boolean;
}) {
  const numeric = typeof value === "number"
    ? value
    : value && typeof value === "object" && "value" in value && typeof (value as Record<string, unknown>).value === "number"
      ? ((value as Record<string, unknown>).value as number)
      : undefined;

  if (numeric === undefined) {
    return <GenericPreview value={value} />;
  }

  const isRadius = /radius|corner/i.test(path);
  const isOpacity = /opacity|alpha/i.test(path);
  const isWidth = /width|thickness|stroke|border/i.test(path);

  if (isRadius) {
    // In compact mode the swatch is ~20px, so cap the inner box at ~14px
    // so the rounded corner is still legible and we don't need an extra
    // numeric label.
    const size = compact ? 14 : 48;
    const radius = compact ? Math.min(numeric, size / 2) : numeric;
    return (
      <div
        className="bg-foreground/10 border"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: `${radius}px`,
        }}
      />
    );
  }

  if (isOpacity) {
    const opacity = numeric > 1 ? numeric / 100 : numeric;
    if (compact) {
      return (
        <div className="bg-foreground size-3.5 rounded-sm" style={{ opacity }} />
      );
    }
    return (
      <div className="flex items-center gap-2">
        <div className="bg-foreground size-10 rounded-md" style={{ opacity }} />
        <span className="font-mono text-xs">{numeric}</span>
      </div>
    );
  }

  if (compact) {
    // Tiny preview: a horizontal stroke whose thickness reflects the value
    // for width-like tokens, or a short bar whose length reflects spacing.
    if (isWidth) {
      const thickness = Math.min(Math.max(numeric, 1), 10);
      return (
        <div
          className="bg-foreground w-3.5 rounded-[1px]"
          style={{ height: `${thickness}px` }}
        />
      );
    }
    const widthPx = Math.min(Math.max(numeric, 2), 14);
    return (
      <div
        className="bg-foreground h-0.5 rounded-[1px]"
        style={{ width: `${widthPx}px` }}
      />
    );
  }

  const widthPx = Math.min(Math.max(numeric, 2), 80);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="bg-foreground h-1 rounded" style={{ width: `${widthPx}px` }} />
      <span className="font-mono text-xs">{numeric}</span>
    </div>
  );
}

function FontFamilyPreview({ value }: { value: DtcgValue }) {
  const family =
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value.join(", ")
        : "—";
  return (
    <span className="text-base" style={{ fontFamily: String(family) }}>
      Aa
    </span>
  );
}

function FontWeightPreview({
  value,
  compact,
}: {
  value: DtcgValue;
  compact: boolean;
}) {
  const weight = typeof value === "number" ? value : Number(value) || 400;
  return (
    <span className={compact ? "text-[10px]" : "text-lg"} style={{ fontWeight: weight }}>
      Aa
    </span>
  );
}

function GenericPreview({ value }: { value: DtcgValue }) {
  return (
    <span className="text-muted-foreground truncate px-2 font-mono text-xs">
      {typeof value === "object" ? JSON.stringify(value) : String(value)}
    </span>
  );
}

function UnresolvedPreview() {
  return (
    <span className="text-muted-foreground/60 font-mono text-xs">unresolved</span>
  );
}
