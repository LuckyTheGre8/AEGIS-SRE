import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "acorn";
import { investigate } from "../lib/agent/orchestrator";
import type { LLMProvider } from "../lib/agent/provider";
import type { SandboxProvider } from "../lib/sandbox/provider";
import { evaluateToolPolicy, MAX_COMMAND_SECONDS, MAX_GENERATED_TOOLS, MAX_TOOL_RETRIES, validateToolSource } from "../lib/tools/validation";
import { RUNNER } from "../lib/tools/fixture";

// Synthetic provider source for boundary tests only; never executed on this host.
const source = `const config = readConfig();
const proxy = await probe("proxy");
const backend = await probe("backend");
const upstream = await probe("configuredUpstream");
console.log(JSON.stringify({config, proxy, backend, upstream, mismatch: config.upstreamPort !== config.backendPort}));`;
const tool = { id: "synthetic-tool", name: "Synthetic unit diagnostic", purpose: "Test generated-source boundaries", language: "javascript", source, entrypoint: "/workspace/generated-tool.js", timeoutSeconds: 20, risk: "READ_ONLY", expectedOutput: "json" };
const input = { incident: "Synthetic HTTP 502 proxy incident.", fixture: "broken-proxy" as const };

test("generated source is parsed without execution and rejects dangerous operations and byte overflow", () => {
  assert.equal(validateToolSource(tool).checks.length, 4);
  assert.equal(evaluateToolPolicy(validateToolSource(tool).tool).decision, "ALLOW");
  for (const attack of [
    "process.exit(0);", "require('node:child_process').execSync('id');", "eval('1');",
    "const x = console.log.constructor;", "const x = config['constructor'];", "while(true){}",
    "import('node:fs');", "const x = () => 1;", "const {constructor:x} = config;",
    "const config = readConfig(); config.upstreamPort = 2;", "const x = new Function('return 1');",
    "const x = probe('https://example.com');", "const probe = console.log;",
  ]) assert.throws(() => validateToolSource({ ...tool, source: source + attack }), /prohibited|unavailable|rejected|Unsupported|Only|syntax/);
  assert.throws(() => validateToolSource({ ...tool, source: "const =" }), /syntax/);
  assert.throws(() => validateToolSource({ ...tool, source: "//" + "💥".repeat(4500) }), /bytes/);
  for (const change of [{risk: "SANDBOX_MUTATION"}, {entrypoint: "/workspace/other.js"}, {expectedOutput: "text"}]) {
    assert.equal(evaluateToolPolicy({ ...validateToolSource(tool).tool, ...change } as never).decision, "DENY");
  }
  // Parse trusted guest runner, never run it or generated code locally.
  assert.doesNotThrow(() => parse(RUNNER, {ecmaVersion: 2022}));
});

function harness(generate: LLMProvider["generateDiagnosticTool"], failExecution = false) {
  const uploads: Array<{path:string;source:string}> = [];
  let destroyed = 0, generated = 0;
  const sandbox: SandboxProvider = {
    async authenticate() { return { userId: "synthetic" }; },
    async create(options) { return { id: "synthetic-vm", name: options.name, rootfs: "unit", shape: "unit" }; },
    async upload(_session,path,body) { uploads.push({path,source:String(body)}); },
    async execute(_session, command, args, options) {
      assert.ok((options?.timeoutMs ?? 0) <= MAX_COMMAND_SECONDS * 1000);
      if (command === "mkdir") return {stdout:"",stderr:"",exitCode:0,durationMs:1};
      if (args?.[0] === "/workspace/bootstrap.cjs") return {stdout:JSON.stringify({proxy:{status:502},backend:{status:200}}),stderr:"",exitCode:0,durationMs:2};
      assert.equal(command,"node"); assert.deepEqual(args,["/workspace/tool-runner.cjs","20"]);
      return {stdout:failExecution ? "" : JSON.stringify({synthetic:true,proxyStatus:502,backendStatus:200}),stderr:failExecution ? "synthetic failure" : "",exitCode:failExecution ? 1 : 0,durationMs:3};
    },
    async destroy() { destroyed++; },
  };
  const llm: LLMProvider = {
    name:"synthetic", model:"unit",
    async nextAction(context) { return {
      hypotheses:[{id:"H1",statement:"Synthetic upstream mismatch",confidence:0.5,status:context.evidence.length ? "SUPPORTED":"ACTIVE",supportingEvidence:context.evidence.map(e=>e.id),contradictingEvidence:[]}],
      action:{action:context.evidence.length ? "finish":"generate_tool",risk:context.evidence.length ? "SAFE":"READ_ONLY",diagnostic:"none",reason:"Inspect synthetic runtime config",hypothesisId:"H1",expectedEvidence:[]},
    }; },
    async generateDiagnosticTool(context) { generated++; return generate(context); },
  };
  return {sandbox,llm,uploads,counts:()=>({destroyed,generated})};
}

test("generated diagnostic golden path uploads exactly validated source, captures provenance and cleans up", async () => {
  const box=harness(async()=>tool);
  const result=await investigate(input,()=>box.llm,()=>box.sandbox);
  assert.equal(result.state,"COMPLETED"); assert.equal(result.cleanup,"DESTROYED");
  assert.equal(result.tools[0].decision,"ALLOW"); assert.equal(result.tools[0].execution?.exitCode,0);
  assert.equal(box.uploads.find(entry=>entry.path===tool.entrypoint)?.source,source);
  assert.equal(result.evidence[1].type,"GENERATED_TOOL"); assert.match(result.evidence[1].source,/sha256:/);
  assert.equal(JSON.parse(result.evidence[1].raw!).durationMs,3);
  assert.deepEqual(box.counts(),{destroyed:1,generated:1});
});

test("invalid generated tools never upload and exhaust the exact global generation/retry budget", async () => {
  const box=harness(async()=>({...tool,source:source+"process.exit(0);"}));
  const result=await investigate(input,()=>box.llm,()=>box.sandbox);
  assert.equal(result.state,"FAILED"); assert.equal(result.error?.code,"TOOL_BUDGET_EXHAUSTED");
  assert.equal(result.cleanup,"DESTROYED"); assert.equal(result.tools.length,MAX_GENERATED_TOOLS);
  assert.equal(box.counts().generated,1+MAX_TOOL_RETRIES);
  assert.equal(box.uploads.some(entry=>entry.path===tool.entrypoint),false);
  assert.ok(result.tools.every(entry=>entry.decision==="DENY" && entry.execution===null));
});

test("syntax rejection can recover once and command failures retain evidence before cleanup", async () => {
  const box=harness(async context=>context.attempt===1 ? {...tool,source:"const ="}:tool);
  const result=await investigate(input,()=>box.llm,()=>box.sandbox);
  assert.equal(result.state,"COMPLETED"); assert.equal(result.tools.length,2);
  assert.equal(result.tools[0].decision,"DENY"); assert.equal(result.tools[1].execution?.exitCode,0);
  const failed=harness(async()=>tool,true);
  const failure=await investigate(input,()=>failed.llm,()=>failed.sandbox);
  assert.equal(failure.state,"FAILED"); assert.equal(failure.cleanup,"DESTROYED");
  assert.equal(failure.evidence.filter(entry=>entry.type==="GENERATED_TOOL").length,3);
  assert.ok(failure.tools.every(entry=>entry.execution?.stderr==="synthetic failure"));
});
