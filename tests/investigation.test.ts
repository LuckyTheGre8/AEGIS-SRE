import assert from "node:assert/strict";
import { test } from "node:test";
import { investigate, MAX_AGENT_ITERATIONS } from "../lib/agent/orchestrator";
import { AgentError, type LLMProvider, type AgentContext } from "../lib/agent/provider";
import { GeminiLLMProvider } from "../lib/agent/gemini";
import { evaluatePolicy } from "../lib/policy/policy";
import { InvestigationMachine } from "../lib/investigation/machine";
import type { AgentAction } from "../lib/agent/types";
import type { SandboxProvider } from "../lib/sandbox/provider";

const input = { incident: "Production API returns HTTP 502. Diagnose the issue.", fixture: "broken-proxy" as const };
function decision(context?: AgentContext) {
  return {
    hypotheses: [{ id: "H1", statement: "The incident may involve an upstream runtime or listener issue; production evidence is missing.", confidence: 0.35, status: "ACTIVE", supportingEvidence: context?.evidence.map((entry) => entry.id) ?? [], contradictingEvidence: [] }],
    action: { action: context?.evidence.length ? "finish" : "execute_diagnostic", reason: context?.evidence.length ? "Baseline collected; affected service evidence is still required." : "Observe the disposable sandbox runtime before collecting incident-specific evidence.", hypothesisId: "H1", risk: context?.evidence.length ? "SAFE" : "READ_ONLY", diagnostic: context?.evidence.length ? "none" : "runtime", expectedEvidence: ["Sandbox runtime baseline"] },
  };
}
function sandboxHarness() {
  let created = 0, executed = 0, destroyed = 0;
  const provider: SandboxProvider = {
    async authenticate() { return { userId: "synthetic-test-user" }; },
    async create(options) { created++; return { id: "synthetic-test-vm", name: options.name, shape: "unit", rootfs: "unit" }; },
    async execute(_session, command, args) { executed++; assert.equal(command, "node"); assert.deepEqual(args, ["--version"]); return { stdout: "synthetic test output\n", stderr: "", exitCode: 0, durationMs: 2 }; },
    async upload() { throw new Error("No uploads allowed in v0.3"); },
    async destroy() { destroyed++; },
  };
  return { provider, counts: () => ({ created, executed, destroyed }) };
}
function llm(nextAction: LLMProvider["nextAction"]): LLMProvider { return { name: "synthetic-test-provider", model: "test-model", nextAction }; }

test("bounded golden path validates a decision, executes policy-approved diagnostic, records evidence, and cleans up", async () => {
  const box = sandboxHarness();
  const result = await investigate(input, () => llm(async (context) => decision(context)), () => box.provider);
  assert.equal(result.state, "COMPLETED");
  assert.equal(result.outcome, "INCONCLUSIVE");
  assert.equal(result.iterations, 2);
  assert.equal(result.evidence[0].id, "E1");
  assert.equal(JSON.parse(result.evidence[0].raw!).stdout, "synthetic test output\n");
  assert.deepEqual(result.hypotheses[0].supportingEvidence, ["E1"]);
  assert.equal(result.actions[0].decision, "ALLOW");
  assert.equal(result.cleanup, "DESTROYED");
  assert.deepEqual(box.counts(), { created: 1, executed: 1, destroyed: 1 });
  assert.ok(result.events.some((event) => event.state === "EXECUTING_DIAGNOSTIC"));
  assert.equal(result.productionAction, "NOT_EXECUTED");
});

test("policy denies unsupported execution and requires approval without allowing production mutation", () => {
  const base: AgentAction = { action: "execute_diagnostic", reason: "Check baseline", risk: "READ_ONLY", diagnostic: "runtime", expectedEvidence: [] };
  assert.equal(evaluatePolicy(base).decision, "ALLOW");
  for (const change of [{ risk: "DESTRUCTIVE" }, { risk: "EXTERNAL_NETWORK" }, { risk: "SAFE" }, { action: "generate_tool" }, { action: "propose_fix" }, { diagnostic: "none" }]) {
    assert.equal(evaluatePolicy({ ...base, ...change } as AgentAction).decision, "DENY");
  }
  assert.equal(evaluatePolicy({ ...base, risk: "PRODUCTION_MUTATION" }).decision, "REQUIRE_APPROVAL");
});

test("malformed model output and invented evidence stop before provisioning", async () => {
  for (const variant of ["unknown-field", "invented-evidence", "confirmation"] as const) {
    const box = sandboxHarness();
    const result = await investigate(input, () => llm(async () => {
      const output = decision();
      if (variant === "unknown-field") return { ...output, command: "arbitrary shell" };
      if (variant === "invented-evidence") output.hypotheses[0].supportingEvidence = ["E999"];
      if (variant === "confirmation") output.hypotheses[0].status = "CONFIRMED";
      return output;
    }), () => box.provider);
    assert.equal(result.state, "FAILED");
    assert.deepEqual(box.counts(), { created: 0, executed: 0, destroyed: 0 });
  }
});

test("iteration budget stops repeated context requests without provisioning", async () => {
  const box = sandboxHarness();
  const result = await investigate(input, () => llm(async () => ({ ...decision(), action: { ...decision().action, action: "inspect_context", risk: "SAFE", diagnostic: "none" } })), () => box.provider);
  assert.equal(result.iterations, MAX_AGENT_ITERATIONS);
  assert.equal(result.outcome, "INCONCLUSIVE");
  assert.match(result.summary, /budget/);
  assert.equal(box.counts().created, 0);
});

test("model failure after real-command boundary still cleans up and preserves observed evidence", async () => {
  const box = sandboxHarness();
  const result = await investigate(input, () => llm(async (context) => {
    if (context.evidence.length) throw new AgentError("LLM_TEST_FAILURE", "Synthetic model failure");
    return decision();
  }), () => box.provider);
  assert.equal(result.state, "FAILED");
  assert.equal(result.evidence.length, 1);
  assert.equal(result.cleanup, "DESTROYED");
  assert.equal(box.counts().destroyed, 1);
});

test("Gemini provider requests schema-constrained JSON and discards any thought parts", async () => {
  const provider = new GeminiLLMProvider("synthetic-key", "test-model", async (url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(String(url).includes("synthetic-key"), false);
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "synthetic-key");
    assert.equal(body.generationConfig.thinkingConfig.includeThoughts, false);
    assert.equal(body.generationConfig.responseFormat.text.mimeType, "APPLICATION_JSON");
    assert.ok(body.generationConfig.responseFormat.text.schema.properties.action.required.includes("diagnostic"));
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [
      { thought: true, text: "must never be consumed" },
      { text: JSON.stringify(decision()) },
    ] } }] });
  });
  assert.deepEqual(await provider.nextAction({ incident: input.incident, iteration: 1, evidence: [], hypotheses: [], availableDiagnostics: ["runtime"] }), decision());
  const machine = new InvestigationMachine();
  machine.move("FAILED", "Stop", "Synthetic failure");
  assert.throws(() => machine.move("PLANNING", "Restart", "Forbidden transition"), /Cannot transition/);
});
