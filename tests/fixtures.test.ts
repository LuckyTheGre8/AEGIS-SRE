import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "acorn";
import { FIXTURE_CATALOG, FIXTURE_IDS, type FixtureId } from "../lib/fixtures/catalog";
import { fixtureDefinition } from "../lib/fixtures/registry";
import { IncidentInputSchema } from "../lib/agent/schemas";
import { investigate } from "../lib/agent/orchestrator";
import type { LLMProvider } from "../lib/agent/provider";
import type { SandboxProvider } from "../lib/sandbox/provider";
import { renderPatch, verificationPassed } from "../lib/patch/validate";
import { validateToolSource } from "../lib/tools/validation";

test("registry and input selection expose exactly three bounded synthetic fixtures", () => {
  assert.deepEqual(FIXTURE_CATALOG.map(item => item.id), FIXTURE_IDS);
  assert.equal(new Set(FIXTURE_IDS).size, 3);
  for (const item of FIXTURE_CATALOG) {
    const fixture = fixtureDefinition(item.id);
    assert.equal(IncidentInputSchema.parse({ incident: item.incidentText, fixture: item.id }).fixture, item.id);
    assert.equal(fixture.probeTargets.length, 3);
    assert.deepEqual(fixture.allowedFiles, ["/workspace/fixture-config.json"]);
    assert.ok(fixture.configSchema.safeParse(JSON.parse(fixture.files[fixture.allowedFiles[0]])).success);
    // Syntax checks parse trusted guest programs; nothing executes on the host.
    for (const [path, source] of Object.entries(fixture.files)) if (path.endsWith(".cjs")) assert.doesNotThrow(() => parse(source, { ecmaVersion: 2022 }));
    for (const source of [fixture.healthCheck, fixture.applyPatch]) assert.doesNotThrow(() => parse(source, { ecmaVersion: 2022 }));
  }
  assert.throws(() => fixtureDefinition("production" as FixtureId));
});

const output = (value: unknown, exitCode = 0) => ({ stdout: JSON.stringify(value), stderr: "", exitCode, durationMs: 1 });
type Failure = "before" | "after" | "regression" | "cleanup" | "reuse" | "cross-fixture-patch";
function harness(id: "missing-environment" | "broken-health-check", failure?: Failure) {
  const fixture = fixtureDefinition(id);
  const config = JSON.parse(fixture.files["/workspace/fixture-config.json"]);
  const key = fixture.patchConstraints.path.slice(1);
  const proposal = { file: "/workspace/fixture-config.json", operation: "replace", path: fixture.patchConstraints.path, oldValue: config[key], value: id === "missing-environment" ? config.expectedValue : config.applicationPath, rootCause: "Synthetic configuration mismatch", reason: "Use observed configuration and endpoints", evidenceIds: ["E1", "E2"], risk: "SANDBOX_MUTATION" };
  const tool = { id: "unit-tool", name: "Runtime observation", purpose: "Inspect selected fixture", language: "javascript", source: `const cfg=readConfig(); const first=await probe(${JSON.stringify(fixture.probeTargets[0])}); const second=await probe(${JSON.stringify(fixture.probeTargets[1])}); const third=await probe(${JSON.stringify(fixture.probeTargets[2])}); console.log(JSON.stringify({cfg,first,second,third}));`, entrypoint: "/workspace/generated-tool.js", timeoutSeconds: 20, risk: "READ_ONLY", expectedOutput: "json" };
  let created = 0, healthCalls = 0;
  const destroyed: string[] = [], uploaded: { id: string; path: string }[] = [];
  const healthy = JSON.stringify({ service: "synthetic-backend", ok: true });
  const factory = (): SandboxProvider => ({
    async authenticate() { return { userId: "synthetic" }; },
    async create(options) { return { id: ++created === 1 || failure === "reuse" ? "diagnosis" : "validation", name: options.name, shape: "unit", rootfs: "unit" }; },
    async upload(session, path) { uploaded.push({ id: session.id, path }); },
    async execute(session, command, args, options) {
      assert.ok((options?.timeoutMs ?? 0) <= 20_000);
      if (command === "mkdir") return output({});
      if (command === "cat") return output(config);
      if (args?.[0] === "/workspace/bootstrap.cjs") return output({ proxy: { status: fixture.expectedFailureStatus }, backend: { status: 200 } });
      if (args?.[0] === "/workspace/tool-runner.cjs") return output({ config, observedFailure: fixture.expectedFailureStatus });
      if (args?.[0] === "/workspace/apply-patch.cjs") return output({ applied: true, reloaded: true, before: config, after: { ...config, [key]: proposal.value } });
      assert.equal(session.id, "validation"); assert.deepEqual(args, ["/workspace/health-check.cjs"]);
      const post = ++healthCalls === 2;
      return output({ proxy: { port: 3000, status: post ? failure === "after" ? fixture.expectedFailureStatus : 200 : failure === "before" ? 502 : fixture.expectedFailureStatus, body: post ? healthy : "Synthetic failure" }, backend: { port: 3000, status: 200, body: healthy }, regression: { pass: post && failure !== "regression", description: "Healthy endpoint is unchanged" } });
    },
    async destroy(session) { destroyed.push(session.id); if (failure === "cleanup" && session.id === "validation") throw new Error("Synthetic cleanup failure"); },
  });
  const llm: LLMProvider = {
    name: "unit", model: "unit",
    async nextAction(context) {
      assert.equal(context.fixture, fixture.diagnosticContract);
      const ready = context.evidence.length > 0;
      return { hypotheses: [{ id: "H1", statement: "Synthetic configuration mismatch", confidence: 0.8, status: ready ? "SUPPORTED" : "ACTIVE", supportingEvidence: context.evidence.map(item => item.id), contradictingEvidence: [] }], action: { action: ready ? "propose_fix" : "generate_tool", risk: ready ? "SANDBOX_MUTATION" : "READ_ONLY", reason: "Observe then verify in isolation", hypothesisId: "H1", diagnostic: "none", expectedEvidence: [] } };
    },
    async generateDiagnosticTool(context) { assert.deepEqual(context.probeTargets, fixture.probeTargets); return tool; },
    async generatePatch(context) { assert.equal(context.fixture, id); assert.deepEqual(context.observedConfig, config); return failure === "cross-fixture-patch" ? { ...proposal, path: "/upstreamPort", oldValue: 3001, value: 3000 } : proposal; },
  };
  return { fixture, config, proposal, tool, factory, llm, destroyed, uploaded, healthCalls: () => healthCalls };
}

