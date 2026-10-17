import Stripe from "stripe";
import { PaymentError, type StripeGateway } from "./service";

export function paymentConfiguration() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  const mode = secret?.startsWith("sk_live_") ? "live" as const : "test" as const;
  const configured = !!secret?.startsWith(`sk_${mode}_`) && !!publishableKey?.startsWith(`pk_${mode}_`);
  return { configured, mode, ...(configured ? { publishableKey } : {}) };
}

export function stripeFromEnvironment(): StripeGateway {
  if (!paymentConfiguration().configured) throw new PaymentError(503, "Configure matching STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY from the same Stripe account and mode.");
  // Lazy creation allows the unchanged app/build to work without payment keys.
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!.trim(), { timeout: 10_000, maxNetworkRetries: 1, telemetry: false, appInfo: { name: "Aegis SRE" } });
  return {
    livemode: paymentConfiguration().mode === "live",
    create: (params, key) => stripe.paymentIntents.create(params, { idempotencyKey: key }),
    retrieve: id => stripe.paymentIntents.retrieve(id),
    update: (id, metadata) => stripe.paymentIntents.update(id, { metadata }),
    capture: (id, key) => stripe.paymentIntents.capture(id, { amount_to_capture: 500 }, { idempotencyKey: key }),
    cancel: (id, key) => stripe.paymentIntents.cancel(id, { cancellation_reason: "requested_by_customer" }, { idempotencyKey: key }),
  };
}
