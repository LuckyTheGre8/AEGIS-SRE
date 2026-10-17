import { ZodError } from "zod";
import { AgentError, type LLMProvider } from "../agent/provider";
import { EvidenceSchema } from "../agent/schemas";
import type { InvestigationResult } from "../investigation/result";
import type { InvestigationMachine } from "../investigation/machine";
import { safeSandboxError } from "../sandbox/createos";
import { SandboxProvisionError, type SandboxProvider, type SandboxSession } from "../sandbox/provider";
import { installFixture } from "../tools/fixture";
import { fixtureDefinition } from "../fixtures/registry";
import { HealthObservationSchema, type FixtureConfig, type PatchValidation } from "./schemas";

export function renderPatch(input: unknown, config: FixtureConfig, evidenceIds: Set<string>, fixture = fixtureDefinition()) {
  const proposal = fixture.patchSchema.parse(input);
  config = fixture.configSchema.parse(config);
  const key = fixture.patchConstraints.path.slice(1);
  const fields = config as unknown as Record<string, unknown>;
  if (proposal.oldValue !== fields[key] || proposal.value === proposal.oldValue || proposal.evidenceIds.some(id=>!evidenceIds.has(id))) throw new AgentError("PATCH_POLICY_DENIED", "Patch precondition or observed evidence references failed deterministic policy.");
  const before=JSON.stringify(config,null,2),after=JSON.stringify({...config,[key]:proposal.value},null,2);
  const oldLines=before.split("\n"),newLines=after.split("\n");
  const lines=oldLines.flatMap((line,index)=>line===newLines[index] ? [` ${line}`] : [`-${line}`,`+${newLines[index]}`]);
  return {file:proposal.file,reason:proposal.reason,before,after,diff:`--- a/fixture-config.json\n+++ b/fixture-config.json\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n${lines.join("\n")}\n`,risk:"SANDBOX_MUTATION" as const,validationStatus:"PROPOSED" as const};
}

export function verificationPassed(validation: PatchValidation, fixture = fixtureDefinition()): boolean {
  return validation.diagnosisSandboxId !== validation.validationSandboxId && validation.validationSandboxId !== null && validation.beforeStatus===fixture.expectedFailureStatus && validation.patchApplied && validation.afterStatus===200 && validation.regression==="PASS" && validation.cleanup==="DESTROYED" && !validation.error;
}

