import { expect, test } from 'vitest';
import { WorkspaceStore } from '../src/server/workspace';
import { CommandService } from '../src/server/runtime/command-service';
import type { ConversationTransport } from '../src/server/runtime/stdio';
import fixture from './fixtures/runtime/producer-baseline.json';

function bindingFixture() {
  const workspace = new WorkspaceStore(':memory:', 'binding-recovery-owner');
  const dotId = workspace.dots()[0].id;
  workspace.runtimeBindings.bindAgent({
    dotId,
    gatewayId: 'gateway',
    principalId: 'principal',
    profileId: 'profile',
    agentId: 'primary',
    privilegeClass: 'primary',
  });
  let binds = 0;
  const producer = {
    config: { home: '/tmp/isolated-binding-recovery', identity: {} },
    connected: true,
    epoch: 1,
    call: async (method: string, params: Record<string, unknown>) => {
      if (method === 'runtime.conversation.bind') {
        binds++;
        return {
          conversation: {
            conversation_id: params.conversation_id,
            agent_id: 'primary',
          },
          session_id: `live-${producer.epoch}-${params.conversation_id}`,
          readiness: 'ready',
        };
      }
      if (method === 'runtime.capabilities')
        return {
          ...fixture.fixtures.unconfiguredCapabilities.response.result,
          provider: { durable_execution: true, execution_owner: 'hermes' },
          operations: [
            { operation: 'submit', accepts_commands: true, executes: true },
          ],
        };
      if (method === 'runtime.snapshot')
        return {
          ...fixture.fixtures.idleSnapshot.response.result,
          session_id: String(params.session_id).replace(/^live-\d+-/, ''),
        };
      throw new Error(`Unexpected producer call: ${method}`);
    },
  };
  const service = new CommandService(
    workspace,
    ':memory:',
    producer as unknown as ConversationTransport,
    async (id, auth, access) => {
      auth();
      return workspace.runtimeBindings.resolveConversation(id, access);
    },
    (scope, auth, access) => {
      auth();
      workspace.runtimeBindings.assertCurrent(scope, access);
    },
  );
  const add = (id: string) =>
    workspace.runtimeBindings.bindConversation({
      conversationId: id,
      dotId,
      spaceId: null,
      durableSessionId: id,
      liveSessionId: null,
      liveGeneration: 0,
    });
  return {
    workspace,
    producer,
    service,
    add,
    binds: () => binds,
    async close() {
      await service.stop();
      workspace.close();
    },
  };
}

test('a transport reconnected between recovery ticks can replace a full stale binding cache', async () => {
  const f = bindingFixture();
  try {
    for (let index = 0; index < 256; index++) {
      const id = `conversation-${index}`;
      f.add(id);
      expect(await f.service.connect(id, () => {})).toBe(true);
    }
    expect(f.binds()).toBe(256);
    // A receipt read may restart the transport before recovery sees disconnected.
    // Its new epoch, rather than a sampled disconnected flag, invalidates the cache.
    f.producer.epoch++;
    expect(f.producer.connected).toBe(true);
    expect(await f.service.connect('conversation-0', () => {})).toBe(true);
    expect(f.binds()).toBe(257);
    expect(
      f.workspace.runtimeBindings.resolveConversation('conversation-0')
        .liveGeneration,
    ).toBe(2);
    expect(await f.service.connect('conversation-0', () => {})).toBe(true);
    expect(f.binds()).toBe(257);
  } finally {
    await f.close();
  }
});

test('pending binds reserve capacity so concurrent connections cannot exceed the live bound', async () => {
  const f = bindingFixture();
  try {
    for (let index = 0; index < 257; index++) {
      const id = `conversation-${index}`;
      f.add(id);
      if (index < 254) await f.service.connect(id, () => {});
    }
    const results = await Promise.allSettled(
      [254, 255, 256].map((index) =>
        f.service.connect(`conversation-${index}`, () => {}),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(2);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.reason.status).toBe(503);
    expect(f.binds()).toBe(256);
  } finally {
    await f.close();
  }
});
