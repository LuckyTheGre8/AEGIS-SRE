import { LockKeyhole, ShieldCheck, CircleAlert } from "lucide-react";
import { fixtureMetadata } from "@/lib/fixtures/catalog";
import type { InvestigationResult } from "@/lib/investigation/result";

export function DemoOutcome({ result, previous = false }: { result: InvestigationResult; previous?: boolean }) {
  const validation = result.validation;
  const hypothesis = result.hypotheses.find(item => item.status === "SUPPORTED" || item.status === "CONFIRMED") ?? result.hypotheses[0];
  return <section className={`demo-outcome ${result.outcome.toLowerCase()}`} aria-label="Reference incident result">
    <div className="outcome-heading"><span className="eyebrow">{previous ? "PREVIOUS RESULT" : result.outcome === "FAILED" ? "LATEST ATTEMPT" : "REFERENCE INCIDENT"} · {result.id.slice(0,8)}</span><strong>{result.outcome === "VERIFIED" ? <ShieldCheck size={16} /> : <CircleAlert size={16} />}{result.outcome}</strong></div>
    <h2>{fixtureMetadata(result.fixture).title}</h2><p>{fixtureMetadata(result.fixture).incidentText}</p>
    {hypothesis && <p><span className="result-label">HYPOTHESIS</span>{hypothesis.statement} <span className="confidence-label">{Math.round(hypothesis.confidence * 100)}% confidence estimate · {hypothesis.status}</span></p>}
    {validation && <>
      <div className="result-metrics" aria-label="Measured validation results">
        <div><span>BEFORE</span><strong>{validation.beforeStatus ?? "—"}</strong></div>
        <div><span>AFTER</span><strong>{validation.afterStatus ?? "—"}</strong></div>
        <div><span>REGRESSION</span><strong>{validation.regression}</strong></div>
        <div><span>FIX STATUS</span><strong>{validation.status}</strong></div>
      </div>
      <p className="result-provenance">Diagnosis: {validation.diagnosisSandboxId}<br />Fresh validation: {validation.validationSandboxId ?? "not created"}{validation.validationSandboxId && validation.validationSandboxId !== validation.diagnosisSandboxId ? " · separate sandbox" : ""}</p>
    </>}
    <div className="safety-boundary"><LockKeyhole size={14} /><span>Production action: <strong>NOT EXECUTED</strong> · Human approval required before production mutation</span></div>
  </section>;
}
