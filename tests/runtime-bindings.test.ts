import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceStore } from '../src/server/workspace.js';
function bind(ws: WorkspaceStore) {
  const dot = ws.dots()[0];
  const agent = {
    dotId: dot.id,
    gatewayId: 'gateway',
    principalId: 'verified-owner',
    profileId: 'profile',
    agentId: 'stable-primary',
    privilegeClass: 'primary' as const,
  };
  ws.runtimeBindings.bindAgent(agent);
  ws.runtimeBindings.bindProject({
    spaceId: dot.spaceId,
    gatewayId: 'gateway',
    profileId: 'profile',
    projectId: 'project',
  });
  const conversation = {
    conversationId: 'canonical-conversation',
    dotId: dot.id,
    spaceId: dot.spaceId,
    durableSessionId: 'durable-lineage',
    liveSessionId: 'live-a',
    liveGeneration: 1,
  };
  return {
    dot,
    agent,
    conversation,
    scope: ws.runtimeBindings.bindConversation(conversation),
  };
}
it('persists unique verified identity mappings while keeping live reconnect epochs separate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dots-bindings-'));
  const path = join(dir, 'db');
  try {
    const ws = new WorkspaceStore(path, 'owner');
    const { conversation, scope } = bind(ws);
    ws.close();
    const restarted = new WorkspaceStore(path, 'owner');
    expect(
      restarted.runtimeBindings.resolveConversation(
        conversation.conversationId,
      ),
    ).toEqual(scope);
    const rebound = restarted.runtimeBindings.bindConversation(
      { ...conversation, liveSessionId: 'live-b', liveGeneration: 2 },
      1,
    );
    expect(rebound.authorityRevision).toBe(scope.authorityRevision);
    expect(rebound.durableSessionId).toBe(scope.durableSessionId);
    expect(() =>
      restarted.runtimeBindings.assertCurrent(scope, 'subscribe'),
    ).toThrow('Stale');
    expect(() =>
      restarted.runtimeBindings.bindConversation(
        {
          ...conversation,
          liveSessionId: 'foreign',
          durableSessionId: 'foreign',
          liveGeneration: 3,
        },
        2,
      ),
    ).toThrow('authority');
    restarted.close();
    expect(() => new WorkspaceStore(path, 'other-owner')).toThrow(
      'different owner',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('does not let renames promote a specialist, client fields assert authority, or IDs rebind', () => {
  const ws = new WorkspaceStore(':memory:', 'owner');
  try {
    const { dot, agent, scope } = bind(ws);
    const renamed = ws.updateDot(dot.id, { ...dot, name: 'Specialist' });
    expect(ws.runtimeBindings.resolveDot(dot.id).privilegeClass).toBe(
      'primary',
    );
    expect(() => ws.runtimeBindings.assertCurrent(scope)).toThrow('Stale');
    expect(() =>
      ws.runtimeBindings.bindAgent(
        { ...agent, privilegeClass: 'specialist' },
        1,
      ),
    ).toThrow('immutable');
    const other = ws.createDot(renamed.spaceId, 'Primary', 'help', true, true);
    expect(() =>
      ws.runtimeBindings.bindAgent({
        ...agent,
        dotId: other.id,
        agentId: 'other-primary',
      }),
    ).toThrow();
    expect(() => ws.runtimeBindings.resolveDot('foreign')).toThrow();
    expect(() =>
      ws.runtimeBindings.bindAgent({
        ...agent,
        ownerId: 'foreign',
      } as typeof agent),
    ).toThrow();
  } finally {
    ws.close();
  }
});
it('rechecks revoked grants for reads, subscriptions and downloads including A→B→A changes', () => {
  const ws = new WorkspaceStore(':memory:', 'owner');
  try {
    const { dot, conversation, scope } = bind(ws);
    const other = ws.createSpace('Other', '');
    ws.updateDot(dot.id, { ...dot, spaceId: other.id, spaceIds: [other.id] });
    for (const access of ['read', 'write', 'subscribe', 'download'] as const)
      expect(() =>
        ws.runtimeBindings.resolveConversation(
          conversation.conversationId,
          access,
        ),
      ).toThrow('Space access');
    ws.updateDot(dot.id, dot);
    expect(() => ws.runtimeBindings.assertCurrent(scope)).toThrow('Stale');
    const current = ws.runtimeBindings.resolveConversation(
      conversation.conversationId,
    );
    ws.runtimeBindings.revoke('project', dot.spaceId, 1);
    expect(() => ws.runtimeBindings.assertCurrent(current, 'download')).toThrow(
      'Space access',
    );
  } finally {
    ws.close();
  }
});
it('honors archive and deletion tombstones with revision-checked writes', () => {
  const ws = new WorkspaceStore(':memory:', 'owner');
  try {
    const { conversation } = bind(ws);
    const id = conversation.conversationId;
    ws.runtimeBindings.archiveConversation(id, true, 1);
    expect(ws.runtimeBindings.resolveConversation(id).archived).toBe(true);
    for (const access of ['write', 'subscribe', 'download'] as const)
      expect(() =>
        ws.runtimeBindings.resolveConversation(id, access),
      ).toThrow();
    expect(() => ws.runtimeBindings.archiveConversation(id, false, 1)).toThrow(
      'revision',
    );
    ws.runtimeBindings.revoke('conversation', id, 2);
    expect(() => ws.runtimeBindings.resolveConversation(id)).toThrow();
    expect(() =>
      ws.runtimeBindings.bindConversation(
        { ...conversation, liveGeneration: 3 },
        3,
      ),
    ).toThrow('revived');
  } finally {
    ws.close();
  }
});
