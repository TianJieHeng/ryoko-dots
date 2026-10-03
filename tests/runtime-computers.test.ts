import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contractVersion } from '../src/shared/runtime/contracts';
import {
  assertFreshScreen,
  computerStatusSchema,
  type RuntimeComputerStatus,
} from '../src/shared/runtime/computers';
import { runComputerOperation } from '../src/client/runtime/computers';
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
    expect([...values.values()]).toEqual([result.operationId]);
    expect([...values.keys()].join()).not.toContain('pwd');
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
