/**
 * Zod schema for DTCG token files.
 *
 * Validates that the parsed JSON is structurally a DTCG document. We are
 * lenient with composite values because the spec keeps evolving — the
 * priority is to never reject a valid Figma export.
 */

import { z } from "zod";
import { DTCG_TYPES } from "./types";

const dtcgTypeSchema = z.enum(DTCG_TYPES);

/**
 * Optional structural shape for the `com.rozetta.semantic` extension. Exposed
 * for downstream consumers that want to validate the metadata when present;
 * not enforced inside the DTCG `$extensions` record (which stays open by
 * design).
 */
export const rozettaSemanticDescriptionSchema = z.object({
  intent: z.string().optional(),
  usage: z.string().optional(),
  donts: z.array(z.string()).optional(),
});

export const tokenRelationSchema = z.object({
  kind: z.enum(["backs", "variant-of", "pairs-with", "replaces"]),
  target: z.string(),
});

export const rozettaSemanticMetadataSchema = z.object({
  tier: z.enum(["primitive", "semantic", "component"]),
  role: z.string().optional(),
  description: rozettaSemanticDescriptionSchema.optional(),
  relations: z.array(tokenRelationSchema).optional(),
  deprecated: z.boolean().optional(),
  replacedBy: z.string().optional(),
});

export type RozettaSemanticMetadataInput = z.infer<
  typeof rozettaSemanticMetadataSchema
>;

/** Recursive node schema: either a token (has $value) or a group. */
const dtcgNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z
      .object({
        $value: z.unknown(),
        $type: dtcgTypeSchema.optional(),
        $description: z.string().optional(),
        $extensions: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough(),
    z
      .object({
        $type: dtcgTypeSchema.optional(),
        $description: z.string().optional(),
        $extensions: z.record(z.string(), z.unknown()).optional(),
      })
      .catchall(z.unknown()),
  ])
);

/** Full file schema: a top-level object whose keys are nodes. */
export const dtcgFileSchema = z
  .record(z.string(), dtcgNodeSchema)
  .refine((value) => Object.keys(value).length > 0, {
    message: "Token file must contain at least one group or token.",
  });

export type DtcgFileInput = z.infer<typeof dtcgFileSchema>;

/**
 * Parse + validate raw text. Returns either the structured tree or a
 * formatted error string for surfacing in the UI.
 */
export function parseTokenFile(
  raw: string
): { ok: true; data: DtcgFileInput } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const result = dtcgFileSchema.safeParse(json);
  if (!result.success) {
    const flat = z.flattenError(result.error);
    const messages = [
      ...flat.formErrors,
      ...Object.entries(flat.fieldErrors).map(
        ([k, v]) => `${k}: ${(v ?? []).join(", ")}`
      ),
    ];
    return {
      ok: false,
      error: messages.length > 0 ? messages.join("\n") : "Schema validation failed.",
    };
  }

  return { ok: true, data: result.data };
}
