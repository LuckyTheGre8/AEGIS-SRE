# Aegis SRE

**v0.5.0 — Fresh-sandbox fix verification.** Gemini generates a diagnostic and minimal configuration patch from actual synthetic HTTP 502 evidence. Aegis validates the tool and patch, creates a separate CreateOS validation sandbox, reproduces 502, applies/reloads the patch, measures 200, runs regression, and confirms cleanup before calling the fixture fix VERIFIED.

## Local setup

Use Node.js 22.13 or newer and npm. The UI boots without credentials. Set server-only `GEMINI_API_KEY`, `CREATEOS_SANDBOX_API_KEY`, and your account-issued `CREATEOS_SANDBOX_BASE_URL` in ignored `.env.local`. Optional settings: `GEMINI_MODEL` (default `gemini-3.5-flash-lite`) and `CREATEOS_SANDBOX_SHAPE`. Never add a `NEXT_PUBLIC_` prefix to keys. Restart after changing configuration.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The server binds to loopback. This Windows environment uses supported Webpack mode because Turbopack failed to connect its CSS worker; production disk caching is disabled to resolve a repeat-build hashing failure.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

## Run an investigation

1. Click **Load demo incident** to populate the synthetic HTTP 502 report.
2. Click **Investigate**. The server sends incident text, hypotheses, and observed sandbox output to Gemini.
3. Inspect generated source, hypotheses, policy and actual evidence, then the model root cause/diff and BEFORE 502 → AFTER 200, REGRESSION PASS, FIX STATUS VERIFIED after confirmed cleanup.
4. Use **Refresh investigation result** after a disconnect, or **Reset incident** to clear the browser view.

The budget is three model turns, three generated tools total, two tool retries, 20 seconds per command, one diagnosis sandbox and one fresh validation sandbox. Results remain in server memory until restart. The reproducible synthetic fixture runs a real broken proxy (HTTP 502) and healthy backend (HTTP 200), with mismatched upstream configuration. Fixture fixes become **VERIFIED** only after real before/after, patch/reload, regression and cleanup gates pass. Production action remains **NOT_EXECUTED** and requires human approval. See [v0.5 operation and real acceptance](docs/V0.5.md).

`POST /api/investigate` accepts only the validated incident/fixture schema. `GET` returns in-process status and the latest result. The browser cannot submit arbitrary commands or source; generated tools come from the server-side model and pass validation before execution. Gemini is the only LLM implementation; no provider selection infrastructure was added.

## Run the CreateOS smoke test

After resetting the incident, click **Run CreateOS smoke test**. The server verifies `whoami()`, discovers shapes/images, creates one `devbox:1` sandbox with public ingress disabled, runs `uname -a`, `python3 --version`, and `node --version`, and confirms destruction. The panel displays actual stdout, stderr, exitCode, and guest durationMs. This independent v0.2 test does not call a model.

```sh
npm run smoke:createos
```

`POST /api/sandbox/smoke` accepts only `{}`; `GET` retrieves the latest in-memory result. See [CreateOS operation and API discrepancies](docs/CREATEOS_SMOKE.md).

## Architecture and boundaries

Next.js App Router, strict TypeScript, React, Tailwind, Zod, Lucide, and official CreateOS Sandbox SDK `0.8.2`. LLMProvider has one Gemini REST implementation. The server validates model decisions and evidence links, applies deterministic policy, executes validated generated JavaScript through a fixed capability runner in CreateOS, and destroys the sandbox in `finally`. Generated code is never executed on the host. Model thought parts are discarded; rationales are limited to 240 characters. Keys never reach browser props or model context.

Policy denies destructive/external-network actions. Generated diagnostics must be READ_ONLY and use only fixed fixture capabilities. Patch policy permits one guarded upstream config replacement inside a new disposable validation sandbox. Production mutations return REQUIRE_APPROVAL without execution. Confidence is a model estimate; fixture observations are explicitly synthetic evidence. See [architecture](docs/ARCHITECTURE.md).

This repository remains initialized as **Aegis-sre** in Stripe Projects. Use its CLI for service provisioning and managed credentials. Status was rechecked; no hosting service or deployment was added. User-supplied Gemini and Sandbox keys remain local. The CreateOS CLI is not required or installed.

```sh
stripe projects status
stripe projects catalog createos --json
```

These endpoints support a local single-process demo. There is no authentication, persistent queue, database, shared concurrency control, production execution. Do not expose the server publicly without appropriate access controls.

## Milestones

- v0.1: foundation workspace, health endpoint, typed contracts.
- v0.2: real CreateOS commands and confirmed cleanup.
- v0.3: bounded Gemini loop, hypotheses, evidence, deterministic policy.
- v0.4: runtime-generated diagnostics, static validation, synthetic 502 fixture, real execution.
- v0.5: model-generated minimal patch and fresh-sandbox 502 → 200/regression verification (current).
- Later: deployment and demo freeze.

[Progress and verification](docs/PROGRESS.md) · [Documentation checks](docs/DOC_CHECK.md)
