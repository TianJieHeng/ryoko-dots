/* global fetch, AbortSignal */
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
// Single-owner workstation supervisor for the signed native computer target.
// It exposes the existing lifecycle protocol on loopback, without Docker.
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, URL } from 'node:url';

const dotId = process.env.COMPUTER_BOT_ID;
const master = process.env.COMPUTER_TOKEN?.trim();
const credential = process.env.COMPUTER_SUPERVISOR_TOKEN?.trim();
const namespace = process.env.COMPUTER_NAMESPACE ?? 'opendots';
const port = Number(process.env.COMPUTER_LOCAL_PORT ?? 4312);
const supervisorPort = Number(process.env.COMPUTER_SUPERVISOR_PORT ?? 4311);
if (
  !dotId ||
  !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(dotId) ||
  !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(namespace) ||
  !master ||
  master.length < 24 ||
  !credential ||
  credential.length < 24 ||
  ![port, supervisorPort].every(
    (p) => Number.isInteger(p) && p >= 1024 && p <= 65535,
  ) ||
  port === supervisorPort
)
  throw new Error('Invalid local computer configuration.');

const target = fileURLToPath(
  new URL('../dist/computer/computer/index.js', import.meta.url),
);
let child = null;
let busy = false;
let closing = false;
const state = () => ({
  botId: dotId,
  container: `${namespace}-computer-${dotId}`,
  status:
    child && child.exitCode === null && !child.killed ? 'running' : 'stopped',
  port,
});
async function start() {
  if (child) return;
  const next = spawn(process.execPath, [target], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      PATH: '/usr/bin:/bin',
      HOME: process.env.HOME,
      COMPUTER_HOST: '127.0.0.1',
      PORT: String(port),
      COMPUTER_BOT_ID: dotId,
      COMPUTER_EXECUTOR_ID:
        process.env.COMPUTER_EXECUTOR_ID ?? `computer:${dotId}`,
      COMPUTER_TOKEN: createHmac('sha256', master)
        .update(`opendots-computer:${dotId}`)
        .digest('hex'),
      PROFILES_DIR: process.env.PROFILES_DIR,
      WORKSPACE_DIR: process.env.WORKSPACE_DIR,
      COMPUTER_QUALIFICATION_FILE: process.env.COMPUTER_QUALIFICATION_FILE,
    },
  });
  child = next;
  next.once('exit', () => {
    if (child === next) child = null;
  });
  next.once('error', () => {
    if (child === next) child = null;
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child !== next)
      throw new Error('Computer target exited during startup.');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/edge/status`, {
        method: 'POST',
        body: '{}',
        signal: AbortSignal.timeout(500),
      });
      // An unauthenticated probe must be rejected by the live target.
      if (response.status === 409) {
        const health = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(500),
        });
        if ((await health.json()).protocol === 'dots-computer-edge/1') return;
      }
    } catch {
      /* Wait for target startup only; never dispatch an action. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await stop();
  throw new Error('Computer target did not become ready.');
}
async function stop() {
  const current = child;
  if (!current) return;
  const exited = once(current, 'exit');
  current.kill('SIGTERM');
  const timeout = setTimeout(() => current.kill('SIGKILL'), 5000);
  try {
    await exited;
  } finally {
    clearTimeout(timeout);
  }
}
const server = createServer(async (request, response) => {
  const reply = (status, body) => {
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(body));
  };
  const supplied = Buffer.from(request.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${credential}`);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    request.resume();
    return reply(401, { error: 'Authentication required.' });
  }
  if (request.method === 'GET' && request.url === '/computers')
    return reply(200, { computers: [state()] });
  const verb =
    request.url === `/computers/${dotId}/ensure`
      ? 'start'
      : request.url === `/computers/${dotId}/stop`
        ? 'stop'
        : null;
  if (request.method !== 'POST' || !verb)
    return reply(404, { error: 'Not found.' });
  if (busy || closing)
    return reply(409, { error: 'Lifecycle operation in progress.' });
  busy = true;
  try {
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 1024) throw new Error('Request too large.');
    }
    if (verb === 'start') await start();
    else await stop();
    reply(200, verb === 'start' ? state() : { stopped: true });
  } catch {
    reply(503, {
      error: 'Local computer lifecycle failed; inspect the service journal.',
    });
  } finally {
    busy = false;
  }
});
server.requestTimeout = 15000;
await start();
server.listen(supervisorPort, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    server.close();
    void stop().finally(() => process.exit(0));
  });
