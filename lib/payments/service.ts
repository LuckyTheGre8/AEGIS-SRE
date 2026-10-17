import type Stripe from "stripe";
import type { IncidentInput } from "../agent/types";
import { IncidentInputSchema } from "../agent/schemas";
import { InvestigationResultSchema, type InvestigationResult } from "../investigation/result";
import { type PaymentView, PaymentViewSchema } from "./schemas";
import { fixtureDefinition } from "../fixtures/registry";

type Intent = Pick<Stripe.PaymentIntent, "id" | "status" | "amount" | "currency" | "capture_method" | "amount_capturable" | "amount_received" | "livemode" | "metadata" | "client_secret">;
export interface StripeGateway {
  readonly livemode: boolean;
  create(params: Stripe.PaymentIntentCreateParams, idempotencyKey: string): Promise<Intent>;
  retrieve(id: string): Promise<Intent>;
  update(id: string, metadata: Record<string, string>): Promise<Intent>;
  capture(id: string, idempotencyKey: string): Promise<Intent>;
  cancel(id: string, idempotencyKey: string): Promise<Intent>;
}
export class PaymentError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
interface RecordState {
  owner: string; livemode: boolean; attemptId: string; input: IncidentInput; intentId: string | null;
  stripeStatus: string; started: boolean; running: boolean; result: InvestigationResult | null;
  history: PaymentView["stage"][]; warning?: string;
}
export interface PaymentStore { records: Map<string, RecordState>; current: Map<string, string>; locks: Set<string> }
export const newPaymentStore = (): PaymentStore => ({ records: new Map(), current: new Map(), locks: new Set() });
const PRODUCT = "aegis_verified_remediation";
const sameIncident = (a: IncidentInput, b: IncidentInput) => a.fixture === b.fixture && a.incident === b.incident;

/** Accepts only results returned by the existing server investigation handler. */
export function verifiedForPayment(result: InvestigationResult | null, input: IncidentInput): boolean {
  const validation = result?.validation;
  return !!result && result.fixture === input.fixture && result.outcome === "VERIFIED" && result.state === "COMPLETED" && !result.error && result.cleanup === "DESTROYED" && !!validation && validation.status === "VERIFIED" && !validation.error && validation.policy.decision === "ALLOW" && validation.patch.validationStatus === "VERIFIED" && validation.patchApplied && validation.beforeStatus === fixtureDefinition(input.fixture).expectedFailureStatus && validation.afterStatus === 200 && validation.regression === "PASS" && validation.cleanup === "DESTROYED" && !!validation.validationSandboxId && result.sandboxId === validation.diagnosisSandboxId && validation.diagnosisSandboxId !== validation.validationSandboxId;
}

