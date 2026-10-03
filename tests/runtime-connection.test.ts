import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import {
  connectionState,
  RequestGeneration,
} from '../src/client/runtime/connection';
import {
  contractVersion,
  featureNames,
  setupSchema,
} from '../src/shared/runtime/contracts';
const ready = { state: 'ready', reason: '' };
const setup = () =>
  setupSchema.parse({
    version: contractVersion,
    runtimeOwner: 'ryoko',
    qualified: true,
    scope: {
      owner: 'owner',
      gateway: 'g',
      agent: 'a',
      project: null,
      generation: 1,
    },
    controlPlane: ready,
    binding: ready,
    compatibility: ready,
    features: Object.fromEntries(featureNames.map((name) => [name, ready])),
  });
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
describe('connection and authentication fencing', () => {
  it('invalidates A→B→A and reconnect responses', () => {
    const fence = new RequestGeneration();
    const a = fence.advance();
    const b = fence.advance();
    const nextA = fence.advance();
    expect(fence.current(a)).toBe(false);
    expect(fence.current(b)).toBe(false);
    expect(fence.current(nextA)).toBe(true);
    fence.advance();
    expect(fence.current(nextA)).toBe(false);
  });
  it('keeps disconnected, degraded, unsupported and denied distinct', () => {
    for (const state of [
      'disconnected',
      'degraded',
      'unsupported',
      'permission_denied',
    ] as const)
      expect(
        connectionState({ ...setup(), binding: { state, reason: '' } }),
      ).toBe(state);
    expect(connectionState({ ...setup(), qualified: false })).toBe(
      'unsupported',
    );
  });
  it('does not let an old response restore protected state after authentication changes', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    let resolve!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        path === '/api/auth/login'
          ? Promise.resolve(
              Response.json({
                authenticated: true,
                csrfToken: 'new-session-csrf',
                expiresAt: Date.now() + 60_000,
              }),
            )
          : new Promise<Response>((done) => {
              resolve = done;
            }),
      ),
    );
    const { api, unlockSession, subscribeAuthentication } =
      await import('../src/client/api');
    const listener = vi.fn();
    const unsubscribe = subscribeAuthentication(listener);
    const request = api('/state');
    const unlock = unlockSession('new-owner');
    resolve(
      new Response(JSON.stringify({ private: 'old-owner' }), { status: 200 }),
    );
    await expect(request).rejects.toThrow('Authentication changed');
    await unlock;
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
it('expires protected authentication once without an unauthorized-response loop', async () => {
  vi.stubGlobal('sessionStorage', {
    getItem: () => null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) =>
      path === '/api/auth/session'
        ? Response.json({
            authenticated: true,
            csrfToken: 'expired-session-csrf',
            expiresAt: Date.now() + 60_000,
          })
        : Response.json({ error: 'Expired' }, { status: 401 }),
    ),
  );
  const { api, bootstrapSession, subscribeAuthentication, authHeaders } =
    await import('../src/client/api');
  await bootstrapSession();
  const listener = vi.fn();
  const remove = subscribeAuthentication(listener);
  await expect(api('/runtime/setup')).rejects.toMatchObject({ status: 401 });
  await expect(api('/runtime/setup')).rejects.toMatchObject({ status: 401 });
  expect(listener).toHaveBeenCalledOnce();
  expect(authHeaders()).toEqual({});
  remove();
});
