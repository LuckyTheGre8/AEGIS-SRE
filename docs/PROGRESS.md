# Progress

## Post-v0.6 — Reusable incident fixtures

Added a browser-selectable trusted registry for the original broken proxy, missing synthetic environment configuration, and a wrong health-probe path. All use the existing bounded investigator, runtime Gemini-generated diagnostic, restricted capabilities/policy, generated data patch, and fresh-sandbox validation. The original proxy server/bootstrap/runner strings and health/applier programs are unchanged; its 502 gates remain the default. CreateOS adapter, origin/auth, production boundary, budgets and cleanup semantics are unchanged.

Real Gemini → generated diagnostic → CreateOS → generated patch → fresh validation acceptance on 18 October 2026:

- Broken proxy: **502 → 200 · regression PASS · VERIFIED**, run `3579871a-0796-4214-ae3b-b908e16cd505`. [Receipt](evidence/broken-proxy-fixtures-acceptance.json).
- Missing environment: **500 → 200 · regression PASS · VERIFIED**, run `6791a010-8ae8-40ed-a81d-fc611361ff08`. Gemini populated only synthetic AEGIS_DEMO_GREETING configuration. [Receipt](evidence/missing-environment-acceptance.json).
- Broken health check: **404 → 200 · regression PASS · VERIFIED**, run `fd0d71c9-5860-4fe5-90b8-7081a1e19022`. Gemini changed /healthz → /ready. [Receipt](evidence/broken-health-check-acceptance.json).

Every run used different diagnosis/validation IDs and confirmed both sandboxes DESTROYED; production remained NOT_EXECUTED. Browser checks confirmed all three selections update context, controls disable during execution, the original proxy completes, and actual result titles remain bound to their fixture. No browser warnings/errors were observed.

Required checks passed: lint, strict typecheck, **41 tests**, production build. Essential new tests cover registry/selection, config/patch capability boundaries, fixture-specific failure classes, wrong before/after results, regression/cleanup failure, and sandbox reuse. Source and browser bundles passed a credential-value scan. No new environment variables or services are required. No deployment was performed. Local acceptance server stopped after cleanup. Stop after Goal 1; optional invoicing was not started.

## v0.6.0 — Demo freeze and submission polish

The investigation orchestrator, Gemini provider/prompts, CreateOS adapter, generated-tool execution, deterministic policy, patch generation, fresh-sandbox validation and cleanup implementations are unchanged from v0.5 plus the deployed origin fix.

Added immediate browser waiting feedback (spinner, indeterminate progress, elapsed time and isolated-environment message), safe GET polling/reconnect, synchronous duplicate-submit protection, actual server errors, retry, stale-response rejection and retention of the previous successful result. No completed investigation phases are invented while waiting. Refresh recovers the actual backend result; storage remains process memory.

The result summary makes the reference incident, supported hypothesis/confidence, BEFORE 502, AFTER 200, regression PASS, VERIFIED, distinct sandbox IDs and human approval boundary prominent. Diagnostic source/purpose/hash/risk/policy/output/exit/duration are readable in the existing workspace, alongside the actual generated diff and cleanup. Sponsor cards describe Gemini, CreateOS Sandbox, Stripe Projects and Railway roles without simulated connection states. README and the [recording guide](DEMO.md) explicitly describe one complete reference incident.

Real browser acceptance on 18 October 2026 (Asia/Calcutta): run `0c7b5d4c-3450-4bd8-a2b2-89ea1d4e4027` completed VERIFIED after refreshing the browser during execution. Diagnosis sandbox `sb-01m55zxc60p2b8f0yyf5xrvye4` and fresh validation sandbox `sb-01m55zxn1457ry26x5qaqtr7sn` were different and both confirmed DESTROYED. Actual 502 → 200, regression PASS, production NOT_EXECUTED. [Observed receipt](evidence/demo-freeze-v0.6.json). A separate local missing-key check showed the actual error, enabled Retry, and allocated no sandbox; saved credentials were not changed.

Public deployment checks found Gemini and CreateOS configuration flags true and an own-origin invalid-input POST reaching body validation (400). The deployed build was still v0.5 during these checks; deploying the v0.6 commit is separate. Stripe Projects reports complete CreateOS and Railway service attachments. No hosting/service changes were made.

Final required checks: lint, strict typecheck, all **37 tests**, and production build passed. New tests cover duplicate submissions, stale polling both before and after POST completion, failed retry/result retention, browser fetch binding, and reconnect/recovery. Local test servers were stopped. One v0.6 polish commit; no new core features.

## v0.5.0 — Fresh-sandbox fix verification

