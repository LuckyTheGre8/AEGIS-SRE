import { z } from "zod";
import { AgentActionSchema, EvidenceSchema, HypothesisSchema, InvestigationEventSchema, InvestigationStateSchema } from "../agent/schemas";

export const InvestigationResultSchema = z.object({
  id: z.string(),
  state: InvestigationStateSchema,
  outcome: z.enum(["INCONCLUSIVE", "FAILED"]),
  summary: z.string(),
  iterations: z.number().int().nonnegative(),
  model: z.object({ provider: z.string(), model: z.string() }).nullable(),
  hypotheses: z.array(HypothesisSchema),
  evidence: z.array(EvidenceSchema),
  events: z.array(InvestigationEventSchema),
  actions: z.array(z.object({ action: AgentActionSchema, decision: z.enum(["ALLOW", "DENY", "REQUIRE_APPROVAL"]), reason: z.string() })),
  cleanup: z.enum(["NOT_REQUIRED", "DESTROYED", "FAILED", "UNCONFIRMED"]),
  sandboxId: z.string().nullable(),
  productionAction: z.literal("NOT_EXECUTED"),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});
export type InvestigationResult = z.infer<typeof InvestigationResultSchema>;
