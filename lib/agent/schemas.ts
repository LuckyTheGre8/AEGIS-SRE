import { z } from "zod";
import { INVESTIGATION_STATES } from "../investigation/states";

export const RiskSchema = z.enum([
  "SAFE", "READ_ONLY", "SANDBOX_MUTATION", "EXTERNAL_NETWORK",
  "PRODUCTION_MUTATION", "DESTRUCTIVE",
]);

export const InvestigationStateSchema = z.enum(INVESTIGATION_STATES);

export const IncidentInputSchema = z.strictObject({
  incident: z.string().trim().min(10, "Describe the incident in at least 10 characters.")
    .max(4000, "Keep the incident under 4,000 characters."),
  fixture: z.literal("broken-proxy"),
});

export const AgentActionSchema = z.strictObject({
  action: z.enum(["inspect_context", "execute_diagnostic", "generate_tool", "propose_fix", "finish"]),
  reason: z.string().trim().min(1).max(240),
  hypothesisId: z.string().min(1).optional(),
  risk: RiskSchema,
  expectedEvidence: z.array(z.string().min(1).max(500)).max(20).default([]),
  diagnostic: z.enum(["runtime", "listeners", "none"]).optional(),
});

export const EvidenceSchema = z.strictObject({
  id: z.string().min(1),
  type: z.enum(["COMMAND_OUTPUT", "CONFIG_FILE", "HTTP_RESPONSE", "TEST_RESULT", "DIFF", "GENERATED_TOOL"]),
  source: z.string().min(1),
  summary: z.string().min(1),
  raw: z.string().optional(),
  reliable: z.boolean(),
});

export const HypothesisSchema = z.strictObject({
  id: z.string().min(1),
  statement: z.string().min(1),
  confidence: z.number().min(0).max(1),
  status: z.enum(["ACTIVE", "SUPPORTED", "REJECTED", "CONFIRMED"]),
  supportingEvidence: z.array(z.string()),
  contradictingEvidence: z.array(z.string()),
});

export const InvestigationEventSchema = z.strictObject({
  id: z.string().min(1),
  timestamp: z.iso.datetime(),
  state: InvestigationStateSchema,
  type: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const GeneratedToolSchema = z.strictObject({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  purpose: z.string().min(1).max(2000),
  language: z.enum(["python", "javascript"]),
  source: z.string().min(1).max(16000),
  entrypoint: z.string().regex(/^\/workspace\/[a-zA-Z0-9_-]+\.(py|js)$/),
  timeoutSeconds: z.number().int().min(1).max(20),
  risk: z.enum(["SAFE", "READ_ONLY", "SANDBOX_MUTATION"]),
  expectedOutput: z.enum(["json", "text"]),
}).superRefine((tool, context) => {
  const extension = tool.language === "python" ? ".py" : ".js";
  if (!tool.entrypoint.endsWith(extension)) {
    context.addIssue({ code: "custom", path: ["entrypoint"], message: "Entrypoint must match the tool language." });
  }
});

export const CommandResultSchema = z.strictObject({
  stdout: z.string(), stderr: z.string(), exitCode: z.number().int(),
  durationMs: z.number().nonnegative(),
});

export const PatchArtifactSchema = z.strictObject({
  file: z.string().min(1),
  reason: z.string().min(1),
  before: z.string(),
  after: z.string(),
  diff: z.string().min(1),
  risk: z.literal("SANDBOX_MUTATION"),
  validationStatus: z.enum(["PROPOSED", "PARTIALLY_VALIDATED", "VERIFIED", "FAILED_VALIDATION", "INCONCLUSIVE"]),
});

export const IncidentReportSchema = z.strictObject({
  title: z.string().min(1),
  summary: z.string().min(1),
  rootCause: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string()),
  validationStatus: PatchArtifactSchema.shape.validationStatus,
  productionAction: z.literal("NOT_EXECUTED"),
});
