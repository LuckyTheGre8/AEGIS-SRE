# Aegis — 2–3 minute demo

Before recording, set the server-only Gemini/CreateOS credentials and the exact public APP_ORIGIN. Open the app, use Check status, and ensure no run or unresolved cleanup is active. The App healthy badge checks the control plane, not provider connectivity. Infrastructure cards describe roles, not live connection tests.

1. **0:00–0:25 — Problem and scope.** “AI can be wrong safely. This prototype demonstrates one complete, reproducible HTTP 502 incident.” Load the demo incident and click Investigate. Show the immediate spinner, elapsed time and isolated-environment message. No intermediate completion is simulated.
2. **0:25–1:20 — Generated capability.** Show the supported hypothesis and confidence estimate. Open AI-generated diagnostic source, purpose, READ_ONLY risk, policy ALLOW and SHA-256. Show the actual CreateOS sandbox ID, stdout, stderr, exit code and duration. The proxy fails with 502 while the backend works; observed config points to the wrong port.
3. **1:20–2:15 — Prove the fix.** Show the model-generated minimal diff, upstreamPort 3001 → 3000. Point out the different diagnosis and fresh validation sandbox IDs. Show BEFORE 502, AFTER 200, REGRESSION PASS, FIX STATUS VERIFIED and both cleanup receipts.
4. **2:15–2:40 — Boundary and infrastructure.** “Production action is NOT EXECUTED. Human approval is required.” Show Gemini, CreateOS Sandbox, Stripe Projects and Railway roles. Explain that more repository/incident adapters are future work.

If a run fails, show its actual error. The previous successful run remains clearly labelled. Retry only after the backend is idle; Check status reconnects after an interrupted request or browser refresh. Results are process memory, not durable storage. Do not claim a recorded receipt is a new live run.

The README links the original real v0.5 receipt for reproducible review. The [v0.6 browser acceptance receipt](evidence/demo-freeze-v0.6.json) also proves the real path after refreshing during execution. v0.6 changes presentation and browser request coordination, not the diagnostic, policy, patch, validation or cleanup implementation.
