# Architecture — v0.1.0

The current application has two runtime boundaries:

1. The browser renders the workspace and validates an incident with `IncidentInputSchema`. A prepared incident is a local `RECEIVED` event, stored in React state. Nothing is submitted for execution.
2. The Next.js server responds to `GET /api/health` with the package version, timestamp, and capability flags. It reads no secrets, provisions no resources, and contacts no external services.

Zod schemas are the source of truth for TypeScript domain types. The state module defines the future investigation vocabulary; it is not a state-transition engine. Stream events are typed as a discriminated union but are not streamed in this milestone.

## Domain contracts

- Incident input accepts only bounded text and the `broken-proxy` fixture identifier.
- Agent actions require an explicit risk and reject unknown properties.
- Evidence has explicit provenance and reliability; hypotheses use confidence between 0 and 1.
- Generated tools have source and timeout limits and bounded absolute guest paths. Schema acceptance does not approve code execution.
- Patches distinguish proposed, partial, verified, failed, and inconclusive outcomes.
- Reports can only represent `NOT_EXECUTED` for production action.

## Next integration boundaries

Stripe Projects will manage services and server-side credentials. Future server-side orchestration will call an LLM abstraction, validate its output with Zod, pass it through a deterministic policy engine, and execute approved actions through a sandbox-provider interface. CreateOS will supply both the diagnosis sandbox and a fresh validation sandbox.

The orchestration layer must capture actual stdout, stderr, exit codes, and duration. It must destroy every sandbox in `finally`, and surface cleanup failures. The UI must show evidence from execution before any verified fix status. No browser-accessible arbitrary shell endpoint is planned.

The sandbox adapter, LLM provider, orchestrator, policy implementation, fixture processes, patch application, and production approval workflow are intentionally outside v0.1.
