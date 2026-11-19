import assert from "node:assert/strict";
import test from "node:test";
import { BackendClient } from "../src/lib/backend-client.ts";
import { loadBackendProviders, parseProviderPage } from "../src/lib/backend-providers.ts";

const provider = (id) => ({ id, name: `provider-${id}`, modelName: "model", streaming: false,
  baseUrl: "https://model.example/v1", reasoning: false, thinkingLevel: null,
  modelCost: null, contextWindow: 1000000, maxTokens: 16384 });
const batch = (count, offset = 0) => Array.from({ length: count }, (_, i) => provider(String(i + offset)));

test("loads all pages through the configured prefix, preserving backend default and order", async () => {
  const calls = [];
  const pages = [batch(100), batch(100, 100), batch(3, 200)];
  const client = new BackendClient("http://localhost:8080/prefix/", { fetch: async (url, init) => {
    calls.push({ url, init });
    return Response.json(pages[calls.length - 1]);
  } });
  const result = await loadBackendProviders(client, new AbortController().signal);
  assert.equal(result.length, 203);
  assert.deepEqual(result, pages.flat());
  assert.equal(result[0].name, "provider-0");
  assert.deepEqual(calls.map((call) => call.url), [0, 1, 2].map((page) =>
    `http://localhost:8080/prefix/api/provider?page=${page}&size=100`));
  assert.ok(calls.every((call) => call.init.cache === "no-store"));
});

test("exactly full last page requires a final empty page; an empty backend is valid", async () => {
  for (const count of [0, 100, 200]) {
    let calls = 0;
    const client = new BackendClient("http://localhost/", { fetch: async () => {
      const offset = calls++ * 100;
      return Response.json(offset < count ? batch(100, offset) : []);
    } });
    assert.equal((await loadBackendProviders(client, new AbortController().signal)).length, count);
    assert.equal(calls, count / 100 + 1);
  }
});

test("retains false and nullable metadata, stripping unexpected fields", () => {
  const p = { ...provider("a"), baseUrl: null, reasoning: null, contextWindow: null, maxTokens: null };
  assert.deepEqual(parseProviderPage([{ ...p, apiKey: "unexpected" }]), [p]);
  assert.equal(parseProviderPage([provider("b")])[0].streaming, false);
  assert.equal(parseProviderPage([provider("b")])[0].reasoning, false);
});

test("rejects invalid shape and malformed records instead of treating them as an empty list", () => {
  for (const value of [undefined, null, {}, { data: [] }, [null], ["provider"],
    [{ ...provider("a"), id: " " }], [{ ...provider("a"), streaming: "false" }],
    [{ ...provider("a"), modelCost: "1" }], [{ ...provider("a"), maxTokens: -1 }],
    [{ ...provider("a"), contextWindow: 1.5 }], [{ ...provider("a"), reasoning: undefined }]]) {
    assert.throws(() => parseProviderPage(value), { code: "invalid-response" });
  }
});

test("rejects duplicate IDs within or across pages and oversized pages", async () => {
  for (const pages of [[provider("a"), provider("a")], batch(101)]) {
    const client = new BackendClient("http://localhost/", { fetch: async () => Response.json(pages) });
    await assert.rejects(loadBackendProviders(client, new AbortController().signal), { code: "invalid-response" });
  }
  let calls = 0;
  const client = new BackendClient("http://localhost/", { fetch: async () => Response.json(calls++ ? [provider("0")] : batch(100)) });
  await assert.rejects(loadBackendProviders(client, new AbortController().signal), { code: "invalid-response" });
});

test("a later page HTTP error fails the complete load", async () => {
  let calls = 0;
  const client = new BackendClient("http://localhost/", { fetch: async () =>
    calls++ ? new Response(null, { status: 503 }) : Response.json(batch(100)) });
  await assert.rejects(loadBackendProviders(client, new AbortController().signal), { code: "http", status: 503 });
});
