import { InvestigationEventSchema } from "../agent/schemas";
import { AgentError } from "../agent/provider";
import type { InvestigationEvent } from "../agent/types";
import type { InvestigationState } from "./states";

const edges: Partial<Record<InvestigationState, InvestigationState[]>> = {
  RECEIVED: ["PLANNING", "FAILED"],
  PLANNING: ["REVIEWING_ACTION", "COMPLETED", "FAILED"],
  REVIEWING_ACTION: ["GENERATING_FIX", "PROVISIONING_SANDBOX", "GENERATING_TOOL", "EXECUTING_DIAGNOSTIC", "PLANNING", "COMPLETED", "CLEANING_UP", "FAILED"],
  GENERATING_FIX: ["VALIDATING_FIX", "CLEANING_UP", "FAILED"],
  VALIDATING_FIX: ["CLEANING_UP", "FAILED"],
  PROVISIONING_SANDBOX: ["REPRODUCING", "EXECUTING_DIAGNOSTIC", "CLEANING_UP", "FAILED"],
  REPRODUCING: ["GENERATING_TOOL", "CLEANING_UP", "FAILED"],
  GENERATING_TOOL: ["REVIEWING_TOOL", "CLEANING_UP", "FAILED"],
  REVIEWING_TOOL: ["GENERATING_TOOL", "EXECUTING_TOOL", "CLEANING_UP", "FAILED"],
  EXECUTING_TOOL: ["GENERATING_TOOL", "ANALYZING_RESULT", "CLEANING_UP", "FAILED"],
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
