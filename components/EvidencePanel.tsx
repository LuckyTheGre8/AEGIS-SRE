import { FileSearch, Layers3, ShieldCheck } from "lucide-react";
import { Panel } from "./Panel";
import type { InvestigationResult } from "@/lib/investigation/result";

export function EvidencePanel({ result }: { result?: InvestigationResult | null }) {
  return <Panel title="Evidence & hypotheses" icon={<Layers3 size={16} />} aside={<span className="panel-count">{result?.evidence.length ?? 0} COLLECTED</span>}>
    {result ? <div className="investigation-findings">
      {result.hypotheses.map((hypothesis) => <article className="hypothesis-item" key={hypothesis.id}>
        <div><strong>{hypothesis.id} · {hypothesis.status}</strong><span>{Math.round(hypothesis.confidence * 100)}% estimate</span></div>
        <p>{hypothesis.statement}</p><progress aria-label={`${hypothesis.id} estimated confidence`} value={hypothesis.confidence} max={1} />
        <small>Supports: {hypothesis.supportingEvidence.join(", ") || "none"} · Contradicts: {hypothesis.contradictingEvidence.join(", ") || "none"}</small>
      </article>)}
      {result.evidence.map((evidence) => <details className="evidence-item" key={evidence.id}><summary>{evidence.id} · {evidence.summary}</summary><p>{evidence.source}</p><pre>{evidence.raw}</pre></details>)}
      {result.actions.map((entry, index) => <div className="policy-item" key={index}><strong>{entry.decision} · {entry.action.risk}</strong><p>{entry.action.reason}</p><small>{entry.reason}</small></div>)}
      <p className="investigation-outcome">{result.outcome} · {result.summary}</p>
      {result.error && <p className="form-error" role="alert">{result.error.code}: {result.error.message}</p>}
    </div> : <div className="empty-evidence"><div className="empty-icon"><FileSearch size={23} strokeWidth={1.4} /></div><h3>Evidence before answers.</h3><p>Observed outputs and test results will build<br className="desktop-break" /> the case for each hypothesis.</p><span className="empty-label">NO EVIDENCE COLLECTED</span></div>}
    <div className="panel-note"><ShieldCheck size={14} /><span>Confidence is a model estimate. Synthetic fixture output is not production evidence; no fix has been verified.</span></div>
  </Panel>;
}
