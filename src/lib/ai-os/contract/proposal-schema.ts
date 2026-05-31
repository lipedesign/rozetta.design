import { z } from "zod";

import { AiPatchOperationSchema } from "./operation-schema";

// WHY isomorphic: this module's inferred types back the public AiPatchProposal
// re-exported from workspace/types.ts and consumed by client review surfaces.

export const AiPatchStatusSchema = z.enum(["pending", "reviewed", "applied", "dismissed"]);

const aiTaskKindSchema = z.enum([
  "explain-issues",
  "suggest-names",
  "propose-fixes",
  "design-system",
  "release-notes",
  "workspace-question",
]);

const aiProviderKindSchema = z.enum([
  "deterministic",
  "openai",
  "anthropic",
  "claude-code-local",
  "codex-local",
]);

export const AiPatchProposalSourceSchema = z.object({
  taskKind: aiTaskKindSchema,
  providerKind: aiProviderKindSchema,
  modelId: z.string(),
});

export const AiPatchProposalSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  summary: z.string(),
  status: AiPatchStatusSchema,
  operations: z.array(AiPatchOperationSchema).max(50),
  source: AiPatchProposalSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AiPatchProposal = z.infer<typeof AiPatchProposalSchema>;
export type AiPatchStatus = z.infer<typeof AiPatchStatusSchema>;
export type AiPatchProposalSource = z.infer<typeof AiPatchProposalSourceSchema>;
