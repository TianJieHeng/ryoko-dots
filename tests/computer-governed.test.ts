import { afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import { WorkspaceStore } from '../src/server/workspace.js';
import { ComputerStore } from '../src/server/computer-store.js';
import { ComputerService } from '../src/server/computer-service.js';
import { ComputerEdgeStore } from '../src/computer/edge-store.js';
import { ComputerEdgeService } from '../src/computer/edge-service.js';
import { NativeComputerHttpEdge } from '../src/server/runtime/computer-http-edge.js';
import type { EdgeActor } from '../src/shared/computer-edge-protocol.js';
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));
function fixture() {
  const workspace = new WorkspaceStore(':memory:', 'owner');
  cleanup.push(() => workspace.close());
  const dotId = workspace.dots()[0].id,
    executorId = `computer:${dotId}`;
  const db = new DatabaseSync(':memory:');
  cleanup.push(() => db.close());
  const token = 'fixture-computer-master-token',
    supervisorToken = 'fixture-supervisor-token';
  const derived = createHmac('sha256', token)
    .update('opendots-computer:' + dotId)
    .digest('hex');
  const target = new ComputerEdgeService(
    new ComputerEdgeStore(db, dotId, executorId),
    {
      actions: ['snapshot', 'screenshot'],
      execute: async () => {
        throw new Error('Not implemented in fixture');
      },
      observe: async (action, _input, snapshotId, d) => {
        d.guard();
        return action === 'screenshot'
          ? {
              snapshotId,
              base64: 'a'.repeat(70000),
              width: 1280,
              height: 800,
              url: 'about:blank',
              capturedAt: Date.now(),
            }
          : { snapshotId, tree: 'synthetic' };
      },
    },
    derived,
    Date.now,
    {
      buildSha256: 'b'.repeat(64),
      configurationSha256: 'c'.repeat(64),
      evidence: 'synthetic',
    },
  );
  const calls: string[] = [];
  let foreign = false;
  const transport: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/computers'))
      return Response.json({
        computers: [
          {
            botId: dotId,
            container: `opendots-computer-${dotId}`,
            status: 'running',
            ...(foreign ? { url: 'http://foreign:4100' } : {}),
          },
        ],
      });
    if (url.endsWith('/ensure'))
      return Response.json({
        botId: dotId,
        container: `opendots-computer-${dotId}`,
        status: 'running',
      });
    if (url.endsWith('/stop')) return Response.json({ stopped: true });
    expect(new Headers(init?.headers).get('x-openbot-bot-id')).toBe(dotId);
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer ' + derived,
    );
    expect(init?.redirect).toBe('error');
    return target.fetch(new Request(url, init));
  };
  const service = new ComputerService(
    workspace,
    {
      computerSupervisorUrl: 'http://127.0.0.1:4312',
      computerSupervisorToken: supervisorToken,
      computerToken: token,
    },
    () => false,
    transport,
    1000,
    { executorId: () => executorId },
  );
  const binding = {
    ownerId: 'owner',
    dotId,
    executorId,
    principalId: 'principal',
    profileId: 'profile',
    agentId: 'agent',
  };
  const owner: Extract<EdgeActor, { kind: 'owner' }> = {
    kind: 'owner',
    ownerId: 'owner',
    authSessionId: 'session-reference',
    authRevision: 1,
  };
  const edge = new NativeComputerHttpEdge(binding, service.protocol(dotId), {
    protocol: 'dots-computer-edge/1',
    buildSha256: 'b'.repeat(64),
    configurationSha256: 'c'.repeat(64),
    evidence: 'synthetic',
    dotId,
    executorId,
    receiptSha256: 'a'.repeat(64),
    actions: ['snapshot', 'screenshot'],
  });
  return {
    workspace,
    service,
    binding,
    edge,
    owner,
    target,
    calls,
    foreign: () => (foreign = true),
  };
}
async function prepare() {
  const f = fixture(),
    signal = AbortSignal.timeout(1000);
  await f.edge.change(
    {
      operationId: 'bind',
      actor: f.owner,
      expectedGrantRevision: 0,
      expectedControlRevision: 0,
      change: { kind: 'bind', binding: f.binding },
    },
    signal,
    () => {},
  );
  await f.edge.change(
    {
      operationId: 'permissions',
      actor: f.owner,
      expectedGrantRevision: 0,
      expectedControlRevision: 0,
      change: {
        kind: 'permissions',
        permissions: {
          enabled: true,
          browser: true,
          files: false,
          shell: false,
        },
      },
    },
    signal,
    () => {},
  );
  await f.edge.refresh(f.owner, signal);
  return f;
}
it('governed ComputerService closes legacy owner/agent action and permission/lifecycle paths', async () => {
  const f = fixture();
  for (const run of [
    () => f.service.action(f.binding.dotId, 'read', {}, 'agent'),
    () =>
      f.service.action(
        f.binding.dotId,
        'human_type',
        { text: 'test' },
        'owner',
      ),
    () => f.service.permissions(f.binding.dotId, { enabled: true }),
    () => f.service.start(f.binding.dotId),
    () => f.service.stop(f.binding.dotId),
    () => f.service.control(f.binding.dotId, 'take'),
  ])
    await expect(run()).rejects.toThrow('Legacy');
  expect(f.calls).toEqual([]);
});
it('signs only discovered Dot-bound target requests and invokes final guard after discovery', async () => {
  const f = fixture();
  const guard = vi.fn(() => {
    expect(f.calls.at(-1)).toMatch(/\/computers$/);
  });
  await f.edge.change(
    {
      operationId: 'bind',
      actor: f.owner,
      expectedGrantRevision: 0,
      expectedControlRevision: 0,
      change: { kind: 'bind', binding: f.binding },
    },
    AbortSignal.timeout(1000),
    guard,
  );
  expect(guard).toHaveBeenCalledOnce();
  expect(f.calls.at(-1)).toMatch(/\/edge\/change$/);
  f.foreign();
  await expect(
    f.edge.refresh(f.owner, AbortSignal.timeout(1000)),
  ).rejects.toThrow('endpoint');
  expect(f.edge.available()).toBe(false);
});
it('requires both target discovery and explicit qualification; no implicit computer start', async () => {
  const f = fixture();
  expect(f.edge.available()).toBe(false);
  const missing = new NativeComputerHttpEdge(
    f.binding,
    f.service.protocol(f.binding.dotId),
    null,
  );
  expect(missing.qualified).toBe(false);
  expect(missing.qualifiedActions).toEqual([]);
  expect(f.calls).toEqual([]);
});
it('owner-only screenshot exceeds the inline callback bound without clearing handback snapshot gate', async () => {
  const f = await prepare();
  const before = f.target.store.state();
  const screen = await f.edge.screen(f.owner, 1, 0, AbortSignal.timeout(1000));
  expect(screen.output.base64.length).toBe(70000);
  expect(screen.output.capturedAt).toBeGreaterThan(0);
  expect(f.target.store.state().resumeSnapshotRequired).toBe(
    before.resumeSnapshotRequired,
  );
  expect(f.target.store.state().snapshotId).toBeNull();
  await expect(
    f.edge.observe(
      'screenshot',
      {},
      {
        signal: AbortSignal.timeout(1000),
        expectedGrantRevision: 1,
        expectedControlRevision: 0,
        authority: f.owner,
      },
    ),
  ).rejects.toThrow();
});
it('reads immutable owner control proof after response loss without applying it again', async () => {
  const f = await prepare();
  const proof = await f.edge.inspectChange(
    'permissions',
    f.owner,
    AbortSignal.timeout(1000),
  );
  expect(proof.change?.state.grantRevision).toBe(1);
  expect(f.target.store.state().grantRevision).toBe(1);
});
it('governed lifecycle uses only pinned supervisor and checks owner at dispatch and result', async () => {
  const f = fixture(),
    guard = vi.fn();
  expect(
    await f.service.governedLifecycle(
      f.binding.dotId,
      'start',
      guard,
      AbortSignal.timeout(1000),
    ),
  ).toEqual({ state: 'running' });
  expect(guard).toHaveBeenCalledTimes(2);
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0]).toContain('/ensure');
  expect(
    await f.service.governedLifecycle(
      f.binding.dotId,
      'stop',
      () => {},
      AbortSignal.timeout(1000),
    ),
  ).toEqual({ state: 'stopped' });
});
it('never prunes unresolved computer audit while retaining the bounded terminal tail', () => {
  const db = new DatabaseSync(':memory:');
  cleanup.push(() => db.close());
  const store = new ComputerStore(db);
  const unknown = store.begin('dot', 'exec', 'agent', {
    operationId: 'operation',
    effectId: 'effect',
    agentId: 'agent',
    sessionId: 'session',
  });
  store.finish(unknown, 'unknown');
  for (let n = 0; n < 1002; n++)
    store.finish(store.begin('dot', 'read', 'owner'), 'succeeded');
  expect(
    db.prepare('SELECT * FROM computer_audit WHERE id=?').get(unknown),
  ).toMatchObject({
    outcome: 'unknown',
    operationId: 'operation',
    effectId: 'effect',
  });
  expect(
    Number(db.prepare('SELECT COUNT(*) as n FROM computer_audit').get()!.n),
  ).toBe(1001);
});
it('probes signed owner metadata before bind while missing or mismatched target identity never qualifies', async () => {
  const f = fixture();
  await f.edge.refresh(f.owner, AbortSignal.timeout(1000));
  expect(f.edge.qualified).toBe(true);
  const changed = new NativeComputerHttpEdge(
    f.binding,
    f.service.protocol(f.binding.dotId),
    {
      protocol: 'dots-computer-edge/1',
      dotId: f.binding.dotId,
      executorId: f.binding.executorId,
      receiptSha256: 'a'.repeat(64),
      buildSha256: 'e'.repeat(64),
      configurationSha256: 'c'.repeat(64),
      evidence: 'synthetic',
      actions: ['snapshot'],
    },
  );
  await changed.refresh(f.owner, AbortSignal.timeout(1000));
  expect(changed.available()).toBe(false);
  expect(changed.qualified).toBe(false);
  await expect(
    changed.change(
      {
        operationId: 'wrong-build',
        actor: f.owner,
        expectedGrantRevision: 0,
        expectedControlRevision: 0,
        change: { kind: 'bind', binding: f.binding },
      },
      AbortSignal.timeout(1000),
      () => {},
    ),
  ).rejects.toThrow('409');
});
