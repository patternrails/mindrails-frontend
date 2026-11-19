import assert from "node:assert/strict";
import test from "node:test";
import { createTestConnection } from "./fixtures/backend-connection.mjs";
import { createBackendAgentsStore } from "../src/lib/backend-agents-store.ts";
import { agentId, agentInput, backendAgent } from "./fixtures/backend-agent.mjs";
const A = "http://localhost:8080/";
const ok = () => new Response(null, { status: 200 });
const noContent = () => new Response(null, { status: 204 });
const turn = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(t, options = {}) {
  const calls = [];
  const connection = createTestConnection({ ...options, fetch: (url, init) => {
    const call = { url, ...init, ...deferred() }; calls.push(call); return call.promise;
  } });
  const store = createBackendAgentsStore(connection);
  t.after(() => { store.stop(); connection.stop(); });
  store.start();
  return { connection, store, calls };
}
async function connect(h, list = [backendAgent()]) {
  await h.connection.initialize();
  const creation = h.connection.setConfig(A);
  h.calls.at(-1).resolve(ok()); await creation;
  h.calls.at(-1).resolve(Response.json(list)); await turn();
  assert.equal(h.store.getSnapshot().status, "ready");
}
function cleared(h) {
  const s = h.store.getSnapshot();
  assert.deepEqual(s.agents, []);
  assert.equal(s.detail, null);
  assert.equal(s.selectedId, null);
  assert.equal(s.mutation, null);
  assert.equal(s.feedback, null);
}
async function afterWrite(h, agent, list = [agent]) {
  await turn();
  assert.ok(h.calls.at(-1).url.endsWith(`/api/agent/${agent.id}`));
  h.calls.at(-1).resolve(Response.json(agent)); await turn();
  h.calls.at(-1).resolve(Response.json(list));
}

test("Agent store waits for verified connection, loads the full list, and preserves it across subscriptions", async (t) => {
  const h = setup(t);
  assert.equal(h.calls.length, 0);
  assert.equal(h.store.getServerSnapshot().status, "unavailable");
  await connect(h);
  assert.equal(h.calls[1].url, `${A}api/agent?page=0&size=100`);
  const snapshot = h.store.getSnapshot();
  h.store.start();
  assert.equal(h.calls.length, 2);
  assert.equal(h.store.getSnapshot(), snapshot);
});

test("POST then GET and list refresh selects the server-created Agent; duplicates are blocked", async (t) => {
  const h = setup(t); await connect(h, []);
  const creation = h.store.create(agentInput);
  assert.equal(h.calls.at(-1).method, "POST");
  assert.equal((await h.store.create(agentInput)).error.code, "busy");
  assert.equal((await h.store.update(agentId(), agentInput)).error.code, "busy");
  assert.equal(await h.store.refresh(), false);
  h.calls.at(-1).resolve(Response.json(agentId(2), { status: 201 }));
  const created = backendAgent(2);
  await afterWrite(h, created);
  assert.equal((await creation).ok, true);
  assert.deepEqual(h.store.getSnapshot().detail, created);
  assert.equal(h.store.getSnapshot().selectedId, created.id);
  assert.equal(h.store.getSnapshot().feedback.kind, "created");
  assert.equal(h.store.getSnapshot().mutation, null);
});

test("PUT sends explicit null for cleared fields; read-back metadata comes from the server", async (t) => {
  const h = setup(t); await connect(h);
  const updated = backendAgent(1, { name: "Updated", updatedAt: "2026-10-12T14:00:00Z" });
  const pending = h.store.update(agentId(), { ...agentInput, name: "Updated", description: "" });
  assert.equal(h.calls.at(-1).method, "PUT");
  assert.deepEqual(JSON.parse(h.calls.at(-1).body), { ...agentInput, name: "Updated" });
  h.calls.at(-1).resolve(noContent());
  await afterWrite(h, updated);
  assert.equal((await pending).ok, true);
  assert.deepEqual(h.store.getSnapshot().detail, updated);
  assert.equal(h.store.getSnapshot().feedback.kind, "updated");
});

test("DELETE removes a confirmed record and selection before list refresh, ending in an empty state", async (t) => {
  const h = setup(t); await connect(h);
  const deletion = h.store.remove(agentId());
  assert.equal(h.calls.at(-1).method, "DELETE");
  h.calls.at(-1).resolve(noContent()); await turn();
  assert.deepEqual(h.store.getSnapshot().agents, []);
  assert.equal(h.store.getSnapshot().selectedId, null);
  h.calls.at(-1).resolve(Response.json([]));
  assert.equal((await deletion).ok, true);
  assert.equal(h.store.getSnapshot().status, "ready");
  assert.equal(h.store.getSnapshot().feedback.kind, "deleted");
});

