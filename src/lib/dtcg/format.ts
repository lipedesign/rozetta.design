/**
 * Formatters for DTCG values.
 *
 * The DTCG spec allows colors and dimensions to be expressed in multiple
 * shapes. These helpers normalise them into display strings (`#FFEB3B`,
 * `16px`, etc.) and into CSS-friendly strings consumable by the swatch.
 */

import { formatCss, formatHex, parse as culoriParse } from "culori";

import type { DtcgType, DtcgValue } from "./types";

/** Returns the formatted display value, or `"—"` when nothing renderable. */
export function formatTokenValue(value: DtcgValue, type: DtcgType): string {
  if (value === undefined || value === null) return "—";

  if (typeof value === "string") {
    if (type === "color") return formatColorString(value);
    return value;
  }

  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";

  if (Array.isArray(value)) {
    if (type === "color" && value.every((v) => typeof v === "number")) {
      return formatRgbArray(value as number[]);
    }
    return value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (type === "dimension" && "value" in obj && "unit" in obj) {
      return `${obj.value}${obj.unit}`;
    }
    if (type === "color" && "colorSpace" in obj && "components" in obj) {
      const cs = obj.colorSpace as string;
      const comps = (obj.components as number[]).join(" ");
      const alpha = "alpha" in obj ? ` / ${obj.alpha}` : "";
      return `color(${cs} ${comps}${alpha})`;
    }
    return JSON.stringify(value);
  }

  return String(value);
}

/** Returns a CSS color string usable as `background-color` for a swatch. */
export function formatColorForCss(value: DtcgValue): string | undefined {
  if (typeof value === "string") {
    return culoriParse(value) ? value : undefined;
  }
  if (Array.isArray(value) && value.every((v) => typeof v === "number")) {
    return formatRgbArray(value as number[]);
  }
  if (
    value &&
    typeof value === "object" &&
    "colorSpace" in value &&
    "components" in value
  ) {
    const obj = value as Record<string, unknown>;
    const space = String(obj.colorSpace);
    const components = obj.components as number[];
    const alpha = typeof obj.alpha === "number" ? obj.alpha : 1;
    const cssSpace = mapColorSpace(space);
    if (!cssSpace) return undefined;
    const parsed = culoriParse(
      `color(${cssSpace} ${components.join(" ")}${alpha < 1 ? ` / ${alpha}` : ""})`
    );
    return parsed ? formatHex(parsed) ?? formatCss(parsed) : undefined;
  }
  return undefined;
}

function formatRgbArray(rgb: number[]): string {
  const [r = 0, g = 0, b = 0, a = 1] = rgb;
  const safeR = Math.round(clamp01(r) * 255);
  const safeG = Math.round(clamp01(g) * 255);
  const safeB = Math.round(clamp01(b) * 255);
  if (a < 1) {
    return `rgb(${safeR} ${safeG} ${safeB} / ${a.toFixed(2)})`;
  }
  return rgbToHex(safeR, safeG, safeB);
}

function clamp01(value: number): number {
  if (value <= 1 && value >= 0) return value;
  if (value >= 0 && value <= 255) return value / 255;
  return Math.min(Math.max(value, 0), 255) / 255;
}

function rgbToHex(r: number, g: number, b: number): string {
  const hex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function formatColorString(value: string): string {
  const parsed = culoriParse(value);
  if (!parsed) return value;
  return formatHex(parsed) ?? value;
}

function mapColorSpace(space: string): string | undefined {
  const map: Record<string, string> = {
    srgb: "srgb",
    "display-p3": "display-p3",
    "rec2020": "rec2020",
    a98rgb: "a98-rgb",
    prophoto: "prophoto-rgb",
  };
  return map[space];
}
