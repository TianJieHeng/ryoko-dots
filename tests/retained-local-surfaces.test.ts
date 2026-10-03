import { expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/server/store';
import { OwnerAuth } from '../src/server/owner-auth';
import { WorkspaceStore } from '../src/server/workspace';
import { SelfHostedPlatform } from '../src/server/self-hosted-platform';
import { createSelfHostedApp } from '../src/server/self-hosted-app';
const origin = 'http://127.0.0.1:4310';
const token = 'synthetic-owner-token-at-least-24';
async function fixture(foreignOwner = false) {
  const root = mkdtempSync(join(tmpdir(), 'retained-local-'));
  const database = join(root, 'db');
  const workspace = new WorkspaceStore(database, 'owner');
  const store = new Store(database);
  const auth = new OwnerAuth(
    foreignOwner ? join(root, 'foreign-auth') : database,
    { ownerId: foreignOwner ? 'foreign' : 'owner', ownerToken: token, origin },
  );
  const platform = new SelfHostedPlatform(workspace, database);
  const start = vi
    .spyOn(platform, 'start')
    .mockRejectedValue(new Error('No execution permitted in archive fixture'));
  const app = createSelfHostedApp({ store, auth, platform });
  const login = await app.request(origin + '/api/auth/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ ownerToken: token }),
  });
  const value = await login.json();
  const headers = {
    origin,
    cookie: login.headers.get('set-cookie')!.split(';')[0],
    'x-csrf-token': value.csrfToken,
    'content-type': 'application/json',
  };
  return {
    workspace,
    store,
    platform,
    start,
    app,
    request: (path: string, method = 'GET', body?: unknown) =>
      app.request(origin + '/api' + path, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    async close() {
      await platform.stop();
      auth.close();
      workspace.close();
      store.close();
      rmSync(root, { recursive: true });
    },
  };
}
it('creates only bounded owner metadata without granting a Dot or starting any runtime', async () => {
  const f = await fixture();
  try {
    const dot = f.workspace.dots()[0],
      before = [...dot.spaceIds];
    const response = await f.request('/spaces', 'POST', {
      name: ' New local Space ',
      description: 'metadata only',
    });
    expect(response.status).toBe(201);
    const space = await response.json();
    expect(space.name).toBe('New local Space');
    expect(f.workspace.dot(dot.id)?.spaceIds).toEqual(before);
    expect(f.workspace.canAccessSpace(dot.id, space.id)).toBe(false);
    for (const body of [
      { name: ' ' },
      { name: 'x', projectId: 'forged' },
      { name: 'x', ownerId: 'forged' },
    ])
      expect((await f.request('/spaces', 'POST', body)).status).toBe(400);
    expect(f.start).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});
it('returns local captured bytes and historical task detail without admitting or replaying work', async () => {
  const f = await fixture();
  try {
    f.workspace.bindThread('legacy-thread', f.workspace.dots()[0].id, 'legacy');
    f.workspace.saveCapture('legacy-thread', {
      text: 'historical',
      sources: [],
      sample: false,
    });
    const task = f.store.createTask('fixture historic task');
    expect(
      (await (await f.request('/conversations/legacy-thread/capture')).json())
        .text,
    ).toBe('historical');
    expect((await f.request('/conversations/not-owned/capture')).status).toBe(
      403,
    );
    const detail = await (await f.request(`/tasks/${task.id}`)).json();
    expect(detail.task.id).toBe(task.id);
    expect(detail.events).toHaveLength(1);
    expect(detail.readOnly).toBe(true);
    expect(detail.executable).toBe(false);
    expect(
      (await f.request(`/tasks/${task.id}/actions`, 'POST', { action: 'run' }))
        .status,
    ).toBe(501);
    expect(f.store.task(task.id)?.status).toBe('queued');
    expect(f.start).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});
it('rejects an authenticated different owner at all retained local seams', async () => {
  const f = await fixture(true);
  try {
    for (const [path, method, body] of [
      ['/spaces', 'POST', { name: 'foreign' }],
      ['/tasks/any', 'GET', undefined],
      ['/conversations/any/capture', 'GET', undefined],
    ] as const)
      expect((await f.request(path, method, body)).status).toBe(403);
    expect(f.start).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});
it('returns explicit no-legacy-capture for an owned canonical conversation and denies revoked bindings', async () => {
  const f = await fixture();
  try {
    const dot = f.workspace.dots()[0];
    f.workspace.runtimeBindings.bindAgent({
      dotId: dot.id,
      gatewayId: 'gateway',
      principalId: 'owner',
      profileId: 'profile',
      agentId: 'agent',
      privilegeClass: 'primary',
    });
    f.workspace.runtimeBindings.bindConversation({
      conversationId: 'canonical',
      dotId: dot.id,
      spaceId: null,
      durableSessionId: 'durable',
      liveSessionId: 'live',
      liveGeneration: 1,
    });
    f.platform.ledger.remember(
      {
        id: 'canonical',
        dotId: dot.id,
        title: 'Canonical',
        createdAt: 1,
        lineageId: 'canonical',
        revision: 1,
        archived: false,
        origin: 'web',
      },
      null,
      null,
    );
    expect(
      await (await f.request('/conversations/canonical/capture')).json(),
    ).toBeNull();
    f.workspace.runtimeBindings.revoke('conversation', 'canonical', 1);
    expect((await f.request('/conversations/canonical/capture')).status).toBe(
      403,
    );
    expect(f.start).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});
