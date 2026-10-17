import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "acorn";
import { investigate } from "../lib/agent/orchestrator";
import { GeminiLLMProvider } from "../lib/agent/gemini";
import type { LLMProvider } from "../lib/agent/provider";
import type { SandboxProvider } from "../lib/sandbox/provider";
import { GeneratedPatchSchema } from "../lib/patch/schemas";
import { renderPatch, verificationPassed } from "../lib/patch/validate";
import { APPLY_PATCH, HEALTH_CHECK } from "../lib/patch/guest";

const config={proxyPort:8080,backendPort:3000,upstreamPort:3001};
const proposal={file:"/workspace/fixture-config.json",operation:"replace",path:"/upstreamPort",oldValue:3001,value:3000,rootCause:"Synthetic proxy upstream differs from healthy backend port",reason:"Align only the upstream with the observed backend",evidenceIds:["E1","E2"],risk:"SANDBOX_MUTATION"};
const tool={id:"unit-tool",name:"Unit diagnostic",purpose:"Synthetic test source",language:"javascript",source:'const cfg=readConfig(); const proxy=await probe("proxy"); const backend=await probe("backend"); const upstream=await probe("configuredUpstream"); console.log(JSON.stringify({cfg,proxy,backend,upstream}));',entrypoint:"/workspace/generated-tool.js",timeoutSeconds:20,risk:"READ_ONLY",expectedOutput:"json"};
const backendBody=JSON.stringify({service:"synthetic-backend",ok:true});
const output=(value:unknown,exitCode=0)=>({stdout:JSON.stringify(value),stderr:exitCode?"Synthetic failure":"",exitCode,durationMs:2});
type Failure="before"|"apply"|"after"|"regression"|"cleanup"|"diagnosis-cleanup"|"reuse";

function harness(failure?:Failure) {
  let created=0;const destroyed:string[]=[],healthCalls:string[]=[];
  const uploads:Array<{id:string;path:string;body:string}>=[];
  const factory=():SandboxProvider=>({
    async authenticate(){return{userId:"synthetic"};},
    async create(options){created++;return{id:failure==="reuse"?"unit-diag":created===1?"unit-diag":"unit-validation",name:options.name,shape:"unit",rootfs:"unit"};},
    async upload(session,path,body){uploads.push({id:session.id,path,body:String(body)});},
    async execute(session,command,args,options){
      assert.ok((options?.timeoutMs??0)<=20_000);
      if(command==="mkdir")return output({});
      if(command==="cat")return output(config);
      if(args?.[0]==="/workspace/bootstrap.cjs")return output({proxy:{status:502},backend:{status:200}});
      if(args?.[0]==="/workspace/tool-runner.cjs")return output({config,proxy:{status:502},backend:{status:200}});
      if(args?.[0]==="/workspace/apply-patch.cjs")return output({applied:true,reloaded:true,before:config,after:{...config,upstreamPort:proposal.value}},failure==="apply"?1:0);
      assert.deepEqual(args,["/workspace/health-check.cjs"]);
      assert.equal(session.id,"unit-validation");healthCalls.push(`${command} ${args![0]}`);
      const post=healthCalls.length===2;
      return output({proxy:{port:8080,status:post?(failure==="after"?502:200):(failure==="before"?200:502),body:post?backendBody:"Bad Gateway"},backend:{port:3000,status:200,body:backendBody},regression:{pass:post&&failure!=="regression",description:"Synthetic regression check"}});
    },
    async destroy(session){destroyed.push(session.id);if((failure==="cleanup"&&session.id==="unit-validation")||(failure==="diagnosis-cleanup"&&session.id==="unit-diag"))throw new Error("Synthetic cleanup failure");},
  });
  const llm:LLMProvider={name:"synthetic",model:"unit",async nextAction(context){const ready=context.evidence.length>0;return{hypotheses:[{id:"H1",statement:"Synthetic upstream mismatch",confidence:0.8,status:ready?"SUPPORTED":"ACTIVE",supportingEvidence:context.evidence.map(e=>e.id),contradictingEvidence:[]}],action:{action:ready?"propose_fix":"generate_tool",reason:"Collect and verify synthetic fixture evidence",hypothesisId:"H1",risk:ready?"SANDBOX_MUTATION":"READ_ONLY",diagnostic:"none",expectedEvidence:[]}};},async generateDiagnosticTool(){return tool;},async generatePatch(context){assert.deepEqual(context.observedConfig,config);assert.ok(context.evidence.some(e=>e.type==="GENERATED_TOOL"));return proposal;}};
  return{factory,llm,uploads,healthCalls,destroyed,created:()=>created};
}

