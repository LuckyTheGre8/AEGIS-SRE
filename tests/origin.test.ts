import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedRequestOrigin } from "../lib/http/origin";
import { POST as investigate } from "../app/api/investigate/route";
import { POST as smoke } from "../app/api/sandbox/smoke/route";

const railway = "https://aegis-sre-production.up.railway.app";
const request = (origin: string, extra: Record<string, string> = {}) => new Request("http://internal.railway:8080/api/investigate", {
  method: "POST", headers: { origin, "sec-fetch-site": "same-origin", host: "internal.railway:8080", ...extra },
});

test("production allows configured Railway origin behind an HTTP proxy and rejects unrelated or spoofed origins", () => {
  const environment = { NODE_ENV: "production", APP_ORIGIN: `${railway}/` };
  assert.equal(isAllowedRequestOrigin(request(railway), environment), true);
  assert.equal(isAllowedRequestOrigin(request(railway), { NODE_ENV: "production", ALLOWED_ORIGIN: railway }), true);
  for (const origin of ["https://unrelated.invalid", "http://aegis-sre-production.up.railway.app", `${railway}.attacker.invalid`, "null", `${railway}/path`, "http://localhost:3000"]) {
    assert.equal(isAllowedRequestOrigin(request(origin), environment), false, origin);
  }
  assert.equal(isAllowedRequestOrigin(request(railway, { "sec-fetch-site": "cross-site" }), environment), false);
  assert.equal(isAllowedRequestOrigin(request("https://attacker.invalid", { host: "attacker.invalid", "x-forwarded-host": "attacker.invalid", "x-forwarded-proto": "https" }), environment), false);
  for (const APP_ORIGIN of [undefined, "*", "not an origin", `${railway}/path`, `${railway}?query=1`, "https://user:password@example.com"]) {
    assert.equal(isAllowedRequestOrigin(request(railway), { NODE_ENV: "production", APP_ORIGIN }), false);
  }
});

test("localhost fallback is limited to development and retains exact host, scheme and port matching", () => {
  const local = new Request("http://localhost:3000/api/investigate", { method: "POST", headers: { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" } });
  assert.equal(isAllowedRequestOrigin(local, { NODE_ENV: "development" }), true);
  assert.equal(isAllowedRequestOrigin(local, { NODE_ENV: "production" }), false);
  assert.equal(isAllowedRequestOrigin(local, { NODE_ENV: "production", APP_ORIGIN: "http://127.0.0.1:3000" }), false);
  assert.equal(isAllowedRequestOrigin(request("http://localhost:3001", { host: "localhost:3000" }), { NODE_ENV: "development" }), false);
  assert.equal(isAllowedRequestOrigin(request("https://attacker.invalid", { host: "attacker.invalid" }), { NODE_ENV: "development" }), false);
  assert.equal(isAllowedRequestOrigin(new Request("http://localhost:3000/api/investigate", { method: "POST" }), { NODE_ENV: "production" }), true);
});

test("both execution routes accept the configured deployment origin and reject cross-origin requests before any execution", async (context) => {
  const previous = { NODE_ENV: process.env.NODE_ENV, APP_ORIGIN: process.env.APP_ORIGIN, ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN };
  Object.assign(process.env, { NODE_ENV: "production", APP_ORIGIN: railway, ALLOWED_ORIGIN: "" });
  context.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  for (const route of [investigate, smoke]) {
    const invalidBody = (origin: string, extra: Record<string, string> = {}) => new Request("http://internal.railway:8080/api/investigate", {
      method: "POST", headers: { "Content-Type": "application/json", origin, host: "internal.railway:8080", "sec-fetch-site": "same-origin", ...extra }, body: '{"command":"reject before providers"}',
    });
    assert.equal((await route(invalidBody(railway))).status, 400, "Allowed origin reaches input validation without running a provider");
    assert.equal((await route(invalidBody("https://unrelated.invalid"))).status, 403);
    assert.equal((await route(invalidBody(railway, { "sec-fetch-site": "cross-site" }))).status, 403);
  }
});
