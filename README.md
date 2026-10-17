# Aegis SRE

**v0.3.0 — Bounded Gemini investigation.** Gemini proposes typed hypotheses and actions; deterministic policy permits fixed read-only diagnostics in a real disposable CreateOS sandbox. The workspace displays confidence estimates, actual evidence, concise rationales, and confirmed cleanup.

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

The budget is three model turns, two distinct fixed diagnostics, and one disposable sandbox. Results remain in server memory until restart. This version observes a clean VM baseline; it does not reproduce the reported production incident. Successful runs end **INCONCLUSIVE**, with production action **NOT_EXECUTED**. See [v0.3 operation and real acceptance](docs/V0.3.md).

`POST /api/investigate` accepts only the validated incident/fixture schema. `GET` returns in-process status and the latest result. No arbitrary command or generated-code endpoint exists. Gemini is the only LLM implementation; no provider selection infrastructure was added.

## Run the CreateOS smoke test

After resetting the incident, click **Run CreateOS smoke test**. The server verifies `whoami()`, discovers shapes/images, creates one `devbox:1` sandbox with public ingress disabled, runs `uname -a`, `python3 --version`, and `node --version`, and confirms destruction. The panel displays actual stdout, stderr, exitCode, and guest durationMs. This independent v0.2 test does not call a model.

```sh
npm run smoke:createos
```

`POST /api/sandbox/smoke` accepts only `{}`; `GET` retrieves the latest in-memory result. See [CreateOS operation and API discrepancies](docs/CREATEOS_SMOKE.md).

## Architecture and boundaries

Next.js App Router, strict TypeScript, React, Tailwind, Zod, Lucide, and official CreateOS Sandbox SDK `0.8.2`. LLMProvider has one Gemini REST implementation. The server validates model decisions and evidence links, applies deterministic policy, executes only server-owned command/argument pairs, and destroys the sandbox in `finally`. Model thought parts are discarded; rationales are limited to 240 characters. Keys never reach browser props or model context.

Policy denies destructive/network actions, generated tools, and patches. Production mutations return REQUIRE_APPROVAL without execution. Confidence is a model estimate; fresh-VM output is explicitly baseline evidence. See [architecture](docs/ARCHITECTURE.md).

This repository remains initialized as **Aegis-sre** in Stripe Projects. Use its CLI for service provisioning and managed credentials. Status was rechecked; no hosting service or deployment was added. User-supplied Gemini and Sandbox keys remain local. The CreateOS CLI is not required or installed.

```sh
stripe projects status
stripe projects catalog createos --json
```

These endpoints support a local single-process demo. There is no authentication, persistent queue, database, shared concurrency control, generated diagnostic tool execution, patch validation, or production execution. Do not expose the server publicly without appropriate access controls.

## Milestones

- v0.1: foundation workspace, health endpoint, typed contracts.
- v0.2: real CreateOS commands and confirmed cleanup.
- v0.3: bounded Gemini loop, hypotheses, evidence, deterministic policy (current).
- Later: generated tools, incident reproduction, patch validation, deployment.

[Progress and verification](docs/PROGRESS.md) · [Documentation checks](docs/DOC_CHECK.md)
