"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CreditCard, LoaderCircle, RefreshCw } from "lucide-react";
import { loadStripe, type Stripe, type StripeElements, type StripePaymentElement } from "@stripe/stripe-js";
import { PaymentClient } from "@/lib/client/payment-client";
import { paymentMessage, type PaymentView } from "@/lib/payments/schemas";
import { fixtureMetadata } from "@/lib/fixtures/catalog";

export function RemediationPayment({ client, enabled, locked, investigating, onEnabled, onInvestigate }: {
  client: PaymentClient; enabled: boolean; locked: boolean; investigating: boolean;
  onEnabled: (enabled: boolean) => void; onInvestigate: (payment: PaymentView) => void;
}) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getServerSnapshot);
  const payment = state.payment;
  const mount = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<{ stripe: Stripe; elements: StripeElements; element: StripePaymentElement } | null>(null);
  const confirmLock = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [elementReady, setElementReady] = useState(false);
  const confirmingInput = payment?.stage === "AUTHORIZING" && !!state.clientSecret;

  useEffect(() => {
    if (!confirmingInput || !state.publishableKey || !state.clientSecret || !mount.current) return;
    let active = true;
    const destination = mount.current;
    void loadStripe(state.publishableKey).then(stripe => {
      if (!active) return;
      if (!stripe) throw new Error("Stripe.js could not load. Refresh and retry authorization.");
      const elements = stripe.elements({ clientSecret: state.clientSecret!, appearance: { theme: "night" } });
      const element = elements.create("payment", { layout: "tabs" });
      element.on("ready", () => { if (active) setElementReady(true); });
      element.on("loaderror", () => client.reportError("Stripe payment form failed to load. Refresh or release this payment before retrying."));
      stripeRef.current = { stripe, elements, element }; element.mount(destination);
    }).catch(() => { if (active) client.reportError("Stripe.js could not load. Refresh or release this payment before retrying."); });
    return () => { active = false; stripeRef.current?.element.destroy(); stripeRef.current = null; setElementReady(false); };
  }, [client, confirmingInput, state.publishableKey, state.clientSecret]);

  async function authorize() {
    if (confirmLock.current || !stripeRef.current) return;
    confirmLock.current = true; setConfirming(true); client.reportError("");
    try {
      const { stripe, elements } = stripeRef.current;
      const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/` }, redirect: "if_required" });
      if (result.error) { client.reportError(result.error.message ?? "Stripe authorization failed. Check the payment form and retry."); return; }
      // The client response is not trusted for authorization. Re-read Stripe
      // server-side before starting the unchanged Aegis investigation.
      const authorized = await client.refresh(true);
      if (authorized?.stripeStatus === "requires_capture" && authorized.stage === "AUTHORIZED") onInvestigate(authorized);
      else client.reportError("Stripe has not confirmed authorization. Refresh payment status before continuing.");
    } catch { client.reportError("Authorization was interrupted. Refresh payment status before retrying."); }
    finally { confirmLock.current = false; setConfirming(false); }
  }

  return <section className="panel remediation-payment" aria-label="Verified remediation payment">
    <div className="panel-heading"><h2><CreditCard size={16} />Pay only for verified remediation.</h2><span className={`subtle-tag ${state.mode === "live" ? "payment-live" : ""}`}>{state.checking ? "CHECKING STRIPE MODE" : !state.configured ? "STRIPE NOT CONFIGURED" : state.mode === "live" ? "LIVE MODE · REAL $5" : "STRIPE TEST MODE"}</span><button className="icon-button" aria-label="Refresh payment status" disabled={state.busy || confirming} onClick={() => void client.refresh()}><RefreshCw size={14} /></button></div>
    <div className="payment-content">
      <p>Aegis authorizes payment up front, but Stripe captures it only after the proposed remediation passes independent validation in a fresh CreateOS sandbox.</p>
      <label className="payment-toggle"><input type="checkbox" checked={enabled} disabled={locked || investigating || state.busy || confirming || state.checking || !state.configured} onChange={event => onEnabled(event.target.checked)} />Authorize $5 before the next investigation{state.mode === "test" ? " (test funds)" : " (real funds)"}</label>
      {!state.configured && !state.checking && <p className="form-help">Payments unavailable. Configure matching Stripe keys on the server. The existing investigation remains available.</p>}
      <div className="payment-summary"><strong>{state.mode === "live" ? "Price" : "Demo price"}: $5.00 USD</strong><span>{state.checking ? "Checking payment status…" : payment?.stage ?? "NOT_STARTED"}</span></div>
      <p role="status">{state.checking ? "Checking Stripe mode and payment status." : !payment && state.mode === "live" ? "Authorize $5.00 USD in live mode before the next investigation. Real funds will be held." : paymentMessage(payment)}</p>
      {payment && <>
        <p className="result-provenance">{fixtureMetadata(payment.input.fixture).title}<br />PaymentIntent: {payment.paymentIntentId ?? "creation pending"}<br />Stripe: {payment.stripeStatus} · Investigation: {payment.investigationId ?? "not started"}</p>
        <p className="payment-history">{payment.history.join(" → ")}</p>
        {payment.verification && <p><strong>{payment.verification.status}</strong> · BEFORE {payment.verification.before ?? "—"} · AFTER {payment.verification.after ?? "—"} · REGRESSION {payment.verification.regression}<br /><small>Diagnosis {payment.verification.diagnosisSandboxId ?? "—"} · Fresh validation {payment.verification.validationSandboxId ?? "—"}<br />Cleanup: {payment.verification.cleanup}</small></p>}
        {payment.warning && <p className="form-error">{payment.warning}</p>}
      </>}
      {confirmingInput && <div className="payment-confirmation"><div ref={mount} /><button className="button primary" disabled={!elementReady || confirming || state.busy} onClick={() => void authorize()}>{confirming && <LoaderCircle size={15} className="spin" />}Authorize $5 & investigate</button></div>}
      <div className="payment-actions">
        {payment?.stage === "AUTHORIZING" && !state.clientSecret && <button className="button secondary" disabled={state.busy} onClick={() => void client.create(payment.input)}>Resume authorization</button>}
        {payment?.stage === "AUTHORIZED" && !payment.started && <button className="button primary" disabled={state.busy || investigating || confirming} onClick={() => onInvestigate(payment)}>Start authorized investigation</button>}
        {payment?.stage === "READY_TO_CAPTURE" && <button className="button primary" disabled={state.busy || confirming} onClick={() => { if (window.confirm(`Capture $5.00 USD ${state.mode === "test" ? "in Stripe test mode" : "in LIVE MODE (real funds)"} for this independently verified remediation?`)) void client.capture(true); }}>{state.busy && <LoaderCircle size={15} className="spin" />}Approve & capture $5</button>}
        {payment?.paymentIntentId && !["CAPTURED", "RELEASED"].includes(payment.stage) && <button className="button secondary" disabled={state.busy || confirming} onClick={() => void client.cancel()}>Release authorization</button>}
      </div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <small className="form-help">Payment approval is separate from production approval. Production action remains NOT EXECUTED.</small>
    </div>
  </section>;
}
