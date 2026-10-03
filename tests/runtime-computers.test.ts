import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contractVersion } from '../src/shared/runtime/contracts';
import {
  assertFreshScreen,
  computerStatusSchema,
  type RuntimeComputerStatus,
} from '../src/shared/runtime/computers';
import {
  discoverComputerStatus,
  inspectComputerOperation,
  loadComputerStatus,
  pendingComputerOperations,
  runComputerOperation,
} from '../src/client/runtime/computers';
import { createHash } from 'node:crypto';
import { api } from '../src/client/api';
vi.mock('../src/client/api', () => ({ api: vi.fn() }));
const now = 100000;
const scope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'agent',
  project: null,
  generation: 2,
};
const status: RuntimeComputerStatus = {
  version: contractVersion,
  scope,
  executorId: 'executor',
  revision: 3,
  refreshedAt: now,
  configured: true,
  state: 'running',
  permissions: { enabled: true, browser: true, files: true, shell: true },
  control: {
    holder: 'bot',
    requested: false,
    transitioning: false,
    resumeSnapshotRequired: false,
  },
  audit: [],
};
const screen = {
  version: contractVersion,
  scope,
  executorId: 'executor',
  snapshotRevision: 3,
  base64: 'iVBORw0KGgo=',
  width: 800,
  height: 600,
  url: 'about:blank',
  capturedAt: now,
};
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.mocked(api).mockReset();
});
afterEach(() => vi.unstubAllGlobals());
function receipt(body: Record<string, unknown>) {
  return {
    version: contractVersion,
    scope,
    executorId: 'executor',
    revision: 3,
    operationId: body.operationId,
    intentDigest: body.intentDigest,
    effectId: null,
    state: 'unknown',
    output: null,
  };
}
describe('runtime computer broker', () => {
  it('rejects expired, future and mismatched executor revisions', () => {
    expect(assertFreshScreen(screen, status, now)).toEqual(screen);
    expect(() => assertFreshScreen(screen, status, now + 15001)).toThrow();
    expect(() => assertFreshScreen(screen, status, now - 1001)).toThrow();
    expect(() =>
      assertFreshScreen({ ...screen, snapshotRevision: 2 }, status, now),
    ).toThrow();
    expect(() =>
      assertFreshScreen({ ...screen, executorId: 'other' }, status, now),
    ).toThrow();
  });
  it('rejects revoked authority and unknown fields', async () => {
    const revoked = {
      ...status,
      permissions: { ...status.permissions, browser: false },
    };
    expect(() => assertFreshScreen(screen, revoked, now)).toThrow();
    expect(() =>
      assertFreshScreen(
        { ...screen, scope: { ...scope, generation: 1 } },
        status,
        now,
      ),
    ).toThrow();
    expect(
      computerStatusSchema.safeParse({ ...status, token: 'secret' }).success,
    ).toBe(false);
    await expect(
      runComputerOperation(revoked, 'navigate', { url: 'https://example.com' }),
    ).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
  });
  it('keeps a lost admission outcome unknown', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('disconnected'));
    const result = await runComputerOperation(status, 'exec', {
      command: 'pwd',
    });
    expect(result.state).toBe('unknown');
    expect(result.effectId).toBeNull();
    expect([...values.values()]).toContain(result.operationId);
    expect(pendingComputerOperations(status)).toEqual([
      expect.objectContaining({
        operationId: result.operationId,
        intentDigest: result.intentDigest,
      }),
    ]);
    expect(JSON.stringify([...values])).not.toContain('pwd');
  });
  it('inspects repeats without replaying and rejects mismatched receipts', async () => {
    let response: ReturnType<typeof receipt>;
    vi.mocked(api).mockImplementation(async (_path, _method, body) => {
      response ??= receipt(body as Record<string, unknown>);
      return response as never;
    });
    const first = await runComputerOperation(status, 'exec', {
      command: 'pwd',
    });
    expect(
      (await runComputerOperation(status, 'exec', { command: 'pwd' }))
        .operationId,
    ).toBe(first.operationId);
    expect(vi.mocked(api).mock.calls[0][1]).toBe('POST');
    expect(vi.mocked(api).mock.calls[1]).toEqual([
      `/runtime/computer-operations/${first.operationId}`,
    ]);
    vi.mocked(api).mockResolvedValueOnce({ ...first, executorId: 'other' });
    await expect(
      runComputerOperation(status, 'exec', { command: 'pwd' }),
    ).rejects.toThrow('does not match');
  });
  it('rejects invalid input before dispatch and routes takeover separately', async () => {
    await expect(
      runComputerOperation(status, 'navigate', { url: 'javascript:alert(1)' }),
    ).rejects.toThrow();
    await expect(
      runComputerOperation(status, 'permissions', { owner: true }),
    ).rejects.toThrow();
    await expect(
      runComputerOperation(status, 'files_read', { path: '../secret' }),
    ).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
    vi.mocked(api).mockImplementation(
      async (_path, _method, body) =>
        receipt(body as Record<string, unknown>) as never,
    );
    await runComputerOperation(status, 'take', {});
    expect(vi.mocked(api).mock.calls[0][0]).toBe(
      '/runtime/computers/executor/control',
    );
  });
});

