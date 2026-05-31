/**
 * Token exporters.
 *
 * Each exporter takes the in-memory token sets (already with any unsaved
 * edits applied) and produces a downloadable artifact in a different
 * target format:
 *
 *   - CSS variables (`:root { --color-text: #111; }`) for plain CSS / Vite
 *     consumers.
 *   - Tailwind config (`{ theme: { extend: { colors: { ... } } } }`)
 *     formatted as a CommonJS module so it can be `require()`d directly.
 *   - JSON flat (`{ "color.text": "#111" }`) for design-tool round-trips.
 *
 * Aliases are resolved transitively before formatting so the output never
 * contains `{group.token.name}` references — every exported value is a
 * literal that the target consumer can use as-is.
 */

import { formatColorForCss, formatTokenValue } from "@/lib/dtcg/format";
import { flattenTokens } from "@/lib/dtcg/parser";
import { resolveToken } from "@/lib/dtcg/resolver";
import type { DtcgType, DtcgValue, TokenSet } from "@/lib/dtcg/types";

export type ExportFormatId = "css" | "tailwind" | "json";

export interface ExportFormat {
  id: ExportFormatId;
  label: string;
  description: string;
  filename: (setName: string) => string;
  /** Programming language for syntax highlighting in the preview UI. */
  language: "css" | "javascript" | "json";
}

export const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: "css",
    label: "CSS variables",
    description:
      "Plain CSS custom properties under `:root`. Drop into any global stylesheet.",
    filename: (setName) => `${slugify(setName)}.css`,
    language: "css",
  },
  {
    id: "tailwind",
    label: "Tailwind config",
    description:
      "CommonJS module with `theme.extend` shaped to match the token tree. Tailwind v3+.",
    filename: (setName) => `tailwind.${slugify(setName)}.config.js`,
    language: "javascript",
  },
  {
    id: "json",
    label: "JSON flat",
    description:
      "Resolved key-value map (`{ \"color.text\": \"#111\" }`). Useful for design-tool round-trips.",
    filename: (setName) => `${slugify(setName)}.flat.json`,
    language: "json",
  },
];

interface ResolvedExportToken {
  setId: string;
  path: string;
  $type: DtcgType;
  /** Final literal value after walking aliases. */
  value: DtcgValue;
  $description?: string;
}

/**
 * Resolves every token in a set to a literal value, dropping any that fail
 * to resolve (cycles, unresolved aliases, etc.). The returned list is sorted
 * by path so exporter output is deterministic across runs.
 */
function resolveAllTokens(
  set: TokenSet,
  sets: TokenSet[]
): ResolvedExportToken[] {
  const flat = flattenTokens(set);
  const resolved: ResolvedExportToken[] = [];
  for (const t of flat) {
    if (t.isAlias) {
      const r = resolveToken(t.setId, t.path, {
        currentSetId: t.setId,
        sets,
      });
      if (r.value === undefined) continue;
      resolved.push({
        setId: t.setId,
        path: t.path,
        $type: t.$type,
        value: r.value,
        $description: t.$description,
      });
    } else {
      resolved.push({
        setId: t.setId,
        path: t.path,
        $type: t.$type,
        value: t.$value,
        $description: t.$description,
      });
    }
  }
  return resolved.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Converts a token's value into the string that will land in the artifact.
 *
 * The DTCG `number` type is unitless on purpose, but most consumers
 * (CSS, Tailwind) expect a CSS length with units. When the path or value
 * shape strongly suggests a length (border-radius, spacing, width…) we
 * append `px` — only for unitless numeric values, never for explicit
 * `dimension` objects which already carry their own unit.
 */
function valueForOutput(token: ResolvedExportToken): string {
  if (token.$type === "color") {
    const css = formatColorForCss(token.value);
    if (css) return css;
  }
  const formatted = formatTokenValue(token.value, token.$type);
  if (
    token.$type === "number" &&
    typeof token.value === "number" &&
    looksLikeLength(token.path)
  ) {
    return `${formatted}px`;
  }
  return formatted;
}

/**
 * Heuristic: tokens whose path contains length-ish words are probably
 * meant to render as CSS lengths (px). Everything else stays unitless.
 */
function looksLikeLength(path: string): boolean {
  return /(?:^|\.)(?:radius|width|height|size|spacing|gap|padding|margin|inset|offset|stroke|thickness|corner|scale)\b/i.test(
    path
  );
}

/** "border.radius.lg" -> "--border-radius-lg" */
function pathToCssVar(path: string): string {
  return `--${path.replace(/\./g, "-")}`;
}

/** "Brand Tokens" -> "brand-tokens" */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "tokens";
}

/* ------------------------------------------------------------------ CSS */