export async function generateAndValidatePatch(incident: string, llm: LLMProvider, diagnosis: SandboxProvider, diagnosisSession: SandboxSession, sandboxFactory:()=>SandboxProvider, result: InvestigationResult, machine: InvestigationMachine, fixture = fixtureDefinition()) {
  if (!result.tools.some(tool=>tool.decision==="ALLOW" && tool.execution?.exitCode===0)) throw new AgentError("PATCH_EVIDENCE_REQUIRED", "A successful generated diagnostic must precede patch generation.");
  const observed=await diagnosis.execute(diagnosisSession,"cat",["/workspace/fixture-config.json"],{timeoutMs:20_000});
  if(observed.exitCode!==0)throw new AgentError("PATCH_CONFIG_UNAVAILABLE","Could not read actual diagnosis fixture configuration.");
  const config=fixture.configSchema.parse(JSON.parse(observed.stdout));
  if(!fixture.hasConfigFault(config))throw new AgentError("PATCH_EVIDENCE_REQUIRED","No selected configuration fault was observed; no patch will be generated.");
  result.evidence.push(EvidenceSchema.parse({id:`E${result.evidence.length+1}`,type:"CONFIG_FILE",source:`CreateOS ${diagnosisSession.id} · /workspace/fixture-config.json`,summary:"Actual diagnosis fixture configuration read before generating a minimal patch.",raw:JSON.stringify(observed),reliable:true}));
  machine.move("GENERATING_FIX","Generate minimal fixture patch","Gemini selects one configuration replacement from actual diagnostic evidence; no production access.");
  const proposal=fixture.patchSchema.parse(await llm.generatePatch({incident,hypotheses:result.hypotheses,evidence:result.evidence,observedConfig:config,fixture:fixture.id,patchConstraints:fixture.patchConstraints}));
  const patch=renderPatch(proposal,config,new Set(result.evidence.map(e=>e.id)),fixture);
  const validation:PatchValidation={status:"PROPOSED",diagnosisSandboxId:diagnosisSession.id,validationSandboxId:null,proposal,patch,policy:{decision:"ALLOW",reason:`${fixture.patchConstraints.description} Fixed fixture file; disposable validation sandbox only.`},beforeStatus:null,afterStatus:null,patchApplied:false,regression:"NOT_RUN",commands:[],cleanup:"NOT_REQUIRED"};
  result.validation=validation;
  machine.move("VALIDATING_FIX","Validate in a fresh sandbox",`Recreate selected fixture, prove ${fixture.expectedFailureStatus}, apply generated data patch, reload, test 200 and regression, then confirm destruction.`);
  let provider:SandboxProvider|undefined,session:SandboxSession|undefined;
  try {
    provider=sandboxFactory(); await provider.authenticate();
    session=await provider.create({name:`aegis-val-${crypto.randomUUID().replaceAll("-","").slice(0,10)}`,...(process.env.CREATEOS_SANDBOX_SHAPE?.trim()?{shape:process.env.CREATEOS_SANDBOX_SHAPE.trim()}:{})});
    validation.validationSandboxId=session.id;validation.cleanup="UNCONFIRMED";
    if(session.id===diagnosisSession.id)throw new AgentError("VALIDATION_SANDBOX_REUSED","Validation requires a different sandbox ID from diagnosis.");
    const recreated=await installFixture(provider,session,fixture);
    validation.commands.push({phase:"RECREATE",command:"node /workspace/bootstrap.cjs",result:recreated});
    for(const [path,source] of Object.entries({"/workspace/health-check.cjs":fixture.healthCheck,"/workspace/apply-patch.cjs":fixture.applyPatch,"/workspace/proposed-patch.json":JSON.stringify(proposal)}))await provider.upload(session,path,source);
    const before=await provider.execute(session,"node",["/workspace/health-check.cjs"],{timeoutMs:20_000});
    validation.commands.push({phase:"BEFORE",command:"node /workspace/health-check.cjs",result:before});
    const pre=HealthObservationSchema.parse(JSON.parse(before.stdout));validation.beforeStatus=pre.proxy.status;
    if(before.exitCode!==0||pre.proxy.status!==fixture.expectedFailureStatus||pre.backend.status!==200)throw new AgentError("PRE_PATCH_REPRODUCTION_FAILED","Fresh sandbox did not reproduce the selected failure with a healthy baseline.");
    // Compare actual fresh config with the observed diagnosis precondition before any write.
    const fresh=await provider.execute(session,"cat",["/workspace/fixture-config.json"],{timeoutMs:20_000});
    if(fresh.exitCode!==0||JSON.stringify(fixture.configSchema.parse(JSON.parse(fresh.stdout)))!==JSON.stringify(config))throw new AgentError("PATCH_PRECONDITION_FAILED","Fresh fixture configuration differs from observed diagnosis configuration.");
    const applied=await provider.execute(session,"node",["/workspace/apply-patch.cjs"],{timeoutMs:20_000});
    validation.commands.push({phase:"APPLY_RELOAD",command:"node /workspace/apply-patch.cjs",result:applied});
    if(applied.exitCode!==0)throw new AgentError("PATCH_APPLY_FAILED","Generated patch did not apply and reload successfully.");
    const application=JSON.parse(applied.stdout);
    if(application.applied!==true||application.reloaded!==true||JSON.stringify(fixture.configSchema.parse(application.after))!==JSON.stringify(JSON.parse(patch.after)))throw new AgentError("PATCH_APPLY_FAILED","Guest did not confirm the exact generated change and service reload.");
    validation.patchApplied=true;
    const after=await provider.execute(session,"node",["/workspace/health-check.cjs"],{timeoutMs:20_000});
    validation.commands.push({phase:"AFTER_REGRESSION",command:"node /workspace/health-check.cjs",result:after});
    const post=HealthObservationSchema.parse(JSON.parse(after.stdout));validation.afterStatus=post.proxy.status;
    validation.regression=after.exitCode===0&&post.backend.status===200&&post.regression.pass&&post.backend.body===pre.backend.body?"PASS":"FAIL";
    if(after.exitCode!==0||post.proxy.status!==200||validation.regression!=="PASS")throw new AgentError("POST_PATCH_VALIDATION_FAILED","Patch failed HTTP 200 or the backend/response regression check.");
  } catch(error) {
    validation.error=error instanceof AgentError?{code:error.code,message:error.message}:error instanceof ZodError?{code:"VALIDATION_SCHEMA_REJECTED",message:"Observed validation data failed schema checks."}:safeSandboxError(error);
    if(error instanceof SandboxProvisionError){validation.cleanup=error.cleanup.status;validation.validationSandboxId=error.session?.id??null;}
  } finally {
    if(provider&&session){try{await provider.destroy(session);validation.cleanup="DESTROYED";}catch(error){validation.cleanup="FAILED";validation.error=safeSandboxError(error);}}
    validation.status=verificationPassed(validation,fixture)?"VERIFIED":"FAILED_VALIDATION";
    validation.patch.validationStatus=validation.status;
  }
  for(const command of validation.commands)result.evidence.push(EvidenceSchema.parse({id:`E${result.evidence.length+1}`,type:"TEST_RESULT",source:`CreateOS ${validation.validationSandboxId} · validation ${command.phase}`,summary:`${command.phase}: exit ${command.result.exitCode}, ${command.result.durationMs} ms. Fresh synthetic validation sandbox.`,raw:JSON.stringify(command.result),reliable:true}));
  if(validation.status!=="VERIFIED")throw new AgentError(validation.error?.code??"VALIDATION_FAILED",validation.error?.message??"Validation gates did not all pass.");
}
