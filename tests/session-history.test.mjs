import test from 'node:test';import assert from 'node:assert/strict';
import {archivedTurn} from '../src/lib/session-history.ts';import {backendSession} from './fixtures/backend-session.mjs';import {agentId} from './fixtures/backend-agent.mjs';
const record={id:agentId(900),requestId:agentId(901),status:'COMPLETED',transport:'STREAM',startedAt:'2026-10-18T00:00:00Z',finishedAt:'2026-10-18T00:00:01Z',metadata:{result:'final'},messages:[{type:'USER',text:'question'},{type:'AI',text:'intermediate',thinking:'analysis',toolExecutionRequests:[{id:'call',name:'read',arguments:'{"path":"file"}'}]},{type:'TOOL_EXECUTION_RESULT',id:'call',toolName:'read',text:'content'},{type:'AI',text:'final'}]};
test('archives restore attachment references for the turn', () => {
  const screenshot = { versionId: agentId(902), name: 'screenshot.png' };
  const archived = archivedTurn({ ...record, metadata: { ...record.metadata, attachments: [
    { ...screenshot, payload: 'ignored' }, { versionId: 'bad', name: 'bad.png' }, null,
  ] } }, backendSession());
  assert.deepEqual(archived.attachments, [screenshot]);
  assert.equal(archivedTurn(record, backendSession()).attachments, undefined);
});
test('backend archives recover thinking, separate rounds and real tool result',()=>{const t=archivedTurn(record,backendSession());assert.equal(t.user,'question');assert.equal(t.assistant,'final');assert.equal(t.stream.messages.length,2);assert.equal(t.stream.tools[0].status,'completed');assert.deepEqual(t.stream.tools[0].arguments,{path:'file'});assert.equal(t.stream.tools[0].result,'content');});
test('cancelled archive retains partial answer and thinking',()=>{const t=archivedTurn({...record,status:'CANCELLED',metadata:{partial:{answer:'partial',thinking:'still thinking'}}},backendSession());assert.equal(t.status,'stopped');assert.equal(t.assistant,'partial');assert.equal(t.stream.messages.at(-1).thinking,'still thinking');});
test('cancel after a model round preserves already archived answer even without partial metadata',()=>{const t=archivedTurn({...record,status:'CANCELLED',metadata:{}},backendSession());assert.equal(t.assistant,'final');assert.equal(t.stream.messages.find(m=>m.id===t.stream.finalMessageId).answer,'final');});

test('failed archives restore safe diagnostics and partial content into the same turn', () => {
 const t = archivedTurn({ ...record, status: 'FAILED', metadata: {
  partial: { answer: 'Partial reply' }, error: { code: 'UNAVAILABLE', message: 'Secure connection failed',
   reason: 'TLS_HANDSHAKE_FAILED', detail: 'SSLHandshakeException: Remote host terminated the handshake' },
 } }, backendSession());
 assert.equal(t.status, 'failed'); assert.equal(t.assistant, 'Partial reply');
 assert.equal(t.error.reason, 'TLS_HANDSHAKE_FAILED'); assert.equal(t.error.requestId, record.requestId);
 assert.equal(t.error.status, null);
});

test('communication history restores original text and trusted source rather than the model envelope',()=>{
 const source={sourceSessionId:agentId(21),sourceAgentId:agentId(2),sourceRunId:agentId(950),inReplyTo:agentId(951),sentAt:'2026-11-07T08:00:00Z',hops:2};
 const turn=archivedTurn({...record,metadata:{result:'done',input:'selected context only',communication:source}},backendSession());
 assert.equal(turn.user,'selected context only');assert.deepEqual(turn.communication,source);assert.equal(turn.assistant,'done');
});
