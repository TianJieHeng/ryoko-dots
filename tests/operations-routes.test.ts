import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { OwnerAuth } from '../src/server/owner-auth';
import { Store } from '../src/server/store';
import { WorkspaceStore } from '../src/server/workspace';
import { SelfHostedPlatform } from '../src/server/self-hosted-platform';
import { createSelfHostedApp } from '../src/server/self-hosted-app';
import { LegacyHistoryReader } from '../src/server/operations/history-archive';
import { RuntimeOperations } from '../src/server/operations/runtime-operations';
import { ReadinessEvidence } from '../src/server/operations/readiness-evidence';
import { stateMetrics } from '../src/server/operations/state-metrics';
it('protects archive paths, provenance, readiness and metrics and rejects work after freeze', async () => {
  const root = mkdtempSync(join(tmpdir(), 'be11-routes-'));
  const db = join(root, 'dots.sqlite'),
    ownerId = 'owner',
    origin = 'http://127.0.0.1:4310',
    token = 'synthetic-owner-token-at-least-24';
  const workspace = new WorkspaceStore(db, ownerId),
    store = new Store(db),
    auth = new OwnerAuth(db, { ownerId, origin, ownerToken: token });
  const platform = new SelfHostedPlatform(workspace, db);
  const archive = join(root, 'archive.sqlite'),
    sqlite = new DatabaseSync(archive);
  sqlite.exec(
    `CREATE TABLE history_meta(id INTEGER,format TEXT,owner TEXT); INSERT INTO history_meta VALUES(1,'dots-inert-history-v1','owner'); CREATE TABLE history_conversations(id TEXT,source TEXT,legacyId TEXT,title TEXT,createdAt INTEGER,originalDigest TEXT); INSERT INTO history_conversations VALUES('stable','source','old','Archive',1,'digest'); CREATE TABLE history_tombstones(id TEXT,reason TEXT); CREATE TABLE history_messages(id TEXT,conversationId TEXT,legacyId TEXT,ordinal INTEGER,role TEXT,text TEXT,createdAt INTEGER); INSERT INTO history_messages VALUES('m','stable','original',0,'user','inert',1);`,
  );
  sqlite.close();
  const history = new LegacyHistoryReader(archive, ownerId);
  const operations = new RuntimeOperations({ storage: () => 'ready' });
  const app = createSelfHostedApp({
    auth,
    platform,
    store,
    history,
    operations,
  });
  try {
    expect((await app.request(`${origin}/health/live`)).status).toBe(200);
    for (const path of [
      '/api/ops/readiness',
      '/api/ops/metrics',
      '/api/ops/legacy-history/sources',
    ])
      expect((await app.request(origin + path)).status).toBe(401);
    const login = await app.request(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ ownerToken: token }),
    });
    const headers = {
      cookie: login.headers.get('set-cookie')!.split(';')[0],
      origin,
    };
    const list = await app.request(
      `${origin}/api/ops/legacy-history?source=source`,
      { headers },
    );
    expect(list.status).toBe(200);
    expect(list.headers.get('cache-control')).toContain('no-store');
    expect((await list.json()).conversations[0].legacyId).toBe('old');
    const detail = await (
      await app.request(`${origin}/api/ops/legacy-history/old?source=source`, {
        headers,
      })
    ).json();
    expect(detail.executable).toBe(false);
    expect(detail.messages[0].text).toBe('inert');
    for (const query of [
      'source=source&path=/tmp/secret',
      'source=source&owner=other',
      'source=source&source=other',
      'source=source&offset=-1',
    ])
      expect(
        (
          await app.request(`${origin}/api/ops/legacy-history?${query}`, {
            headers,
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await app.request(`${origin}/api/ops/legacy-history?source=source`, {
          method: 'POST',
          headers,
        })
      ).status,
    ).not.toBe(200);
    operations.freeze();
    expect(
      (await app.request(`${origin}/api/workspace`, { headers })).status,
    ).toBe(503);
    const ready = await app.request(`${origin}/api/ops/readiness`, { headers });
    expect(ready.status).toBe(503);
    expect((await ready.json()).draining).toBe(true);
  } finally {
    history.close();
    await platform.stop();
    auth.close();
    workspace.close();
    store.close();
    rmSync(root, { recursive: true });
  }
});
it('expires per-surface observations and invalidates them across producer reconnect', () => {
  let now = 1;
  const evidence = new ReadinessEvidence(() => now, 15);
  expect(evidence.read(1, true)).toBe('unavailable');
  evidence.record('ready', 1);
  expect(evidence.read(1, true)).toBe('ready');
  expect(evidence.read(2, true)).toBe('unavailable');
  expect(evidence.read(1, false)).toBe('unavailable');
  now = 17;
  expect(evidence.read(1, true)).toBe('unavailable');
});
it('reads bounded aggregate ledger gauges without leaking payloads or mutating outcomes', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      "CREATE TABLE runtime_command_ingress(state TEXT,payload TEXT); INSERT INTO runtime_command_ingress VALUES('outcome_unknown','private prompt')",
    );
    const metrics = stateMetrics(db, tmpdir());
    expect(metrics.queue_depth).toBe(1);
    expect(metrics.command_unknown).toBe(1);
    expect(metrics.storage_free_bytes).toBeGreaterThan(0);
    expect(JSON.stringify(metrics)).not.toContain('private');
    expect(
      db.prepare('SELECT state FROM runtime_command_ingress').get()?.state,
    ).toBe('outcome_unknown');
  } finally {
    db.close();
  }
});
