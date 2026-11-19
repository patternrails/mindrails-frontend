import assert from "node:assert/strict";
import test from "node:test";
import { createBackendConnectionStore, parseBackendConfig } from "../src/lib/backend-connection-store.ts";
const A = { version: 1, BASE_URL: "http://localhost:8080/" };
const B = { version: 1, BASE_URL: "http://127.0.0.1:8081/prefix/" };
const ok = () => new Response(null, { status: 200 });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test("configuration accepts deployment prefixes and rejects unsafe or malformed addresses", () => {
  assert.deepEqual(parseBackendConfig(JSON.stringify({ version: 1, BASE_URL: "https://example.com/prefix" })), { version: 1, BASE_URL: "https://example.com/prefix/" });
  for (const input of [null, "invalid", JSON.stringify({ ...A, version: 2 }), JSON.stringify({ ...A, BASE_URL: "javascript:alert(1)" }), JSON.stringify({ ...A, BASE_URL: "https://user:pass@example.com/" })]) assert.equal(parseBackendConfig(input), null);
});
test("rendering does not read configuration or fetch and exposes no connection mutation API", () => {
  const store = createBackendConnectionStore({ readConfig: () => assert.fail("no configuration during render"), fetch: () => assert.fail("no requests during render") });
  assert.equal(store.getSnapshot(), store.getServerSnapshot());
  assert.equal(store.getSnapshot().initialized, false);
  for (const key of ["create", "update", "remove", "cancelEdit"]) assert.equal(key in store, false);
});
test("initialization reads only the deployment configuration and verifies health before exposing a client", async () => {
  const response = deferred(); let reads = 0;
  const store = createBackendConnectionStore({ readConfig: () => { reads++; return A; }, fetch: (url, init) => {
    assert.equal(url, `${A.BASE_URL}api/health`); assert.equal(init.credentials, "omit"); return response.promise;
  }, now: () => 123 });
  let changes = 0; const unsubscribe = store.subscribe(() => changes++);
  const first = store.initialize(), second = store.initialize();
  assert.equal(store.getSnapshot().status, "checking"); assert.equal(store.getSnapshot().client, null);
  response.resolve(ok()); await first; await second;
  assert.equal(reads, 1); assert.equal(store.getSnapshot().status, "connected"); assert.equal(store.getSnapshot().lastCheckedAt, 123);
  assert.equal(store.getSnapshot().client.BASE_URL, A.BASE_URL); assert.ok(changes >= 3);
  unsubscribe(); const before = changes; store.stop(); assert.equal(changes, before);
});
test("missing and unreadable configuration fail closed and refresh can recover after the file is repaired", async () => {
  let config = null, calls = 0;
  const store = createBackendConnectionStore({ readConfig: () => config, fetch: async () => { calls++; return ok(); } });
  assert.equal((await store.initialize()).error.code, "configuration");
  assert.equal(store.getSnapshot().initialized, true); assert.equal(store.getSnapshot().status, "disconnected");
  assert.equal(store.getSnapshot().client, null); assert.equal(calls, 0);
  config = A; assert.equal((await store.recheck()).ok, true); assert.equal(calls, 1);
  config = { ...B, BASE_URL: "bad" }; assert.equal((await store.reload()).error.code, "configuration");
  assert.equal(store.getSnapshot().config, null); assert.equal(store.getSnapshot().client, null);
});
test("unreachable backend retains its configured address and sidebar refresh retries only health", async () => {
  let online = false, reads = 0;
  const store = createBackendConnectionStore({ readConfig: () => { reads++; return A; }, fetch: async () => online ? ok() : new Response(null, { status: 503 }) });
  assert.equal((await store.initialize()).error.status, 503);
  assert.equal(store.getSnapshot().status, "disconnected"); assert.deepEqual(store.getSnapshot().config, A);
  online = true; assert.equal((await store.recheck()).ok, true); assert.equal(reads, 1);
  assert.equal(store.getSnapshot().status, "connected");
});
test("a failed business request disconnects and a successful health refresh restores availability", async () => {
  const store = createBackendConnectionStore({ readConfig: () => A, fetch: async url => {
    if (url.endsWith("api/health")) return ok(); throw new TypeError("offline");
  } });
  await store.initialize(); const client = store.getSnapshot().client;
  await assert.rejects(client.request("api/agent"), { code: "network" });
  assert.equal(store.getSnapshot().status, "disconnected"); assert.equal(store.getSnapshot().client, null);
  await store.recheck(); assert.equal(store.getSnapshot().client, client);
});
test("configuration reload cancels old work immediately and late health/file results cannot restore old clients", async () => {
  let config = A; const calls = [];
  const store = createBackendConnectionStore({ readConfig: () => config, fetch: (url, init) => {
    const response = deferred(); calls.push({ url, init, ...response }); return response.promise;
  } });
  const first = store.initialize(); calls[0].resolve(ok()); await first;
  const old = store.getSnapshot().client, work = old.request("api/agent");
  config = B; const replacement = store.reload();
  await assert.rejects(work, { code: "cancelled" }); assert.equal(store.getSnapshot().client, null);
  calls.at(-1).resolve(ok()); await replacement;
  assert.equal(store.getSnapshot().client.BASE_URL, B.BASE_URL);
  await assert.rejects(old.request("api/agent"), { code: "cancelled" });
  store.stop(); assert.equal(store.getSnapshot().initialized, false);
});
test("Strict Mode replay and overlapping file loads keep only the latest initialization", async () => {
  const old = deferred(); let config = old.promise;
  const store = createBackendConnectionStore({ readConfig: () => config, fetch: async () => ok() });
  const first = store.initialize(); store.stop(); config = B;
  await store.initialize(); old.resolve(A); assert.equal((await first).error.code, "cancelled");
  assert.equal(store.getSnapshot().client.BASE_URL, B.BASE_URL);
});
