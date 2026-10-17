import type { IncidentInput } from "../agent/types";
import { PaymentResponseSchema, type PaymentView } from "../payments/schemas";

interface PaymentClientState {
  checking: boolean; busy: boolean; configured: boolean; mode: "test" | "live";
  payment: PaymentView | null; publishableKey: string | null; clientSecret: string | null; error: string;
}
const INITIAL: PaymentClientState = { checking: true, busy: false, configured: false, mode: "test", payment: null, publishableKey: null, clientSecret: null, error: "" };

/** Browser-only payment UI coordination. Verification is never sent by this client. */
export class PaymentClient {
  private state = INITIAL;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private refreshInFlight: Promise<PaymentView | null> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private investigationAttemptId: string | null = null;
  constructor(private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)) {}
  getSnapshot = () => this.state;
  getServerSnapshot = () => INITIAL;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(change: Partial<PaymentClientState>) { this.state = { ...this.state, ...change }; this.listeners.forEach(listener => listener()); }
  reportError = (message: string) => this.update({ error: message });
  linkInvestigation(attemptId: string | null) { this.investigationAttemptId = attemptId; }
  investigationFetch: typeof fetch = (url, init) => {
    if (url === "/api/investigate" && init?.method === "POST" && this.investigationAttemptId) return this.fetcher("/api/payments/investigate", { ...init, body: JSON.stringify({ ...JSON.parse(String(init.body)), attemptId: this.investigationAttemptId }) });
    return this.fetcher(url, init);
  };
  start() {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => { if (this.state.checking || (this.state.payment && !["CAPTURED", "RELEASED"].includes(this.state.payment.stage))) void this.refresh(); }, 2500);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.epoch++; this.refreshInFlight = null; }
  private async read(response: Response) {
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "Payment request failed. Refresh status before retrying.");
    return PaymentResponseSchema.parse(data);
  }
  async refresh(fresh = false): Promise<PaymentView | null> {
    if (this.refreshInFlight) {
      const previous = await this.refreshInFlight;
      return fresh ? this.refresh() : previous;
    }
    if (this.state.busy) return this.state.payment;
    const work = this.readStatus(); this.refreshInFlight = work;
    try { return await work; } finally { if (this.refreshInFlight === work) this.refreshInFlight = null; }
  }
  private async readStatus(): Promise<PaymentView | null> {
    const epoch = this.epoch;
    try {
      const data = await this.read(await this.fetcher("/api/payments/status", { cache: "no-store", signal: AbortSignal.timeout(10_000) }));
      if (epoch === this.epoch) this.update({ checking: false, configured: data.configured, mode: data.mode, publishableKey: data.publishableKey ?? null, payment: data.payment, ...(["CAPTURED", "RELEASED"].includes(data.payment?.stage ?? "") ? { clientSecret: null } : {}) });
      return epoch === this.epoch ? data.payment : this.state.payment;
    } catch (error) {
      if (epoch === this.epoch) this.update({ checking: false, error: error instanceof Error ? error.message : "Payment status unavailable." });
      return null;
    }
  }
  private async post(path: string, body: unknown) {
    if (this.state.busy) return null;
    const epoch = ++this.epoch; this.update({ busy: true, error: "" });
    try {
      const data = await this.read(await this.fetcher(`/api/payments/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) }));
      if (epoch !== this.epoch) return null;
      this.update({ configured: data.configured, mode: data.mode, publishableKey: data.publishableKey ?? null, payment: data.payment, clientSecret: data.clientSecret ?? null });
      return data.payment;
    } catch (error) { if (epoch === this.epoch) this.update({ error: error instanceof Error ? error.message : "Payment request failed. Refresh before retrying." }); return null; }
    finally { if (epoch === this.epoch) this.update({ busy: false }); }
  }
  create(input: IncidentInput) { return this.post("create", input); }
  capture(approved: boolean) {
    const payment = this.state.payment;
    if (!approved || !payment || payment.stage !== "READY_TO_CAPTURE" || !payment.investigationId) return Promise.resolve(null);
    return this.post("capture", { attemptId: payment.attemptId, paymentIntentId: payment.paymentIntentId, investigationId: payment.investigationId, approved: true });
  }
  cancel() {
    const payment = this.state.payment;
    if (!payment?.paymentIntentId) return Promise.resolve(null);
    return this.post("cancel", { attemptId: payment.attemptId, paymentIntentId: payment.paymentIntentId });
  }
}
