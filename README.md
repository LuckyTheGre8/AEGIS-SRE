# Aegis SRE

**v0.4.0 — Runtime-generated diagnostics.** Gemini writes a diagnostic program at runtime. Aegis validates its schema, source size, syntax and operations, applies deterministic policy, and uploads the exact source into a real disposable CreateOS sandbox. The workspace displays generated source, purpose, risk, policy, actual output, evidence, hypotheses, and confirmed cleanup.

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
3. Inspect hypotheses, confidence estimates, deterministic policy decisions, actual command evidence, and cleanup.
4. Use **Refresh investigation result** after a disconnect, or **Reset incident** to clear the browser view.

The budget is three model turns, three generated tools total, two tool retries, 20 seconds per command, and one disposable sandbox. Results remain in server memory until restart. The reproducible synthetic fixture runs a real broken proxy (HTTP 502) and healthy backend (HTTP 200), with mismatched upstream configuration. Successful runs remain **INCONCLUSIVE** for production, with production action **NOT_EXECUTED**. See [v0.4 operation and real acceptance](docs/V0.4.md).

`POST /api/investigate` accepts only the validated incident/fixture schema. `GET` returns in-process status and the latest result. The browser cannot submit arbitrary commands or source; generated tools come from the server-side model and pass validation before execution. Gemini is the only LLM implementation; no provider selection infrastructure was added.

## Run the CreateOS smoke test

After resetting the incident, click **Run CreateOS smoke test**. The server verifies `whoami()`, discovers shapes/images, creates one `devbox:1` sandbox with public ingress disabled, runs `uname -a`, `python3 --version`, and `node --version`, and confirms destruction. The panel displays actual stdout, stderr, exitCode, and guest durationMs. This independent v0.2 test does not call a model.

```sh
npm run smoke:createos
```

`POST /api/sandbox/smoke` accepts only `{}`; `GET` retrieves the latest in-memory result. See [CreateOS operation and API discrepancies](docs/CREATEOS_SMOKE.md).

## Architecture and boundaries

Next.js App Router, strict TypeScript, React, Tailwind, Zod, Lucide, and official CreateOS Sandbox SDK `0.8.2`. LLMProvider has one Gemini REST implementation. The server validates model decisions and evidence links, applies deterministic policy, executes validated generated JavaScript through a fixed capability runner in CreateOS, and destroys the sandbox in `finally`. Generated code is never executed on the host. Model thought parts are discarded; rationales are limited to 240 characters. Keys never reach browser props or model context.

Policy denies destructive/external-network actions and patches. Generated diagnostics must be READ_ONLY and use only fixed fixture capabilities. Production mutations return REQUIRE_APPROVAL without execution. Confidence is a model estimate; fixture observations are explicitly synthetic evidence. See [architecture](docs/ARCHITECTURE.md).

This repository remains initialized as **Aegis-sre** in Stripe Projects. Use its CLI for service provisioning and managed credentials. Status was rechecked; no hosting service or deployment was added. User-supplied Gemini and Sandbox keys remain local. The CreateOS CLI is not required or installed.

```sh
stripe projects status
stripe projects catalog createos --json
```

These endpoints support a local single-process demo. There is no authentication, persistent queue, database, shared concurrency control, patch validation or production execution. Do not expose the server publicly without appropriate access controls.

## Milestones

- v0.1: foundation workspace, health endpoint, typed contracts.
- v0.2: real CreateOS commands and confirmed cleanup.
- v0.3: bounded Gemini loop, hypotheses, evidence, deterministic policy.
- v0.4: runtime-generated diagnostics, static validation, synthetic 502 fixture, real execution (current).
- Later: final patch verification and deployment.

[Progress and verification](docs/PROGRESS.md) · [Documentation checks](docs/DOC_CHECK.md)
