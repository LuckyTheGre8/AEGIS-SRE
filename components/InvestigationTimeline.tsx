import { Check, CircleDashed, GitBranch, CircleAlert } from "lucide-react";
import type { InvestigationEvent } from "@/lib/agent/types";
import { Panel } from "./Panel";
import type { InvestigationResult } from "@/lib/investigation/result";

const stages = [
  ["Incident prepared", "Validate the incident context"],
  ["Reproduce the failure", "Observe the service in isolation"],
  ["Build diagnostic evidence", "Generate and review a new tool"],
  ["Identify the root cause", "Connect findings to hypotheses"],
  ["Validate a minimal fix", "Verify in a fresh environment"],
];

export function InvestigationTimeline({ event, result, busy = false }: { event: InvestigationEvent | null; result?: InvestigationResult | null; busy?: boolean }) {
  if (result) return <Panel title="Investigation" icon={<GitBranch size={16} />} aside={<span className="panel-count">{result.state}</span>}>
    <div className="timeline investigation-events">{result.events.map((entry) => <div className={`timeline-step ${entry.state === "FAILED" ? "step-failed" : "step-complete"}`} key={entry.id}>
      <div className="step-marker">{entry.state === "FAILED" ? <CircleAlert size={13} /> : <Check size={13} />}</div><div><h3>{entry.title}</h3><p>{entry.summary}</p><time dateTime={entry.timestamp}>{entry.state}</time></div>
    </div>)}</div><div className="panel-note"><CircleDashed size={14} /><span>{result.iterations}/3 model turns · cleanup {result.cleanup} · production NOT EXECUTED</span></div>
  </Panel>;
  return <Panel title="Investigation" icon={<GitBranch size={16} />} aside={<span className="panel-count">{event ? "01" : "00"} / 05</span>}>
    <div className="timeline">
      {stages.map(([title, description], index) => <div className={`timeline-step ${index === 0 && event ? "step-complete" : ""}`} key={title}>
        <div className="step-marker">{index === 0 && event ? <Check size={13} /> : <span>{String(index + 1).padStart(2, "0")}</span>}</div>
        <div><h3>{title}</h3><p>{index === 0 && event ? event.summary : description}</p>
          {index === 0 && event && <time dateTime={event.timestamp}>Prepared locally · no execution</time>}
        </div>
      </div>)}
    </div>
    <div className="panel-note"><CircleDashed size={14} /><span>{busy ? "Model, policy, sandbox evidence, then cleanup. Waiting for the bounded run…" : event ? "Incident accepted. The bounded investigator is starting." : "Your investigation starts with an incident."}</span></div>
  </Panel>;
}
