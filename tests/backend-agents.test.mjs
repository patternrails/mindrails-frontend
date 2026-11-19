import assert from "node:assert/strict";
import test from "node:test";
import { BackendClient } from "../src/lib/backend-client.ts";
import { BackendAgentsClient, parseBackendAgent, normalizeAgentWrite } from "../src/lib/backend-agents.ts";
import { agentId, agentInput, backendAgent } from "./fixtures/backend-agent.mjs";
const signal = () => new AbortController().signal;
const api = (fetch) => new BackendAgentsClient(new BackendClient("http://localhost:8080/backend/", { fetch }));

test("Agent parser retains readonly resources and nullable fields; session counts use owned references", () => {
  const a = backendAgent(1, { sessions: [{ id: agentId(2), parentAgentId: agentId(1), provider: {} }] });
  const result = parseBackendAgent({ ...a, status: "ARCHIVED", ignored: "unused" });
  assert.deepEqual(result, { ...a, sessions: [{ id: agentId(2), parentAgentId: agentId(1) }] });
  assert.equal(result.description, null);
});

test("invalid Agent responses are rejected instead of shown as valid or empty", () => {
  for (const value of [undefined, null, {}, { ...backendAgent(), id: "not-uuid" },
    { ...backendAgent(), updatedAt: "yesterday" },
    { ...backendAgent(), sessions: null }, { ...backendAgent(), ownerId: undefined },
    { ...backendAgent(), name: " " }, { ...backendAgent(), skillIds: ["bad"] },
    { ...backendAgent(), sessions: [{ id: agentId(2), parentAgentId: agentId(3) }] }]) {
    assert.throws(() => parseBackendAgent(value), { code: "invalid-response" });
  }
});

test("complete Agent pagination preserves backend ordering and deployment prefix", async () => {
  const list = Array.from({ length: 203 }, (_, i) => backendAgent(i + 1));
  const urls = [];
  const client = api(async (url) => {
    urls.push(url);
    const page = Number(new URL(url).searchParams.get("page"));
    return Response.json(list.slice(page * 100, (page + 1) * 100));
  });
  assert.deepEqual(await client.list(signal()), list);
  assert.deepEqual(urls, [0, 1, 2].map((page) => `http://localhost:8080/backend/api/agent?page=${page}&size=100`));
});

test("an exact full page requires an empty last page; empty arrays and duplicate IDs are handled", async () => {
  let calls = 0;
  const client = api(async () => Response.json(calls++ ? [] : Array.from({ length: 100 }, (_, i) => backendAgent(i + 1))));
  assert.equal((await client.list(signal())).length, 100);
  assert.equal(calls, 2);
  assert.deepEqual(await api(async () => Response.json([])).list(signal()), []);
  await assert.rejects(api(async () => Response.json([backendAgent(), backendAgent()])).list(signal()), { code: "invalid-response" });
  await assert.rejects(api(async () => Response.json({ data: [] })).list(signal()), { code: "invalid-response" });
});

test("POST receives a UUID string and PUT sends full fields without readonly metadata; DELETE accepts 204", async () => {
  const calls = [];
  const client = api(async (url, init) => {
    calls.push({ url, init });
    return init.method === "POST" ? Response.json(agentId(), { status: 201 }) : new Response(null, { status: 204 });
  });
  const input = { ...backendAgent(1), status: "ARCHIVED", name: "  Updated  ", description: "", goal: "  ", systemMessage: "line one\nline two" };
  assert.equal(await client.create(input, signal()), agentId());
  assert.equal(await client.update(agentId(), input, signal()), undefined);
  assert.equal(await client.delete(agentId(), signal()), undefined);
  for (const call of calls.slice(0, 2)) {
    assert.deepEqual(JSON.parse(call.init.body), { name: "Updated", description: null, goal: null,
      systemMessage: "line one\nline two" });
    assert.equal(call.init.headers.get("Content-Type"), "application/json");
  }
  assert.deepEqual(calls.map((call) => call.init.method), ["POST", "PUT", "DELETE"]);
  assert.equal(calls[2].init.body, undefined);
});

test("get validates resource identity and creation rejects non-UUID success bodies", async () => {
  assert.deepEqual(await api(async () => Response.json(backendAgent())).get(agentId(), signal()), backendAgent());
  await assert.rejects(api(async () => Response.json(backendAgent(2))).get(agentId(), signal()), { code: "invalid-response" });
  for (const result of [{ id: agentId() }, null, "not-uuid"]) {
    await assert.rejects(api(async () => Response.json(result, { status: 201 })).create(agentInput, signal()), { code: "invalid-response" });
  }
});

test("invalid names and IDs fail before fetch; preserved prompts are not trimmed", async () => {
  const client = api(() => assert.fail("invalid request must not fetch"));
  await assert.rejects(client.create({ ...agentInput, name: " " }, signal()), { code: "invalid-request" });
  await assert.rejects(client.update("../../other", agentInput, signal()), { code: "invalid-request" });
  await assert.rejects(client.delete("bad", signal()), { code: "invalid-request" });
  assert.equal(normalizeAgentWrite({ ...agentInput, systemMessage: "  Instructions\n  next  " }).systemMessage, "  Instructions\n  next  ");
});
