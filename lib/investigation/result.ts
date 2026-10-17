import { z } from "zod";
import { AgentActionSchema, CommandResultSchema, EvidenceSchema, GeneratedToolSchema, HypothesisSchema, InvestigationEventSchema, InvestigationStateSchema } from "../agent/schemas";
import { PatchValidationSchema } from "../patch/schemas";

export const ToolAttemptSchema = z.object({
  attempt: z.number().int(), tool: GeneratedToolSchema.nullable(), sha256: z.string().nullable(),
  checks: z.array(z.string()), decision: z.enum(["ALLOW", "DENY"]), reason: z.string(),
  execution: CommandResultSchema.nullable(), error: z.string().optional(),
});
export type ToolAttempt = z.infer<typeof ToolAttemptSchema>;

export const InvestigationResultSchema = z.object({
  id: z.string(),
  state: InvestigationStateSchema,
  outcome: z.enum(["INCONCLUSIVE", "FAILED", "VERIFIED"]),
  summary: z.string(),
  iterations: z.number().int().nonnegative(),
  model: z.object({ provider: z.string(), model: z.string() }).nullable(),
  hypotheses: z.array(HypothesisSchema),
  evidence: z.array(EvidenceSchema),
  events: z.array(InvestigationEventSchema),
  actions: z.array(z.object({ action: AgentActionSchema, decision: z.enum(["ALLOW", "DENY", "REQUIRE_APPROVAL"]), reason: z.string() })),
  tools: z.array(ToolAttemptSchema).default([]),
  validation: PatchValidationSchema.nullable().default(null),
  cleanup: z.enum(["NOT_REQUIRED", "DESTROYED", "FAILED", "UNCONFIRMED"]),
  sandboxId: z.string().nullable(),
  productionAction: z.literal("NOT_EXECUTED"),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});
export type InvestigationResult = z.infer<typeof InvestigationResultSchema>;