describe('BE08 owner computer adaptation', () => {
  it('discovers the server-owned executor from a Dot selector before exact executor refreshes', async () => {
    const native = { ...status, executorId: 'computer:dot-one' };
    vi.mocked(api).mockResolvedValueOnce(native);
    const discovered = await discoverComputerStatus('dot-one', scope);
    expect(discovered.executorId).toBe('computer:dot-one');
    expect(api).toHaveBeenLastCalledWith(
      '/runtime/computers?dotId=dot-one',
      'GET',
      undefined,
      undefined,
    );
    vi.mocked(api).mockResolvedValueOnce(native);
    await expect(
      loadComputerStatus(discovered.executorId, scope),
    ).resolves.toEqual(native);
    expect(api).toHaveBeenLastCalledWith(
      '/runtime/computers/computer%3Adot-one',
      'GET',
      undefined,
      undefined,
    );
    vi.mocked(api).mockResolvedValueOnce({
      ...native,
      scope: { ...scope, generation: 1 },
    });
    await expect(discoverComputerStatus('dot-one', scope)).rejects.toThrow(
      'another binding',
    );
    vi.mocked(api).mockResolvedValueOnce({
      ...native,
      executorId: 'substituted',
    });
    await expect(
      loadComputerStatus(discovered.executorId, scope),
    ).rejects.toThrow('another binding or executor');
  });

  it('loads only the exact scoped executor route and rejects substituted identities', async () => {
    vi.mocked(api).mockResolvedValueOnce(status);
    await expect(loadComputerStatus('executor', scope)).resolves.toEqual(
      status,
    );
    expect(api).toHaveBeenLastCalledWith(
      '/runtime/computers/executor',
      'GET',
      undefined,
      undefined,
    );
    vi.mocked(api).mockResolvedValueOnce({ ...status, executorId: 'other' });
    await expect(loadComputerStatus('executor', scope)).rejects.toThrow(
      'another binding or executor',
    );
    vi.mocked(api).mockResolvedValueOnce({
      ...status,
      scope: { ...scope, generation: 1 },
    });
    await expect(loadComputerStatus('executor', scope)).rejects.toThrow(
      'another binding or executor',
    );
  });

  it('does not turn an unqualified configured endpoint into usable computer authority', async () => {
    const unavailable = {
      ...status,
      configured: false,
      state: 'unavailable' as const,
    };
    vi.mocked(api).mockResolvedValueOnce(unavailable);
    await expect(loadComputerStatus('executor', scope)).resolves.toEqual(
      unavailable,
    );
    vi.mocked(api).mockClear();
    for (const action of [
      'start',
      'take',
      'emergency_stop',
      'snapshot',
      'exec',
    ]) {
      await expect(
        runComputerOperation(
          unavailable,
          action,
          action === 'exec' ? { command: 'pwd' } : {},
        ),
      ).rejects.toThrow();
    }
    expect(api).not.toHaveBeenCalled();
  });

  it('fences browser resume until an actual snapshot, while retaining human takeover', async () => {
    const stale = {
      ...status,
      control: { ...status.control, resumeSnapshotRequired: true },
    };
    await expect(
      runComputerOperation(stale, 'navigate', { url: 'https://example.com' }),
    ).rejects.toThrow('does not currently allow');
    expect(api).not.toHaveBeenCalled();
    vi.mocked(api).mockImplementation(
      async (_path, _method, body) =>
        ({
          ...receipt(body as Record<string, unknown>),
          state: 'reconciled',
        }) as never,
    );
    await expect(
      runComputerOperation(stale, 'snapshot'),
    ).resolves.toMatchObject({ state: 'reconciled', effectId: null });
    await expect(
      runComputerOperation(
        { ...stale, control: { ...stale.control, holder: 'human' } },
        'human_key',
        { key: 'Enter' },
      ),
    ).resolves.toMatchObject({ state: 'reconciled' });
  });

  it('rejects a producer effect identity on an owner operation without losing recovery', async () => {
    vi.mocked(api).mockImplementation(
      async (_path, _method, body) =>
        ({
          ...receipt(body as Record<string, unknown>),
          state: 'reconciled',
          effectId: 'invented-effect',
        }) as never,
    );
    await expect(
      runComputerOperation(status, 'exec', { command: 'pwd' }),
    ).rejects.toThrow('does not match');
    expect(pendingComputerOperations(status)).toHaveLength(1);
  });

  it('retains unknown operations across status revisions and recovers after revocation by GET only', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('lost response'));
    const admitted = await runComputerOperation(status, 'exec', {
      command: 'secret-command',
    });
    const changed = {
      ...status,
      revision: 9,
      configured: false,
      state: 'unavailable' as const,
      permissions: { ...status.permissions, enabled: false },
    };
    const [pending] = pendingComputerOperations(changed);
    expect(pending.operationId).toBe(admitted.operationId);
    expect(JSON.stringify([...values])).not.toContain('secret-command');
    vi.mocked(api).mockRejectedValueOnce(new Error('temporarily missing'));
    await expect(
      inspectComputerOperation(changed, pending),
    ).resolves.toMatchObject({ state: 'unknown' });
    expect(pendingComputerOperations(changed)).toHaveLength(1);
    vi.mocked(api).mockResolvedValueOnce({
      ...admitted,
      state: 'reconciled',
      output: { text: 'finished' },
    });
    await expect(
      inspectComputerOperation(changed, pending),
    ).resolves.toMatchObject({ state: 'reconciled' });
    expect(pendingComputerOperations(changed)).toEqual([]);
    expect(vi.mocked(api).mock.calls.slice(1)).toEqual([
      [`/runtime/computer-operations/${admitted.operationId}`],
      [`/runtime/computer-operations/${admitted.operationId}`],
    ]);
  });

  it('blocks changed-intent admissions while unknown but preserves out-of-band safety controls', async () => {
    vi.mocked(api).mockRejectedValue(new Error('no acknowledgment'));
    await runComputerOperation(status, 'exec', { command: 'pwd' });
    await expect(
      runComputerOperation({ ...status, revision: 4 }, 'exec', {
        command: 'ls',
      }),
    ).rejects.toThrow('unresolved');
    expect(api).toHaveBeenCalledTimes(1);
    await runComputerOperation(
      { ...status, state: 'unavailable' },
      'emergency_stop',
    );
    expect(vi.mocked(api).mock.calls[1][0]).toBe(
      '/runtime/computers/executor/control',
    );
    expect(pendingComputerOperations(status)).toHaveLength(2);
  });

  it('does not inspect an operation in another binding or executor', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('lost response'));
    await runComputerOperation(status, 'exec', { command: 'pwd' });
    const [pending] = pendingComputerOperations(status);
    vi.mocked(api).mockClear();
    await expect(
      inspectComputerOperation({ ...status, executorId: 'other' }, pending),
    ).rejects.toThrow('another binding');
    await expect(
      inspectComputerOperation(
        { ...status, scope: { ...scope, generation: 3 } },
        pending,
      ),
    ).rejects.toThrow('another binding');
    expect(api).not.toHaveBeenCalled();
    expect(
      pendingComputerOperations({
        ...status,
        scope: { ...scope, generation: 3 },
      }),
    ).toEqual([]);
  });

  it('preserves canonical validated intent digests and metadata-only deduplication', async () => {
    vi.mocked(api).mockImplementation(
      async (_path, _method, body) =>
        receipt(body as Record<string, unknown>) as never,
    );
    const effect = await runComputerOperation(status, 'exec', {
      command: ' pwd ',
    });
    const expected = createHash('sha256')
      .update(
        '{"action":"exec","executorId":"executor","input":{"command":"pwd","timeoutMs":30000},"revision":3,"scope":{"agent":"agent","gateway":"gateway","generation":2,"owner":"owner","project":null}}',
      )
      .digest('hex');
    expect(effect.intentDigest).toBe(expected);
    vi.mocked(api).mockResolvedValueOnce(effect);
    await expect(
      runComputerOperation(status, 'exec', {
        timeoutMs: 30000,
        command: 'pwd',
      }),
    ).resolves.toEqual(effect);
    expect(vi.mocked(api).mock.calls[1]).toEqual([
      `/runtime/computer-operations/${effect.operationId}`,
    ]);
  });

  it('fails closed when recovery storage is unavailable before dispatch', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage unavailable');
      },
    });
    await expect(
      runComputerOperation(status, 'exec', { command: 'pwd' }),
    ).rejects.toThrow('storage unavailable');
    expect(api).not.toHaveBeenCalled();
  });
});
