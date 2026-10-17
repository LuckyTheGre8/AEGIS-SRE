import { Check, CircleDashed, GitBranch } from "lucide-react";
import type { InvestigationEvent } from "@/lib/agent/types";
import { Panel } from "./Panel";

const stages = [
  ["Incident prepared", "Validate the incident context"],
  ["Reproduce the failure", "Observe the service in isolation"],
  ["Build diagnostic evidence", "Generate and review a new tool"],
  ["Identify the root cause", "Connect findings to hypotheses"],
  ["Validate a minimal fix", "Verify in a fresh environment"],
];

export function InvestigationTimeline({ event }: { event: InvestigationEvent | null }) {
  return <Panel title="Investigation" icon={<GitBranch size={16} />} aside={<span className="panel-count">{event ? "01" : "00"} / 05</span>}>
    <div className="timeline">
      {stages.map(([title, description], index) => <div className={`timeline-step ${index === 0 && event ? "step-complete" : ""}`} key={title}>
        <div className="step-marker">{index === 0 && event ? <Check size={13} /> : <span>{String(index + 1).padStart(2, "0")}</span>}</div>
        <div><h3>{title}</h3><p>{index === 0 && event ? event.summary : description}</p>
          {index === 0 && event && <time dateTime={event.timestamp}>Prepared locally · no execution</time>}
        </div>
      </div>)}
    </div>
    <div className="panel-note"><CircleDashed size={14} /><span>{event ? "Incident ready. Execution arrives in a later milestone." : "Your investigation starts with an incident."}</span></div>
  </Panel>;
}
