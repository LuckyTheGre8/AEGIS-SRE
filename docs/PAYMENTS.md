# Pay on verified remediation

Aegis optionally authorizes **USD $5.00** before a selected synthetic incident runs. The existing investigator and all Gemini, generated-tool, CreateOS, patch, validation, and cleanup code remain unchanged. Payment is a separate wrapper around the existing investigation route. Verification never automatically captures payment or approves production mutation.

## Mode and configuration

Configure these two variables in ignored `.env.local` locally, and in Railway's service variables for deployment:

- `STRIPE_SECRET_KEY` — server only.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — public Stripe.js key from the same account and mode.

Matching `sk_test_` / `pk_test_` keys use Stripe test mode. Matching `sk_live_` / `pk_live_` keys use live mode, prominently labelled **LIVE MODE · REAL $5**. Mixed/missing keys fail closed and leave ordinary investigations available. **Live card authorization and capture require the human operator on HTTPS**. Test cards must never be used with live keys.

The existing `APP_ORIGIN` must match the deployed HTTPS origin. No webhook secret, price ID, customer, database, subscription, or payment-details storage is needed. The public key is returned by the server configuration endpoint, so changing keys requires a server restart, not a client-side secret. Secret keys never enter the response, UI, metadata, sandbox, or error logs.

## Flow

1. Select a fixture, enable **Authorize $5 before the next investigation**, and click Investigate. The ordinary unpaid investigation path remains available when payments are disabled.
2. A server-generated reservation ID links a fixed-price PaymentIntent using `capture_method: manual`. The Payment Element collects payment details inside Stripe's iframe; application code never reads raw card values.
3. Click **Authorize $5 & investigate**. Stripe.js confirms the PaymentIntent with `redirect: if_required`. Aegis re-reads Stripe server-side and requires `requires_capture` and the full authorized amount before calling the original investigation handler.
4. The unchanged Aegis workflow runs. Its server response binds the actual investigation ID to the payment record and Stripe metadata. The original reservation remains `attemptId`; before execution, `metadata.investigationId` holds that reservation, then changes to the actual server-generated investigation ID.
5. Only a linked COMPLETED/VERIFIED result with the expected fixture failure, applied patch, AFTER 200, regression PASS, separate sandbox IDs, and both cleanups permits **Approve & capture $5**. The button asks for explicit confirmation. The server checks ownership, all IDs, the trusted result, amount, currency, capture method, Stripe mode, metadata and current `requires_capture` status before capture.
6. `succeeded` means **CAPTURED**. Authorization alone never means captured. Failed/inconclusive/unverified results cannot capture; **Release authorization** cancels the existing PaymentIntent. A duplicate capture retry returns the existing succeeded result, without a second Stripe capture.

## API and ownership

- `POST /api/payments/create`: strict selected incident input; fixed 500 cents/USD/manual capture; returns an owner-scoped confirmation client secret, never the secret API key.
- `GET /api/payments/status`: sanitized current payment, mode and verification snapshot. Never returns a confirmation secret or card data.
- `POST /api/payments/investigate`: selected incident plus reservation `attemptId`; requires actual Stripe authorization; invokes the frozen investigation handler.
- `POST /api/payments/capture`: `attemptId`, `paymentIntentId`, actual `investigationId`, `approved: true`. Client-supplied verification flags are rejected.
- `POST /api/payments/cancel`: linked `attemptId` and `paymentIntentId`.

An opaque HttpOnly, SameSite=Strict cookie owns the payment attempt. Production uses Secure cookies. Existing exact origin checks protect the new routes; the origin implementation and original routes are unchanged. Per-owner operation locks, one investigation per authorization, and Stripe idempotency keys prevent duplicate operations. Results and ownership stay in server memory, consistent with the prototype. This is browser-session ownership, not a new user authentication system.

Use one Railway replica. After process restart, expired cookies, or loss of in-memory linkage, capture fails closed; cancel an outstanding authorization in the Stripe Dashboard. Keep the PaymentIntent ID for that purpose. Authorization expiry is controlled by Stripe/card networks; consult [manual capture guidance](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method). A restart does not itself release a Stripe hold. Uncertainty or lost responses require refreshing actual Stripe status before retrying.

## SDK/docs

Official `stripe` **23.0.0** and `@stripe/stripe-js` **10.1.0** are pinned. The current Node SDK uses `allowed_payment_method_types: ["card"]` when creating PaymentIntents; older examples using the create parameter `payment_method_types` no longer match this SDK's current types. The response still exposes `payment_method_types`.

Primary references: [Node SDK](https://github.com/stripe/stripe-node), [create](https://docs.stripe.com/api/payment_intents/create), [capture](https://docs.stripe.com/api/payment_intents/capture), [cancel](https://docs.stripe.com/api/payment_intents/cancel), [Payment Element confirmation](https://docs.stripe.com/js/payment_intents/confirm_payment), [Stripe testing](https://docs.stripe.com/testing).

## Observed acceptance and remaining manual step

The supplied keys were live-mode keys. The real Stripe API created unconfirmed manual-capture PaymentIntents. Real application checks rejected capture before verification (409), missing approval (400), wrong payment linkage (404), and investigation without authorization (409). Both unconfirmed intents were canceled, and Stripe confirmed **amount_capturable = 0, amount_received = 0**. [Actual API receipt](evidence/payment-boundary-live.json).

The unchanged core also passed a new real Gemini/CreateOS **502 → 200 / regression PASS / VERIFIED** run, with different diagnosis and validation sandbox IDs and both destroyed. [Actual core regression receipt](evidence/payment-core-regression.json).

Automated mocked payment tests prove AUTHORIZED → VERIFIED → CAPTURED, denial gates, release, safe retries, owner linkage, errors and UI state. **These are not a real Stripe authorization/capture acceptance run.** That final step remains for a human on the HTTPS deployment with live keys, or an automated/synthetic-card run after matching test keys are supplied. No payment was authorized or captured during the recorded checks. Local live Stripe.js displayed its expected HTTPS requirement; no payment details were entered.