export function exportCss(set: TokenSet, sets: TokenSet[]): string {
  const tokens = resolveAllTokens(set, sets);
  if (tokens.length === 0) {
    return `/* ${set.name} — no tokens */\n`;
  }
  const lines: string[] = [];
  lines.push("/**");
  lines.push(` * ${set.name}`);
  lines.push(` * ${tokens.length} tokens — generated by Rozetta`);
  lines.push(" * Aliases are resolved to their literal values.");
  lines.push(" */");
  lines.push(":root {");
  for (const t of tokens) {
    if (t.$description) {
      lines.push(`  /* ${t.$description.replace(/\*\//g, "*\\/")} */`);
    }
    lines.push(`  ${pathToCssVar(t.path)}: ${valueForOutput(t)};`);
  }
  lines.push("}");
  return lines.join("\n") + "\n";
}

/* ------------------------------------------------------------- Tailwind */

/**
 * Tailwind groups tokens by their leading path segment: `color.text.muted`
 * lives under `theme.extend.colors.text.muted`. We only project the four
 * "obvious" buckets that Tailwind core understands; the rest fall under
 * a generic `extend` namespace named after the segment.
 */
const TAILWIND_BUCKETS: Record<string, string> = {
  color: "colors",
  spacing: "spacing",
  size: "spacing",
  unit: "spacing",
  font: "fontFamily",
  border: "borderRadius",
};

interface NestedTree {
  [key: string]: string | NestedTree;
}

function setNested(tree: NestedTree, segments: string[], value: string): void {
  let cursor: NestedTree = tree;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]!;
    const next = cursor[key];
    if (typeof next === "string" || next === undefined) {
      const replacement: NestedTree = {};
      cursor[key] = replacement;
      cursor = replacement;
    } else {
      cursor = next;
    }
  }
  const leaf = segments[segments.length - 1]!;
  cursor[leaf] = value;
}

function nestedToJsLiteral(tree: NestedTree, indent: string): string {
  const entries = Object.entries(tree);
  if (entries.length === 0) return "{}";
  const inner = entries
    .map(([k, v]) => {
      const key = /^[a-z_$][a-z0-9_$]*$/i.test(k) ? k : JSON.stringify(k);
      const renderedValue =
        typeof v === "string"
          ? JSON.stringify(v)
          : nestedToJsLiteral(v, indent + "  ");
      return `${indent}  ${key}: ${renderedValue}`;
    })
    .join(",\n");
  return `{\n${inner}\n${indent}}`;
}

export function exportTailwind(set: TokenSet, sets: TokenSet[]): string {
  const tokens = resolveAllTokens(set, sets);
  /** bucketName -> nested tree of token-name-segment -> value */
  const buckets: Record<string, NestedTree> = {};
  /** Tokens whose top-level segment isn't a Tailwind-known bucket. */
  const customTree: NestedTree = {};

  for (const t of tokens) {
    const segments = t.path.split(".");
    const head = segments[0] ?? "";
    const bucket = TAILWIND_BUCKETS[head];
    const value = valueForOutput(t);
    if (bucket) {
      buckets[bucket] ??= {};
      setNested(buckets[bucket]!, segments.slice(1), value);
    } else {
      setNested(customTree, segments, value);
    }
  }

  const themeExtendEntries: string[] = [];
  for (const [bucket, tree] of Object.entries(buckets)) {
    themeExtendEntries.push(`    ${bucket}: ${nestedToJsLiteral(tree, "    ")}`);
  }
  if (Object.keys(customTree).length > 0) {
    themeExtendEntries.push(`    custom: ${nestedToJsLiteral(customTree, "    ")}`);
  }

  return [
    `/** ${set.name} — generated by Rozetta. ${tokens.length} tokens. */`,
    "module.exports = {",
    "  theme: {",
    "    extend: {",
    themeExtendEntries
      .map((line, i, arr) => (i < arr.length - 1 ? `${line},` : line))
      .join("\n"),
    "    },",
    "  },",
    "};",
    "",
  ].join("\n");
}

/* ----------------------------------------------------------------- JSON */

export function exportJsonFlat(set: TokenSet, sets: TokenSet[]): string {
  const tokens = resolveAllTokens(set, sets);
  const obj: Record<string, string> = {};
  for (const t of tokens) {
    obj[t.path] = valueForOutput(t);
  }
  return JSON.stringify(obj, null, 2) + "\n";
}

/* ------------------------------------------------------------ Dispatch */

export function runExport(
  format: ExportFormatId,
  set: TokenSet,
  sets: TokenSet[]
): string {
  switch (format) {
    case "css":
      return exportCss(set, sets);
    case "tailwind":
      return exportTailwind(set, sets);
    case "json":
      return exportJsonFlat(set, sets);
  }
}
