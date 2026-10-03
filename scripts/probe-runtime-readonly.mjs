#!/usr/bin/env node
// Explicit synthetic test; not a supported deployment transport or live auth proof.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { ReadOnlyRpc } from '../src/server/runtime/rpc.ts';
const [python, root] = process.argv.slice(2);
if (!python || !root)
  throw new Error(
    'Pass synthetic Python interpreter and reviewed producer root',
  );
const child = spawn(
  resolve(python),
  ['-u', 'scripts/probe-runtime-readonly.py', resolve(root)],
  { stdio: ['pipe', 'pipe', 'pipe'] },
);
// Do not publish arbitrary stderr/private provider diagnostics.
child.stderr.resume();
const rpc = new ReadOnlyRpc(child.stdout, child.stdin, {
  bytes: 1000000,
  pending: 4,
  timeoutMs: 30000,
});
try {
  const capabilities = await rpc.read('runtime.capabilities', {
    session_id: 'live-a',
  });
  assert.deepEqual(capabilities.schema_versions, [1]);
  const snapshot = await rpc.read('runtime.snapshot', {
    session_id: 'live-a',
    schema_version: 1,
  });
  assert.equal(snapshot.revision, 0);
  const replay = await rpc.read('runtime.events.since', {
    session_id: 'live-a',
    schema_version: 1,
    cursor: snapshot.last_cursor,
    limit: 100,
  });
  assert.equal(replay.status, 'ok');
  assert.deepEqual(replay.events, []);
  await assert.rejects(
    rpc.read('runtime.snapshot', { session_id: 'live-b', schema_version: 1 }),
    /rejected/,
  );
  const expired = await rpc.read('runtime.events.since', {
    session_id: 'live-a',
    schema_version: 1,
    cursor: 'expired:999999',
    limit: 100,
  });
  assert.equal(expired.status, 'snapshot_required');
  assert.equal(expired.snapshot.session_id, snapshot.session_id);
  const exit = once(child, 'exit');
  child.stdin.end();
  const [code] = await exit;
  assert.equal(code, 0);
  console.log(
    JSON.stringify(
      {
        evidence: 'synthetic_real_dispatch_over_child_pipes',
        capabilities: 'passed',
        snapshot: 'passed',
        replay: 'passed',
        foreignSession: 'denied',
        expiredCursor: 'snapshot_required',
        providerDispatches: 0,
        deploymentTransport: 'not_run',
        serviceHumanBinding: 'not_qualified',
        productionReady: false,
      },
      null,
      2,
    ),
  );
} finally {
  rpc.close();
  child.kill();
}
