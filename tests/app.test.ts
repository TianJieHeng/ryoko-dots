import { OwnerAuth } from '../src/server/owner-auth.js';
import {
  authenticatedRequests,
  loginHeaders,
  testOwnerToken,
} from './helpers/owner-auth.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { Store } from '../src/server/store.js';
import { Runner } from '../src/server/runner.js';
import type { Config } from '../src/server/research.js';
const stores: { close(): void }[] = [];
const config: Config = { mode: 'sample', baseUrl: 'https://api.openai.com/v1' };
function fixture(token?: string) {
  const store = new Store(':memory:');
  stores.push(store);
  const runner = new Runner(store, config);
  const auth = new OwnerAuth(':memory:', {
    ownerId: 'owner',
    ownerToken: token ?? testOwnerToken,
    origin: 'http://localhost',
  });
  stores.push(auth);
  const raw = createApp({ store, runner, config, auth });
  return {
    store,
    runner,
    raw,
    app: token ? raw : authenticatedRequests(raw),
  };
}
const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
afterEach(() => stores.splice(0).forEach((store) => store.close()));
describe('API boundaries', () => {
  it('requires owner token for state and mutations when configured', async () => {
    const { app, raw } = fixture('private-owner-token-for-test-only');
    expect((await app.request('/api/state')).status).toBe(401);
    expect(
      (
        await app.request('/api/state', {
          headers: await loginHeaders(raw, 'private-owner-token-for-test-only'),
        })
      ).status,
    ).toBe(200);
  });
  it('blocks browser cross-origin requests and form posts', async () => {
    const { app } = fixture();
    expect(
      (
        await app.request('/api/tasks', {
          ...json({ prompt: 'test' }),
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://evil.example',
          },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request('/api/tasks', {
          method: 'POST',
          body: 'prompt=hello',
        })
      ).status,
    ).toBe(415);
  });
  it('validates inputs and enforces research permissions on the server', async () => {
    const { app, store } = fixture();
    expect(
      (await app.request('/api/tasks', json({ prompt: 'x' }))).status,
    ).toBe(400);
    expect(
      (
        await app.request(
          '/api/tasks',
          json({ prompt: 'Research', intervalSeconds: 1 }),
        )
      ).status,
    ).toBe(400);
    store.updateSettings({ researchAllowed: false });
    expect(
      (await app.request('/api/tasks', json({ prompt: 'Research' }))).status,
    ).toBe(403);
    expect(store.claim()).toBeNull();
  });
  it('runs a sample job from the durable queue and retains its result', async () => {
    const { app, store, runner } = fixture();
    const response = await app.request(
      '/api/tasks',
      json({ prompt: 'Plan a quiet weekend' }),
    );
    expect(response.status).toBe(201);
    await runner.tick();
    const task = store.tasks()[0];
    expect(task.status).toBe('completed');
    expect(store.detail(task.id)?.runs[0].result?.sample).toBe(true);
  });
  it('persists memory edits and deletes', async () => {
    const { app, store } = fixture();
    await app.request('/api/memories', json({ text: 'Prefer short briefs' }));
    const memory = store.memories()[0];
    const updated = await app.request(`/api/memories/${memory.id}`, {
      ...json({ text: 'Prefer deep briefs' }),
      method: 'PUT',
    });
    expect(updated.status).toBe(200);
    expect(store.memories()[0].text).toBe('Prefer deep briefs');
    await app.request(`/api/memories/${memory.id}`, {
      ...json({}),
      method: 'DELETE',
    });
    expect(store.memories()).toHaveLength(0);
  });
});
it('rejects DNS-rebinding Host even with a matching hostile Origin', async () => {
  const { app } = fixture();
  const response = await app.request('http://attacker.example/api/tasks', {
    ...json({ prompt: 'Sneaky task' }),
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://attacker.example',
      'Sec-Fetch-Site': 'same-origin',
    },
  });
  expect(response.status).toBe(403);
});

it('exposes honest runtime setup only through the existing authenticated boundary', async () => {
  const { app, raw } = fixture('owner-runtime-token-for-tests');
  expect((await app.request('/api/runtime/setup')).status).toBe(401);
  const response = await app.request('/api/runtime/setup', {
    headers: await loginHeaders(raw, 'owner-runtime-token-for-tests'),
  });
  expect(response.status).toBe(200);
  const setup = await response.json();
  expect(setup.version).toBe('ryoko-dots/1');
  expect(setup.qualified).toBe(false);
  expect(setup.scope).toBeNull();
  expect(JSON.stringify(setup)).not.toContain('owner-runtime-token-for-tests');
});
