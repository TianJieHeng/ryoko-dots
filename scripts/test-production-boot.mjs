import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import process from 'node:process';
import { log } from 'node:console';
const root = resolve(process.argv[2] ?? '.');
const temp = mkdtempSync(join(tmpdir(), 'dots-production-boot-'));
const listener = createServer();
await new Promise((done) => listener.listen(0, '127.0.0.1', done));
const port = listener.address().port;
await new Promise((done) => listener.close(done));
const origin = `http://127.0.0.1:${port}`;
const token = 'synthetic-boot-owner-not-a-real-secret';
mkdirSync(join(temp, 'gate'), { mode: 0o700 });
const child = spawn(
  process.execPath,
  [join(root, 'scripts/start-self-hosted.mjs')],
  {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      APP_ORIGIN: origin,
      OWNER_TOKEN: token,
      DATABASE_PATH: join(temp, 'dots.sqlite'),
      DOTS_STATE_GATE_PATH: join(temp, 'gate/state.lock'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let output = '';
child.stdout.on('data', (data) => {
  output += data;
});
child.stderr.on('data', (data) => {
  output += data;
});
const exited = new Promise((done) =>
  child.once('exit', (code, signal) => done({ code, signal })),
);
try {
  let live;
  for (let attempts = 0; attempts < 100; attempts++) {
    if (child.exitCode !== null)
      throw new Error('Fresh-install child exited before readiness.');
    try {
      live = await globalThis.fetch(origin + '/health/live');
      if (live.ok) break;
    } catch {
      /* startup */
    }
    await sleep(25);
  }
  assert.equal(live?.status, 200);
  const html = await (await globalThis.fetch(origin + '/')).text();
  assert.ok(html.includes('type="module"'));
  const asset = html.match(/src="([^"]+\.js)"/);
  assert.ok(asset);
  assert.equal(
    (await globalThis.fetch(new globalThis.URL(asset[1], origin))).status,
    200,
  );
  assert.equal(
    (await globalThis.fetch(origin + '/api/ops/readiness')).status,
    401,
  );
  const login = await globalThis.fetch(origin + '/api/auth/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ ownerToken: token }),
  });
  assert.equal(login.status, 200);
  const headers = {
    cookie: login.headers.get('set-cookie').split(';')[0],
    origin,
  };
  const readiness = await globalThis.fetch(origin + '/api/ops/readiness', {
    headers,
  });
  assert.equal(readiness.status, 200);
  const body = await readiness.json();
  assert.equal(body.surfaces.storage, 'ready');
  assert.equal(body.surfaces.conversations, 'unconfigured');
  assert.equal(body.qualification, 'not-certified');
  assert.equal(
    (await globalThis.fetch(origin + '/api/workspace', { headers })).status,
    200,
  );
  const metrics = await (
    await globalThis.fetch(origin + '/api/ops/metrics', { headers })
  ).json();
  assert.equal(metrics.ledgerMetrics, 'ready');
  child.kill('SIGTERM');
  const timeout = new globalThis.AbortController();
  const outcome = await Promise.race([
    exited,
    sleep(10000, undefined, { signal: timeout.signal }).then(
      () => ({ timeout: true }),
      () => undefined,
    ),
  ]);
  timeout.abort();
  assert.deepEqual(outcome, { code: 0, signal: null });
  assert.ok(!output.includes(token));
  log(
    JSON.stringify({
      fixture: 'synthetic-fresh-install-production-only',
      liveness: 'passed',
      ownerReadiness: 'passed',
      producer: 'unconfigured',
      intelligenceCredentials: 'absent',
      orderlyExit: 0,
      staticFrontend: 'passed',
      productionQualification: false,
    }),
  );
} finally {
  if (child.exitCode === null && child.signalCode === null)
    child.kill('SIGKILL');
  await exited;
  rmSync(temp, { recursive: true, force: true });
}
