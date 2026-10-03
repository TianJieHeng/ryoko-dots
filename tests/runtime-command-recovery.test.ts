import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapSession, unlockSession } from '../src/client/api';
import {
  prepareCommand,
  recoverCommandPage,
  inspectCommand,
  sendCommand,
} from '../src/client/runtime/commands';
import {
  acknowledgeCommand,
  commandRecoveryLimit,
  controllableRuns,
  hasCommittedInput,
  mergeRecoveredCommands,
  prepareTrackedCommand,
  recordCommandReceipt,
  recoverCommands,
} from '../src/client/runtime/command-recovery';
import {
  contractVersion,
  type CommandIntent,
  type CommandReceipt,
  type PendingCommand,
  type RuntimeScope,
  type TranscriptMessage,
} from '../src/shared/runtime/contracts';

const scope: RuntimeScope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'agent',
  project: null,
  generation: 1,
};
const intent: CommandIntent = {
  operation: 'submit',
  conversationId: 'chat',
  text: 'Hello',
  sourceUrl: null,
};
function storage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}
const receipt = (
  pending: PendingCommand,
  change: Partial<CommandReceipt> = {},
): CommandReceipt => ({
  version: contractVersion,
  scope,
  operationId: pending.operationId,
  intentDigest: pending.intentDigest,
  status: 'accepted',
  missionId: null,
  runId: 'run-actual',
  durableRevision: 2,
  executionStatus: 'accepted',
  messageId: null,
  reason: 'Accepted separately from execution.',
  ...change,
});
beforeEach(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        authenticated: true,
        csrfToken: 'csrf',
        expiresAt: Date.now() + 60_000,
      }),
    ),
  );
  await bootstrapSession();
});
afterEach(() => vi.unstubAllGlobals());

