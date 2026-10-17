import { z } from "zod";
import { AgentActionSchema, HypothesisSchema } from "./schemas";
import type { Evidence, Hypothesis } from "./types";

// All fields are required here for the provider's strict JSON schema.
export const AgentDecisionSchema = z.strictObject({
  hypotheses: z.array(HypothesisSchema.extend({ statement: z.string().min(1).max(240) })).min(1).max(4),
  action: AgentActionSchema.extend({
    hypothesisId: z.string().min(1),
    expectedEvidence: z.array(z.string().min(1).max(240)).max(5),
    diagnostic: z.enum(["runtime", "listeners", "none"]),
  }),
});

export interface AgentContext {
  incident: string;
  iteration: number;
  hypotheses: Hypothesis[];
  evidence: Evidence[];
  availableDiagnostics: readonly string[];
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  /** Output is untrusted until the orchestrator validates it. */
  nextAction(context: AgentContext): Promise<unknown>;
  generateDiagnosticTool(context: ToolGenerationContext): Promise<unknown>;
}

export interface ToolGenerationContext {
  incident: string;
  hypotheses: Hypothesis[];
  evidence: Evidence[];
  fixture: string;
  attempt: number;
  previousFailure?: string;
}

export class AgentError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "AgentError"; }
}
