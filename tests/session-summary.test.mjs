import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionToolCounts, parseTokenUsage } from '../src/lib/session-summary.ts';
import { newSessionStream, parseStreamEvent, updateSessionStream } from '../src/lib/session-stream.ts';
import { archivedTurn } from '../src/lib/session-history.ts';
import { parseSessionAttachments } from '../src/lib/backend-assets.ts';
import { agentId } from './fixtures/backend-agent.mjs';
import { backendSession } from './fixtures/backend-session.mjs';
import { toolDisplayName } from '../src/lib/tool-presentation.ts';

test('MCP calls use a compact display name while builtin tools keep their names', () => {
  const first = 'mcp_b004792e28e243028cc3dabd6b5632b9_record_exercise_cd06da0b';
  const second = 'mcp_00000000000000000000000000000001_search_1234abcd';
  assert.equal(toolDisplayName(first), 'mcp_execution');
  for (const name of ['mcp_connection_status', 'mcp_execution', 'bash', 'activate_skill', 'mcp_invalid_name', '']) {
    assert.equal(toolDisplayName(name), name);
  }
  assert.deepEqual(sessionToolCounts([{ executedTools: [first, second, first, 'bash'] }]),
    [{ name: 'bash', count: 1 }, { name: 'mcp_execution', count: 3 }]);
  const stream = updateSessionStream(newSessionStream(), event('tool.started', { round: 1, toolCallId: 'one', toolName: first, arguments: {} }));
  assert.deepEqual(sessionToolCounts([{ stream }]), [{ name: 'mcp_execution', count: 1 }]);
  assert.equal(stream.tools[0].name, first);
});

const event = (type, data) => parseStreamEvent(JSON.stringify({ version: 1, type, data,
  agentId: agentId(), sessionId: agentId(10), requestId: agentId(500), seq: 1, timestamp: '2026-10-21T00:00:00Z' }));
test('tool counts count calls once, exclude argument fragments, and retain calls after cancellation', () => {
  let stream = newSessionStream();
  for (const [type, data] of [
    ['tool.arguments.delta', { round: 1, toolCallId: 'pending', toolName: 'write', text: '{' }],
    ['tool.started', { round: 1, toolCallId: 'one', toolName: 'read', arguments: {} }],
    ['tool.completed', { round: 1, toolCallId: 'one', toolName: 'read', result: 'ok', durationMs: 2 }],
    ['tool.started', { round: 2, toolCallId: 'two', toolName: 'read', arguments: {} }],
    ['run.cancelled', { state: 'CANCELLED' }],
  ]) stream = updateSessionStream(stream, event(type, data));
  assert.deepEqual(sessionToolCounts([{ stream }, { executedTools: ['bash', 'read', 'bash'] }]),
    [{ name: 'bash', count: 2 }, { name: 'read', count: 3 }]);
});

test('sync and streamed history restore the same executed calls and token totals', () => {
  const record = { id: agentId(900), requestId: agentId(901), status: 'CANCELLED',
    startedAt: '2026-10-21T00:00:00Z', finishedAt: '2026-10-21T00:00:01Z',
    metadata: { usage: { inputTokens: 200, outputTokens: 30, totalTokens: 230 } }, messages: [
      { type: 'AI', toolExecutionRequests: [{ id: 'one', name: 'write', arguments: '{}' }, { id: 'pending', name: 'bash', arguments: '{}' }] },
      { type: 'TOOL_EXECUTION_RESULT', id: 'one', toolName: 'write', text: 'failed', isError: true },
    ] };
  for (const transport of ['SYNC', 'STREAM']) {
    const turn = archivedTurn({ ...record, transport }, backendSession());
    assert.deepEqual(sessionToolCounts([turn]), [{ name: 'write', count: 1 }]);
    assert.deepEqual(turn.usage, record.metadata.usage);
  }
  assert.deepEqual(archivedTurn({ ...record, transport: 'SYNC', metadata: {} }, backendSession()).usage,
    { inputTokens: null, outputTokens: null, totalTokens: null });
});

test('stream completion carries aggregated usage and missing counts remain unknown', () => {
  const usage = { inputTokens: 150, outputTokens: 24, totalTokens: 174 };
  assert.deepEqual(updateSessionStream(newSessionStream(), event('run.completed', { answer: 'done', finalMessageId: agentId(600), usage })).usage, usage);
  assert.equal(parseTokenUsage(null), null);
  assert.deepEqual(parseTokenUsage({ inputTokens: 0 }), { inputTokens: 0, outputTokens: null, totalTokens: null });
  for (const value of [{ totalTokens: -1 }, { totalTokens: '4' }, { totalTokens: 1.5 }, []]) assert.throws(() => parseTokenUsage(value), { code: 'invalid-response' });
});

test('attachment parsing preserves attachment order instead of sorting by asset creation date', () => {
  const file = { id: agentId(700), assetId: agentId(701), extractionId: agentId(702), number: 1, filename: 'old-asset-new-attachment.pdf', bytes: 80, createdAt: '2026-10-01T00:00:00Z' };
  const files = [file, { ...file, id: agentId(703), createdAt: '2026-10-20T00:00:00Z' }];
  assert.deepEqual(parseSessionAttachments(files), files);
  for (const value of [[file, file], [{ ...file, bytes: -1 }], [{ ...file, id: 'bad' }], {}]) assert.throws(() => parseSessionAttachments(value), { code: 'invalid-response' });
});
