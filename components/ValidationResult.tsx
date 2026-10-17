import { ArrowRight, GitCompareArrows, LockKeyhole } from "lucide-react";
import { Panel } from "./Panel";

export function ValidationResult() {
  return <Panel title="Fix & validation" icon={<GitCompareArrows size={16} />} aside={<span className="subtle-tag">PENDING</span>}>
    <div className="validation-content"><div className="validation-copy"><h3>A fix earns its verification.</h3><p>A proposed patch must pass health and regression<br className="desktop-break" /> checks in a clean sandbox.</p></div>
      <div className="comparison"><div><span>BEFORE</span><strong>—</strong><small>Not observed</small></div><ArrowRight size={20} /><div><span>AFTER</span><strong>—</strong><small>Not tested</small></div></div>
    </div>
    <div className="production-lock"><LockKeyhole size={14} /><span>Production actions disabled</span><span className="lock-status">ENFORCED</span></div>
  </Panel>;
}
