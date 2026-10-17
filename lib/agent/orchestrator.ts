import { ZodError } from "zod";
import { EvidenceSchema, IncidentInputSchema } from "./schemas";
import { AgentDecisionSchema, AgentError, type LLMProvider } from "./provider";
import type { IncidentInput } from "./types";
import { DIAGNOSTICS, evaluatePolicy } from "../policy/policy";
import { InvestigationMachine } from "../investigation/machine";
import { InvestigationResultSchema, type InvestigationResult } from "../investigation/result";
import { safeSandboxError } from "../sandbox/createos";
import { SandboxProvisionError, type SandboxProvider, type SandboxSession } from "../sandbox/provider";
import { installFixture } from "../tools/fixture";
import { executeGeneratedDiagnostic } from "../tools/execute";

export const MAX_AGENT_ITERATIONS = 3;
export const MAX_DIAGNOSTICS = 2;

export async function investigate(input: IncidentInput, llmFactory: () => LLMProvider, sandboxFactory: () => SandboxProvider): Promise<InvestigationResult> {
  const incident = IncidentInputSchema.parse(input);
  const machine = new InvestigationMachine();
  const result: InvestigationResult = {
    id: crypto.randomUUID(), state: "RECEIVED", outcome: "INCONCLUSIVE", iterations: 0,
    summary: "Synthetic fixture observations cannot confirm a production root cause. Patch verification has not run.",
    model: null, hypotheses: [], evidence: [], events: machine.events, actions: [], tools: [], cleanup: "NOT_REQUIRED", sandboxId: null, productionAction: "NOT_EXECUTED",
  };
  let sandbox: SandboxProvider | undefined;
  let session: SandboxSession | undefined;
  const executed = new Set<string>();
  let stopped = false;
  let fixtureInstalled = false;
  try {
    const llm = llmFactory();
    result.model = { provider: llm.name, model: llm.model };
    machine.move("PLANNING", "Form initial hypotheses", "Request a structured decision using only the incident and available observations.");
    for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
      result.iterations++;
      const decision = AgentDecisionSchema.parse(await llm.nextAction({
        incident: incident.incident, iteration: iteration + 1, hypotheses: result.hypotheses,
        evidence: result.evidence, availableDiagnostics: Object.keys(DIAGNOSTICS),
      }));
      const ids = new Set(decision.hypotheses.map((hypothesis) => hypothesis.id));
      const evidenceIds = new Set(result.evidence.map((evidence) => evidence.id));
      if (ids.size !== decision.hypotheses.length || !ids.has(decision.action.hypothesisId)) throw new AgentError("INVALID_HYPOTHESIS_LINK", "The model returned duplicate or unknown hypothesis IDs.");
      for (const hypothesis of decision.hypotheses) {
        if ([...hypothesis.supportingEvidence, ...hypothesis.contradictingEvidence].some((id) => !evidenceIds.has(id))) throw new AgentError("INVENTED_EVIDENCE", "The model referenced evidence that was never observed. No action was executed.");
        if (hypothesis.status === "CONFIRMED" || (hypothesis.status === "SUPPORTED" && hypothesis.supportingEvidence.length === 0)) throw new AgentError("UNSUPPORTED_CONFIRMATION", "Baseline evidence cannot confirm a production root cause.");
      }
      result.hypotheses = decision.hypotheses;
      const action = decision.action;
      machine.move("REVIEWING_ACTION", "Review proposed action", action.reason);
      const policy = evaluatePolicy(action);
      result.actions.push({ action, ...policy });
      if (policy.decision !== "ALLOW") { result.summary = `${policy.reason} No production action was executed.`; stopped = true; break; }
      if (action.action === "finish") { stopped = true; break; }
      if (action.action === "inspect_context") {
        machine.move("PLANNING", "Context reviewed", "No external access or command execution was requested.");
        continue;
      }
      const diagnosticId = action.diagnostic as keyof typeof DIAGNOSTICS;
      if (action.action === "execute_diagnostic" && (executed.has(diagnosticId) || executed.size >= MAX_DIAGNOSTICS)) { result.summary = "Diagnostic budget reached. Investigation remains inconclusive."; stopped = true; break; }
      if (!session) {
        machine.move("PROVISIONING_SANDBOX", "Create isolated baseline", "Authenticate and create one disposable CreateOS sandbox without production credentials.");
        sandbox = sandboxFactory();
        await sandbox.authenticate();
        session = await sandbox.create({ name: `aegis-inv-${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`, ...(process.env.CREATEOS_SANDBOX_SHAPE?.trim() ? { shape: process.env.CREATEOS_SANDBOX_SHAPE.trim() } : {}) });
        result.sandboxId = session.id;
        result.cleanup = "UNCONFIRMED";
      }
      if (action.action === "generate_tool") {
        if (!fixtureInstalled) {
          // A baseline command may already have created the sandbox in a previous turn.
          if (machine.state === "REVIEWING_ACTION") machine.move("PROVISIONING_SANDBOX", "Reuse disposable sandbox", "Prepare the synthetic fixture in this investigation's existing VM.");
          machine.move("REPRODUCING", "Start synthetic HTTP 502 fixture", "Start a real loopback backend and broken proxy, then verify their actual HTTP responses.");
          const baseline = await installFixture(sandbox!, session);
          result.evidence.push(EvidenceSchema.parse({ id: `E${result.evidence.length + 1}`, type: "HTTP_RESPONSE", reliable: true, source: `CreateOS ${session.id} · trusted fixture bootstrap`, summary: "Synthetic proxy HTTP 502 and backend HTTP 200 observed. This is fixture evidence, not production evidence.", raw: JSON.stringify(baseline) }));
          fixtureInstalled = true;
        }
        await executeGeneratedDiagnostic(incident.incident, llm, sandbox!, session, result, machine);
        machine.move("ANALYZING_RESULT", "Generated-tool evidence recorded", "Actual generated-program output is cited with its source hash and sandbox provenance.");
        machine.move("PLANNING", "Update fixture hypotheses", "Use observed evidence; production diagnosis and final patch verification remain unavailable.");
        continue;
      }
      const diagnostic = DIAGNOSTICS[diagnosticId];
      machine.move("EXECUTING_DIAGNOSTIC", "Execute approved diagnostic", `${diagnostic.command} ${diagnostic.args.join(" ")} · READ_ONLY · disposable sandbox baseline`);
      const output = await sandbox!.execute(session, diagnostic.command, [...diagnostic.args], { timeoutMs: 20_000 });
      executed.add(diagnosticId);
      result.evidence.push(EvidenceSchema.parse({
        id: `E${result.evidence.length + 1}`, type: "COMMAND_OUTPUT", reliable: true,
        source: `CreateOS ${session.id} · ${diagnostic.command} ${diagnostic.args.join(" ")}`,
        summary: `${diagnostic.label}: exit ${output.exitCode}, ${output.durationMs} ms. Baseline only; not production evidence.`,
        raw: JSON.stringify(output),
      }));
      machine.move("ANALYZING_RESULT", "Observation recorded", "Actual stdout, stderr, exit code and guest duration are available as cited evidence.");
      machine.move("PLANNING", "Update hypotheses", "Re-evaluate estimates against observed evidence; do not infer a production cause from a clean VM.");
    }
    if (!stopped && result.iterations === MAX_AGENT_ITERATIONS) result.summary = "Iteration budget reached. Baseline evidence is insufficient to establish a production root cause.";
  } catch (error) {
    result.outcome = "FAILED";
    result.error = error instanceof AgentError ? { code: error.code, message: error.message }
      : error instanceof ZodError ? { code: "SCHEMA_REJECTED", message: "Model output or observed data failed schema validation. No unvalidated action was executed." }
        : safeSandboxError(error);
    if (error instanceof SandboxProvisionError) { result.cleanup = error.cleanup.status; result.sandboxId = error.session?.id ?? null; }
  } finally {
    if (sandbox && session) {
      // PLANNING can be the last phase after evidence collection or a model failure.
      if (machine.state === "PLANNING") machine.move("REVIEWING_ACTION", "Close investigation", "No further actions will execute; release the disposable sandbox.");
      machine.move("CLEANING_UP", "Destroy sandbox", "Cleanup continues even if the browser disconnects.");
      try { await sandbox.destroy(session); result.cleanup = "DESTROYED"; }
      catch (error) { result.cleanup = "FAILED"; result.outcome = "FAILED"; result.error = safeSandboxError(error); }
    }
    machine.move(result.outcome === "FAILED" ? "FAILED" : "COMPLETED", result.outcome === "FAILED" ? "Investigation failed" : "Baseline investigation complete", result.error?.message ?? result.summary);
    result.state = machine.state;
  }
  return InvestigationResultSchema.parse(result);
}
