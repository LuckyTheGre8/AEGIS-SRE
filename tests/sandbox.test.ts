import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@nodeops-createos/sandbox";
import { CreateOSSandboxProvider } from "../lib/sandbox/createos";
import { runSandboxSmokeTest } from "../lib/sandbox/smoke";
import { POST } from "../app/api/sandbox/smoke/route";

// These are explicitly synthetic unit-test responses through the REAL SDK's
// transport/parser. They never become app evidence or acceptance proof.
function sdkHarness(options: {
  authFailure?: boolean;
  failCommand?: string;
  nonzeroCommand?: string;
  cleanupFailure?: boolean;
  createFailure?: boolean;
  lostCreateNotListed?: boolean;
  missingShape?: boolean;
} = {}) {
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
  let createdBody: Record<string, unknown> = {};
  let deleted = false;
  const view = () => ({ id: "unit-sandbox", name: createdBody.name, shape: "s-2vcpu-4gb", rootfs: "devbox:1", status: deleted ? "destroyed" : "running" });
  const success = (data: unknown) => Response.json({ status: "success", data });
  const failure = (status: number) => Response.json({ status: "error", message: "Never expose unit-test-secret from an API error." }, { status });
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
    const method = init?.method ?? "GET";
    const body: Record<string, unknown> = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ method, path, body });
    if (path === "/v1/whoami") return options.authFailure ? failure(401) : success({ user_id: "unit-user", stats: {} });
    if (path === "/v1/shapes") return success(options.missingShape ? [] : [{ id: "s-2vcpu-4gb", vcpu: 2, mem_mib: 4096, default_disk_mib: 10240 }]);
    if (path === "/v1/rootfs") return success({ rootfs: ["devbox:1"], default: "devbox:1" });
    if (path === "/v1/sandboxes" && method === "POST") {
      createdBody = body;
      return options.createFailure ? failure(500) : success(view());
    }
    if (path === "/v1/sandboxes") return success(options.lostCreateNotListed ? [] : [view()]);
    if (path.endsWith("/exec")) {
      if (body.cmd === options.failCommand) throw new TypeError("unit-test-secret connection failure");
      return success({ result: { stdout: `unit output for ${body.cmd}\n`, stderr: body.cmd === options.nonzeroCommand ? "unit stderr\n" : "", exit_code: body.cmd === options.nonzeroCommand ? 7 : 0 }, exec_ms: 12.5 });
    }
    if (path === "/v1/sandboxes/unit-sandbox" && method === "DELETE") {
      if (options.cleanupFailure) return failure(500);
      deleted = true;
      return success({ id: "unit-sandbox", status: "destroying" });
    }
    if (path === "/v1/sandboxes/unit-sandbox") return success(view());
    throw new Error(`Unexpected unit-test request ${method} ${path}`);
  };
  const provider = new CreateOSSandboxProvider(createClient({ baseUrl: "https://createos.invalid", apiKey: "unit-test-secret", retry: false, fetch }));
  return { provider, calls };
}

test("real SDK adapter maps command output and confirms destruction after the fixed suite", async () => {
  const { provider, calls } = sdkHarness();
  const result = await runSandboxSmokeTest(() => provider);
  assert.equal(result.status, "PASSED");
  assert.equal(result.authenticated, true);
  assert.equal(result.cleanup.status, "DESTROYED");
  assert.ok(result.sandboxName.length <= 22, "Live CreateOS API limits names to 22 characters");
  assert.deepEqual(result.commands.map(({ command, args, durationMs, exitCode, stderr }) => ({ command, args, durationMs, exitCode, stderr })), [
    { command: "uname", args: ["-a"], durationMs: 12.5, exitCode: 0, stderr: "" },
    { command: "python3", args: ["--version"], durationMs: 12.5, exitCode: 0, stderr: "" },
    { command: "node", args: ["--version"], durationMs: 12.5, exitCode: 0, stderr: "" },
  ]);
  assert.equal(result.commands[0].stdout, "unit output for uname\n");
  assert.equal(calls[0].path, "/v1/whoami");
  const created = calls.find((call) => call.path === "/v1/sandboxes" && call.method === "POST")!;
  assert.equal(created.body.ingress_enabled, false);
  assert.equal(created.body.auto_pause_after_seconds, 300);
  assert.equal(created.body.disk_mib, 10240);
  assert.equal(created.body.envs, undefined);
  assert.equal(calls.at(-1)?.method, "GET");
  assert.equal(calls.at(-1)?.path, "/v1/sandboxes/unit-sandbox");
});