test("model patch is constrained data and diff reflects model value rather than a hardcoded result",()=>{
  const parsed=GeneratedPatchSchema.parse({...proposal,value:4321});
  const artifact=renderPatch(parsed,config,new Set(["E1","E2"]));
  assert.equal(JSON.parse(artifact.after).upstreamPort,4321);
  assert.match(artifact.diff,/\+  "upstreamPort": 4321/);
  for(const change of [{file:"/etc/passwd"},{path:"/backendPort"},{value:70000},{command:"arbitrary code"}])assert.equal(GeneratedPatchSchema.safeParse({...proposal,...change}).success,false);
  assert.throws(()=>renderPatch({...parsed,oldValue:999},config,new Set(["E1","E2"])),/precondition/);
  assert.throws(()=>renderPatch({...parsed,evidenceIds:["invented"]},config,new Set(["E1","E2"])),/evidence/);
  assert.doesNotThrow(()=>parse(APPLY_PATCH,{ecmaVersion:2022}));
  assert.doesNotThrow(()=>parse(HEALTH_CHECK,{ecmaVersion:2022}));
});

test("full verification requires distinct sandbox, same before/after health test, actual patch and both cleanups",async()=>{
  const box=harness();const result=await investigate({incident:"Synthetic HTTP 502 incident",fixture:"broken-proxy"},()=>box.llm,box.factory);
  assert.equal(result.outcome,"VERIFIED");assert.equal(result.state,"COMPLETED");assert.equal(box.created(),2);
  assert.equal(result.validation?.diagnosisSandboxId,"unit-diag");assert.equal(result.validation?.validationSandboxId,"unit-validation");
  assert.equal(result.validation?.beforeStatus,502);assert.equal(result.validation?.afterStatus,200);assert.equal(result.validation?.regression,"PASS");
  assert.equal(result.validation?.status,"VERIFIED");assert.equal(result.validation?.cleanup,"DESTROYED");assert.equal(result.cleanup,"DESTROYED");
  assert.equal(result.productionAction,"NOT_EXECUTED");assert.deepEqual(box.destroyed,["unit-validation","unit-diag"]);
  assert.deepEqual(box.healthCalls,["node /workspace/health-check.cjs","node /workspace/health-check.cjs"]);
  const uploaded=box.uploads.find(u=>u.path==="/workspace/proposed-patch.json");assert.equal(uploaded?.id,"unit-validation");assert.deepEqual(JSON.parse(uploaded!.body),proposal);
  assert.equal(result.validation?.commands.length,4);
  assert.equal(verificationPassed(result.validation!),true);
});

test("no failed verification gate or cleanup can produce VERIFIED and sandbox reuse is rejected before fixture execution",async()=>{
  for(const failure of ["before","apply","after","regression","cleanup","diagnosis-cleanup","reuse"] as const){
    const box=harness(failure);const result=await investigate({incident:"Synthetic HTTP 502 incident",fixture:"broken-proxy"},()=>box.llm,box.factory);
    assert.equal(result.outcome,"FAILED",failure);assert.equal(result.validation?.status,"FAILED_VALIDATION",failure);
    assert.ok(box.destroyed.includes("unit-diag"));
    if(failure==="reuse")assert.equal(box.uploads.filter(u=>u.path==="/workspace/health-check.cjs").length,0);
    if(failure==="cleanup")assert.equal(result.validation?.cleanup,"FAILED");
  }
});

test("Gemini patch request uses strict structured data without claiming verification",async()=>{
  const provider=new GeminiLLMProvider("synthetic-key","unit",async(_url,init)=>{
    const body=JSON.parse(String(init?.body));
    assert.equal(body.generationConfig.responseFormat.text.schema.properties.path.const,"/upstreamPort");
    assert.equal(body.generationConfig.thinkingConfig.includeThoughts,false);
    return Response.json({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify(proposal)}]}}]});
  });
  assert.deepEqual(await provider.generatePatch({incident:"Synthetic",hypotheses:[],evidence:[],observedConfig:config}),proposal);
});
