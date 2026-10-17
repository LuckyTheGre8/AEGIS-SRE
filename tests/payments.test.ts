import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type Stripe from "stripe";
import { PaymentService, PaymentError, verifiedForPayment, type StripeGateway } from "../lib/payments/service";
import { createPaymentHandlers, PAYMENT_COOKIE } from "../lib/payments/http";
import { paymentConfiguration, stripeFromEnvironment } from "../lib/payments/stripe";
import { PaymentClient } from "../lib/client/payment-client";
import { paymentMessage } from "../lib/payments/schemas";
import { InvestigationResultSchema } from "../lib/investigation/result";

const input = { fixture: "broken-proxy" as const, incident: "Production API is returning HTTP 502 errors. Diagnose the issue." };
const verified = InvestigationResultSchema.parse(JSON.parse(readFileSync(new URL("../docs/evidence/broken-proxy-fixtures-acceptance.json", import.meta.url), "utf8")));
const owner = "8f5a1d2b-1687-448d-94e2-68fbb51c8c34";
const anotherOwner = "182fba36-e502-472c-bb67-8a2cb3dca320";

function harness() {
  let intent: Awaited<ReturnType<StripeGateway["create"]>>;
  const calls = { creates: [] as Stripe.PaymentIntentCreateParams[], captures: 0, cancels: 0, keys: [] as string[] };
  let failCapture = false;
  const gateway: StripeGateway = {
    livemode: false,
    async create(params, key) {
      calls.creates.push(params); calls.keys.push(key);
      intent = { id: "pi_unit", status: "requires_payment_method", amount: 500, currency: "usd", capture_method: "manual", amount_capturable: 0, amount_received: 0, livemode: false, metadata: params.metadata as Record<string, string>, client_secret: "pi_unit_secret_confirmation_only" };
      return structuredClone(intent);
    },
    async retrieve() { return structuredClone(intent); },
    async update(_id, metadata) { intent.metadata = { ...intent.metadata, ...metadata }; return structuredClone(intent); },
    async capture(_id, key) { calls.captures++; calls.keys.push(key); if (failCapture) throw new Error("Provider body with secret-must-not-escape"); intent.status = "succeeded"; intent.amount_capturable = 0; intent.amount_received = 500; return structuredClone(intent); },
    async cancel() { calls.cancels++; intent.status = "canceled"; intent.amount_capturable = 0; return structuredClone(intent); },
  };
  const service = new PaymentService(() => gateway);
  return { service, gateway, calls, authorize() { intent.status = "requires_capture"; intent.amount_capturable = 500; }, mutate(change: Partial<typeof intent>) { Object.assign(intent, change); }, failCapture() { failCapture = true; }, intent: () => structuredClone(intent) };
}
const link = (payment: { attemptId: string; paymentIntentId: string | null }) => ({ attemptId: payment.attemptId, paymentIntentId: payment.paymentIntentId!, investigationId: verified.id, approved: true });

test("payment creation fixes USD 5, manual capture, card-only methods and server-generated linkage; retries reuse the intent", async () => {
  const box = harness(), created = await box.service.create(owner, input);
  assert.equal(created.payment.stage, "AUTHORIZING"); assert.equal(created.payment.stripeStatus, "requires_payment_method");
  assert.equal(created.payment.testMode, true); assert.equal(box.calls.captures, 0);
  const params = box.calls.creates[0];
  assert.equal(params.amount, 500); assert.equal(params.currency, "usd"); assert.equal(params.capture_method, "manual");
  assert.deepEqual(params.allowed_payment_method_types, ["card"]);
  assert.equal(params.metadata?.fixtureId, input.fixture); assert.equal(params.metadata?.investigationId, created.payment.attemptId);
  assert.equal(params.metadata?.product, "aegis_verified_remediation");
  const retry = await box.service.create(owner, input);
  assert.equal(retry.payment.paymentIntentId, created.payment.paymentIntentId); assert.equal(box.calls.creates.length, 1);
  await assert.rejects(box.service.create(owner, { ...input, fixture: "missing-environment" }), /Release/);
});

