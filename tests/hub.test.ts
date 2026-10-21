import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DotHub } from '../src/server/hub/service';
import { ApiCredentials } from '../src/server/hub/credentials';
import { hubRoutes } from '../src/server/hub/routes';
import { OwnerAuth } from '../src/server/owner-auth';
import type { RuntimeAdapter } from '../src/server/hub/adapter';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dots-hub-')),
    path = join(root, 'state.sqlite');
  const hub = new DotHub(path),
    creds = new ApiCredentials(path),
    auth = new OwnerAuth(path, {
      ownerId: 'owner',
      ownerToken: 'test-password-only',
      origin: 'http://localhost',
    });
  const adapter: RuntimeAdapter = {
    capabilities: {
      chat: true,
      cancel: true,
      children: false,
      computer: false,
      approvals: false,
    },
    readiness: () => 'ready',
    create: vi.fn(async () => randomUUID()),
    list: async () => ({ items: [], nextCursor: null }),
    messages: async () => ({ items: [], nextCursor: null }),
    submit: vi.fn(async () => ({
      nativeId: 'native-run',
      state: 'running' as const,
    })),
    inspect: vi.fn(async () => ({
      nativeId: 'native-run',
      state: 'completed' as const,
    })),
    cancel: async () => ({ nativeId: 'native-run', state: 'cancelled' }),
    children: async () => [],
    stop: async () => {},
  };
  hub.register(
    { id: 'a', name: 'Ryoko', kind: 'hermes', runtime: 'a' },
    adapter,
    true,
  );
  hub.register(
    { id: 'b', name: 'Other', kind: 'hermes', runtime: 'b' },
    adapter,
  );
  const app = new Hono();
  app.route('/api/v1', hubRoutes(hub, creds, auth));
  cleanup.push(async () => {
    await hub.stop();
    creds.close();
    auth.close();
    rmSync(root, { recursive: true, force: true });
  });
  return { hub, creds, adapter, app, path };
}
describe('versioned scoped multi-runtime API', () => {
  it('isolates dot reads/writes, credential administration, revocation and origin', async () => {
    const { app, creds } = fixture();
    const c = creds.create('reader', ['a'], false, 1);
    const headers = {
      Authorization: 'Bearer ' + c.token,
      'Content-Type': 'application/json',
    };
    expect(
      (await app.request('http://localhost/api/v1/dots', { headers })).status,
    ).toBe(200);
    const list = await (
      await app.request('http://localhost/api/v1/dots', { headers })
    ).json();
    expect(list.items.map((d: { id: string }) => d.id)).toEqual(['a']);
    expect(
      (await app.request('http://localhost/api/v1/dots/b', { headers })).status,
    ).toBe(403);
    expect(
      (
        await app.request('http://localhost/api/v1/dots/a/conversations', {
          method: 'POST',
          headers,
          body: JSON.stringify({ operationId: randomUUID(), title: 'No' }),
        })
      ).status,
    ).toBe(403);
    expect(
      (await app.request('http://localhost/api/v1/credentials', { headers }))
        .status,
    ).toBe(403);
    expect(
      (await app.request('http://evil.test/api/v1/dots', { headers })).status,
    ).toBe(403);
    creds.revoke(c.id);
    expect(
      (await app.request('http://localhost/api/v1/dots', { headers })).status,
    ).toBe(401);
  });
  it('deduplicates concurrent messages and rejects conflicting operation reuse', async () => {
    const { hub, adapter } = fixture();
    const t = await hub.create('a', randomUUID(), 'Thread', () => {});
    const id = randomUUID();
    let resolve!: (v: { nativeId: string; state: 'running' }) => void;
    vi.mocked(adapter.submit).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const first = hub.submit(t.id, id, 'hello', () => {});
    const duplicate = await hub.submit(t.id, id, 'hello', () => {});
    expect(duplicate.state).toBe('accepted');
    expect(adapter.submit).toHaveBeenCalledTimes(1);
    resolve({ nativeId: 'n', state: 'running' });
    await first;
    await expect(hub.submit(t.id, id, 'different', () => {})).rejects.toThrow(
      'different input',
    );
    expect((await hub.inspect(id, () => {})).state).toBe('completed');
    const events = hub.events(id, 0);
    expect(events.items.map((e) => e.state)).toEqual([
      'accepted',
      'running',
      'completed',
    ]);
    expect(hub.events(id, events.nextCursor).items).toEqual([]);
  });
  it('never replays an uncertain dispatch and rejects cross-conversation run access', async () => {
    const { hub, adapter, app, creds } = fixture();
    const t = await hub.create('a', randomUUID(), 'Thread', () => {});
    vi.mocked(adapter.submit).mockRejectedValue(Error('lost response'));
    vi.mocked(adapter.inspect).mockResolvedValue({
      nativeId: null,
      state: 'unknown',
    });
    const id = randomUUID();
    expect((await hub.submit(t.id, id, 'hello', () => {})).state).toBe(
      'unknown',
    );
    await hub.submit(t.id, id, 'hello', () => {});
    expect(adapter.submit).toHaveBeenCalledTimes(1);
    await expect(
      hub.submit(t.id, randomUUID(), 'again', () => {}),
    ).rejects.toThrow('uncertain');
    const c = creds.create('other', ['b'], true, 1);
    expect(
      (
        await app.request(`http://localhost/api/v1/runs/${id}`, {
          headers: { Authorization: 'Bearer ' + c.token },
        })
      ).status,
    ).toBe(403);
  });
  it('pages more than 100 Dots and keeps default separate from runtime identity', () => {
    const { hub, adapter } = fixture();
    for (let i = 0; i < 120; i++)
      hub.register(
        {
          id: 'dot' + String(i).padStart(3, '0'),
          name: 'Dot',
          kind: 'hermes',
          runtime: 'runtime' + i,
        },
        adapter,
      );
    let cursor: string | undefined;
    const ids: string[] = [];
    do {
      const r = hub.dots(cursor);
      ids.push(...r.items.map((d) => d.id));
      cursor = r.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(ids).size).toBe(122);
    hub.update('b', { isDefault: true });
    expect(hub.dot('a').isDefault).toBe(false);
    expect(hub.dot('b').isDefault).toBe(true);
    expect(hub.dot('a').runtime).toBe('a');
  });
  it('preserves archived history and refuses to archive unfinished work', async () => {
    const { hub } = fixture();
    const t = await hub.create('b', randomUUID(), 'Thread', () => {});
    const r = await hub.submit(t.id, randomUUID(), 'hello', () => {});
    expect(() => hub.update('b', { archived: true })).toThrow('active');
    await hub.inspect(r.id, () => {});
    hub.update('b', { archived: true });
    expect(hub.thread(t.id).nativeId).toBeTruthy();
    await expect(
      hub.submit(t.id, randomUUID(), 'no', () => {}),
    ).rejects.toThrow('archived');
  });
});
