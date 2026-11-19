import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBackendUrl, backendEndpoint } from "../src/lib/backend-url.ts";
import { BackendClient, BackendClientError } from "../src/lib/backend-client.ts";

const rejectsCode = (promise, code, status) => assert.rejects(promise, (error) =>
  error instanceof BackendClientError && error.code === code && (status === undefined || error.status === status));

test("backend URLs normalize trailing slashes and preserve deployment prefixes", () => {
  for (const [input, expected] of [
    [" http://localhost:8080/ ", "http://localhost:8080/api/health"],
    ["http://127.0.0.1:8080", "http://127.0.0.1:8080/api/health"],
    ["https://somewhere.ai/mindrais_backend///", "https://somewhere.ai/mindrais_backend/api/health"],
    ["http://[::1]:8080/backend", "http://[::1]:8080/backend/api/health"],
  ]) {
    assert.equal(backendEndpoint(input, "api/health"), expected);
    assert.equal(backendEndpoint(input, "/api/health"), expected);
  }
  assert.equal(normalizeBackendUrl("HTTPS://EXAMPLE.COM/prefix"), "https://example.com/prefix/");
  assert.equal(backendEndpoint("https://example.com/prefix/", "api/agent?page=0&size=20"),
    "https://example.com/prefix/api/agent?page=0&size=20");
});

test("invalid backend URLs and escaping API paths are rejected before fetch", async () => {
  for (const value of ["", "localhost:8080", "ftp://host", "/relative", "http://", "https://a?", "https://a#",
    "https://a?key=value", "https://user:pass@a", "https://user@a", "https://a/a b", "https://a\\b"]) {
    assert.throws(() => normalizeBackendUrl(value), undefined, value);
  }
  const client = new BackendClient("https://example.com/prefix", { fetch: () => assert.fail("must not fetch") });
  for (const path of ["https://evil.test/api/health", "//evil.test/api/health", "api/../health",
    "api/%2e%2e/health", "api/a%2fb", "api/%5cfoo", "api/%", "api/health#fragment"]) {
    await rejectsCode(client.request(path), "invalid-request");
  }
  await rejectsCode(client.request("api/agent", { json: {} }), "invalid-request");
  await rejectsCode(client.health({ timeoutMs: 0 }), "invalid-request");
});

test("health requires exactly 200 and never attempts JSON parsing", async () => {
  const client = new BackendClient("http://localhost:8080/root", { fetch: async (url, init) => {
    assert.equal(url, "http://localhost:8080/root/api/health");
    assert.equal(init.method, "GET");
    assert.equal(init.cache, "no-store");
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    assert.equal(init.headers.has("Content-Type"), false);
    return { status: 200, text: () => assert.fail("health must not read JSON") };
  } });
  assert.equal(await client.health(), undefined);
  for (const status of [201, 204, 301, 400, 404, 500]) {
    const failing = new BackendClient("http://localhost:8080", { fetch: async () => new Response(null, { status }) });
    await rejectsCode(failing.health(), "http", status);
  }
});

test("client sends JSON and returns JSON values or undefined for empty success bodies", async () => {
  const replies = [Response.json({ name: "saved" }, { status: 201 }), new Response(null, { status: 204 }),
    new Response(""), Response.json("id-123")];
  const client = new BackendClient("https://example.com/prefix", { fetch: async (url, init) => {
    assert.equal(url, "https://example.com/prefix/api/agent");
    if (init.method === "POST") {
      assert.equal(init.headers.get("Content-Type"), "application/json");
      assert.equal(init.headers.get("X-Request-ID"), "test");
      assert.equal(init.body, '{"name":"test"}');
    }
    return replies.shift();
  } });
  assert.deepEqual(await client.request("api/agent", { method: "POST", json: { name: "test" },
    headers: { "X-Request-ID": "test" } }), { name: "saved" });
  assert.equal(await client.request("api/agent", { method: "DELETE" }), undefined);
  assert.equal(await client.request("api/agent"), undefined);
  assert.equal(await client.request("api/agent"), "id-123");
});

test("HTTP and malformed JSON errors are distinct from transport failure; no automatic retry", async () => {
  let calls = 0;
  const reported = [];
  const replies = [new Response("bad", { status: 400 }), new Response("not json")];
  const client = new BackendClient("https://example.com", {
    fetch: async () => { calls++; if (replies.length) return replies.shift(); throw new TypeError("Failed to fetch"); },
    onConnectionError: (error) => reported.push(error.code),
  });
  await rejectsCode(client.request("api/agent"), "http", 400);
  await rejectsCode(client.request("api/agent"), "invalid-response");
  assert.deepEqual(reported, []);
  await rejectsCode(client.request("api/agent", { method: "POST", json: {} }), "network");
  assert.deepEqual(reported, ["network"]);
  assert.equal(calls, 3);
});

test("HTTP errors preserve explicit backend error details for polling and retry failures", async () => {
  const client = new BackendClient("http://localhost:8080", {
    fetch: async () => Response.json({ code: "ASSET_ERROR", message: "Knowledge indexing disabled: configure an embedding provider" }, { status: 503 }),
  });
  await assert.rejects(client.request("api/asset-storage/versions/test/retry", { method: "POST" }), error => error.status === 503 && error.message.includes("configure an embedding provider"));
});

test("timeout covers fetching and response body consumption even if transport ignores abort", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const fetch of [async () => new Promise(() => {}),
    async () => ({ ok: true, text: () => new Promise(() => {}) })]) {
    let signal;
    const client = new BackendClient("https://example.com", { timeoutMs: 50,
      fetch: (...args) => { signal = args[1].signal; return fetch(); } });
    const request = client.request("api/agent");
    const assertion = rejectsCode(request, "timeout");
    await Promise.resolve();
    t.mock.timers.tick(50);
    await assertion;
    assert.equal(signal.aborted, true);
  }
});

test("caller cancellation and disposal abort in-flight calls and invalidate old references", async () => {
  let calls = 0;
  const signals = [];
  const client = new BackendClient("https://example.com", { fetch: async (_, init) => {
    calls++; signals.push(init.signal); return new Promise(() => {});
  } });
  const controller = new AbortController();
  const request = client.request("api/agent", { signal: controller.signal });
  controller.abort();
  await rejectsCode(request, "cancelled");
  const one = client.health();
  const two = client.request("api/agent");
  client.dispose();
  await Promise.all([rejectsCode(one, "cancelled"), rejectsCode(two, "cancelled")]);
  await rejectsCode(client.request("api/agent"), "cancelled");
  assert.equal(calls, 3);
  assert.equal(signals.every((signal) => signal.aborted), true);
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  const fresh = new BackendClient("https://example.com", { fetch: () => assert.fail("must not fetch") });
  await rejectsCode(fresh.health({ signal: alreadyAborted.signal }), "cancelled");
});
