import { createHash } from "node:crypto";
import { ZodError } from "zod";
import { GeneratedToolSchema, EvidenceSchema } from "../agent/schemas";
import { AgentError, type LLMProvider } from "../agent/provider";
import type { InvestigationResult, ToolAttempt } from "../investigation/result";
import type { InvestigationMachine } from "../investigation/machine";
import type { SandboxProvider, SandboxSession } from "../sandbox/provider";
import { FIXTURE_DESCRIPTION } from "./fixture";
import { evaluateToolPolicy, MAX_COMMAND_SECONDS, MAX_GENERATED_TOOLS, MAX_TOOL_RETRIES, validateToolSource } from "./validation";

export async function executeGeneratedDiagnostic(incident: string, llm: LLMProvider, sandbox: SandboxProvider, session: SandboxSession, result: InvestigationResult, machine: InvestigationMachine) {
  let previousFailure: string | undefined;
  for (let retry = 0; retry <= MAX_TOOL_RETRIES && result.tools.length < MAX_GENERATED_TOOLS; retry++) {
    machine.move("GENERATING_TOOL", "Generate diagnostic program", "Gemini writes a new diagnostic from the fixture contract and observed evidence.");
    const record: ToolAttempt = { attempt: result.tools.length + 1, tool: null, sha256: null, checks: [], decision: "DENY", reason: "Source has not passed validation and policy.", execution: null };
    result.tools.push(record);
    try {
      const output = await llm.generateDiagnosticTool({ incident, hypotheses: result.hypotheses, evidence: result.evidence, fixture: FIXTURE_DESCRIPTION, attempt: record.attempt, ...(previousFailure ? { previousFailure } : {}) });
      machine.move("REVIEWING_TOOL", "Validate generated program", "Check schema, source bytes, JavaScript syntax, dangerous operations, and deterministic policy.");
      const tool = GeneratedToolSchema.parse(output);
      record.tool = tool;
      record.sha256 = createHash("sha256").update(tool.source).digest("hex");
      record.checks = validateToolSource(tool).checks;
      const policy = evaluateToolPolicy(tool);
      record.decision = policy.decision === "ALLOW" ? "ALLOW" : "DENY";
      record.reason = policy.reason;
      if (record.decision !== "ALLOW") throw new AgentError("TOOL_POLICY_DENIED", policy.reason);
      await sandbox.upload(session, tool.entrypoint, tool.source);
      machine.move("EXECUTING_TOOL", "Execute generated diagnostic", `Tool ${tool.name} · READ_ONLY · CreateOS ${session.id} · maximum ${tool.timeoutSeconds} seconds`);
      const execution = await sandbox.execute(session, "node", ["/workspace/tool-runner.cjs", String(tool.timeoutSeconds)], { timeoutMs: Math.min(tool.timeoutSeconds, MAX_COMMAND_SECONDS) * 1000 });
      record.execution = execution;
      result.evidence.push(EvidenceSchema.parse({
        id: `E${result.evidence.length + 1}`, type: "GENERATED_TOOL", reliable: true,
        source: `CreateOS ${session.id} · generated ${tool.id} · sha256:${record.sha256}`,
        summary: `Generated diagnostic ${tool.name}: exit ${execution.exitCode}, ${execution.durationMs} ms. Synthetic fixture only; no production or fix verification.`,
        raw: JSON.stringify(execution),
      }));
      if (execution.exitCode !== 0) throw new AgentError("TOOL_EXECUTION_FAILED", "The generated diagnostic returned a nonzero exit code.");
      try {
        const observation = JSON.parse(execution.stdout);
        if (!observation || typeof observation !== "object" || Array.isArray(observation)) throw new Error("Expected object");
      } catch { throw new AgentError("TOOL_OUTPUT_INVALID", "The generated tool did not return a JSON evidence object."); }
      return;
    } catch (error) {
      // Never send raw provider errors or arbitrary exception contents back to Gemini.
      const message = error instanceof AgentError ? error.message : error instanceof ZodError ? "Generated tool failed its strict schema." : "Tool upload or sandbox command failed.";
      record.error = message;
      if (record.decision !== "ALLOW") record.reason = message;
      previousFailure = message;
      if (machine.state === "GENERATING_TOOL") machine.move("REVIEWING_TOOL", "Generation rejected", message);
    }
  }
  throw new AgentError("TOOL_BUDGET_EXHAUSTED", "No generated diagnostic succeeded within three generated tools and two retries.");
}
