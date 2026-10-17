# Documentation and environment check

## v0.3 update — 18 October 2026

Checked Google's official structured-output guide and generateContent reference, and verified model availability through the live catalog. The live API requires `responseFormat.text.mimeType: APPLICATION_JSON`, despite the guide's lowercase example. The real acceptance run succeeded after following the API enum. See [v0.3 notes](V0.3.md). Read installed Next.js route-handler guidance before adding the investigation endpoint. Rechecked Stripe Projects guidance/status; no service provisioning was required. Only Gemini was wired behind LLMProvider.

## v0.2 update — 18 October 2026

Rechecked the official SDK quickstart and installed current package `0.8.2`. Read the exact client, command, cleanup, catalog, error, and option types/source. The quickstart's `wait: false` and `waitTimeoutMs` guidance is stale for this SDK: the installed API makes creation synchronous and deprecates those options. The adapter uses `timeoutMs` instead. SDK exec outputs map from `result.stdout`, `result.stderr`, `result.exit_code`, and `exec_ms`.

The live account authenticated successfully using the user's saved `.env.local`, without displaying secret values. The live shape/image catalogs include `s-2vcpu-4gb` and `devbox:1`, both used in successful smoke runs. The live API also enforced a 22-character sandbox-name limit that the prompt did not specify; generated names were shortened accordingly. Destruction was confirmed after each successful run. Read [CreateOS operation notes](CREATEOS_SMOKE.md) for details and [the app receipt](evidence/createos-smoke-v0.2.json) for actual command output.

Stripe Projects guidance, status, and redacted environment listing were rechecked. The existing project remains valid and no hosting resource was needed for the local smoke path. Next.js's installed route-handler guide was read before implementation. The SDK is ESM-only; the package now declares ESM so CLI/test imports work. No model APIs were added.

## Original v0.1 check

Checked 18 October 2026 (Asia/Calcutta), before foundation implementation.

## CLI and project

- Node.js: `v26.12.0`; npm: `11.20.0`.
- Stripe CLI: `1.54.0`; installed Projects plugin: `0.50.0`.
- Verified `stripe projects --help` and `stripe plugin list`.
- Executed `stripe projects llm-context`: no active provider guidance.
- Executed `stripe projects status --json`: authenticated, existing project `Aegis-sre`, default environment, zero providers/services/plans.
- Executed catalog searches for CreateOS and hosting, then `stripe projects catalog createos --json`.
- Exact CreateOS catalog services: `createos/free` and `createos/project`. The deployable references a companion plan. Existing resource adoption is reported unsupported.
- No reinitialization was needed. No service was provisioned and no credentials were pulled for this foundation.
- The Stripe plugin broker failed inside the sandbox and succeeded with approved execution outside it. npm registry DNS was also blocked inside the sandbox; version lookup and installation use approved network access.
- The default Turbopack build failed when its CSS worker process exited before connecting, both inside and outside the sandbox. The CLI's local `build --help` and `dev --help` confirm the supported `--webpack` flag; the npm scripts select that mode for this Windows setup.
- Webpack's persistent disk cache failed when rebuilding changed source on this host. Disabling production `config.cache` resolved it; two successive builds then passed. The installed Next.js Webpack configuration and accessibility guides were also read after `next dev` generated its repository guidance.
- CreateOS CLI: absent; not required or installed for v0.1.
- No `.env` existed and no process environment names matched `CREATEOS*`. Secret values and CLI-managed state files were not inspected.
- CreateOS `whoami`: not run; credentials are unconfigured and integration belongs to v0.2.
- Git began clean with a single commit, `e84eebf chore: initialize Aegis with Stripe Projects`, and no app source.

## Current source checks

- [Stripe Projects docs](https://docs.stripe.com/projects): verify CLI/plugin, inspect existing state/catalog, add exact provider/service slugs, pull credentials. Existing projects do not need reinitialization.
- [Stripe CLI docs](https://docs.stripe.com/cli) and [Stripe CLI repository](https://github.com/stripe/stripe-cli): current CLI reference.
- [CreateOS CLI repository](https://github.com/NodeOps-app/createos-cli): current CLI includes `sandbox` commands and deployment workflows. No CLI operations were required for foundation.
- [CreateOS SDK quickstart](https://createos.sh/docs/Sandbox/SDK/Quickstart/): package `@nodeops-createos/sandbox`, ESM, `createClient`, API key through `apiKey` or `CREATEOS_SANDBOX_API_KEY`; URL through `baseUrl` or `CREATEOS_SANDBOX_BASE_URL`.
- SDK version returned by npm: `0.8.2`. Not installed in v0.1.
- Documented lifecycle: `client.whoami()`, `client.createSandbox(...)`, `sandbox.runCommand(command, args)`, `sandbox.destroy()`, optional `sandbox.waitUntilDestroyed()`.
- [CreateOS file guide](https://createos.sh/docs/Sandbox/SDK/How-To/Files/): `sandbox.files.upload(absoluteGuestPath, data)`; parent directories must exist first.
- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation): App Router setup; ESLint runs through the CLI rather than `next lint`.
- npm current package versions: Next.js `16.4.2`, React `19.3.1`, Tailwind `4.3.3`, Zod `4.6.7`. The lockfile records installed transitive versions.

## Differences and deferred verification

The current SDK quickstart uses `https://api.sb.createos.sh` and example shape `s-4vcpu-4gb`. The attached master prompt supplies `https://api-eu.sb.createos.sh` and prefers `s-2vcpu-4gb`. Neither account endpoint nor shape availability was verified. In v0.2, confirm the issued endpoint with `whoami()` and discover shapes/root filesystems through the live catalog (`listShapes()` / `listRootfs()`). Do not assume the example shape or regional URL is account-valid.

The SDK reference overview URL supplied by the master prompt could not be fetched. Lifecycle and upload method names were checked against the current quickstart/file guide, but their full option signatures, result shape, and account-specific resource configuration must be checked again before integration code is written.

The supplied master prompt describes all six milestones. The user's request selects v0.1, so no later sandbox, AI, fixture execution, or deployment work was undertaken.