test("authorization is re-read from Stripe; unverified, foreign-owner, wrong-payment and wrong-incident capture are denied", async () => {
  const box = harness(), { payment } = await box.service.create(owner, input);
  await assert.rejects(box.service.investigate(owner, payment.attemptId, input, async () => { throw new Error("Must not execute"); }), /Authorize/);
  box.authorize(); assert.equal((await box.service.status(owner))?.stage, "AUTHORIZED");
  await assert.rejects(box.service.capture(owner, link(payment)), /not independently VERIFIED/);
  await assert.rejects(box.service.capture(anotherOwner, link(payment)), /browser session/);
  await assert.rejects(box.service.capture(owner, { ...link(payment), paymentIntentId: "pi_foreign" }), /linkage/);
  await assert.rejects(box.service.investigate(owner, payment.attemptId, { ...input, fixture: "missing-environment" }, async () => Response.json(verified)), /does not match/);
  assert.equal(box.calls.captures, 0);
});

test("only the server-run result enables approved capture; duplicate capture is idempotent and authorization can be released", async () => {
  const box = harness(), { payment } = await box.service.create(owner, input); box.authorize();
  await box.service.investigate(owner, payment.attemptId, input, async trustedInput => { assert.deepEqual(trustedInput, input); assert.equal((await box.service.status(owner))?.stage, "AWAITING_VERIFICATION"); return Response.json(verified); });
  const ready = await box.service.status(owner); assert.equal(ready?.stage, "READY_TO_CAPTURE");
  assert.equal(ready?.investigationId, verified.id); assert.equal(box.intent().metadata.investigationId, verified.id);
  assert.equal(box.calls.captures, 0, "Verification never automatically captures");
  await assert.rejects(box.service.capture(owner, { ...link(payment), approved: false }), /Explicit approval/);
  await assert.rejects(box.service.capture(owner, { ...link(payment), investigationId: crypto.randomUUID() }), /not independently VERIFIED/);
  const captured = await box.service.capture(owner, link(payment));
  assert.equal(captured.stage, "CAPTURED"); assert.equal(captured.stripeStatus, "succeeded");
  assert.deepEqual(captured.history, ["AUTHORIZING", "AUTHORIZED", "AWAITING_VERIFICATION", "READY_TO_CAPTURE", "CAPTURED"]);
  await box.service.capture(owner, link(payment)); assert.equal(box.calls.captures, 1);
  await assert.rejects(box.service.cancel(owner, link(payment)), /already captured/);
  const abandoned = harness(), pending = await abandoned.service.create(owner, input); abandoned.authorize();
  const canceled = await abandoned.service.cancel(owner, link(pending.payment));
  assert.equal(canceled.stage, "RELEASED"); assert.equal(abandoned.intent().amount_capturable, 0); assert.equal(abandoned.calls.captures, 0);
});

test("every verification gate and failed/inconclusive result keeps payment uncaptured and permits release", async () => {
  const variants = [
    { ...verified, outcome: "FAILED", state: "FAILED" }, { ...verified, outcome: "INCONCLUSIVE" },
    { ...verified, cleanup: "FAILED" }, { ...verified, validation: null },
    ...[{ status: "FAILED_VALIDATION" }, { regression: "FAIL" }, { beforeStatus: 200 }, { afterStatus: 500 }, { cleanup: "FAILED" }, { patchApplied: false }, { validationSandboxId: verified.sandboxId }].map(change => ({ ...verified, validation: { ...verified.validation, ...change } })),
  ];
  for (const variant of variants) {
    const box = harness(), { payment } = await box.service.create(owner, input); box.authorize();
    const result = InvestigationResultSchema.parse(variant);
    assert.equal(verifiedForPayment(result, input), false);
    await box.service.investigate(owner, payment.attemptId, input, async () => Response.json(result));
    await assert.rejects(box.service.capture(owner, { ...link(payment), investigationId: result.id }), /not independently VERIFIED/);
    assert.equal(box.calls.captures, 0); assert.equal(box.intent().status, "requires_capture");
    assert.equal((await box.service.cancel(owner, link(payment))).stage, "RELEASED");
  }
});