export class PaymentService {
  constructor(private readonly gateway: () => StripeGateway, private readonly store = newPaymentStore()) {}
  private async exclusive<T>(owner: string, work: () => Promise<T>): Promise<T> {
    if (this.store.locks.has(owner)) throw new PaymentError(409, "A payment operation is already in progress. Refresh status before retrying.");
    this.store.locks.add(owner);
    try { return await work(); } finally { this.store.locks.delete(owner); }
  }
  private owned(owner: string, attemptId: string, intentId?: string): RecordState {
    const record = this.store.records.get(attemptId);
    if (!record || record.owner !== owner || (intentId && record.intentId !== intentId)) throw new PaymentError(404, "Payment linkage was not found for this browser session.");
    return record;
  }
  private checkIntent(record: RecordState, intent: Intent) {
    if (intent.id !== record.intentId || intent.livemode !== record.livemode || intent.amount !== 500 || intent.currency !== "usd" || intent.capture_method !== "manual" || intent.metadata.product !== PRODUCT || intent.metadata.attemptId !== record.attemptId || intent.metadata.fixtureId !== record.input.fixture || ![record.attemptId, record.result?.id].includes(intent.metadata.investigationId)) throw new PaymentError(409, "Stripe payment amount, mode, or investigation linkage did not match. Capture blocked.");
    if (intent.status === "requires_capture" && intent.amount_capturable !== 500) throw new PaymentError(409, "Stripe did not authorize the full demo amount. Capture blocked.");
    if (intent.status === "succeeded" && intent.amount_received !== 500) throw new PaymentError(409, "Stripe did not confirm the expected captured amount.");
    record.stripeStatus = intent.status;
    if (intent.status === "requires_capture" && !record.history.includes("AUTHORIZED")) record.history.push("AUTHORIZED");
  }
  private view(record: RecordState): PaymentView {
    const result = record.result, v = result?.validation;
    const stage: PaymentView["stage"] = record.stripeStatus === "succeeded" ? "CAPTURED" : record.stripeStatus === "canceled" ? "RELEASED" : record.running ? "AWAITING_VERIFICATION" : result ? verifiedForPayment(result, record.input) && record.stripeStatus === "requires_capture" ? "READY_TO_CAPTURE" : "FAILED" : record.stripeStatus === "requires_capture" ? "AUTHORIZED" : "AUTHORIZING";
    if (record.history.at(-1) !== stage) record.history.push(stage);
    return PaymentViewSchema.parse({ attemptId: record.attemptId, input: record.input, investigationId: result?.id ?? null, paymentIntentId: record.intentId, amount: 500, currency: "usd", testMode: !record.livemode, stripeStatus: record.stripeStatus, stage, started: record.started, history: record.history, verification: result ? { outcome: result.outcome, status: v?.status ?? "NOT_VERIFIED", before: v?.beforeStatus ?? null, after: v?.afterStatus ?? null, regression: v?.regression ?? "NOT_RUN", diagnosisSandboxId: result.sandboxId, validationSandboxId: v?.validationSandboxId ?? null, cleanup: `${result.cleanup} / ${v?.cleanup ?? "NOT_REQUIRED"}` } : null, ...(record.warning ? { warning: record.warning } : {}) });
  }
  async create(owner: string, input: IncidentInput) {
    input = IncidentInputSchema.parse(input);
    return this.exclusive(owner, async () => {
      const stripe = this.gateway();
      const current = this.store.current.get(owner);
      let record = current ? this.owned(owner, current) : undefined;
      if (record && !["succeeded", "canceled"].includes(record.stripeStatus)) {
        if (record.started || !sameIncident(record.input, input)) throw new PaymentError(409, "Release the existing authorization before starting another paid investigation.");
      } else record = undefined;
      if (!record) {
        record = { owner, livemode: stripe.livemode, attemptId: crypto.randomUUID(), input, intentId: null, stripeStatus: "not_created", started: false, running: false, result: null, history: ["AUTHORIZING"] };
        this.store.records.set(record.attemptId, record); this.store.current.set(owner, record.attemptId);
      }
      const intent = record.intentId ? await stripe.retrieve(record.intentId) : await stripe.create({ amount: 500, currency: "usd", capture_method: "manual", allowed_payment_method_types: ["card"], description: `Aegis verified remediation — ${input.fixture} (${stripe.livemode ? "live" : "test"} mode)`, metadata: { product: PRODUCT, attemptId: record.attemptId, investigationId: record.attemptId, fixtureId: input.fixture } }, `aegis:create:${record.attemptId}`);
      record.intentId = intent.id; this.checkIntent(record, intent);
      if (!intent.client_secret) throw new PaymentError(502, "Stripe did not return a payment confirmation secret.");
      return { payment: this.view(record), clientSecret: intent.client_secret };
    });
  }
  async status(owner: string | null) {
    const current = owner && this.store.current.get(owner);
    if (!current || !owner) return null;
    const record = this.owned(owner, current);
    if (record.intentId) this.checkIntent(record, await this.gateway().retrieve(record.intentId));
    return this.view(record);
  }
  async investigate(owner: string, attemptId: string, input: IncidentInput, run: (input: IncidentInput) => Promise<Response>): Promise<Response> {
    const record = await this.exclusive(owner, async () => {
      const record = this.owned(owner, attemptId);
      if (record.started || record.running) throw new PaymentError(409, "This authorization has already been linked to an investigation.");
      if (!sameIncident(record.input, input) || !record.intentId) throw new PaymentError(409, "Incident does not match the authorized payment.");
      this.checkIntent(record, await this.gateway().retrieve(record.intentId));
      if (record.stripeStatus !== "requires_capture") throw new PaymentError(409, "Authorize the Stripe payment before investigating.");
      record.started = true; record.running = true; record.history.push("AWAITING_VERIFICATION"); return record;
    });
    try {
      // The browser never supplies a result or a VERIFIED flag. The frozen
      // handler owns execution, validation, and cleanup, including on disconnect.
      const response = await run(record.input);
      const parsed = InvestigationResultSchema.safeParse(await response.clone().json().catch(() => null));
      if (parsed.success && parsed.data.fixture === record.input.fixture) record.result = parsed.data;
      else { record.started = false; record.warning = "The investigation did not start or return a linked result. Payment remains uncaptured."; }
      return response;
    } finally {
      record.running = false;
      if (record.result && record.intentId) {
        try { await this.linkMetadata(record); }
        catch { record.warning = "Stripe metadata synchronization failed. Payment is uncaptured; refresh and retry the payment action."; }
      }
      this.view(record);
    }
  }
  private async linkMetadata(record: RecordState) {
    if (!record.intentId || !record.result) throw new PaymentError(409, "No server-side investigation is linked.");
    const stripe = this.gateway(), intent = await stripe.retrieve(record.intentId);
    this.checkIntent(record, intent);
    if (intent.metadata.investigationId !== record.result.id) {
      this.checkIntent(record, await stripe.update(record.intentId, { investigationId: record.result.id }));
    }
    delete record.warning;
  }
  async capture(owner: string, input: { attemptId: string; paymentIntentId: string; investigationId: string; approved: boolean }) {
    if (input.approved !== true) throw new PaymentError(400, "Explicit approval is required to capture payment.");
    return this.exclusive(owner, async () => {
      const record = this.owned(owner, input.attemptId, input.paymentIntentId);
      if (record.running || record.result?.id !== input.investigationId || !verifiedForPayment(record.result, record.input)) throw new PaymentError(409, "Remediation is not independently VERIFIED with regression PASS, HTTP 200, separate sandboxes, and confirmed cleanup. Payment not captured.");
      await this.linkMetadata(record);
      if (record.stripeStatus === "succeeded") return this.view(record); // Retry after a lost capture response.
      if (record.stripeStatus !== "requires_capture") throw new PaymentError(409, "The linked Stripe payment is not authorized for capture.");
      const intent = await this.gateway().capture(record.intentId!, `aegis:capture:${record.attemptId}`);
      this.checkIntent(record, intent);
      if (intent.status !== "succeeded") throw new PaymentError(502, "Stripe has not confirmed capture. Refresh payment status before retrying.");
      return this.view(record);
    });
  }
  async cancel(owner: string, input: { attemptId: string; paymentIntentId: string }) {
    return this.exclusive(owner, async () => {
      const record = this.owned(owner, input.attemptId, input.paymentIntentId), stripe = this.gateway();
      this.checkIntent(record, await stripe.retrieve(input.paymentIntentId));
      if (record.stripeStatus === "succeeded") throw new PaymentError(409, "The payment is already captured; authorization cannot be released.");
      if (record.stripeStatus !== "canceled") this.checkIntent(record, await stripe.cancel(input.paymentIntentId, `aegis:cancel:${record.attemptId}`));
      return this.view(record);
    });
  }
}
