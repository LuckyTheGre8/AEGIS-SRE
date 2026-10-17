import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AgentActionSchema, EvidenceSchema, GeneratedToolSchema, HypothesisSchema,
  IncidentInputSchema, IncidentReportSchema, InvestigationEventSchema,
} from "../lib/agent/schemas";

test("incident input trims text and rejects unsupported fixtures and executable fields", () => {
  assert.equal(IncidentInputSchema.parse({ incident: "  The API returns HTTP 502.  ", fixture: "broken-proxy" }).incident, "The API returns HTTP 502.");
  for (const input of [
    { incident: "   ", fixture: "broken-proxy" },
    { incident: "x".repeat(4001), fixture: "broken-proxy" },
    { incident: "The API returns HTTP 502.", fixture: "production" },
    { incident: "The API returns HTTP 502.", fixture: "broken-proxy", command: "uname -a" },
  ]) assert.equal(IncidentInputSchema.safeParse(input).success, false);
});

test("agent action preserves risk and rejects unknown executable properties", () => {
  const action = { action: "generate_tool", reason: "Collect missing evidence", risk: "READ_ONLY" };
  assert.deepEqual(AgentActionSchema.parse(action).expectedEvidence, []);
  assert.equal(AgentActionSchema.safeParse({ ...action, command: "arbitrary shell" }).success, false);
  assert.equal(AgentActionSchema.safeParse({ ...action, risk: "APPROVED_BY_MODEL" }).success, false);
  assert.equal(AgentActionSchema.parse({ ...action, risk: "PRODUCTION_MUTATION" }).risk, "PRODUCTION_MUTATION");
});

test("generated tool contract bounds source, timeout, and guest paths", () => {
  const tool = { id: "t1", name: "inspect", purpose: "Collect evidence", language: "python", source: "print('hello')", entrypoint: "/workspace/inspect.py", timeoutSeconds: 20, risk: "READ_ONLY", expectedOutput: "text" };
  assert.equal(GeneratedToolSchema.safeParse(tool).success, true);
  for (const change of [
    { source: "x".repeat(16001) }, { timeoutSeconds: 21 },
    { entrypoint: "/workspace/../etc/profile.py" }, { entrypoint: "inspect.py" },
    { entrypoint: "/workspace/inspect.js" }, { risk: "PRODUCTION_MUTATION" },
  ]) assert.equal(GeneratedToolSchema.safeParse({ ...tool, ...change }).success, false);
});

test("confidence must be normalized and evidence reliability must be explicit", () => {
  const hypothesis = { id: "h1", statement: "Missing evidence", confidence: .5, status: "ACTIVE", supportingEvidence: [], contradictingEvidence: [] };
  assert.equal(HypothesisSchema.safeParse(hypothesis).success, true);
  for (const confidence of [-.1, 1.1, NaN]) assert.equal(HypothesisSchema.safeParse({ ...hypothesis, confidence }).success, false);
  const evidence = { id: "e1", type: "COMMAND_OUTPUT", source: "sandbox", summary: "Observed output" };
  assert.equal(EvidenceSchema.safeParse(evidence).success, false);
  assert.equal(EvidenceSchema.safeParse({ ...evidence, reliable: false }).success, true);
});

test("investigation events reject unknown states and invalid timestamps", () => {
  const event = { id: "event1", timestamp: "2026-10-18T00:00:00.000Z", state: "RECEIVED", type: "incident_prepared", title: "Ready", summary: "Local input validated" };
  assert.equal(InvestigationEventSchema.safeParse(event).success, true);
  assert.equal(InvestigationEventSchema.safeParse({ ...event, state: "PRODUCTION_APPLIED" }).success, false);
  assert.equal(InvestigationEventSchema.safeParse({ ...event, timestamp: "not-a-date" }).success, false);
});

test("reports cannot claim production execution", () => {
  const report = { title: "Investigation", summary: "Pending", rootCause: null, confidence: 0, evidenceIds: [], validationStatus: "INCONCLUSIVE", productionAction: "NOT_EXECUTED" };
  assert.equal(IncidentReportSchema.safeParse(report).success, true);
  assert.equal(IncidentReportSchema.safeParse({ ...report, productionAction: "EXECUTED" }).success, false);
});