describe('bounded, inspect-only command recovery', () => {
  it('keeps immutable identities for same and different uncertain drafts across reopen', async () => {
    const store = storage();
    const first = await prepareTrackedCommand(scope, intent, store);
    const other = await prepareTrackedCommand(
      scope,
      { ...intent, text: 'Different draft' },
      store,
    );
    const reopened = recoverCommands(scope, 'chat', store);
    expect(reopened.map((row) => row.pending.operationId)).toEqual([
      first.pending.operationId,
      other.pending.operationId,
    ]);
    expect(await prepareTrackedCommand(scope, intent, store)).toEqual({
      pending: first.pending,
      existing: true,
    });
    expect(recoverCommands(scope, 'chat', store)).toHaveLength(2);
  });
  it('permits an intentional identical message after confirmed admission without losing run recovery', async () => {
    const store = storage();
    const first = await prepareTrackedCommand(scope, intent, store);
    recordCommandReceipt(first.pending, receipt(first.pending), store);
    expect((await prepareTrackedCommand(scope, intent, store)).existing).toBe(
      true,
    );
    acknowledgeCommand(first.pending, store);
    const again = await prepareTrackedCommand(scope, intent, store);
    expect(again.existing).toBe(false);
    expect(again.pending.operationId).not.toBe(first.pending.operationId);
    expect(recoverCommands(scope, 'chat', store)[0].receipt?.runId).toBe(
      'run-actual',
    );
  });
  it('recovers a lost response using only the original operation GET and never replay or cancellation', async () => {
    const store = storage();
    const first = await prepareTrackedCommand(scope, intent, store);
    const fetch = vi.fn().mockRejectedValueOnce(new Error('Response lost'));
    vi.stubGlobal('fetch', fetch);
    await expect(sendCommand(first.pending)).rejects.toThrow('Response lost');
    const [reopened] = recoverCommands(scope, 'chat', store);
    fetch.mockResolvedValueOnce(Response.json(receipt(first.pending)));
    recordCommandReceipt(
      reopened.pending,
      await inspectCommand(reopened.pending),
      store,
    );
    expect(fetch.mock.calls.map((call) => call[1].method)).toEqual([
      'POST',
      'GET',
    ]);
    expect(fetch.mock.calls[1][0]).toBe(
      `/api/runtime/commands/${first.pending.operationId}`,
    );
  });
  it('migrates the previous single pending pointer without changing or resending its identity', async () => {
    const store = storage();
    const first = await prepareCommand(scope, intent, store);
    const legacyKey = `ryoko-pending:${JSON.stringify([scope, 'chat'])}`;
    store.setItem(legacyKey, JSON.stringify(first.pending));
    expect(recoverCommands(scope, 'chat', store)).toEqual([
      { pending: first.pending },
    ]);
    recordCommandReceipt(first.pending, receipt(first.pending), store);
    expect(store.getItem(legacyKey)).toBeNull();
    expect(recoverCommands(scope, 'chat', store)).toHaveLength(1);
  });
  it('never overwrites a completed run with an older, unknown, or delayed accepted receipt', async () => {
    const store = storage();
    const { pending } = await prepareTrackedCommand(scope, intent, store);
    const done = receipt(pending, {
      durableRevision: 9,
      executionStatus: 'completed',
      messageId: 'canonical',
    });
    recordCommandReceipt(pending, done, store);
    for (const late of [
      receipt(pending),
      receipt(pending, { durableRevision: 9 }),
      receipt(pending, { status: 'outcome_unknown', runId: null }),
    ]) {
      expect(recordCommandReceipt(pending, late, store)).toEqual(done);
    }
    expect(controllableRuns(recoverCommands(scope, 'chat', store))).toEqual([]);
  });
  it('isolates reconnect authority changes and rejects foreign persisted identities', async () => {
    const store = storage();
    await prepareTrackedCommand(scope, intent, store);
    expect(recoverCommands({ ...scope, generation: 2 }, 'chat', store)).toEqual(
      [],
    );
    expect(
      recoverCommands({ ...scope, owner: 'other' }, 'chat', store),
    ).toEqual([]);
    const [key, raw] = [...store.data].find(([key]) =>
      key.startsWith('ryoko-command-recovery'),
    )!;
    const rows = JSON.parse(raw);
    rows[0].pending.scope.owner = 'foreign';
    store.setItem(key, JSON.stringify(rows));
    expect(() => recoverCommands(scope, 'chat', store)).toThrow('do not match');
  });
  it('fences a delayed admission response after authentication changes', async () => {
    const store = storage();
    const { pending } = await prepareTrackedCommand(scope, intent, store);
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        path === '/api/auth/login'
          ? Promise.resolve(
              Response.json({
                authenticated: true,
                csrfToken: 'rotated',
                expiresAt: Date.now() + 60_000,
              }),
            )
          : new Promise<Response>((done) => {
              resolve = done;
            }),
      ),
    );
    const sending = sendCommand(pending);
    // Digest validation precedes HTTP; let that asynchronous preflight finish.
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    const unlock = unlockSession('different-owner');
    resolve(Response.json(receipt(pending)));
    await expect(sending).rejects.toThrow('Authentication changed');
    await unlock;
    expect(recoverCommands(scope, 'chat', store)[0].receipt).toBeUndefined();
  });
  it('bounds recovery without evicting unresolved operations, then prunes only a terminal record', async () => {
    const store = storage();
    for (let index = 0; index < commandRecoveryLimit; index++)
      await prepareTrackedCommand(
        scope,
        { ...intent, text: String(index) },
        store,
      );
    const before = [...store.data];
    await expect(prepareTrackedCommand(scope, intent, store)).rejects.toThrow(
      'queue is full',
    );
    expect([...store.data]).toEqual(before);
    const first = recoverCommands(scope, 'chat', store)[0].pending;
    recordCommandReceipt(
      first,
      receipt(first, { executionStatus: 'completed' }),
      store,
    );
    await prepareTrackedCommand(scope, intent, store);
    expect(recoverCommands(scope, 'chat', store)).toHaveLength(
      commandRecoveryLimit,
    );
    expect(
      recoverCommands(scope, 'chat', store).some(
        (row) => row.pending.operationId === first.operationId,
      ),
    ).toBe(false);
  });
  it('fails closed if the recovery record cannot be persisted before dispatch', async () => {
    const store = storage();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const limited = {
      ...store,
      setItem: (key: string, value: string) => {
        if (key.startsWith('ryoko-command-recovery'))
          throw new Error('Quota exceeded');
        store.setItem(key, value);
      },
    };
    await expect(
      prepareTrackedCommand(scope, intent, limited).then(({ pending }) =>
        sendCommand(pending),
      ),
    ).rejects.toThrow('Quota exceeded');
    expect(fetch).not.toHaveBeenCalled();
    expect((await prepareTrackedCommand(scope, intent, store)).existing).toBe(
      true,
    );
  });
});

