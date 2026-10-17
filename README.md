# Aegis SRE

An evidence-driven autonomous SRE that will write diagnostic tools, run them in isolated CreateOS sandboxes, and verify fixes before recommending production action.

**v0.2.0 — Real CreateOS.** The workspace now runs a fixed smoke test in a real disposable CreateOS sandbox: authenticate, create, run Linux/Python/Node checks, capture output, and confirm destruction. AI diagnostics, generated tools, patches, and incident verification remain later milestones.

## Local setup

Use Node.js 22.13 or newer and npm. The UI boots without credentials; the real smoke test requires server-side CreateOS credentials.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The server binds to loopback by default.

Development and production builds explicitly use Next.js's supported Webpack mode. The default Turbopack CSS worker failed to connect on this Windows/Node setup, including outside the execution sandbox. Production Webpack disk caching is disabled to avoid a repeat-build hashing failure on this host.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`GET /api/health` returns HTTP 200 with the app version, explicit capability flags, and a credential-presence boolean. It checks the application only; it does not claim provider health.

## Run the real CreateOS smoke test

Set `CREATEOS_SANDBOX_API_KEY` and your account-issued `CREATEOS_SANDBOX_BASE_URL` in `.env.local`, without a `NEXT_PUBLIC_` prefix. Restart the app after changing credentials. Do not paste credentials into the UI or commit the file.

Click **Run CreateOS smoke test** in the sandbox panel. The server verifies `whoami()`, discovers shapes/images, creates one `devbox:1` VM with public ingress disabled, and executes:

```sh
uname -a
python3 --version
node --version
```

The panel displays actual stdout, stderr, exit codes, and guest execution durations. Success requires all three zero exits and confirmed sandbox destruction. The run is independent of incident preparation and never invokes a model.

For terminal verification:

```sh
npm run smoke:createos
```

`POST /api/sandbox/smoke` accepts only an empty JSON object `{}` and returns the result after cleanup. `GET /api/sandbox/smoke` returns the current in-process status and latest result, useful after a browser disconnect. Only one run is allowed per server process. See [smoke-test operation and API discrepancies](docs/CREATEOS_SMOKE.md).

## Try the foundation

1. Click **Load demo incident** to populate: “Production API is returning HTTP 502 errors. Diagnose the issue.”
2. Click **Prepare incident** to validate the text and record a local `RECEIVED` event.
3. Inspect the workspace, switch between terminal output and generated source, and refresh application health.
4. Use **Reset incident** to clear preparation, or **Project notes** for milestone details.

Incident preparation is browser memory only. Reloading clears it. There is no investigation endpoint, model invocation, or arbitrary shell endpoint. The independent smoke endpoint performs real execution; incident evidence and fix-verification panels remain empty. No diagnostic output or verification is simulated.

## What problem we solve

Incidents often need evidence that existing diagnostic tools cannot collect. Aegis is being built to generate that missing capability, execute it in isolation, and require a clean validation run before calling a fix verified.

The planned complete demo reproduces HTTP 502, generates a diagnostic from observed evidence, proposes a minimal patch, and tests it in a fresh sandbox. The v0.1 interface lays out this workflow without claiming it has run.

## Architecture and stack

Next.js App Router, strict TypeScript, React, Tailwind CSS, Zod, Lucide icons, and the official CreateOS Sandbox SDK. The application has no database or user authentication layer. See [architecture](docs/ARCHITECTURE.md) for current boundaries and future integration points.

- `app/`: page, layout, styles, and server-only health route.
- `components/`: incident preparation, timeline, execution, evidence, and validation shell.
- `lib/agent/`: Zod schemas and inferred TypeScript contracts.
- `lib/sandbox/`: provider abstraction, official CreateOS adapter, and fixed smoke runner.
- `lib/investigation/`: explicit state vocabulary, with no execution engine yet.
- `tests/`: boundary validation tests using the Node test runner via `tsx`.

## Stripe Projects and CreateOS

This repository is already initialized as **Aegis-sre** in Stripe Projects. The bootstrap commit and CLI-managed agent instructions are retained. We verified the project with `stripe projects status --json`, inspected provider guidance, and searched the live catalog. No hosting services or deployment were added for this smoke-test milestone. The account-issued Sandbox credentials were supplied locally; they are not assumed to be hosting credentials.

Use Stripe Projects for future provisioning and credentials:

```sh
stripe projects status
stripe projects catalog createos --json
stripe projects search hosting
```

The checked catalog exposes `createos/free` (plan) and `createos/project` (deployable). Provisioning and account linking remain future work. The catalog describes hosting; do not assume its credentials are also Sandbox API credentials.

CreateOS supplies disposable execution for the v0.2 smoke test. The official ESM SDK is pinned to `0.8.2`; the package uses ESM so the CLI and tests can load it. The CreateOS CLI is not required and was not installed.

## Environment and safety

`.env.example` documents the server-only `CREATEOS_SANDBOX_BASE_URL`, `CREATEOS_SANDBOX_API_KEY`, and optional `CREATEOS_SANDBOX_SHAPE`. Do not add a `NEXT_PUBLIC_` prefix to credentials. Manage provisioned service credentials through Stripe Projects; `.env.local` supports the user-supplied Sandbox key. Keep environment files, vaults, and caches ignored.

Production execution is disabled. Input schemas reject unknown properties; model action schemas preserve risk for future policy review. **Schemas are data validation, not a source-code security policy.** A deterministic policy engine and isolated execution must be implemented before generated code can run.

## Roadmap and limitations

- **v0.1:** foundation workspace, health endpoint, and typed contracts.
- **v0.2:** actual CreateOS connectivity, fixed command output, and confirmed cleanup (this release).
- **v0.3:** bounded agent loop, provider abstraction, evidence, and deterministic policy.
- **v0.4:** model-generated tools, policy review, upload, and sandbox execution.
- **v0.5:** actual failing fixture, patch generation, and clean 502 → 200 validation.
- **v0.6:** deployment and demo freeze.

This version has no persistent investigations, AI provider, generated tools, diagnosis loop, policy execution, or production mutations. The smoke endpoint is for a local single-process demo; do not expose it publicly without authentication and shared concurrency controls. See [progress](docs/PROGRESS.md) for verification results and [documentation checks](docs/DOC_CHECK.md) for the source review.
