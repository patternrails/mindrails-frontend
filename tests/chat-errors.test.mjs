import test from 'node:test';
import assert from 'node:assert/strict';
import { BackendClientError } from '../src/lib/backend-client.ts';
import { chatError, archivedChatError, chatErrorKind } from '../src/lib/chat-errors.ts';

test('stream failures preserve server diagnostics and correlation without inventing HTTP status', () => {
  const error = chatError(new BackendClientError('remote', 'Secure connection failed', {
    serverCode: 'UNAVAILABLE', reason: 'TLS_HANDSHAKE_FAILED',
    detail: 'SSLHandshakeException: Remote host terminated the handshake', requestId: 'request-1',
  }), 'fallback');
  assert.equal(error.code, 'UNAVAILABLE');
  assert.equal(error.status, null);
  assert.equal(error.requestId, 'request-1');
  assert.equal(chatErrorKind(error, 'failed'), 'tls');
  assert.equal(chatErrorKind(error, 'unconfirmed'), 'unconfirmed');
  assert.deepEqual(archivedChatError(error, 'request-1'), error);
});

test('older archived errors retain their message and unknown reasons have a generic presentation', () => {
  const error = archivedChatError({ code: 'INTERNAL_ERROR', message: 'Session stream failed' }, 'old-request');
  assert.equal(error.message, 'Session stream failed');
  assert.equal(chatErrorKind(error, 'failed'), 'generic');
  assert.equal(chatErrorKind({ ...error, reason: 'FUTURE_REASON' }, 'failed'), 'generic');
  assert.equal(archivedChatError({ code: 500 }, 'bad'), null);
});
