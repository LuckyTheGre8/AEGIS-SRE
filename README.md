# Aegis SRE

Aegis is an evidence-driven autonomous SRE that generates its own diagnostic tools, executes them inside isolated CreateOS sandboxes, and verifies fixes in fresh environments before recommending production action.

**Hackathon prototype · three complete synthetic reference incidents.** [Live demo](https://aegis-sre-production.up.railway.app) · [2–3 minute demo guide](docs/DEMO.md) · [Real verification receipt](docs/evidence/patch-validation-v0.5.json)

## Problem

AI diagnosis can be plausible and wrong. Letting an agent experiment directly on production infrastructure turns that uncertainty into operational risk.

## Key idea

**AI can be wrong safely.** Require isolated execution, observable evidence, and fresh-environment verification before recommending action.

## What Aegis does

Incident → hypotheses → generated diagnostic → policy validation → CreateOS execution → evidence → root cause → generated patch → fresh validation sandbox → **failure → 200 → VERIFIED** → human approval boundary.

The UI shows actual generated source, confidence estimates, risk/policy decisions, source hashes, sandbox IDs, stdout/stderr, exit codes, duration, diff, regression, and cleanup. Waiting feedback is indeterminate; completed steps come only from real results.

## Architecture

```text
User
  ↓
Railway-hosted Next.js app
  ↓
Investigation orchestrator
  ├─ Gemini: hypotheses, diagnostic code, minimal patch
  ├─ Deterministic policy: validate and gate actions
  └─ CreateOS Sandbox
      ├─ Diagnosis sandbox: reproduce + collect evidence
      └─ Fresh validation sandbox: apply + test + clean up

Stripe Projects: provisioning / project / submission layer
  └─ Attached CreateOS + Railway services
```

## Demo scenario

The proxy returns **502** while its backend returns **200**. Configuration points upstream to **3001**, but the backend listens on **3000**. A runtime-generated tool discovers the mismatch. Gemini proposes the minimal **3001 → 3000** config replacement. A different sandbox recreates the failure, applies/reloads the patch, and verifies **BEFORE 502 · AFTER 200 · REGRESSION PASS** before reporting **VERIFIED**.

Select one of three trusted fixtures before investigating:

- **Broken proxy / 502:** the original upstream 3001 → 3000 flow above.
- **Missing environment variable / 500:** requests fail while /health stays healthy. The diagnostic observes the missing synthetic `AEGIS_DEMO_GREETING`; a generated config replacement populates its synthetic value, reloads the service, and verifies **500 → 200**. No real secrets are used.
- **Broken health check:** the configured /healthz probe returns 404 while the application and /ready return 200. A generated health-path patch is verified as **404 → 200** with the application response unchanged.

All three use the same bounded investigator, restricted generated-code pipeline, policy, and fresh-sandbox validation. The server registry owns bootstrap programs, three allowed probe targets, config schemas, patch constraints and expected failure classes. Gemini supplies the diagnostic source, root cause and replacement value. Each VERIFIED result requires its fixture-specific before failure, successful patch application, HTTP 200 afterward, regression PASS, separate sandbox IDs, and both cleanups.

Real acceptance receipts: [502 regression](docs/evidence/broken-proxy-fixtures-acceptance.json), [missing environment](docs/evidence/missing-environment-acceptance.json), [health check](docs/evidence/broken-health-check-acceptance.json). Guest observation JSON retains the original `proxy`/`backend` field names for compatibility: these mean the primary failing request and the healthy regression endpoint for the additional fixtures.

## Safety

Generated tools execute only in disposable CreateOS environments. Zod/schema validation, source-size/syntax checks, and deterministic policy reject dangerous operations. The golden path supports a restricted read-only diagnostic and one guarded fixture-config patch. Verification requires real before/after results, regression, and confirmed cleanup. **Production mutation is disabled. Human approval is required before production action.** Confidence is a model estimate; synthetic evidence is not production evidence.

## Tech stack

Next.js · TypeScript · Zod · Gemini · CreateOS Sandbox · Stripe Projects · Railway.

## Running locally

Use Node.js 22.13+ and npm. Configure server-only variables in ignored `.env.local`:

- `GEMINI_API_KEY`
- `CREATEOS_SANDBOX_API_KEY`
- `CREATEOS_SANDBOX_BASE_URL` — your account-issued endpoint
- `APP_ORIGIN` — public app origin for production browser requests; `ALLOWED_ORIGIN` is an alias/additional exact origin

Optional: `GEMINI_MODEL`, `CREATEOS_SANDBOX_SHAPE`. Never use `NEXT_PUBLIC_` for credentials or paste keys into the UI. Restart after configuration changes.

```sh
npm ci
npm run dev
```

Open localhost:3000, select a demo incident, load its context, then Investigate. Development permits same-origin localhost requests. Refreshing reconnects through GET /api/investigate; results are in server memory and clear on server restart. A failed attempt retains the previous successful result in the current page. If a connection drops, confirm backend status before retrying.

## Deployment

The control plane is deployed on Railway through services attached in Stripe Projects. Configure the server credentials and `APP_ORIGIN` to match the public HTTPS origin exactly. Railway supplies `PORT`; the production command binds to `0.0.0.0`. Unrelated/cross-site origins remain blocked. Origin validation is not authentication; this single-process hackathon app has no user-authentication or durable job layer.

## Pay only for verified remediation

An optional Stripe flow authorizes **$5.00 USD** before investigating and captures only after independent fresh-sandbox verification **and explicit human approval**. Failed/inconclusive investigations cannot capture, and authorizations can be released. The original investigation engine is unchanged. Configure `STRIPE_SECRET_KEY` server-side and the matching `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; matching test keys simulate payments, while matching live keys display **LIVE MODE · REAL $5** and require the human operator to perform real payment confirmation/capture. No automatic charge or production mutation. [Payment details](docs/PAYMENTS.md) · [Official test-card demo workflow](docs/DEMO.md).

## Current scope

The prototype demonstrates three complete synthetic reference incidents. The architecture is designed to support additional repository/incident adapters later. It does not diagnose arbitrary production incidents today.

Validation: `npm run lint` · `npm run typecheck` · `npm test` · `npm run build`. See [progress](docs/PROGRESS.md), [v0.5 verification](docs/V0.5.md), and [CreateOS operation](docs/CREATEOS_SMOKE.md). This Windows host uses supported Webpack builds; the frozen investigation path is unchanged by v0.6.
