import type { AgentAction } from "../agent/types";

export const DIAGNOSTICS = {
  runtime: { command: "node", args: ["--version"], label: "Disposable sandbox Node runtime" },
  listeners: { command: "ss", args: ["-ltn"], label: "Disposable sandbox listening sockets" },
} as const;

export interface PolicyDecision { decision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL"; reason: string }

export function evaluatePolicy(action: AgentAction): PolicyDecision {
  if (action.risk === "PRODUCTION_MUTATION") return { decision: "REQUIRE_APPROVAL", reason: "Production mutation requires human approval and is disabled in this build." };
  if (action.risk === "DESTRUCTIVE" || action.risk === "EXTERNAL_NETWORK") return { decision: "DENY", reason: "Destructive and external-network actions are blocked." };
  if (action.action === "propose_fix" && action.risk === "SANDBOX_MUTATION") return { decision: "ALLOW", reason: "Generate one constrained fixture-config patch for a fresh disposable validation sandbox; no production access." };
  if (action.action === "generate_tool" && action.risk === "READ_ONLY") return { decision: "ALLOW", reason: "Generate a diagnostic; execution requires separate source validation and tool policy." };
  if (action.action === "execute_diagnostic") {
    if (action.risk !== "READ_ONLY" || !action.diagnostic || !(action.diagnostic in DIAGNOSTICS)) {
      return { decision: "DENY", reason: "Only catalog diagnostics classified READ_ONLY may execute." };
    }
    return { decision: "ALLOW", reason: "Approved fixed read-only command in a disposable sandbox." };
  }
  if ((action.action === "inspect_context" || action.action === "finish") && action.risk === "SAFE") {
    return { decision: "ALLOW", reason: "Safe context or completion action; no infrastructure mutation." };
  }
  return { decision: "DENY", reason: "The action does not match an available capability and required risk." };
}
