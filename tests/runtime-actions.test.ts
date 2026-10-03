import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('../src/client/api', () => ({ api: request }));
import { runtimeAction } from '../src/client/runtime/actions';
import { contractVersion } from '../src/shared/runtime/contracts';
const scope = {
  owner: 'o',
  gateway: 'g',
  agent: 'a',
  project: null,
  generation: 2,
};
let saved: Map<string, string>;
beforeEach(() => {
  saved = new Map();
  request.mockReset();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());
it('inspect-only never dispatches a missing operation', async () => {
  await expect(
    runtimeAction(
      scope,
      '/runtime/reviews/r/decision',
      'approval.resolve',
      { choice: 'once' },
      1,
      true,
    ),
  ).rejects.toThrow('No persisted');
  expect(request).not.toHaveBeenCalled();
});
it('unknown response retains identity and next action inspects rather than dispatching', async () => {
  request.mockRejectedValue(new Error('lost response'));
  await expect(
    runtimeAction(
      scope,
      '/runtime/reviews/r/decision',
      'approval.resolve',
      { choice: 'once' },
      1,
    ),
  ).rejects.toThrow();
  expect(saved.size).toBe(1);
  request.mockClear();
  await expect(
    runtimeAction(
      scope,
      '/runtime/reviews/r/decision',
      'approval.resolve',
      { choice: 'once' },
      1,
      true,
    ),
  ).rejects.toThrow();
  expect(request.mock.calls[0][0]).toMatch(/^\/runtime\/operations\//);
  expect(request.mock.calls[0][1]).toBe('GET');
});
it('accepts only exact receipt bindings and independent delivery action', async () => {
  request.mockImplementation(async (_path, _method, body) => ({
    version: contractVersion,
    scope,
    operationId: body.operationId,
    intentDigest: body.intentDigest,
    status: 'accepted',
    reason: '',
  }));
  await expect(
    runtimeAction(
      scope,
      '/runtime/missions/m/actions',
      'retry_delivery',
      {},
      9,
    ),
  ).resolves.toMatchObject({ status: 'accepted' });
  expect(request.mock.calls[0][2].action).toBe('retry_delivery');
  request.mockImplementation(async (_path, _method, body) => ({
    version: contractVersion,
    scope: { ...scope, generation: 3 },
    operationId: body.operationId,
    intentDigest: body.intentDigest,
    status: 'accepted',
    reason: '',
  }));
  await expect(
    runtimeAction(scope, '/runtime/missions/other/actions', 'resume', {}, 2),
  ).rejects.toThrow('does not match');
});
