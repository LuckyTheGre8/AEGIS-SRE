import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { InvestigationClient } from "../lib/client/investigation-client";
import { InvestigationResultSchema } from "../lib/investigation/result";

// Recorded result reused only as simulated HTTP data for browser coordination
// tests. These tests never invoke providers or become execution evidence.
const previous = InvestigationResultSchema.parse(JSON.parse(readFileSync(new URL("../docs/evidence/patch-validation-v0.5.json", import.meta.url), "utf8")));
const next = { ...previous, id: "ui-test-next-result" };
const input = { incident: "Production API is returning HTTP 502 errors.", fixture: "broken-proxy" as const };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test("default browser fetch retains the global receiver required by native Window.fetch", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = function (this: typeof globalThis) {
      assert.equal(this, globalThis);
      return Promise.resolve(Response.json({ running: false, lastResult: null }));
    };
    const client = new InvestigationClient(); await client.refresh();
    assert.equal(client.getSnapshot().phase, "idle"); assert.equal(client.getSnapshot().error, "");
  } finally { globalThis.fetch = original; }
});

test("rapid duplicate submits send one POST and polling never replaces an active run with the previous result", async () => {
  const post = deferred<Response>(), lateStatus = deferred<Response>(); let posts = 0, delayStatus = false;
  const client = new InvestigationClient(async (_url, init) => {
    if (init?.method === "POST") { posts++; return post.promise; }
    if (delayStatus) return lateStatus.promise;
    return Response.json({ running: false, lastResult: previous });
  });
  await client.refresh();
  const pending = client.submit(input);
  assert.equal(client.getSnapshot().phase, "running");
  await client.submit(input);
  await client.refresh();
  assert.equal(posts, 1);
  assert.equal(client.getSnapshot().phase, "running");
  assert.equal(client.getSnapshot().result?.id, previous.id);
  delayStatus = true; const latePoll = client.refresh();
  post.resolve(Response.json(next)); await pending;
  lateStatus.resolve(Response.json({ running: false, lastResult: previous })); await latePoll;
  assert.equal(client.getSnapshot().phase, "idle");
  assert.equal(client.getSnapshot().result?.id, next.id);
});

test("actual server errors retain the last successful result and permit retry after a completed failure", async () => {
  let posts = 0;
  const failed = { ...previous, id: "ui-test-failed", outcome: "FAILED", state: "FAILED", validation: null, error: { code: "MISSING_LLM_CONFIGURATION", message: "Set GEMINI_API_KEY on the server before investigating." } };
  const client = new InvestigationClient(async (_url, init) => {
    if (init?.method !== "POST") return Response.json({ running: false, lastResult: previous });
    posts++;
    return posts === 1 ? Response.json(failed, { status: 502 }) : posts === 2 ? Response.json(next) : Response.json({ error: "Cross-origin investigations are blocked." }, { status: 403 });
  });
  await client.refresh(); await client.submit(input);
  assert.equal(client.getSnapshot().phase, "idle");
  assert.match(client.getSnapshot().error, /MISSING_LLM_CONFIGURATION: Set GEMINI_API_KEY/);
  assert.equal(client.getSnapshot().result?.id, previous.id);
  assert.equal(client.getSnapshot().lastAttempt?.id, failed.id);
  await client.submit(input);
  assert.equal(client.getSnapshot().result?.id, next.id);
  assert.equal(client.getSnapshot().error, "");
  await client.submit(input);
  assert.match(client.getSnapshot().error, /HTTP 403: Cross-origin investigations are blocked/);
  assert.equal(client.getSnapshot().result?.id, next.id);
});

test("reload recovers a running investigation, and status replies issued before submit cannot overwrite it", async () => {
  const stale = deferred<Response>(), post = deferred<Response>(); let gets = 0;
  const client = new InvestigationClient(async (_url, init) => {
    if (init?.method === "POST") return post.promise;
    gets++; return gets === 2 ? stale.promise : Response.json({ running: false, lastResult: previous });
  });
  await client.refresh(); const pendingStatus = client.refresh(); const pendingPost = client.submit(input);
  stale.resolve(Response.json({ running: false, lastResult: null })); await pendingStatus;
  assert.equal(client.getSnapshot().phase, "running");
  post.resolve(Response.json(next)); await pendingPost;
  let running = true;
  const reloaded = new InvestigationClient(async () => Response.json({ running, lastResult: running ? previous : next }));
  await reloaded.refresh();
  assert.equal(reloaded.getSnapshot().phase, "running"); assert.equal(reloaded.getSnapshot().reconnected, true);
  assert.equal(reloaded.getSnapshot().result?.id, previous.id);
  running = false; await reloaded.refresh();
  assert.equal(reloaded.getSnapshot().phase, "idle"); assert.equal(reloaded.getSnapshot().result?.id, next.id);
});

test("an interrupted POST checks server status and prevents retry until the active run completes", async () => {
  let running = false, posts = 0;
  const client = new InvestigationClient(async (_url, init) => {
    if (init?.method === "POST") { posts++; running = true; throw new TypeError("Simulated browser disconnect"); }
    return Response.json({ running, lastResult: running ? previous : posts ? next : previous });
  });
  await client.refresh(); await client.submit(input);
  assert.equal(client.getSnapshot().phase, "running"); assert.equal(client.getSnapshot().result?.id, previous.id);
  await client.submit(input); assert.equal(posts, 1);
  running = false; await client.refresh();
  assert.equal(client.getSnapshot().phase, "idle"); assert.equal(client.getSnapshot().result?.id, next.id);
  assert.equal(client.getSnapshot().error, "");
});
