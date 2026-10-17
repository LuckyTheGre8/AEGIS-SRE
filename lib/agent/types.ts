import type { z } from "zod";
import type {
  AgentActionSchema, CommandResultSchema, EvidenceSchema, GeneratedToolSchema,
  HypothesisSchema, IncidentInputSchema, IncidentReportSchema,
  InvestigationEventSchema, PatchArtifactSchema, RiskSchema,
} from "./schemas";

export type AgentAction = z.infer<typeof AgentActionSchema>;
export type CommandResult = z.infer<typeof CommandResultSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type GeneratedTool = z.infer<typeof GeneratedToolSchema>;
export type Hypothesis = z.infer<typeof HypothesisSchema>;
export type IncidentInput = z.infer<typeof IncidentInputSchema>;
export type IncidentReport = z.infer<typeof IncidentReportSchema>;
export type InvestigationEvent = z.infer<typeof InvestigationEventSchema>;
export type PatchArtifact = z.infer<typeof PatchArtifactSchema>;
export type Risk = z.infer<typeof RiskSchema>;

// A discriminated union keeps future stream consumers tied to real payloads.
export type StreamEvent = {
  [K in keyof StreamPayloads]: { type: K; timestamp: string; payload: StreamPayloads[K] }
}[keyof StreamPayloads];

interface StreamPayloads {
  state: InvestigationEvent;
  hypothesis: Hypothesis;
  tool: GeneratedTool;
  sandbox: { id: string; phase: "diagnosis" | "validation"; status: "creating" | "running" | "destroyed" | "failed" };
  evidence: Evidence;
  patch: PatchArtifact;
  validation: { status: PatchArtifact["validationStatus"]; evidenceIds: string[] };
  report: IncidentReport;
  error: { code: string; message: string };
}
