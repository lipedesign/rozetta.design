import { z } from "zod";

import { DTCG_TYPES } from "@/lib/dtcg/types";

// WHY isomorphic (no `server-only`): the inferred TS types are re-exported as
// the canonical AiPatchOperation / AiPatchProposal in workspace/types.ts and
// must reach client components (ai-review-queue, ai-assistant-home).

const recordOfUnknown = z.record(z.string(), z.unknown());

const themeSetRefSchema = z.object({
  collectionId: z.string().optional(),
  setId: z.string(),
  modeId: z.string().optional(),
  state: z.enum(["enabled", "source", "disabled"]).optional(),
  mode: z.enum(["enabled", "source", "disabled"]),
});

const themeSchema = z.object({
  id: z.string(),
  themeGroupId: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  position: z.number().optional(),
  sets: z.array(themeSetRefSchema),
  updatedAt: z.string(),
});

const brandFigmaMappingSchema = z.object({
  collectionId: z.string(),
  collectionName: z.string().optional(),
  modeId: z.string().optional(),
  modeName: z.string().optional(),
  themeId: z.string().optional(),
});

const brandSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  status: z.enum(["draft", "active", "deprecated"]),
  baseBrandId: z.string().optional(),
  tokenSetIds: z.array(z.string()),
  themeIds: z.array(z.string()),
  exportProfileIds: z.array(z.string()),
  componentIds: z.array(z.string()),
  figmaFile: z
    .object({
      fileKey: z.string(),
      url: z.string().optional(),
      mappings: z.array(brandFigmaMappingSchema),
    })
    .optional(),
  updatedAt: z.string(),
});

const componentVariantSchema = z.object({
  id: z.string(),
  name: z.string(),
  values: z.array(z.string()),
});

const componentPropSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean().optional(),
  description: z.string().optional(),
});

const componentStateSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

const componentCodeBindingSchema = z.object({
  source: z.string(),
  exportName: z.string().optional(),
  framework: z.string().optional(),
});

const componentFigmaBindingSchema = z.object({
  fileKey: z.string().optional(),
  nodeId: z.string().optional(),
  componentName: z.string().optional(),
});

const designSystemComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  category: z.string(),
  status: z.enum(["draft", "ready", "deprecated"]),
  tokenRefs: z.array(z.string()),
  variants: z.array(componentVariantSchema),
  props: z.array(componentPropSchema),
  states: z.array(componentStateSchema),
  bindings: z.object({
    code: z.array(componentCodeBindingSchema),
    figma: z.array(componentFigmaBindingSchema),
  }),
  brandIds: z.array(z.string()),
  updatedAt: z.string(),
});

const exportProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetKind: z.enum(["collection", "set", "theme"]),
  targetId: z.string(),
  format: z.enum(["css", "tailwind", "json", "style-dictionary"]),
  destination: z.string(),
  updatedAt: z.string(),
});

const dtcgTypeSchema = z.enum(DTCG_TYPES);

export const TokenPatchOpSchema = z.object({
  type: z.literal("token.patch"),
  setId: z.string().min(1),
  path: z.string().min(1),
  patch: z.object({
    $value: z.unknown().optional(),
    $type: dtcgTypeSchema.optional(),
    $description: z.string().optional(),
    $extensions: recordOfUnknown.optional(),
  }),
});

export const ThemeUpsertOpSchema = z.object({
  type: z.literal("theme.upsert"),
  theme: themeSchema,
});

export const BrandUpsertOpSchema = z.object({
  type: z.literal("brand.upsert"),
  brand: brandSchema,
});

export const ComponentUpsertOpSchema = z.object({
  type: z.literal("component.upsert"),
  component: designSystemComponentSchema,
});

export const ReleaseNoteGenerateOpSchema = z.object({
  type: z.literal("release-note.generate"),
  notes: z.string(),
});

export const ExportProfileUpsertOpSchema = z.object({
  type: z.literal("export-profile.upsert"),
  profile: exportProfileSchema,
});

export const FigmaApplyToRozettaOpSchema = z.object({
  type: z.literal("figma.apply-to-rozetta"),
  syncRunId: z.string(),
});

export const FigmaPushToFigmaOpSchema = z.object({
  type: z.literal("figma.push-to-figma"),
  syncRunId: z.string(),
});

export const GithubPrCreateOpSchema = z.object({
  type: z.literal("github.pr.create"),
  draftId: z.string(),
});

export const AiPatchOperationSchema = z.discriminatedUnion("type", [
  TokenPatchOpSchema,
  ThemeUpsertOpSchema,
  BrandUpsertOpSchema,
  ComponentUpsertOpSchema,
  ReleaseNoteGenerateOpSchema,
  ExportProfileUpsertOpSchema,
  FigmaApplyToRozettaOpSchema,
  FigmaPushToFigmaOpSchema,
  GithubPrCreateOpSchema,
]);

export type AiPatchOperation = z.infer<typeof AiPatchOperationSchema>;
