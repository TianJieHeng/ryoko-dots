import { expect, test } from 'vitest';
import { PassThrough } from 'node:stream';
import { ConversationRpc } from '../src/server/runtime/conversation-rpc';
import type { DotsApprovalRequest } from '../src/shared/runtime/producer/wire.generated';
const approval = (): DotsApprovalRequest => ({
  session_id: 'live',
  authority: {
    principal_id: 'principal',
    profile_id: 'profile',
    agent_id: 'agent',
    runtime_session_id: 'durable',
    run_id: 'run',
    policy_digest: 'a'.repeat(64),
    generation: 2,
  },
  approval_id: 'approval',
  approval_digest: 'b'.repeat(64),
  action_digest: 'c'.repeat(64),
  expires_at: Date.now() / 1000 + 60,
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const frame = (
  input: PassThrough,
  id: string | number,
  method: string,
  params: unknown,
) => input.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
function channels() {
  const input = new PassThrough(),
    output = new PassThrough();
  const writes: Record<string, unknown>[] = [];
  output.on('data', (data) => writes.push(JSON.parse(String(data))));
  return { input, output, writes };
}
test('typed native callback returns only validated exact response IDs and preserves result notices', async () => {
  const { input, output, writes } = channels();
  const notices: unknown[] = [],
    calls: unknown[] = [];
  const rpc = new ConversationRpc(
    input,
    output,
    undefined,
    (notice) => notices.push(notice),
    async (method, params) => {
      calls.push([method, params]);
      const value = params as DotsApprovalRequest;
      return {
        approval_id: value.approval_id,
        approval_digest: value.approval_digest,
        choice: 'once',
      };
    },
  );
  try {
    const params = approval();
    frame(input, 7, 'dots.approval', params);
    input.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'event',
        params: { type: 'runtime.result.available' },
      }) + '\n',
    );
    await tick();
    expect(calls).toHaveLength(1);
    expect(writes).toEqual([
      {
        jsonrpc: '2.0',
        id: 7,
        result: {
          approval_id: 'approval',
          approval_digest: 'b'.repeat(64),
          choice: 'once',
        },
      },
    ]);
    expect(notices).toHaveLength(1);
    frame(input, 'unsupported', 'arbitrary.shell', { command: 'unsafe' });
    await tick();
    expect(calls).toHaveLength(1);
    expect(writes[1]).toMatchObject({
      id: 'unsupported',
      error: { code: -32601 },
    });
  } finally {
    rpc.close();
  }
});
test('malformed, expired and unvalidated callback results never become native success', async () => {
  const { input, output, writes } = channels();
  let calls = 0;
  const rpc = new ConversationRpc(
    input,
    output,
    undefined,
    undefined,
    async () => {
      calls++;
      return {
        approval_id: 'approval',
        approval_digest: 'wrong',
        choice: 'once',
      };
    },
  );
  try {
    frame(input, 'extra', 'dots.approval', { ...approval(), unexpected: true });
    frame(input, 'expired', 'dots.approval', { ...approval(), expires_at: 1 });
    frame(input, 'invalid-result', 'dots.approval', approval());
    await tick();
    expect(calls).toBe(1);
    expect(writes).toHaveLength(3);
    expect(writes.every((reply) => !!reply.error && !reply.result)).toBe(true);
  } finally {
    rpc.close();
  }
});
test('duplicate native IDs close the pipe and abort pending human wait', async () => {
  const { input, output, writes } = channels();
  let signal: AbortSignal | undefined;
  const rpc = new ConversationRpc(
    input,
    output,
    undefined,
    undefined,
    async (_method, _params, current) => {
      signal = current;
      return new Promise((_, reject) =>
        current.addEventListener('abort', () => reject(new Error('closed')), {
          once: true,
        }),
      );
    },
  );
  frame(input, 'repeat', 'dots.approval', approval());
  expect(signal?.aborted).toBe(false);
  frame(input, 'repeat', 'dots.approval', approval());
  await tick();
  expect(rpc.connected).toBe(false);
  expect(signal?.aborted).toBe(true);
  expect(writes).toHaveLength(0);
  rpc.close();
});
test('native pending callbacks have an independent hard eight-request bound', async () => {
  const { input, output, writes } = channels();
  let calls = 0;
  const rpc = new ConversationRpc(
    input,
    output,
    undefined,
    undefined,
    async (_method, _params, signal) => {
      calls++;
      return new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(new Error('closed')), {
          once: true,
        }),
      );
    },
  );
  try {
    for (let n = 0; n < 9; n++)
      frame(input, `request-${n}`, 'dots.approval', approval());
    await tick();
    expect(calls).toBe(8);
    expect(writes).toEqual([
      {
        jsonrpc: '2.0',
        id: 'request-8',
        error: {
          code: -32601,
          message: 'Unsupported client method; no approval granted.',
        },
      },
    ]);
  } finally {
    rpc.close();
    await tick();
  }
});

test('producer request.cancel validates exact session and method, aborts its waiter and emits no late decision', async () => {
  const { input, output, writes } = channels();
  let signal: AbortSignal | undefined;
  const rpc = new ConversationRpc(
    input,
    output,
    undefined,
    undefined,
    async (_method, _params, current) => {
      signal = current;
      return new Promise((_, reject) =>
        current.addEventListener(
          'abort',
          () => reject(new Error('withdrawn')),
          { once: true },
        ),
      );
    },
  );
  const cancel = (session: string, method: string, extra = false) =>
    input.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'event',
        params: {
          type: 'request.cancel',
          session_id: session,
          payload: {
            id: 'cancel-me',
            method,
            reason: 'disconnected',
            ...(extra ? { unexpected: true } : {}),
          },
        },
      }) + '\n',
    );
  try {
    frame(input, 'cancel-me', 'dots.approval', approval());
    cancel('foreign', 'dots.approval');
    cancel('live', 'dots.effect.dispatch');
    cancel('live', 'dots.approval', true);
    expect(signal?.aborted).toBe(false);
    cancel('live', 'dots.approval');
    await tick();
    expect(signal?.aborted).toBe(true);
    expect(writes).toHaveLength(0);
    expect(rpc.connected).toBe(true);
  } finally {
    rpc.close();
  }
});

test('transport drain waits for the actual callback after close aborts it', async () => {
  const { input, output } = channels();
  let release!: () => void;
  let aborted = false;
  const rpc = new ConversationRpc(
    input,
    output,
    undefined,
    undefined,
    async (_method, _params, signal) => {
      signal.addEventListener('abort', () => {
        aborted = true;
      });
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return {
        approval_id: 'approval',
        approval_digest: 'b'.repeat(64),
        choice: 'deny',
      };
    },
  );
  frame(input, 'slow-callback', 'dots.approval', approval());
  rpc.close();
  expect(aborted).toBe(true);
  let drained = false;
  const drain = rpc.drain().then(() => {
    drained = true;
  });
  await tick();
  expect(drained).toBe(false);
  release();
  await drain;
  expect(drained).toBe(true);
});
