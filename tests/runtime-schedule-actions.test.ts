import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ api: vi.fn(), generation: 1 }));
vi.mock('../src/client/api', () => ({
  api: mock.api,
  getAuthenticationGeneration: () => mock.generation,
}));
import {
  inspectScheduleOperation,
  performScheduleOperation,
  readPendingScheduleOperation,
  schedulePath,
} from '../src/client/runtime/schedule-actions';
import { contractVersion } from '../src/shared/runtime/contracts';
import {
  scheduleConfig,
  scheduleScope,
} from './fixtures/runtime/schedule-evidence';
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  mock.generation = 1;
  mock.api.mockReset();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
function receipt(status = 'accepted') {
  const original = readPendingScheduleOperation(scheduleScope, 'chat')!;
  return {
    version: contractVersion,
    scope: scheduleScope,
    operationId: original.operationId,
    intentDigest: original.intentDigest,
    status,
    reason: status,
  };
}
describe('immutable schedule action recovery', () => {
  it('persists paused creation intent and sends the exact revision and authority generation', async () => {
    mock.api.mockImplementation(async () => {
      expect(readPendingScheduleOperation(scheduleScope, 'chat')).toBeDefined();
      return receipt();
    });
    await performScheduleOperation(
      scheduleScope,
      'chat',
      'create',
      scheduleConfig,
      0,
    );
    expect(mock.api).toHaveBeenCalledWith(
      '/runtime/conversations/chat/schedules',
      'POST',
      expect.objectContaining({
        action: 'create',
        expectedRevision: 0,
        expectedGeneration: 1,
        payload: scheduleConfig,
      }),
    );
    expect(mock.api.mock.calls[0][2]).not.toHaveProperty('path');
    expect(readPendingScheduleOperation(scheduleScope, 'chat')).toBeUndefined();
  });
  it('retains full original intent after a lost response; changed prompt cannot resend', async () => {
    mock.api.mockRejectedValue(new Error('lost response'));
    await expect(
      performScheduleOperation(
        scheduleScope,
        'chat',
        'create',
        scheduleConfig,
        0,
      ),
    ).rejects.toThrow('lost');
    const original = readPendingScheduleOperation(scheduleScope, 'chat')!;
    expect(original.intent.payload).toEqual(scheduleConfig);
    await expect(
      performScheduleOperation(
        scheduleScope,
        'chat',
        'create',
        { ...scheduleConfig, prompt: 'Different task' },
        0,
      ),
    ).rejects.toThrow('unresolved');
    expect(mock.api).toHaveBeenCalledTimes(1);
    mock.api.mockImplementation(async () => receipt());
    await inspectScheduleOperation(scheduleScope, 'chat');
    expect(mock.api).toHaveBeenLastCalledWith(
      `/runtime/operations/${original.operationId}`,
      'GET',
      undefined,
    );
  });
  it('repeated run-now and resume inspect the exact original operation after acceptance', async () => {
    mock.api.mockImplementation(async () => receipt());
    await performScheduleOperation(
      scheduleScope,
      'chat',
      'run_now',
      {},
      5,
      'schedule',
    );
    const first = mock.api.mock.calls[0][2];
    await performScheduleOperation(
      scheduleScope,
      'chat',
      'run_now',
      {},
      5,
      'schedule',
    );
    expect(mock.api).toHaveBeenLastCalledWith(
      `/runtime/operations/${first.operationId}`,
      'GET',
      undefined,
    );
    expect(
      mock.api.mock.calls.filter((call) => call[1] === 'POST'),
    ).toHaveLength(1);
  });
  it('keeps unknown receipts inspect-only and preserves original revision across reload recovery', async () => {
    mock.api.mockImplementation(async () => receipt('outcome_unknown'));
    await performScheduleOperation(
      scheduleScope,
      'chat',
      'resume',
      {},
      5,
      'schedule',
    );
    const original = readPendingScheduleOperation(scheduleScope, 'chat')!;
    await expect(
      performScheduleOperation(
        scheduleScope,
        'chat',
        'resume',
        {},
        6,
        'schedule',
      ),
    ).rejects.toThrow('unresolved');
    await inspectScheduleOperation(scheduleScope, 'chat');
    expect(
      readPendingScheduleOperation(scheduleScope, 'chat')?.intent
        .expectedRevision,
    ).toBe(5);
    expect(mock.api).toHaveBeenLastCalledWith(
      `/runtime/operations/${original.operationId}`,
      'GET',
      undefined,
    );
  });
  it('cannot inspect a missing operation or a different conversation/authority', async () => {
    await expect(
      inspectScheduleOperation(scheduleScope, 'chat'),
    ).rejects.toThrow('No original');
    expect(mock.api).not.toHaveBeenCalled();
    mock.api.mockRejectedValue(new Error('lost'));
    await expect(
      performScheduleOperation(
        scheduleScope,
        'chat',
        'pause',
        {},
        5,
        'schedule',
      ),
    ).rejects.toThrow();
    await expect(
      inspectScheduleOperation(scheduleScope, 'other'),
    ).rejects.toThrow('No original');
    await expect(
      inspectScheduleOperation({ ...scheduleScope, generation: 2 }, 'chat'),
    ).rejects.toThrow('No original');
    expect(mock.api).toHaveBeenCalledTimes(1);
  });
  it('rejects wrong receipt identity and auth changes without clearing pending recovery', async () => {
    mock.api.mockImplementation(async () => ({
      ...receipt(),
      scope: { ...scheduleScope, project: 'other' },
    }));
    await expect(
      performScheduleOperation(
        scheduleScope,
        'chat',
        'cancel',
        {},
        5,
        'schedule',
      ),
    ).rejects.toThrow('does not match');
    expect(readPendingScheduleOperation(scheduleScope, 'chat')).toBeDefined();
    mock.api.mockImplementation(async () => {
      mock.generation++;
      return receipt();
    });
    await expect(
      inspectScheduleOperation(scheduleScope, 'chat'),
    ).rejects.toThrow('does not match');
    expect(readPendingScheduleOperation(scheduleScope, 'chat')).toBeDefined();
  });
  it('blocks dispatch when storage fails and never accepts unscoped or malformed intent', async () => {
    expect(() => schedulePath('..')).toThrow();
    await expect(
      performScheduleOperation(
        scheduleScope,
        'chat',
        'edit',
        scheduleConfig,
        1,
      ),
    ).rejects.toThrow('target');
    await expect(
      performScheduleOperation(
        scheduleScope,
        'chat',
        'create',
        { ...scheduleConfig, threadId: 'other' },
        0,
      ),
    ).rejects.toThrow('another conversation');
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage blocked');
      },
    });
    await expect(
      performScheduleOperation(
        scheduleScope,
        'chat',
        'pause',
        {},
        5,
        'schedule',
      ),
    ).rejects.toThrow('storage blocked');
    expect(mock.api).not.toHaveBeenCalled();
  });
  it('clears a rejected operation but does not replay the same rejected intent', async () => {
    mock.api.mockImplementation(async () => receipt('rejected'));
    await performScheduleOperation(
      scheduleScope,
      'chat',
      'pause',
      {},
      5,
      'schedule',
    );
    expect(readPendingScheduleOperation(scheduleScope, 'chat')).toBeUndefined();
    await performScheduleOperation(
      scheduleScope,
      'chat',
      'pause',
      {},
      5,
      'schedule',
    );
    expect(mock.api.mock.calls[1][1]).toBe('GET');
  });
});
