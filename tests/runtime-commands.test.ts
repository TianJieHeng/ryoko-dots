import { createHash } from 'node:crypto';
import { bootstrapSession } from '../src/client/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  inspectCommand,
  prepareCommand,
  sendCommand,
} from '../src/client/runtime/commands';
import {
  contractVersion,
  type CommandIntent,
  type PendingCommand,
  type RuntimeScope,
} from '../src/shared/runtime/contracts';

const scope: RuntimeScope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'ryoko',
  project: null,
  generation: 1,
};
const intent: CommandIntent = {
  operation: 'submit',
  conversationId: 'conversation',
  text: 'Hello',
  sourceUrl: null,
};
function storage() {
  const records = new Map<string, string>();
  return {
    records,
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    },
  };
}
function receipt(pending: PendingCommand) {
  return {
    version: contractVersion,
    scope: pending.scope,
    operationId: pending.operationId,
    intentDigest: pending.intentDigest,
    status: 'accepted',
    missionId: null,
    runId: null,
    durableRevision: 0,
    executionStatus: null,
    messageId: null,
    reason: '',
  };
}
beforeEach(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        authenticated: true,
        csrfToken: 'command-session-csrf',
        expiresAt: Date.now() + 60_000,
      }),
    ),
  );
  await bootstrapSession();
});
afterEach(() => vi.unstubAllGlobals());

describe('durable command admission', () => {
  it('reuses the operation ID for the same canonical validated intent', async () => {
    const store = storage();
    const first = await prepareCommand(scope, intent, store);
    const repeated = await prepareCommand(
      scope,
      {
        sourceUrl: null,
        text: ' Hello ',
        conversationId: 'conversation',
        operation: 'submit',
      },
      store,
    );
    expect(first.existing).toBe(false);
    expect(repeated.existing).toBe(true);
    expect(repeated.pending).toEqual(first.pending);
    expect(first.pending.intentDigest).toBe(
      createHash('sha256')
        .update(
          '{"conversationId":"conversation","operation":"submit","sourceUrl":null,"text":"Hello"}',
        )
        .digest('hex'),
    );
    expect(store.records.size).toBe(1);
  });

  it('preserves unresolved originals when the user edits text', async () => {
    const store = storage();
    const original = await prepareCommand(scope, intent, store);
    const edited = await prepareCommand(
      scope,
      { ...intent, text: 'Changed' },
      store,
    );
    expect(edited.pending.operationId).not.toBe(original.pending.operationId);
    expect(edited.pending.intentDigest).not.toBe(original.pending.intentDigest);
    expect(store.records.size).toBe(2);
    expect((await prepareCommand(scope, intent, store)).pending).toEqual(
      original.pending,
    );
  });

  it('fails closed before send when persistence is unavailable', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const store = {
      getItem: () => null,
      setItem: () => {
        throw new Error('Quota exceeded');
      },
    };
    await expect(
      prepareCommand(scope, intent, store).then(({ pending }) =>
        sendCommand(pending),
      ),
    ).rejects.toThrow('Quota exceeded');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('isolates every scope field and each conversation', async () => {
    const store = storage();
    const first = await prepareCommand(scope, intent, store);
    for (const field of [
      'owner',
      'gateway',
      'agent',
      'project',
      'generation',
    ] as const) {
      const changed = {
        ...scope,
        [field]: field === 'generation' ? 2 : 'other',
      };
      const result = await prepareCommand(changed, intent, store);
      expect(result.existing).toBe(false);
      expect(result.pending.operationId).not.toBe(first.pending.operationId);
    }
    const differentConversation = await prepareCommand(
      scope,
      { ...intent, conversationId: 'other' },
      store,
    );
    expect(differentConversation.pending.operationId).not.toBe(
      first.pending.operationId,
    );
    expect(store.records.size).toBe(7);
  });

  it('sends the bounded same-origin envelope and only GETs during inspection', async () => {
    const store = storage();
    const { pending } = await prepareCommand(scope, intent, store);
    const fetch = vi
      .fn()
      .mockImplementation(async () => Response.json(receipt(pending)));
    vi.stubGlobal('fetch', fetch);
    expect(await sendCommand(pending)).toEqual(receipt(pending));
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/runtime/conversations/conversation/commands',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'command-session-csrf',
        },
        body: JSON.stringify({
          operationId: pending.operationId,
          intentDigest: pending.intentDigest,
          intent: pending.intent,
          expectedGeneration: 1,
        }),
      }),
    );
    await inspectCommand(pending);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `/api/runtime/commands/${pending.operationId}`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(store.records.size).toBe(1);
  });

  it('rejects receipts with mismatched binding, identity or digest', async () => {
    const { pending } = await prepareCommand(scope, intent, storage());
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const override of [
      { scope: { ...scope, generation: 2 } },
      { operationId: crypto.randomUUID() },
      { intentDigest: 'a'.repeat(64) },
    ]) {
      fetch.mockResolvedValueOnce(
        Response.json({ ...receipt(pending), ...override }),
      );
      await expect(inspectCommand(pending)).rejects.toThrow('does not match');
    }
  });

  it('retains unknown outcomes without retry, cancellation or fallback', async () => {
    const store = storage();
    const { pending } = await prepareCommand(scope, intent, store);
    const fetch = vi.fn().mockRejectedValue(new TypeError('Network error'));
    vi.stubGlobal('fetch', fetch);
    await expect(sendCommand(pending)).rejects.toThrow('Network error');
    const existing = await prepareCommand(scope, intent, store);
    expect(existing.existing).toBe(true);
    expect(existing.pending.operationId).toBe(pending.operationId);
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValueOnce(
      Response.json({ ...receipt(pending), status: 'outcome_unknown' }),
    );
    expect((await inspectCommand(pending)).status).toBe('outcome_unknown');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.records.size).toBe(1);
  });
});
