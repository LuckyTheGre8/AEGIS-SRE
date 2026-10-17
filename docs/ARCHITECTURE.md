# Architecture — v0.4.0

The generated-tool path is described in [v0.4 operation](V0.4.md). It adds fixture reproduction, runtime model generation, static syntax/operation validation, separate tool policy, exact-source upload, guest execution, source hashes and evidence. Patch verification remains unavailable. The retained v0.3 baseline path below is still supported.

## Retained baseline path

The existing React workspace submits a validated incident to `POST /api/investigate`. The Node orchestrator calls LLMProvider; Gemini is its only implementation. Every decision passes strict Zod validation, evidence-reference checks, and deterministic policy before execution.

The state machine records RECEIVED → PLANNING → REVIEWING_ACTION → PROVISIONING_SANDBOX → EXECUTING_DIAGNOSTIC → ANALYZING_RESULT → PLANNING, then CLEANING_UP → COMPLETED or FAILED. Context-only actions can return to planning; denied actions stop. Three model turns, two distinct diagnostics, and one sandbox bound the run. Gemini requests time out after 25 seconds and commands after 20 seconds.

Policy maps diagnostic IDs to fixed command/argument arrays: runtime (`node --version`) and listeners (`ss -ltn`). The model cannot supply shell text. Generated tools, patches, destructive operations, and external-network actions are denied. Production proposals return REQUIRE_APPROVAL and stop; no approval execution path exists.

The existing SandboxProvider and official CreateOS adapter authenticate, provision, execute, and confirm destruction. `finally` cleanup runs after model/command failures. Evidence retains real stdout, stderr, exitCode, durationMs and sandbox provenance. The UI labels confidence as an estimate and clean-VM output as baseline evidence. No successful v0.3 run confirms a production root cause.

`GET /api/investigate` retrieves in-memory status/results after disconnect. A process lock prevents overlapping investigations; unresolved cleanup blocks another run. The independent smoke endpoint retains its separate lock and is available after resetting the incident. There is no database, queue, streaming, authentication, deployment, or local execution fallback.

Gemini keys are server-only and sent in an authentication header. Model context contains incident text, hypotheses, diagnostic IDs, and observed evidence. Repository files and credentials are not injected into context or the VM. Thought parts are discarded; displayed rationales are limited to 240 characters. Provider errors are sanitized.

See [v0.3 operation](V0.3.md), [CreateOS operation](CREATEOS_SMOKE.md), and [progress](PROGRESS.md).
