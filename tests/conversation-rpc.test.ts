import { identityMatches } from '../src/server/runtime/stdio';
import { expect, test } from 'vitest';
import { PassThrough } from 'node:stream';
import { ConversationRpc } from '../src/server/runtime/conversation-rpc';
import { ConversationLedger } from '../src/server/runtime/conversation-ledger';
test('conversation pipe discards private notifications, validates responses and redacts producer errors', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const rpc = new ConversationRpc(input, output, {
    bytes: 2000,
    pending: 2,
    timeoutMs: 20,
  });
  let response: unknown = {
    schema_version: 1,
    found: false,
    idempotency_key: 'id',
    operation: null,
    conversation: null,
  };
  let fail = false;
  output.on('data', (bytes) => {
    const request = JSON.parse(bytes.toString());
    input.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'event',
        params: { secret: 'PRIVATE RAW TOKEN' },
      }) + '\n',
    );
    const frame =
      JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        ...(fail
          ? { error: { code: 4030, message: 'PRIVATE RAW TOKEN' } }
          : { result: response }),
      }) + '\n';
    input.write(frame.slice(0, 13));
    input.write(frame.slice(13));
  });
  expect(
    await rpc.call('runtime.conversation.operation.get', {
      schema_version: 1,
      idempotency_key: 'id',
    }),
  ).toEqual(response);
  response = { schema_version: 2 };
  await expect(
    rpc.call('runtime.conversation.operation.get', {
      schema_version: 1,
      idempotency_key: 'id',
    }),
  ).rejects.toMatchObject({ kind: 'unknown' });
  fail = true;
  await expect(
    rpc.call('runtime.conversation.operation.get', {
      schema_version: 1,
      idempotency_key: 'id',
    }),
  ).rejects.toMatchObject({
    kind: 'rejected',
    message: 'Runtime rejected this operation.',
  });
  await expect(
    rpc.call('runtime.conversation.create', {
      schema_version: 1,
      idempotency_key: 'id',
      principal_id: 'forged',
    }),
  ).rejects.toThrow('schema');
  rpc.close();
});
test('conversation pipe bounds pending calls, timeout, malformed and oversized frames', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const rpc = new ConversationRpc(input, output, {
    bytes: 2000,
    pending: 1,
    timeoutMs: 20,
  });
  const pending = rpc.call('runtime.conversation.list', { schema_version: 1 });
  await expect(
    rpc.call('runtime.conversation.list', { schema_version: 1 }),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(pending).rejects.toMatchObject({ kind: 'unknown' });
  const malformed = rpc.call('runtime.conversation.list', {
    schema_version: 1,
  });
  input.write('not-json\n');
  await expect(malformed).rejects.toMatchObject({ kind: 'unknown' });
  expect(rpc.connected).toBe(false);
  const other = new ConversationRpc(new PassThrough(), new PassThrough());
  other.close();
});
test('durable ingress binds operation ID to exact intent and shares page producer identity', () => {
  const ledger = new ConversationLedger(':memory:', 'owner');
  const input = {
    operationId: 'first',
    dotId: 'dot',
    binding: 'verified',
    kind: 'create' as const,
    intent: '{"title":"one"}',
    producerKey: 'first',
  };
  try {
    expect(ledger.admit(input, 'page').fresh).toBe(true);
    expect(ledger.admit(input, 'page').fresh).toBe(false);
    expect(() => ledger.admit({ ...input, intent: 'changed' }, 'page')).toThrow(
      'conflict',
    );
    const second = ledger.admit(
      {
        ...input,
        operationId: 'second',
        producerKey: 'second',
        intent: '{"title":"two"}',
      },
      'page',
    );
    expect(second.operation.producerKey).toBe('first');
    expect(ledger.pageKeyIntent('first')).toBe(input.intent);
    expect(ledger.operation('absent')).toBeUndefined();
  } finally {
    ledger.close();
  }
});

test('identity proof compares exact field values independently of JSON property order', () => {
  const expected = {
    principal_id: 'owner',
    profile_id: 'profile',
    agent_id: 'agent',
    policy_digest: 'a'.repeat(64),
    config_digest: 'b'.repeat(64),
  };
  const shuffled = {
    config_digest: expected.config_digest,
    policy_digest: expected.policy_digest,
    agent_id: 'agent',
    profile_id: 'profile',
    principal_id: 'owner',
  };
  expect(identityMatches(expected, shuffled)).toBe(true);
  expect(
    identityMatches(expected, { ...shuffled, profile_id: 'foreign' }),
  ).toBe(false);
});