test("command transport failure preserves earlier output and still destroys the VM", async () => {
  const { provider } = sdkHarness({ failCommand: "python3" });
  const result = await runSandboxSmokeTest(() => provider);
  assert.equal(result.status, "FAILED");
  assert.equal(result.phase, "EXECUTION");
  assert.equal(result.commands.length, 1);
  assert.equal(result.cleanup.status, "DESTROYED");
  assert.equal(result.error?.code, "CREATEOS_CONNECTION");
  assert.equal(JSON.stringify(result).includes("unit-test-secret"), false);
});

test("nonzero exit and stderr are retained and cannot pass the smoke test", async () => {
  const { provider } = sdkHarness({ nonzeroCommand: "python3" });
  const result = await runSandboxSmokeTest(() => provider);
  assert.equal(result.status, "FAILED");
  assert.equal(result.commands.length, 3);
  assert.equal(result.commands[1].exitCode, 7);
  assert.equal(result.commands[1].stderr, "unit stderr\n");
  assert.equal(result.cleanup.status, "DESTROYED");
});

test("cleanup failure retries twice and overrides successful command execution", async () => {
  const { provider, calls } = sdkHarness({ cleanupFailure: true });
  const result = await runSandboxSmokeTest(() => provider);
  assert.equal(result.status, "FAILED");
  assert.equal(result.cleanup.status, "FAILED");
  assert.equal(result.cleanup.sandboxId, "unit-sandbox");
  assert.equal(result.commands.length, 3);
  assert.equal(calls.filter((call) => call.method === "DELETE").length, 2);
  assert.equal(JSON.stringify(result).includes("unit-test-secret"), false);
});

test("authentication failure stops before provisioning and redacts provider errors", async () => {
  const { provider, calls } = sdkHarness({ authFailure: true });
  const result = await runSandboxSmokeTest(() => provider);
  assert.equal(result.authenticated, false);
  assert.equal(result.phase, "AUTHENTICATION");
  assert.equal(result.cleanup.status, "NOT_REQUIRED");
  assert.equal(result.error?.statusCode, 401);
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(result).includes("unit-test-secret"), false);
});

test("ambiguous create failure recovers only the unique run name and destroys it", async () => {
  const { provider, calls } = sdkHarness({ createFailure: true });
  const result = await runSandboxSmokeTest(() => provider);
  assert.equal(result.status, "FAILED");
  assert.equal(result.cleanup.status, "DESTROYED");
  assert.equal(result.sandbox?.name, result.sandboxName);
  assert.equal(calls.filter((call) => call.method === "POST" && call.path === "/v1/sandboxes").length, 1);
  assert.equal(calls.some((call) => call.path.endsWith("/exec")), false);
});

test("a lost create response without a listed VM remains unconfirmed", async () => {
  const { provider } = sdkHarness({ createFailure: true, lostCreateNotListed: true });
  const result = await runSandboxSmokeTest(() => provider);
  assert.equal(result.cleanup.status, "UNCONFIRMED");
  assert.equal(result.status, "FAILED");
  assert.equal(result.sandbox, null);
});

test("unsupported live shape stops before any VM allocation", async () => {
  const { provider, calls } = sdkHarness({ missingShape: true });
  const result = await runSandboxSmokeTest(() => provider);
  assert.equal(result.error?.code, "UNAVAILABLE_SHAPE");
  assert.equal(result.cleanup.status, "NOT_REQUIRED");
  assert.equal(calls.some((call) => call.method === "POST"), false);
});

test("smoke endpoint rejects cross-origin and arbitrary browser commands before SDK access", async (context) => {
  const previousMode = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "development" });
  context.after(() => {
    if (previousMode === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
    else Object.assign(process.env, { NODE_ENV: previousMode });
  });
  const request = (body: string, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/sandbox/smoke", {
    method: "POST", headers: { "Content-Type": "application/json", origin }, body,
  });
  assert.equal((await POST(request("{}", "https://untrusted.invalid"))).status, 403);
  assert.equal((await POST(request('{"command":"arbitrary shell"}'))).status, 400);
  assert.equal((await POST(new Request("http://localhost:3000/api/sandbox/smoke", { method: "POST", body: "{}" }))).status, 415);
  const canonicalized = new Request("http://localhost:3000/api/sandbox/smoke", {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }, body: '{"command":"rejected before SDK"}',
  });
  assert.equal((await POST(canonicalized)).status, 400, "Same-origin request must reach body validation despite Next's internal hostname");
});
