import { expect, test } from 'vitest';
import { PassThrough } from 'node:stream';
import { ConversationRpc } from '../src/server/runtime/conversation-rpc';

test('only immutable-result availability notices reach the scoped observer and never auto-ack', () => {
  const input = new PassThrough(),
    output = new PassThrough();
  const received: unknown[] = [],
    writes: string[] = [];
  output.on('data', (bytes) => writes.push(String(bytes)));
  const rpc = new ConversationRpc(input, output, undefined, (value) =>
    received.push(value),
  );
  const notice = {
    type: 'runtime.result.available',
    session_id: 'owned-live',
    payload: { delivery_id: 'delivery', sha256: 'a'.repeat(64) },
  };
  try {
    for (const params of [
      { type: 'text.delta', payload: { text: 'private output' } },
      { type: 'error', payload: { message: 'private error' } },
      notice,
    ])
      input.write(
        JSON.stringify({ jsonrpc: '2.0', method: 'event', params }) + '\n',
      );
    expect(received).toEqual([notice]);
    expect(writes).toEqual([]);
    rpc.close();
    input.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'event', params: notice }) +
        '\n',
    );
    expect(received).toHaveLength(1);
  } finally {
    rpc.close();
  }
});

test('a rejected result notice does not acknowledge or break the owning pipe', () => {
  const input = new PassThrough(),
    output = new PassThrough();
  const rpc = new ConversationRpc(input, output, undefined, () => {
    throw new Error('invalid result');
  });
  try {
    input.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'event',
        params: { type: 'runtime.result.available' },
      }) + '\n',
    );
    expect(rpc.connected).toBe(true);
    expect(output.readableLength).toBe(0);
  } finally {
    rpc.close();
  }
});
