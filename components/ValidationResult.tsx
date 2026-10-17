import { ArrowRight, GitCompareArrows, LockKeyhole } from "lucide-react";
import { Panel } from "./Panel";
import type { InvestigationResult } from "@/lib/investigation/result";

export function ValidationResult({ result }: { result?: InvestigationResult | null }) {
  const validation = result?.validation;
  return <Panel title="Fresh-sandbox fix validation" icon={<GitCompareArrows size={16} />} className={validation?.status === "VERIFIED" ? "validation-verified" : ""} aside={<span className="subtle-tag">{validation?.status ?? "PENDING"}</span>}>
    <div className="validation-content"><div className="validation-copy"><h3>{validation?.status === "VERIFIED" ? "Root cause identified" : validation ? "Root cause assessment" : "A fix earns its verification."}</h3><p>{validation?.status === "VERIFIED" ? "Proxy upstream configuration points to the wrong backend port." : validation?.proposal.rootCause ?? "The same health test must fail before the patch and pass afterward in a fresh environment."}</p>{validation && <details className="evidence-item"><summary>Model assessment · evidence {validation.proposal.evidenceIds.join(", ")}</summary><p>{validation.proposal.rootCause}</p></details>}</div>
      <div className="comparison"><div><span>BEFORE</span><strong>{validation?.beforeStatus ?? "—"}</strong><small>{validation?.beforeStatus ? "Observed in fresh sandbox" : "Not observed"}</small></div><ArrowRight size={20} /><div><span>AFTER</span><strong>{validation?.afterStatus ?? "—"}</strong><small>{validation?.afterStatus ? "Observed after patch" : "Not tested"}</small></div></div>
      {validation && <div className="investigation-findings">
        <p><strong>REGRESSION: {validation.regression}</strong></p>
        <p><strong>FIX STATUS: {validation.status}</strong></p>
        <p>Diagnosis sandbox: {validation.diagnosisSandboxId}</p><p>Fresh validation sandbox: {validation.validationSandboxId ?? "not created"}</p>
        <p>Cleanup: diagnosis {result?.cleanup} · validation {validation.cleanup}</p>
        <p>Policy: {validation.policy.decision} · {validation.policy.reason}</p>
        <details className="evidence-item" open><summary>Generated patch / diff</summary><p>{validation.patch.reason}</p><pre>{validation.patch.diff}</pre></details>
        {validation.commands.map((command,index)=><details className="evidence-item" key={index}><summary>{command.phase} · exit {command.result.exitCode} · {command.result.durationMs} ms</summary><p>{command.command}</p><pre>{`STDOUT:\n${command.result.stdout || "(empty)"}\nSTDERR:\n${command.result.stderr || "(empty)"}`}</pre></details>)}
        {validation.error && <p className="form-error">{validation.error.code}: {validation.error.message}</p>}
      </div>}
    </div>
    <div className="production-lock"><LockKeyhole size={14} /><span>Production action: NOT EXECUTED · requires human approval</span><span className="lock-status">ENFORCED</span></div>
  </Panel>;
}
