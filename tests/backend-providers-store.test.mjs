import assert from "node:assert/strict";
import test from "node:test";
import { createTestConnection } from "./fixtures/backend-connection.mjs";
import { createBackendProvidersStore } from "../src/lib/backend-providers-store.ts";

const A = "http://localhost:8080/";
const config = { version: 1, BASE_URL: A };
const p = (id = "default") => ({ id, name: id, modelName: "model", streaming: false,
  baseUrl: null, reasoning: null, thinkingLevel: null, modelCost: null, contextWindow: null, maxTokens: null });
const ok = () => new Response(null, { status: 200 });
const turn = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function setup(t, options = {}) {
  const calls = [];
  const connection = createTestConnection({ ...options, fetch: (url, init) => {
    const call = { url, signal: init.signal, ...deferred() };
    calls.push(call);
    // Deliberately ignore cancellation so late-response guards are exercised.
    return call.promise;
  } });
  const providers = createBackendProvidersStore(connection);
  t.after(() => { providers.stop(); connection.stop(); });
  providers.start();
  return { connection, providers, calls };
}

async function connect(h, url = A) {
  await h.connection.initialize();
  const creation = h.connection.setConfig(url);
  h.calls.at(-1).resolve(ok());
  assert.equal((await creation).ok, true);
}
async function ready(h, list = [p(), p("other")]) {
  h.calls.at(-1).resolve(Response.json(list));
  await turn();
  assert.equal(h.providers.getSnapshot().status, "ready");
}
function cleared(h) {
  const state = h.providers.getSnapshot();
  assert.deepEqual(state.providers, []);
  assert.equal(state.defaultProvider, null);
  assert.equal(state.error, null);
}

test("no requests before initialization or verified connection; business resources wait for health verification", async (t) => {
  const h = setup(t);
  assert.equal(h.calls.length, 0);
  assert.equal(h.providers.getServerSnapshot().status, "unavailable");
  await h.connection.initialize();
  assert.equal(h.calls.length, 0);
  const creation = h.connection.setConfig(A);
  assert.equal(h.calls.length, 1);
  cleared(h);
  h.calls[0].resolve(new Response(null, { status: 503 }));
  await creation;
  assert.equal(h.calls.length, 1);
  cleared(h);
});

test("loads after health success, exposes only backend first default, and does not reload on harmless updates", async (t) => {
  const h = setup(t);
  await connect(h);
  assert.equal(h.calls[1].url, `${A}api/provider?page=0&size=100`);
  const list = [p("backend-default"), p("another")];
  await ready(h, list);
  const snapshot = h.providers.getSnapshot();
  assert.deepEqual(snapshot.providers, list);
  assert.equal(snapshot.defaultProvider, snapshot.providers[0]);
  h.providers.start();

  assert.equal(h.providers.getSnapshot(), snapshot);
  assert.equal(h.calls.length, 2);
});

test("empty response has no default", async (t) => {
  const h = setup(t);
  await connect(h);
  await ready(h, []);
  assert.equal(h.providers.getSnapshot().defaultProvider, null);
});

test("same URL replacement cancels old list requests and late bodies cannot restore them", async (t) => {
  const h = setup(t);
  await connect(h);
  const oldList = h.calls[1];
  const edit = h.connection.setConfig(A);
  assert.equal(oldList.signal.aborted, true);
  cleared(h);
  oldList.resolve(Response.json([p("stale")]));
  await turn();
  cleared(h);
  h.calls.at(-1).resolve(ok()); await edit;
  await ready(h, [p("new-default")]);
  assert.equal(h.providers.getSnapshot().defaultProvider.id, "new-default");
});

test("reload clears before the configuration read resolves, then loads only after health verification", async (t) => {
  const read = deferred();
  const h = setup(t);
  await connect(h); await ready(h);
  h.connection.setConfigReader(() => read.promise);
  const reload = h.connection.reload();
  cleared(h);
  assert.equal(h.calls.length, 2);
  read.resolve(config); await turn();
  assert.equal(h.calls.at(-1).url, `${A}api/health`);
  cleared(h);
  h.calls.at(-1).resolve(ok()); await reload;
  await ready(h, [p("restored-default")]);
});