test("only the latest detail response is accepted", async (t) => {
  const h = setup(t); await connect(h, [backendAgent(), backendAgent(2)]);
  const older = h.store.select(agentId()); const oldCall = h.calls.at(-1);
  const latest = h.store.select(agentId(2));
  assert.equal(oldCall.signal.aborted, true);
  h.calls.at(-1).resolve(Response.json(backendAgent(2))); await latest;
  oldCall.resolve(Response.json(backendAgent())); await older;
  assert.equal(h.store.getSnapshot().detail.id, agentId(2));
});

test("a write aborts earlier list reads and stale results cannot overwrite the committed record", async (t) => {
  const h = setup(t); await connect(h);
  const read = h.store.refresh(); const old = h.calls.at(-1);
  const update = h.store.update(agentId(), { ...agentInput, name: "New" });
  assert.equal(old.signal.aborted, true);
  h.calls.at(-1).resolve(noContent());
  const a = backendAgent(1, { name: "New" });
  await afterWrite(h, a); await update;
  old.resolve(Response.json([backendAgent()])); await read;
  assert.equal(h.store.getSnapshot().agents[0].name, "New");
});

test("write success plus failed follow-up reads remains a confirmed success", async (t) => {
  const h = setup(t); await connect(h);
  const update = h.store.update(agentId(), { ...agentInput, name: "New" });
  h.calls.at(-1).resolve(noContent()); await turn();
  h.calls.at(-1).resolve(new Response(null, { status: 503 })); await turn();
  h.calls.at(-1).resolve(new Response(null, { status: 503 }));
  assert.equal((await update).ok, true);
  const s = h.store.getSnapshot();
  assert.equal(s.feedback.kind, "updated");
  assert.equal(s.detailError.status, 503);
  assert.equal(s.listError.status, 503);
  assert.equal(s.mutationError, null);
  assert.equal(s.uncertain, false);
});

test("HTTP write failure preserves records; unconfirmed 5xx does not auto-retry", async (t) => {
  const h = setup(t); await connect(h);
  const before = h.calls.length;
  const update = h.store.update(agentId(), agentInput);
  h.calls.at(-1).resolve(new Response(null, { status: 500 }));
  const result = await update;
  assert.equal(result.ok, false); assert.equal(result.uncertain, true);
  assert.equal(h.store.getSnapshot().agents.length, 1);
  assert.equal(h.store.getSnapshot().uncertain, true);
  assert.equal(h.calls.length, before + 1);
  assert.equal(h.connection.getSnapshot().status, "connected");
});

test("HTTP 400 validation failure can be corrected without discarding data", async (t) => {
  const h = setup(t); await connect(h);
  const update = h.store.update(agentId(), agentInput);
  h.calls.at(-1).resolve(new Response(null, { status: 400 }));
  assert.equal((await update).uncertain, false);
  assert.equal(h.store.getSnapshot().mutationError.status, 400);
  assert.equal(h.store.getSnapshot().agents.length, 1);
});

test("missing GET invalidates the detail and refreshes the current list", async (t) => {
  const h = setup(t); await connect(h);
  const get = h.store.select(agentId());
  h.calls.at(-1).resolve(new Response(null, { status: 404 })); await get;
  assert.equal(h.store.getSnapshot().detail, null);
  assert.equal(h.store.getSnapshot().feedback.kind, "missing");
  h.calls.at(-1).resolve(Response.json([])); await turn();
  assert.deepEqual(h.store.getSnapshot().agents, []);
});

test("missing DELETE reconciles as already gone and missing PUT is not treated as saved", async (t) => {
  for (const operation of ["remove", "update"]) {
    const h = setup(t); await connect(h);
    const pending = operation === "remove" ? h.store.remove(agentId()) : h.store.update(agentId(), agentInput);
    h.calls.at(-1).resolve(new Response(null, { status: 404 })); await turn();
    h.calls.at(-1).resolve(Response.json([]));
    const result = await pending;
    assert.equal(result.ok, operation === "remove");
    assert.deepEqual(h.store.getSnapshot().agents, []);
    assert.equal(h.store.getSnapshot().feedback.kind, "missing");
  }
});

test("same URL connection replacement invalidates an in-flight write and its epoch", async (t) => {
  const h = setup(t); await connect(h);
  const epoch = h.store.getSnapshot().epoch;
  const write = h.store.create(agentInput); const oldWrite = h.calls.at(-1);
  const replacement = h.connection.setConfig(A);
  assert.equal(oldWrite.signal.aborted, true);
  assert.equal(h.store.isCurrent(epoch), false);
  cleared(h);
  h.calls.at(-1).resolve(ok()); await replacement;
  h.calls.at(-1).resolve(Response.json([backendAgent(3)])); await turn();
  oldWrite.resolve(Response.json(agentId(2), { status: 201 }));
  assert.equal((await write).ok, false);
  assert.deepEqual(h.store.getSnapshot().agents, [backendAgent(3)]);
  assert.equal(h.store.getSnapshot().feedback, null);
});

