import { expect, it, vi } from 'vitest';
import { HermesAdapter } from '../src/server/hub/hermes';
import type { SelfHostedPlatform } from '../src/server/self-hosted-platform';
it('connects identity and native tools before admitting an API-originated Hermes command', async () => {
  const order: string[] = [];
  const guard = vi.fn();
  const platform = {
    nativeComputers: {},
    commands: {
      connect: async () => {
        order.push('session');
      },
      admit: async () => {
        order.push('submit');
        return { executionStatus: 'claimed', runId: 'native-run' };
      },
    },
    identities: {
      connected: async () => {
        order.push('identity');
      },
    },
    nativePages: {
      connect: async () => {
        order.push('native-tools');
      },
    },
    workspace: {
      runtimeBindings: {
        resolveConversation: () => ({ authorityRevision: 1 }),
      },
    },
  } as unknown as SelfHostedPlatform;
  const result = await new HermesAdapter(platform, 'ryoko').submit(
    'thread',
    'op',
    'hello',
    guard,
  );
  expect(order).toEqual(['session', 'identity', 'native-tools', 'submit']);
  expect(result.state).toBe('running');
});
