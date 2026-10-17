import { InvestigationEventSchema } from "../agent/schemas";
import { AgentError } from "../agent/provider";
import type { InvestigationEvent } from "../agent/types";
import type { InvestigationState } from "./states";

const edges: Partial<Record<InvestigationState, InvestigationState[]>> = {
  RECEIVED: ["PLANNING", "FAILED"],
  PLANNING: ["REVIEWING_ACTION", "COMPLETED", "FAILED"],
  REVIEWING_ACTION: ["PROVISIONING_SANDBOX", "EXECUTING_DIAGNOSTIC", "PLANNING", "COMPLETED", "CLEANING_UP", "FAILED"],
  PROVISIONING_SANDBOX: ["EXECUTING_DIAGNOSTIC", "CLEANING_UP", "FAILED"],
  EXECUTING_DIAGNOSTIC: ["ANALYZING_RESULT", "CLEANING_UP", "FAILED"],
  ANALYZING_RESULT: ["PLANNING", "CLEANING_UP", "COMPLETED", "FAILED"],
  CLEANING_UP: ["COMPLETED", "FAILED"],
};

export class InvestigationMachine {
  state: InvestigationState = "RECEIVED";
  readonly events: InvestigationEvent[] = [];
  constructor() { this.record("Incident received", "Validated incident accepted for a bounded baseline investigation."); }
  move(next: InvestigationState, title: string, summary: string) {
    if (!edges[this.state]?.includes(next)) throw new AgentError("INVALID_TRANSITION", `Cannot transition from ${this.state} to ${next}.`);
    this.state = next;
    this.record(title, summary);
  }
  private record(title: string, summary: string) {
    this.events.push(InvestigationEventSchema.parse({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), state: this.state, type: "transition", title, summary: summary.slice(0, 240) }));
  }
}