test("recheck clears, stays empty on disconnect, and reloads after recovery", async (t) => {
  const h = setup(t);
  await connect(h); await ready(h);
  const check = h.connection.recheck();
  cleared(h);
  h.calls.at(-1).resolve(new Response(null, { status: 503 })); await check;
  cleared(h);
  assert.equal(h.connection.getSnapshot().status, "disconnected");
  const recovery = h.connection.recheck();
  h.calls.at(-1).resolve(ok()); await recovery;
  await ready(h, [p("recovered")]);
});

test("HTTP error supports retry without losing connection; network failure clears and disconnects", async (t) => {
  const h = setup(t);
  await connect(h);
  h.calls.at(-1).resolve(new Response(null, { status: 500 })); await turn();
  assert.equal(h.providers.getSnapshot().status, "error");
  assert.equal(h.providers.getSnapshot().error.status, 500);
  assert.equal(h.connection.getSnapshot().status, "connected");
  h.providers.retry();
  h.providers.retry(); // No duplicate retry while loading.
  assert.equal(h.calls.length, 3);
  await ready(h);
  const request = h.connection.getSnapshot().client.request("api/agent");
  h.calls.at(-1).reject(new Error("network failure"));
  await assert.rejects(request, { code: "network" });
  cleared(h);
  assert.equal(h.connection.getSnapshot().status, "disconnected");
  const count = h.calls.length;
  h.providers.retry();
  assert.equal(h.calls.length, count);
});

test("malformed responses never publish providers or a default", async (t) => {
  const h = setup(t);
  await connect(h);
  h.calls.at(-1).resolve(Response.json({ data: [p()] })); await turn();
  assert.equal(h.providers.getSnapshot().error.code, "invalid-response");
  assert.deepEqual(h.providers.getSnapshot().providers, []);
  assert.equal(h.providers.getSnapshot().defaultProvider, null);
});

test("provider timeout disconnects and cancels its request without leaving a stale default", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = setup(t, { timeoutMs: 50 });
  await connect(h);
  const list = h.calls.at(-1);
  t.mock.timers.tick(50);
  await turn();
  assert.equal(h.connection.getSnapshot().status, "disconnected");
  assert.equal(h.connection.getSnapshot().error.code, "timeout");
  assert.equal(list.signal.aborted, true);
  cleared(h);
});

test("stop and Strict Mode restart abort old work, restore subscriptions and fetch fresh data", async (t) => {
  const h = setup(t);
  await connect(h);
  const old = h.calls[1];
  h.providers.stop();
  assert.equal(old.signal.aborted, true);
  cleared(h);
  h.providers.start();
  assert.equal(h.calls.length, 3);
  old.resolve(Response.json([p("stale")]));
  await ready(h, [p("fresh")]);
  assert.equal(h.providers.getSnapshot().defaultProvider.id, "fresh");
});

test("partial pagination stays hidden and deletion prevents next-page results from publishing", async (t) => {
  const h = setup(t);
  await connect(h);
  h.calls[1].resolve(Response.json(Array.from({ length: 100 }, (_, i) => p(`p-${i}`))));
  await turn();
  assert.equal(h.calls[2].url, `${A}api/provider?page=1&size=100`);
  cleared(h);
  h.connection.setConfigReader(() => null); await h.connection.clearConfig();
  assert.equal(h.calls[2].signal.aborted, true);
  h.calls[2].resolve(Response.json([p("late")])); await turn();
  cleared(h);
  assert.equal(h.calls.length, 3);
});

test("a failed deployment-file reload clears old providers and refresh recovers only verified resources", async t => {
  const h = setup(t); await connect(h); await ready(h);
  const read = deferred(); h.connection.setConfigReader(() => read.promise);
  const reload = h.connection.reload(); cleared(h);
  read.reject(new Error("configuration missing"));
  assert.equal((await reload).error.code, "configuration");
  assert.equal(h.connection.getSnapshot().client, null);
  assert.equal(h.providers.getSnapshot().status, "unavailable");
  h.connection.setConfigReader(() => config);
  const recovery = h.connection.recheck();
  h.calls.at(-1).resolve(ok()); await recovery;
  await ready(h, [p("verified-after-file-repair")]);
  assert.equal(h.providers.getSnapshot().defaultProvider.id, "verified-after-file-repair");
});
