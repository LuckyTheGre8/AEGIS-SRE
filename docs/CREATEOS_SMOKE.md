# v0.2 — Real CreateOS smoke test

The only executable workflow is a fixed credential and runtime check. There is no AI, diagnostic loop, generated program, local execution fallback, or production action.

## Runtime path

The UI calls `POST /api/sandbox/smoke` with `{}`. The server runs:

1. `client.whoami()` and retains only the user ID.
2. `client.listShapes()` and `client.listRootfs()` to verify the resource profile.
3. `client.createSandbox(...)` with `devbox:1`, a 10,240 MiB disk, public ingress disabled, and 300-second idle auto-pause. Prefer the prompt's `s-2vcpu-4gb` if present; otherwise choose the smallest catalog shape with at least 1 GiB memory. An optional server-side `CREATEOS_SANDBOX_SHAPE` must match a catalog ID.
4. `sandbox.runCommand` for `uname -a`, `python3 --version`, and `node --version`, with argument arrays and 20-second request deadlines.
5. Capture `result.stdout`, `result.stderr`, `result.exit_code` and `exec_ms` as `stdout`, `stderr`, `exitCode`, and `durationMs`. Guest execution timing is distinct from the total run duration.
6. In `finally`, `sandbox.destroy()` followed by `sandbox.waitUntilDestroyed()`. A not-found response also confirms the resource is gone. Two bounded cleanup attempts are allowed; success cannot be reported if cleanup fails.

The browser supplies no commands, paths, API keys, resource profiles, or model output. Cross-origin requests are rejected. Credentials remain on the server and are not passed into VM environment variables.

## Running and recovering

Set credentials in `.env.local`, restart the app, then use the sandbox panel or `npm run smoke:createos`. The CLI reads environment files at runtime without displaying their values. It exits after cleanup and after flushing the result; the SDK's HTTP/2 pool otherwise keeps the process alive.

The latest backend result is available from `GET /api/sandbox/smoke` while the same server process is running. **Refresh smoke-test result** retrieves it after a browser disconnect. Browser cancellation does not cancel the cleanup path. Results are in memory and disappear when the server restarts.

If creation fails ambiguously, the adapter checks the account for this run's unique `aegis-smoke-*` name and attempts to destroy that resource. It never deletes unrelated sandboxes. If allocation or destruction cannot be confirmed, the result is `FAILED` with `UNCONFIRMED` or `FAILED` cleanup. Further app runs are blocked until the operator confirms cleanup and restarts the local server. Inspect the reported sandbox ID/name in the CreateOS control plane before doing so. An idle auto-pause is a backup cost control, not proof of destruction; process termination or network failure can still require manual recovery.

## Verified differences from the master prompt and web quickstart

- SDK `0.8.2` makes `createSandbox` synchronous: it returns after the VM is running. Its installed types/source mark `wait` and `waitTimeoutMs` as deprecated no-ops, although the web quickstart still describes them as functional. Use `timeoutMs` in the second argument.
- The live API limits sandbox names to **22 characters**. A full UUID suffix caused HTTP 400 (`too long: 48 characters (max 22)`). The runner now uses a 10-character random suffix after `aegis-smoke-`, while retaining a separate full run UUID.
- The SDK defaults to `https://api.sb.createos.sh`. An account-issued endpoint from `CREATEOS_SANDBOX_BASE_URL` takes precedence; no regional URL is guessed or substituted. The saved endpoint authenticated successfully.
- The live shape catalog includes the prompt's `s-2vcpu-4gb`, and the image catalog includes `devbox:1`; the successful run used both. The web example uses `s-4vcpu-4gb` but that is not a mandatory resource choice.
- Destruction can return `destroying`; the application waits for `destroyed` or confirmed absence before reporting success.
- An SDK `timeoutMs` limits the request; it is not a promise that an arbitrary guest process is killed. v0.2 accepts only three quick, fixed version/runtime commands and destroys the VM afterwards.

Official sources: [SDK quickstart](https://createos.sh/docs/Sandbox/SDK/Quickstart/), [SDK repository](https://github.com/NodeOps-app/createos-sandbox-sdk), and the installed package's `dist/types.d.ts`, `dist/client.js`, and `dist/sandbox.js`. Some reference links could not be fetched; the installed current SDK supplied the exact signatures and behavior.

## Acceptance evidence

First real CLI run passed on 18 October 2026 (Asia/Calcutta):

- Sandbox: `sb-01m55rr25djr34h497w1nhn9zq`, name `aegis-smoke-e74425d235`.
- Profile: `s-2vcpu-4gb`, `devbox:1`.
- `uname -a`: Linux kernel `6.12.95`, x86_64, exit 0, stderr empty, 13.501 ms.
- `python3 --version`: `Python 3.13.14`, exit 0, stderr empty, 57.314 ms.
- `node --version`: `v24.21.0`, exit 0, stderr empty, 174.454 ms.
- Total run: 4,761 ms. Authentication verified; cleanup `DESTROYED`.

Unit tests explicitly use synthetic transport responses to verify SDK mapping, nonzero exits, auth failure, cleanup failure, lost-create recovery, and request rejection. They are not presented as real execution evidence.

The production app/browser also passed, using sandbox `sb-01m55ry44cqw05q43g91nh8c0c` in 4,381 ms. Its full observed JSON is saved in [the acceptance receipt](evidence/createos-smoke-v0.2.json). The receipt includes every stdout/stderr, exit code, and guest execution duration, plus `DESTROYED` cleanup.