test("fixture-specific patch and diagnostic policies reject cross-fixture capabilities and extra mutations", () => {
  for (const id of ["missing-environment", "broken-health-check"] as const) {
    const box = harness(id);
    assert.doesNotThrow(() => validateToolSource(box.tool, box.fixture.probeTargets));
    assert.throws(() => validateToolSource(box.tool));
    const patch = renderPatch(box.proposal, box.config, new Set(["E1", "E2"]), box.fixture);
    const after = JSON.parse(patch.after), key = box.fixture.patchConstraints.path.slice(1);
    assert.deepEqual(after, { ...box.config, [key]: box.proposal.value });
    assert.equal(box.fixture.hasConfigFault(box.config), true);
    assert.equal(box.fixture.hasConfigFault(after), false);
    assert.throws(() => renderPatch({ ...box.proposal, path: "/upstreamPort" }, box.config, new Set(["E1", "E2"]), box.fixture));
    assert.throws(() => renderPatch({ ...box.proposal, command: "arbitrary code" }, box.config, new Set(["E1", "E2"]), box.fixture));
    if (id === "broken-health-check") assert.throws(() => renderPatch({ ...box.proposal, value: "https://unrelated.example/" }, box.config, new Set(["E1", "E2"]), box.fixture));
  }
});

test("both new fixtures verify only their actual failure class, a fresh sandbox, regression and cleanup", async () => {
  for (const id of ["missing-environment", "broken-health-check"] as const) {
    const box = harness(id);
    const result = await investigate({ fixture: id, incident: box.fixture.incidentText }, () => box.llm, box.factory);
    assert.equal(result.fixture, id); assert.equal(result.outcome, "VERIFIED");
    assert.equal(result.validation?.beforeStatus, box.fixture.expectedFailureStatus); assert.equal(result.validation?.afterStatus, 200);
    assert.equal(result.validation?.regression, "PASS"); assert.equal(result.productionAction, "NOT_EXECUTED");
    assert.equal(result.cleanup, "DESTROYED"); assert.deepEqual(box.destroyed, ["validation", "diagnosis"]);
    assert.equal(box.healthCalls(), 2); assert.ok(verificationPassed(result.validation!, box.fixture));
    assert.equal(verificationPassed(result.validation!), false, "new incident cannot pass the 502 fixture gate");
    assert.ok(box.uploaded.some(item => item.id === "validation" && item.path === "/workspace/proposed-patch.json"));
  }
});

test("new fixtures cannot claim VERIFIED after a wrong baseline, failed health/regression, cleanup, sandbox reuse or foreign patch", async () => {
  for (const id of ["missing-environment", "broken-health-check"] as const) for (const failure of ["before", "after", "regression", "cleanup", "reuse", "cross-fixture-patch"] as const) {
    const box = harness(id, failure);
    const result = await investigate({ fixture: id, incident: box.fixture.incidentText }, () => box.llm, box.factory);
    assert.equal(result.outcome, "FAILED", `${id}: ${failure}`);
    assert.notEqual(result.validation?.status, "VERIFIED"); assert.ok(box.destroyed.includes("diagnosis"));
    if (failure === "cross-fixture-patch") assert.equal(box.uploaded.some(item => item.path === "/workspace/proposed-patch.json"), false);
    if (failure === "reuse") assert.equal(box.healthCalls(), 0);
  }
});