test("provider payment mode, amount and metadata mismatches fail closed", async () => {
  for (const change of [{ livemode: true }, { amount: 100 }, { currency: "eur" }, { capture_method: "automatic" }, { metadata: { product: "foreign" } }] as const) {
    const box = harness(); await box.service.create(owner, input); box.mutate(change);
    await assert.rejects(box.service.status(owner), /did not match/); assert.equal(box.calls.captures, 0);
  }
});

test("payment routes enforce cookie ownership, approval, strict input and origin without exposing Stripe secrets", async () => {
  const box = harness();
  const handlers = createPaymentHandlers(box.service, () => ({ configured: true, mode: "test", publishableKey: "pk_test_public" }), async () => Response.json(verified));
  const request = (path: string, body: unknown, cookie?: string) => new Request(`http://localhost:3000/api/payments/${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const created = await handlers.create(request("create", input)), data = await created.json();
  const cookie = created.headers.get("set-cookie")!.split(";")[0];
  assert.match(cookie, new RegExp(PAYMENT_COOKIE)); assert.match(created.headers.get("set-cookie")!, /HttpOnly/); assert.match(created.headers.get("set-cookie")!, /SameSite=strict/i);
  assert.equal((await handlers.capture(request("capture", link(data.payment)))).status, 401);
  assert.equal((await handlers.capture(request("capture", { ...link(data.payment), approved: false }, cookie))).status, 400);
  assert.equal((await handlers.capture(request("capture", { ...link(data.payment), verified: true }, cookie))).status, 400);
  assert.equal((await handlers.capture(request("capture", link(data.payment), cookie))).status, 409);
  assert.equal((await handlers.investigate(request("investigate", { ...input, attemptId: data.payment.attemptId, outcome: "VERIFIED" }, cookie))).status, 400);
  const hostile = request("capture", link(data.payment), cookie); hostile.headers.set("origin", "https://unrelated.invalid");
  assert.equal((await handlers.capture(hostile)).status, 403);
  box.authorize(); await handlers.investigate(request("investigate", { ...input, attemptId: data.payment.attemptId }, cookie));
  box.failCapture(); const failed = await handlers.capture(request("capture", link(data.payment), cookie));
  assert.equal(failed.status, 502); assert.doesNotMatch(JSON.stringify(await failed.json()), /secret-must-not-escape/);
  const status = await handlers.status(new Request("http://localhost:3000/api/payments/status", { headers: { cookie } }));
  const publicStatus = await status.json();
  assert.equal(publicStatus.payment.stripeStatus, "requires_capture");
  assert.equal("clientSecret" in publicStatus, false); assert.doesNotMatch(JSON.stringify(publicStatus), /client_secret|sk_test|STRIPE_SECRET_KEY|payment_method/);
});

test("matching configured key mode is explicit; mixed and absent keys are rejected before SDK access", () => {
  const original = { secret: process.env.STRIPE_SECRET_KEY, public: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY };
  try {
    for (const mode of ["test", "live"] as const) {
      process.env.STRIPE_SECRET_KEY = `sk_${mode}_synthetic`; process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = `pk_${mode}_synthetic`;
      assert.deepEqual(paymentConfiguration(), { configured: true, mode, publishableKey: `pk_${mode}_synthetic` });
      assert.equal(stripeFromEnvironment().livemode, mode === "live");
    }
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_synthetic";
    assert.equal(paymentConfiguration().configured, false); assert.throws(stripeFromEnvironment, PaymentError);
    delete process.env.STRIPE_SECRET_KEY; assert.equal(paymentConfiguration().configured, false);
  } finally {
    for (const [key, value] of [["STRIPE_SECRET_KEY", original.secret], ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", original.public]]) if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
  }
});

test("browser capture requires approval, displays actual succeeded status and handles failure without claiming capture", async () => {
  const box = harness(), { payment } = await box.service.create(owner, input); box.authorize();
  await box.service.investigate(owner, payment.attemptId, input, async () => Response.json(verified));
  let captures = 0, fail = false;
  const client = new PaymentClient(async (_url, init) => {
    if (init?.method === "POST") {
      captures++; const body = JSON.parse(String(init.body)); assert.equal(body.approved, true); assert.equal("verified" in body, false);
      if (fail) return Response.json({ error: "Stripe request failed; still uncaptured" }, { status: 502 });
      return Response.json({ configured: true, mode: "test", payment: await box.service.capture(owner, body) });
    }
    return Response.json({ configured: true, mode: "test", payment: await box.service.status(owner) });
  });
  await client.refresh(); assert.equal(client.getSnapshot().payment?.stage, "READY_TO_CAPTURE");
  await client.capture(false); assert.equal(captures, 0);
  fail = true; await client.capture(true);
  assert.equal(client.getSnapshot().payment?.stage, "READY_TO_CAPTURE"); assert.match(client.getSnapshot().error, /still uncaptured/);
  assert.doesNotMatch(paymentMessage(client.getSnapshot().payment), /^Payment captured/);
  fail = false; await client.capture(true);
  assert.equal(client.getSnapshot().payment?.stage, "CAPTURED"); assert.equal(client.getSnapshot().payment?.stripeStatus, "succeeded");
  assert.equal(paymentMessage(client.getSnapshot().payment), "Payment captured for verified remediation.");
});

test("browser payment bridge leaves the original investigation path unchanged unless an authorization is explicitly linked", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  const client = new PaymentClient(async (url, init) => { requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null }); return Response.json({}); });
  const post = { method: "POST", body: JSON.stringify(input) };
  await client.investigationFetch("/api/investigate", post);
  client.linkInvestigation(owner); await client.investigationFetch("/api/investigate", post);
  await client.investigationFetch("/api/investigate", { cache: "no-store" });
  client.linkInvestigation(null); await client.investigationFetch("/api/investigate", post);
  assert.deepEqual(requests.map(item => item.url), ["/api/investigate", "/api/payments/investigate", "/api/investigate", "/api/investigate"]);
  assert.deepEqual(requests[1].body, { ...input, attemptId: owner });
});

test("confirmation refresh waits for an earlier status poll then obtains a fresh authorization status", async () => {
  const box = harness(), { payment } = await box.service.create(owner, input);
  let resolve!: (response: Response) => void, calls = 0;
  const client = new PaymentClient(async () => {
    if (++calls === 1) return new Promise<Response>(done => { resolve = done; });
    return Response.json({ configured: true, mode: "test", payment: await box.service.status(owner) });
  });
  const stale = client.refresh(), fresh = client.refresh(true);
  box.authorize(); resolve(Response.json({ configured: true, mode: "test", payment }));
  await stale;
  assert.equal((await fresh)?.stage, "AUTHORIZED"); assert.equal(calls, 2);
});

test("payment client recovers from React's start/stop/start lifecycle without stale status or a stuck checking state", async () => {
  let resolveOld!: (response: Response) => void, calls = 0;
  const client = new PaymentClient(async () => {
    if (++calls === 1) return new Promise<Response>(resolve => { resolveOld = resolve; });
    return Response.json({ configured: true, mode: "live", payment: null, publishableKey: "pk_live_synthetic" });
  });
  client.start(); client.stop(); client.start();
  await client.refresh();
  resolveOld(Response.json({ configured: true, mode: "test", payment: null }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.getSnapshot().checking, false); assert.equal(client.getSnapshot().mode, "live"); client.stop();
});
