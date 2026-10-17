import { z } from "zod";
import type { IncidentInput } from "../agent/types";
import { InvestigationResultSchema, type InvestigationResult } from "../investigation/result";

const StatusSchema = z.object({ running: z.boolean(), lastResult: InvestigationResultSchema.nullable() });
interface ViewState {
  phase: "checking" | "idle" | "running" | "recovering";
  result: InvestigationResult | null;
  lastAttempt: InvestigationResult | null;
  error: string;
  elapsedSeconds: number;
  reconnected: boolean;
}
export const INITIAL_INVESTIGATION_VIEW: ViewState = { phase: "checking", result: null, lastAttempt: null, error: "", elapsedSeconds: 0, reconnected: false };

/** Browser request coordination only. Never invents server phases or observations. */
export class InvestigationClient {
  private state = INITIAL_INVESTIGATION_VIEW;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private startedAt: number | null = null;
  private post: AbortController | null = null;
  private status: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init), private readonly now: () => number = Date.now) {}
  getSnapshot = () => this.state;
  getServerSnapshot = () => INITIAL_INVESTIGATION_VIEW;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(change: Partial<ViewState>) { this.state = { ...this.state, ...change }; this.listeners.forEach(listener => listener()); }
  private resultState(result: InvestigationResult): Partial<ViewState> {
    const failed = result.outcome === "FAILED";
    return {
      lastAttempt: result,
      result: failed && this.state.result && this.state.result.outcome !== "FAILED" ? this.state.result : result,
      error: failed ? `${result.error?.code ?? result.validation?.error?.code ?? "INVESTIGATION_FAILED"}: ${result.error?.message ?? result.validation?.error?.message ?? result.summary}` : "",
    };
  }
  start() {
    if (this.timer) return;
    void this.refresh();
    let ticks = 0;
    this.timer = setInterval(() => {
      if (this.startedAt !== null && this.state.phase !== "idle") this.update({ elapsedSeconds: Math.floor((this.now() - this.startedAt) / 1000) });
      if (++ticks % 2 === 0 && this.state.phase !== "idle") void this.refresh();
    }, 1000);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.epoch++;
    this.post?.abort(); this.status?.abort();
    this.post = null; this.status = null;
  }
  clear(clearResult = false) {
    if (this.state.phase !== "idle" || this.post) return;
    this.epoch++;
    this.update({ error: "", ...(clearResult ? { result: null, lastAttempt: null } : {}) });
  }
  async submit(input: IncidentInput) {
    // Synchronous lock also covers rapid clicks before React renders disabled.
    if (this.state.phase !== "idle" || this.post) return;
    const epoch = ++this.epoch;
    const controller = new AbortController(); this.post = controller;
    this.startedAt = this.now();
    this.update({ phase: "running", error: "", elapsedSeconds: 0, reconnected: false });
    let recover = false;
    try {
      const response = await this.fetcher("/api/investigate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: controller.signal });
      const data: unknown = await response.json().catch(() => null);
      if (epoch !== this.epoch) return;
      const parsed = InvestigationResultSchema.safeParse(data);
      if (parsed.success) this.update({ ...this.resultState(parsed.data), phase: "idle" });
      else {
        const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "No valid investigation result was returned.";
        recover = response.status === 409 || response.status >= 500;
        if (recover) this.startedAt = null;
        this.update({ phase: recover ? "recovering" : "idle", error: `HTTP ${response.status}: ${message}` });
      }
    } catch {
      if (epoch !== this.epoch) return;
      recover = true;
      this.update({ phase: "recovering", error: "Request interrupted. Checking server status; sandbox cleanup continues. Confirm status before retrying." });
    } finally {
      if (this.post === controller) this.post = null;
      if (recover && epoch === this.epoch) await this.refresh();
      else if (epoch === this.epoch && this.state.phase === "idle") this.startedAt = null;
    }
  }
  async refresh() {
    if (this.status) return;
    const epoch = this.epoch;
    const duringPost = this.post !== null;
    const controller = new AbortController(); this.status = controller;
    try {
      const response = await this.fetcher("/api/investigate", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
      const data: unknown = await response.json();
      if (epoch !== this.epoch) return;
      if (!response.ok) throw new Error(`Status request failed (HTTP ${response.status}).`);
      const status = StatusSchema.safeParse(data);
      if (!status.success) throw new Error("Server returned an invalid investigation status.");
      // GET may contain the previous run while POST is pending, or briefly say
      // idle before POST is admitted. Neither should finish or replace this run.
      if (duringPost || this.post) return;
      const latest = status.data.lastResult;
      const result = latest && latest.id !== this.state.lastAttempt?.id ? this.resultState(latest) : {};
      if (status.data.running) {
        const reconnecting = this.startedAt === null;
        if (reconnecting) this.startedAt = this.now();
        this.update({ ...(!this.state.result ? result : {}), phase: "running", reconnected: this.state.reconnected || reconnecting });
      } else {
        this.startedAt = null;
        this.update({ ...result, phase: "idle" });
      }
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.update({ error: `${error instanceof Error ? error.message : "Could not retrieve server status."} Use Check status to reconnect.` });
    } finally { if (this.status === controller) this.status = null; }
  }
}