test("network failure during a write disconnects, clears state, and records its unknown outcome", async (t) => {
  const h = setup(t); await connect(h);
  const write = h.store.create(agentInput);
  h.calls.at(-1).reject(new Error("network")); await write;
  cleared(h);
  assert.equal(h.connection.getSnapshot().status, "disconnected");
  assert.equal(h.store.getSnapshot().interruptedWrite, "unknown");
  const recovery = h.connection.recheck(); h.calls.at(-1).resolve(ok()); await recovery;
  h.calls.at(-1).resolve(Response.json([backendAgent(5)])); await turn();
  assert.equal(h.store.getSnapshot().interruptedWrite, null);
  assert.equal(h.store.getSnapshot().agents[0].id, agentId(5));
});

test("reload invalidates data before its configuration read resolves; missing configuration defeats old lists", async (t) => {
  const read = deferred();
  const h = setup(t);
  await connect(h);
  h.connection.setConfigReader(() => read.promise);
  const reload = h.connection.reload();
  cleared(h);
  read.resolve({ version: 1, BASE_URL: A }); await turn();
  h.calls.at(-1).resolve(ok()); await reload;
  const list = h.calls.at(-1);
  h.connection.setConfigReader(() => null); await h.connection.clearConfig(); cleared(h);
  assert.equal(list.signal.aborted, true);
  list.resolve(Response.json([backendAgent(9)])); await turn(); cleared(h);
});

test("Strict Mode stop and restart cancels old work and subscribes afresh", async (t) => {
  const h = setup(t); await connect(h);
  const get = h.store.select(agentId()); const old = h.calls.at(-1);
  h.store.stop(); cleared(h);
  h.store.start();
  old.resolve(Response.json(backendAgent())); await get;
  h.calls.at(-1).resolve(Response.json([backendAgent(2)])); await turn();
  assert.equal(h.store.getSnapshot().agents[0].id, agentId(2));
  assert.equal(h.store.getSnapshot().detail, null);
});

test("connection loss during read-back preserves the known success of a completed write", async (t) => {
  const h = setup(t); await connect(h);
  const update = h.store.update(agentId(), { ...agentInput, name: "Saved" });
  h.calls.at(-1).resolve(noContent()); await turn();
  h.calls.at(-1).reject(new Error("read-back network failure"));
  assert.equal((await update).ok, true);
  cleared(h);
  assert.equal(h.store.getSnapshot().interruptedWrite, "confirmed");
});

test("a timed out create has an unknown outcome and is never retried automatically", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = setup(t, { timeoutMs: 50 }); await connect(h);
  const write = h.store.create(agentInput); const call = h.calls.at(-1);
  t.mock.timers.tick(50); await write;
  cleared(h);
  assert.equal(h.connection.getSnapshot().error.code, "timeout");
  assert.equal(h.store.getSnapshot().interruptedWrite, "unknown");
  assert.equal(call.signal.aborted, true);
  assert.equal(h.calls.length, 3);
});

test("failed later list page does not publish partial Agent data", async (t) => {
  const h = setup(t);
  await h.connection.initialize();
  const connecting = h.connection.setConfig(A); h.calls.at(-1).resolve(ok()); await connecting;
  h.calls.at(-1).resolve(Response.json(Array.from({ length: 100 }, (_, i) => backendAgent(i + 1)))); await turn();
  assert.deepEqual(h.store.getSnapshot().agents, []);
  h.calls.at(-1).resolve(new Response(null, { status: 503 })); await turn();
  assert.equal(h.store.getSnapshot().status, "error");
  assert.deepEqual(h.store.getSnapshot().agents, []);
});

test("refresh invalidates selected details and chooses a remaining resource if another client removed it", async (t) => {
  const h = setup(t); await connect(h, [backendAgent(), backendAgent(2)]);
  const detail = h.store.select(agentId()); h.calls.at(-1).resolve(Response.json(backendAgent())); await detail;
  const refresh = h.store.refresh();
  assert.equal(h.store.getSnapshot().detail, null);
  h.calls.at(-1).resolve(Response.json([backendAgent(2)])); await refresh;
  assert.equal(h.store.getSnapshot().selectedId, agentId(2));
  assert.equal(h.store.getSnapshot().detailStatus, "idle");
});
