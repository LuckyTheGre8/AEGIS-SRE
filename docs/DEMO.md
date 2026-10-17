# Aegis — 2–3 minute demo

## Optional pay-on-verified-remediation segment

For simulated payments, configure matching `STRIPE_SECRET_KEY=sk_test_…` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…` from the same account. Never paste values into chat or the UI. Restart the app and verify **STRIPE TEST MODE** on the payment card. Live keys display **LIVE MODE · REAL $5** and use real money; the human operator must perform live authorization and capture.

1. Select the desired synthetic fixture, enable **Authorize $5 before the next investigation**, load its incident context, then click Investigate.
2. In Stripe's Payment Element, test mode supports Visa **4242 4242 4242 4242**, any future expiry such as **12/34**, and any three-digit CVC. Enter values only inside Stripe's iframe. Use synthetic billing details if requested. For automated test-mode scripts, Stripe recommends **pm_card_visa** instead of raw card numbers. [Official test guidance](https://docs.stripe.com/testing). These values do not work in live mode; do not try them with live keys.
3. Click **Authorize $5 & investigate**. Show **AUTHORIZED / requires_capture** and then **AWAITING_VERIFICATION**. This is a hold, not a capture.
4. Show the actual generated diagnostic, evidence, patch, separate fresh validation sandbox, BEFORE failure → AFTER 200, regression PASS, cleanup and **VERIFIED**.
5. The payment card now shows **READY_TO_CAPTURE**. Click **Approve & capture $5** and confirm. Only an actual Stripe `succeeded` result displays **CAPTURED**. Payment approval does not authorize production mutation.
6. Failure demonstration: before running an authorized investigation, a capture request for that reservation must return 409. Failed, inconclusive, or unverified results also return 409 and leave payment uncaptured. Click **Release authorization** to cancel. The automated tests exercise these failure states without changing the stable incident engine.

Reloading restores payment status through the owner cookie while the server process lives. A server restart loses in-memory linkage and blocks capture; cancel remaining holds in the Stripe Dashboard. See [payment configuration, API and safety details](PAYMENTS.md).

## Core investigation recording

Before recording, set the server-only Gemini/CreateOS credentials and the exact public APP_ORIGIN. Open the app, use Check status, and ensure no run or unresolved cleanup is active. The App healthy badge checks the control plane, not provider connectivity. Infrastructure cards describe roles, not live connection tests.

1. **0:00–0:25 — Problem and scope.** “AI can be wrong safely. This prototype demonstrates one complete, reproducible HTTP 502 incident.” Load the demo incident and click Investigate. Show the immediate spinner, elapsed time and isolated-environment message. No intermediate completion is simulated.
2. **0:25–1:20 — Generated capability.** Show the supported hypothesis and confidence estimate. Open AI-generated diagnostic source, purpose, READ_ONLY risk, policy ALLOW and SHA-256. Show the actual CreateOS sandbox ID, stdout, stderr, exit code and duration. The proxy fails with 502 while the backend works; observed config points to the wrong port.
3. **1:20–2:15 — Prove the fix.** Show the model-generated minimal diff, upstreamPort 3001 → 3000. Point out the different diagnosis and fresh validation sandbox IDs. Show BEFORE 502, AFTER 200, REGRESSION PASS, FIX STATUS VERIFIED and both cleanup receipts.
4. **2:15–2:40 — Boundary and infrastructure.** “Production action is NOT EXECUTED. Human approval is required.” Show Gemini, CreateOS Sandbox, Stripe Projects and Railway roles. Explain that more repository/incident adapters are future work.

If a run fails, show its actual error. The previous successful run remains clearly labelled. Retry only after the backend is idle; Check status reconnects after an interrupted request or browser refresh. Results are process memory, not durable storage. Do not claim a recorded receipt is a new live run.

The README links the original real v0.5 receipt for reproducible review. The [v0.6 browser acceptance receipt](evidence/demo-freeze-v0.6.json) also proves the real path after refreshing during execution. v0.6 changes presentation and browser request coordination, not the diagnostic, policy, patch, validation or cleanup implementation.