describe('run-specific controls and canonical input identity', () => {
  it('uses actual run IDs and journal revisions in immutable cancel/steer digests', async () => {
    const store = storage();
    const first = await prepareTrackedCommand(
      scope,
      {
        operation: 'cancel',
        conversationId: 'chat',
        runId: 'run-A',
        expectedRevision: 5,
      },
      store,
    );
    const repeated = await prepareTrackedCommand(
      scope,
      first.pending.intent,
      store,
    );
    const next = await prepareTrackedCommand(
      scope,
      {
        operation: 'cancel',
        conversationId: 'chat',
        runId: 'run-A',
        expectedRevision: 6,
      },
      store,
    );
    const other = await prepareTrackedCommand(
      scope,
      {
        operation: 'steer',
        conversationId: 'chat',
        runId: 'run-B',
        expectedRevision: 5,
        text: 'Change course',
      },
      store,
    );
    expect(repeated.pending.operationId).toBe(first.pending.operationId);
    expect(next.pending.intentDigest).not.toBe(first.pending.intentDigest);
    expect(other.pending.intent).not.toHaveProperty('missionId');
    const fetch = vi.fn(async () =>
      Response.json(receipt(first.pending, { runId: 'run-B' })),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(inspectCommand(first.pending)).rejects.toThrow(
      'does not match',
    );
    expect(() =>
      recordCommandReceipt(
        first.pending,
        receipt(first.pending, { runId: 'run-B' }),
        store,
      ),
    ).toThrow('does not match');
  });
  it('never aliases mission IDs as runs or enables a terminal run through delayed control receipts', async () => {
    const store = storage();
    const first = await prepareTrackedCommand(scope, intent, store);
    recordCommandReceipt(
      first.pending,
      receipt(first.pending, { runId: null, missionId: 'mission-only' }),
      store,
    );
    expect(controllableRuns(recoverCommands(scope, 'chat', store))).toEqual([]);
    recordCommandReceipt(
      first.pending,
      receipt(first.pending, {
        executionStatus: 'completed',
        durableRevision: 6,
      }),
      store,
    );
    const control = await prepareTrackedCommand(
      scope,
      {
        operation: 'cancel',
        conversationId: 'chat',
        runId: 'run-actual',
        expectedRevision: 5,
      },
      store,
    );
    recordCommandReceipt(
      control.pending,
      receipt(control.pending, {
        durableRevision: 6,
        status: 'cancel_requested',
      }),
      store,
    );
    expect(controllableRuns(recoverCommands(scope, 'chat', store))).toEqual([]);
  });
  it('replaces accepted input only with committed canonical identity, never matching text', async () => {
    const store = storage();
    const { pending } = await prepareTrackedCommand(scope, intent, store);
    const record = { pending, receipt: receipt(pending) };
    const message: TranscriptMessage = {
      id: 'canonical',
      revision: 1,
      role: 'user',
      parts: [{ kind: 'text', text: 'Hello' }],
      internal: false,
      committed: true,
    };
    expect(hasCommittedInput(record, [message])).toBe(false);
    expect(
      hasCommittedInput(record, [
        { ...message, commandId: pending.operationId, committed: false },
      ]),
    ).toBe(false);
    expect(
      hasCommittedInput(record, [
        { ...message, commandId: pending.operationId, internal: true },
      ]),
    ).toBe(false);
    expect(
      hasCommittedInput(record, [
        { ...message, commandId: pending.operationId },
      ]),
    ).toBe(true);
    expect(
      hasCommittedInput(
        { pending, receipt: receipt(pending, { messageId: 'canonical' }) },
        [message],
      ),
    ).toBe(true);
  });
});

describe('server-owned recovery after browser storage loss', () => {
  it('loads immutable operations read-only and prevents the recovered draft from becoming a new POST', async () => {
    const producer = storage();
    const { pending } = await prepareTrackedCommand(scope, intent, producer);
    const freshBrowser = storage();
    const fetch = vi.fn(async () =>
      Response.json({
        version: contractVersion,
        scope,
        conversationId: 'chat',
        commands: [pending],
        nextCursor: 'next-page',
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const page = await recoverCommandPage(scope, 'chat');
    mergeRecoveredCommands(scope, 'chat', page.commands, freshBrowser);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      '/api/runtime/conversations/chat/commands',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(recoverCommands(scope, 'chat', freshBrowser)[0].pending).toEqual(
      pending,
    );
    expect(await prepareTrackedCommand(scope, intent, freshBrowser)).toEqual({
      pending,
      existing: true,
    });
    // Repeated overlapping server pages and changed server admission timestamps do not duplicate operations.
    mergeRecoveredCommands(
      scope,
      'chat',
      [{ ...pending, createdAt: pending.createdAt + 100 }],
      freshBrowser,
    );
    expect(recoverCommands(scope, 'chat', freshBrowser)).toHaveLength(1);
  });
  it('rejects foreign, modified, unbounded and nonadvancing recovery pages before importing', async () => {
    const { pending } = await prepareTrackedCommand(scope, intent, storage());
    const base = {
      version: contractVersion,
      scope,
      conversationId: 'chat',
      commands: [pending],
      nextCursor: null,
    };
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const page of [
      { ...base, scope: { ...scope, owner: 'foreign' } },
      { ...base, commands: [{ ...pending, intentDigest: 'f'.repeat(64) }] },
      { ...base, commands: Array(11).fill(pending) },
      { ...base, nextCursor: 'same' },
    ]) {
      fetch.mockResolvedValueOnce(Response.json(page));
      await expect(recoverCommandPage(scope, 'chat', 'same')).rejects.toThrow();
    }
    expect(fetch.mock.calls.every((call) => call[1].method === 'GET')).toBe(
      true,
    );
  });
  it('takes terminal state only from the target submit, not its completed steering command', async () => {
    const store = storage();
    const { pending } = await prepareTrackedCommand(scope, intent, store);
    recordCommandReceipt(
      pending,
      receipt(pending, { executionStatus: 'claimed', durableRevision: 5 }),
      store,
    );
    const steering = await prepareTrackedCommand(
      scope,
      {
        operation: 'steer',
        conversationId: 'chat',
        runId: 'run-actual',
        expectedRevision: 5,
        text: 'Please adjust',
      },
      store,
    );
    recordCommandReceipt(
      steering.pending,
      receipt(steering.pending, {
        executionStatus: 'completed',
        durableRevision: 7,
      }),
      store,
    );
    const [run] = controllableRuns(recoverCommands(scope, 'chat', store));
    expect(run.pending.operationId).toBe(pending.operationId);
    expect(run.receipt).toMatchObject({
      runId: 'run-actual',
      executionStatus: 'claimed',
      durableRevision: 7,
    });
  });
});
