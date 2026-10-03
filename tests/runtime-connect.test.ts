import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bootstrapSession } from '../src/client/api';
import { connectConversation } from '../src/client/runtime/connection';
import {
  canUse,
  contractVersion,
  featureNames,
  setupSchema,
} from '../src/shared/runtime/contracts';
const ready = { state: 'ready', reason: '' };
const setup = setupSchema.parse({
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
beforeEach(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        authenticated: true,
        csrfToken: 'connect-csrf',
        expiresAt: Date.now() + 60_000,
      }),
    ),
  );
  await bootstrapSession();
});
afterEach(() => vi.unstubAllGlobals());
it('connects only through the explicit authenticated, CSRF-protected conversation POST', async () => {
  const fetch = vi.fn(async () => Response.json(setup));
  vi.stubGlobal('fetch', fetch);
  expect(await connectConversation('conversation / one', setup.scope!)).toEqual(
    setup,
  );
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    '/api/runtime/conversations/conversation%20%2F%20one/connect',
    expect.objectContaining({
      method: 'POST',
      body: '{}',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'connect-csrf',
      },
    }),
  );
});
it('rejects another agent, owner, or authority generation without silently reconnecting it', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  for (const change of [
    { agent: 'other' },
    { owner: 'other' },
    { generation: 2 },
  ]) {
    fetch.mockResolvedValueOnce(
      Response.json({ ...setup, scope: { ...setup.scope, ...change } }),
    );
    await expect(
      connectConversation('conversation', setup.scope!),
    ).rejects.toThrow('another binding');
  }
  expect(fetch).toHaveBeenCalledTimes(3);
});
it('keeps provider-unavailable, degraded and permission-denied execution honest after storage connects', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  for (const state of [
    'disconnected',
    'degraded',
    'permission_denied',
    'unsupported',
  ] as const) {
    fetch.mockResolvedValueOnce(
      Response.json({
        ...setup,
        features: {
          ...setup.features,
          commands: { state, reason: 'Execution is unavailable' },
        },
      }),
    );
    const result = await connectConversation('conversation', setup.scope!);
    expect(canUse(result, 'conversations')).toBe(true);
    expect(canUse(result, 'commands')).toBe(false);
    expect(result.features.commands.state).toBe(state);
  }
});
it('does not retry or fall back to binding through a read when connection fails', async () => {
  const fetch = vi.fn().mockRejectedValue(new Error('Disconnected'));
  vi.stubGlobal('fetch', fetch);
  await expect(
    connectConversation('conversation', setup.scope!),
  ).rejects.toThrow('Disconnected');
  expect(fetch).toHaveBeenCalledTimes(1);
});
