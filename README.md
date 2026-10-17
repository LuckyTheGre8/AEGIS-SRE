# Aegis SRE

An evidence-driven autonomous SRE that will write diagnostic tools, run them in isolated CreateOS sandboxes, and verify fixes before recommending production action.

**v0.1.0 — Foundation.** This milestone provides a working Next.js application, health endpoint, validated incident preparation, core data contracts, and investigation workspace. Sandbox execution, AI diagnostics, patches, and verification are later milestones.

## Local setup

Use Node.js 22.13 or newer and npm. No credentials or external services are required for v0.1.

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

`GET /api/health` returns HTTP 200 with the app version and explicit capability flags. It checks the application only; it does not claim provider health.

## Try the foundation

1. Click **Load demo incident** to populate: “Production API is returning HTTP 502 errors. Diagnose the issue.”
2. Click **Prepare incident** to validate the text and record a local `RECEIVED` event.
3. Inspect the workspace, switch between terminal output and generated source, and refresh application health.
4. Use **Reset incident** to clear preparation, or **Project notes** for milestone details.

Preparation is browser memory only. Reloading clears it. There is no investigation endpoint, model invocation, shell endpoint, or remote execution in this milestone. Empty states are intentional; no diagnostic output or verification is simulated.

## What problem we solve

Incidents often need evidence that existing diagnostic tools cannot collect. Aegis is being built to generate that missing capability, execute it in isolation, and require a clean validation run before calling a fix verified.

The planned complete demo reproduces HTTP 502, generates a diagnostic from observed evidence, proposes a minimal patch, and tests it in a fresh sandbox. The v0.1 interface lays out this workflow without claiming it has run.

## Architecture and stack

Next.js App Router, strict TypeScript, React, Tailwind CSS, Zod, and Lucide icons. The application has no database or authentication layer. See [architecture](docs/ARCHITECTURE.md) for current boundaries and future integration points.

- `app/`: page, layout, styles, and server-only health route.
- `components/`: incident preparation, timeline, execution, evidence, and validation shell.
- `lib/agent/`: Zod schemas and inferred TypeScript contracts.
- `lib/investigation/`: explicit state vocabulary, with no execution engine yet.
- `tests/`: boundary validation tests using the Node test runner via `tsx`.

## Stripe Projects and CreateOS

This repository is already initialized as **Aegis-sre** in Stripe Projects. The bootstrap commit and CLI-managed agent instructions are retained. We verified the project with `stripe projects status --json`, inspected provider guidance, and searched the live catalog. No services were provisioned for v0.1, and no deployment was made.

Use Stripe Projects for future provisioning and credentials:

```sh
stripe projects status
stripe projects catalog createos --json
stripe projects search hosting
```

The checked catalog exposes `createos/free` (plan) and `createos/project` (deployable). Provisioning and account linking remain future work. The catalog describes hosting; do not assume its credentials are also Sandbox API credentials.

CreateOS will supply disposable execution and validation environments in later milestones. The CreateOS CLI is not required for this foundation and was not installed. The official sandbox SDK was checked but is intentionally not installed until v0.2.

## Environment and safety

`.env.example` documents the future server-only `CREATEOS_SANDBOX_BASE_URL` and `CREATEOS_SANDBOX_API_KEY`. Do not add a `NEXT_PUBLIC_` prefix to credentials. No environment values are needed for this version. Manage service credentials through Stripe Projects, and keep `.env`, vaults, and caches ignored.

Production execution is disabled. Input schemas reject unknown properties; model action schemas preserve risk for future policy review. **Schemas are data validation, not a source-code security policy.** A deterministic policy engine and isolated execution must be implemented before generated code can run.

## Roadmap and limitations

- **v0.1:** foundation workspace, health endpoint, and typed contracts (this release).
- **v0.2:** actual CreateOS connectivity, execution output, and guaranteed sandbox cleanup.
- **v0.3:** bounded agent loop, provider abstraction, evidence, and deterministic policy.
- **v0.4:** model-generated tools, policy review, upload, and sandbox execution.
- **v0.5:** actual failing fixture, patch generation, and clean 502 → 200 validation.
- **v0.6:** deployment and demo freeze.

This version has no persistent investigations, AI provider, sandbox integration, policy execution, or production mutations. See [progress](docs/PROGRESS.md) for verification results and [documentation checks](docs/DOC_CHECK.md) for the source review.
