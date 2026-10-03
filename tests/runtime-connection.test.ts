import { describe, expect, it, vi, afterEach } from 'vitest';
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
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    const { api, setToken, subscribeAuthentication } =
      await import('../src/client/api');
    const listener = vi.fn();
    const unsubscribe = subscribeAuthentication(listener);
    const request = api('/state');
    setToken('new-owner');
    resolve(
      new Response(JSON.stringify({ private: 'old-owner' }), { status: 200 }),
    );
    await expect(request).rejects.toThrow('Authentication changed');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
