import assert from 'node:assert/strict';
import test from 'node:test';
import { BackendClient } from '../src/lib/backend-client.ts';
import { BackendSessionsClient, parseBackendSession, sessionWrite } from '../src/lib/backend-sessions.ts';
import { agentId } from './fixtures/backend-agent.mjs';
import { backendSession, backendProvider } from './fixtures/backend-session.mjs';
const signal = () => new AbortController().signal;
const setup = (responses) => {
  const calls = [];
  const client = new BackendClient('http://localhost:8080/prefix/', { fetch: async (url, init) => { calls.push({url,...init}); return responses.shift(); } });
  return { api: new BackendSessionsClient(client), calls };
};
test('Session parser rejects wrong ownership, duplicate IDs, malformed provider/resources/time', async () => {
  assert.deepEqual(parseBackendSession(backendSession(),agentId()),backendSession());
  for (const patch of [{parentAgentId:agentId(2)}, {id:'bad'}, {provider:backendProvider(100,true)}, {skillIds:['bad']}, {createdAt:'yesterday'}, {systemMessage:12}]) {
    if (patch.provider) { assert.equal(parseBackendSession(backendSession(10,1,patch),agentId()).provider.streaming,true); continue; }
    assert.throws(() => parseBackendSession(backendSession(10,1,patch),agentId()), {code:'invalid-response'});
  }
  const h=setup([Response.json([backendSession(),backendSession()])]);
  await assert.rejects(h.api.list(agentId(),signal()),{code:'invalid-response'});
});
test('Session list reads full pages and preserves the path prefix', async () => {
  const page = Array.from({length:100},(_,n)=>backendSession(n+10));
  const h=setup([Response.json(page),Response.json([backendSession(110)])]);
  assert.equal((await h.api.list(agentId(),signal())).length,101);
  assert.equal(h.calls[1].url,`http://localhost:8080/prefix/api/agent/${agentId()}/sessions?page=1&size=100`);
});
test('Start, fork, complete replacement PUT and delete keep their REST contracts', async () => {
  const h=setup([Response.json(agentId(10),{status:201}),Response.json(agentId(11),{status:201}),new Response(null,{status:204}),new Response(null,{status:204})]);
  assert.equal(await h.api.start(agentId(),agentId(100),signal()),agentId(10));
  assert.equal(await h.api.fork(agentId(),agentId(10),signal()),agentId(11));
  const input=sessionWrite(backendSession(),agentId(101),'new\nsystem');
  await h.api.update(agentId(),agentId(10),input,signal()); await h.api.delete(agentId(),agentId(10),signal());
  assert.deepEqual(h.calls.map(c=>c.method),['POST','POST','PUT','DELETE']);
  assert.deepEqual(JSON.parse(h.calls[0].body),{providerId:agentId(100)});
  assert.equal(h.calls[1].body,undefined);
  assert.deepEqual(JSON.parse(h.calls[2].body),{name:null,providerId:agentId(101),systemMessage:'new\nsystem',memoryId:agentId(201)});
});
