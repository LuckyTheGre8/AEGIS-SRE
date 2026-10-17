import { FileSearch, Layers3, ShieldCheck } from "lucide-react";
import { Panel } from "./Panel";

export function EvidencePanel() {
  return <Panel title="Evidence & hypotheses" icon={<Layers3 size={16} />} aside={<span className="panel-count">0 COLLECTED</span>}>
    <div className="empty-evidence"><div className="empty-icon"><FileSearch size={23} strokeWidth={1.4} /></div><h3>Evidence before answers.</h3><p>Observed outputs and test results will build<br className="desktop-break" /> the case for each hypothesis.</p><span className="empty-label">NO EVIDENCE COLLECTED</span></div>
    <div className="panel-note"><ShieldCheck size={14} /><span>Confidence comes from verified observations.</span></div>
  </Panel>;
}