Acceptance passed on 18 October 2026 (Asia/Calcutta). Gemini generated a minimal guarded config replacement from real v0.4-style diagnostic evidence. A new CreateOS sandbox recreated the original broken fixture, measured HTTP 502, applied the generated patch and acknowledged reload, then ran the identical health test to measure HTTP 200 and regression PASS. Both sandbox destructions were confirmed before final VERIFIED. No production mutation was added.

Run `b4897eed-8072-4dde-92d1-fb1e86e98dbf`: diagnosis `sb-01m55v7v400j0hsbtgj4b6xn8t`; fresh validation `sb-01m55v84dv5yzwcvdcr4awq1mh`. Model patch changed upstreamPort 3001 → 3000 using observed backend config. Before test 119.402 ms, apply/reload 219.321 ms, after/regression 131.194 ms; exit codes 0 and empty stderr. [Actual receipt and diff](evidence/patch-validation-v0.5.json).

The existing validation panel shows root cause, generated diff, BEFORE 502, AFTER 200, REGRESSION PASS, FIX STATUS VERIFIED, distinct VM IDs and cleanup. Lint, typecheck, all **29 tests**, and production build passed. Stripe Projects workflow/status was rechecked; no hosting service or deployment added. Stop at v0.5.

## v0.4.0 — Runtime-generated diagnostics

Acceptance passed on 18 October 2026 (Asia/Calcutta). Gemini generated a JavaScript diagnostic at runtime. Strict schema, UTF-8 size, Acorn syntax, dangerous-operation allowlist and deterministic tool policy preceded exact-source upload and execution in a real disposable CreateOS sandbox. No model-generated source was executed on the host.

The real fixture demonstrated proxy HTTP 502, backend HTTP 200, and ECONNREFUSED on the misconfigured upstream port 3001. The generated program read actual config and probes, derived a port mismatch, exited 0 with empty stderr in 126.578 ms, and became source-linked evidence. First tool succeeded without retry; sandbox destruction confirmed. [Actual source/output receipt](evidence/generated-diagnostic-v0.4.json).

Existing panels display generated source/purpose/risk/checks/policy, sandbox status, actual execution fields, and resulting evidence/hypotheses. Hard limits: three generated tools, two retries, 20 seconds per command, one sandbox. Lint, typecheck, all **25 tests**, and production build passed. Stripe Projects status was checked with the repository skill; no service or deployment added. Final patch verification remains unimplemented. Stop at v0.4.

## v0.3.0 — Bounded Gemini investigation

Acceptance passed on 18 October 2026 (Asia/Calcutta). Implemented LLMProvider with Gemini only, strict Hypothesis/Evidence/AgentAction decisions, bounded transitions, deterministic policy, and existing-panel displays for hypotheses, confidence, provenance, command output, and concise action rationales. No generated tools, patches, production actions, or unrelated refactor were added.

The approved synthetic browser run used Gemini `gemini-3.5-flash-lite` and a real disposable CreateOS sandbox. Two model turns produced an allowed `node --version` diagnostic, actual stdout `v24.21.0`, empty stderr, exitCode 0, durationMs 70.963, and confirmed DESTROYED cleanup. Final state COMPLETED, outcome INCONCLUSIVE, production NOT_EXECUTED. See [the actual receipt](evidence/investigation-v0.3.json) and [scope/API notes](V0.3.md).

`npm run lint`, `npm run typecheck`, all **21 tests**, and `npm run build` passed. Browser verification showed hypotheses/confidence/evidence/policy and confirmed cleanup. Credentials remained server-only. Stripe Projects status was rechecked; no services or deployment were added. v0.3 stops at this acceptance milestone.

## v0.2.0 — Real CreateOS

Acceptance passed on 18 October 2026 (Asia/Calcutta):

- Official `@nodeops-createos/sandbox` SDK pinned to `0.8.2`, loaded as ESM.
- `SandboxProvider` abstraction and `CreateOSSandboxProvider` implement authentication, catalog-backed creation, argument-array execution, file upload contract, and confirmed destruction. No local fallback is used.
- Fixed smoke runner verifies `whoami()`, creates one `devbox:1` sandbox, executes `uname -a`, `python3 --version`, and `node --version`, and captures real stdout/stderr/exitCode/guest durationMs.
- Destruction runs in `finally`, is confirmed by polling, retries twice on failure, and reports cleanup errors. Ambiguous creation is recovered only by the run's unique name; uncertain cleanup blocks further app runs.
- `POST /api/sandbox/smoke` executes only the server-owned suite, while `GET` retrieves in-memory status/results. Browser disconnect does not cancel cleanup. The UI displays actual results and can refresh the latest backend receipt.
- No AI provider, generated tools, diagnosis loop, incident execution, fix verification, deployment, or production mutations were added.

Real acceptance runs:

- CLI: sandbox `sb-01m55rr25djr34h497w1nhn9zq`, all three exits 0, cleanup `DESTROYED`, total 4,761 ms.
- Production app/browser: run `6604a054-4143-4943-8393-80e59d4c1a2b`, sandbox `sb-01m55ry44cqw05q43g91nh8c0c`, all three exits 0, empty stderr, cleanup `DESTROYED`, total 4,381 ms. Linux `6.12.95`, Python `3.13.14`, Node `v24.21.0`.
- App result saved verbatim from `GET /api/sandbox/smoke` to [the non-secret acceptance receipt](evidence/createos-smoke-v0.2.json). This is observed output, not a fixture.
- `/api/health` reports version `0.2.0`, sandbox support/configuration true, and investigation/production mutation false.
- Browser showed the successful command results and cleanup status; console inspection returned no warnings/errors.

Checks: `npm run lint`, `npm run typecheck`, all **15 tests**, and `npm run build` passed. Existing v0.1 behavior is retained. Unit tests use explicitly synthetic SDK transport responses for failure-path coverage; only the real runs above count as remote execution evidence.

Resolved API/integration differences: the live API's sandbox name limit is 22 characters; SDK `wait`/`waitTimeoutMs` are deprecated no-ops; creation is synchronous; async deletion requires confirmation. A same-origin check uses the public HTTP Host rather than Next.js's canonical internal hostname. See [CreateOS operation notes](CREATEOS_SMOKE.md).

Credentials were supplied by the user in ignored `.env.local`. Values were never printed, logged, passed to the browser, or injected into the VM. Stripe Projects state and redacted credential names were checked; no hosting resource was provisioned. No v0.3 work was undertaken.

Acceptance test servers and one-off CLI processes were stopped after successful cleanup. Run `npm run dev` or `npm start` to reopen the app. The checked-in receipt preserves proof when the in-memory result is cleared by a server restart.

## v0.1.0 — Foundation

Implemented:

- Next.js App Router app with strict TypeScript, Tailwind CSS, ESLint, and a dependency lockfile.
- Server-side health endpoint with explicit version and capability flags.
- Responsive one-screen investigation workspace with honest empty states.
- Demo-incident loading, validated local preparation, reset, execution/source tabs, clipboard feedback, project notes, and health refresh.
- Core Zod schemas with inferred types for incidents, actions, events, evidence, hypotheses, tools, results, patches, and reports.
- Explicit investigation state vocabulary and typed future stream envelopes.
- Focused schema boundary tests, setup instructions, architecture notes, and documentation/environment checks.
- Existing Stripe Projects bootstrap preserved; project and catalog checked using the CLI.

Verification on 18 October 2026 (Asia/Calcutta):

- `npm install --no-audit --no-fund`: passed, 362 packages installed and lockfile generated. npm reported ESLint 9's support-status warning and two unapproved dependency install scripts; lint and tests worked without approving them.
- `npm run lint`: passed with zero warnings.
- `npm run typecheck`: passed with strict checking.
- `npm test`: all six schema boundary tests passed.
- `npm run build`: production build passed in Webpack mode, including prerendering and server build traces, with no compilation warnings. Two successive builds passed after disabling production disk caching to resolve a repeat-build hash failure.
- `npm run dev`: development server booted; page and health requests returned 200. Next.js appended its own documentation-guidance block to `AGENTS.md`; the original Stripe Projects instructions remain intact.
- `npm start`: production server booted at `http://127.0.0.1:3000`.
- Actual HTTP requests: `/` returned 200 with workspace markup; `/api/health` returned 200, version `0.1.0`, and disabled investigation/sandbox/production capabilities.
- Browser checks passed: empty input error, demo loading, incident preparation, 01/05 progress, source/output tab selection, project-notes dialog open/close, reset, clearing preparation when input is edited, and application-health refresh. Console inspection returned no warnings/errors. Full-page visual inspection confirmed all workspace panels render. Icon-only sidebar controls retain accessible names in the compact layout.
- Secret/build ignore rules checked: `.env`, `.env.local`, `.projects/vault`, `.projects/cache`, `node_modules`, and `.next` are ignored; `.env.example` remains trackable. `git diff --check` passed.

Environment notes: the default Turbopack CSS worker failed on this Windows/Node environment even outside the sandbox, so both scripts use the documented `--webpack` mode. A clean sandboxed build later hit a Windows output-directory permission error; the approved production build completed outside the sandbox. Loopback HTTP/browser access also required starting the preview outside the sandbox. No application credentials were needed.

The preview servers were stopped after verification. Start the workspace with `npm run dev`, or serve the verified production build with `npm start`. Implementation changes are left uncommitted for review.

Sandbox execution, AI investigation, generated diagnostic code, patching, and production execution are not implemented. No remote service or deployment was created. Stop at this milestone; v0.2 requires the user's continuation request.
