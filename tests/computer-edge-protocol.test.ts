import { afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { ComputerEdgeStore } from '../src/computer/edge-store.js';
import {
  ComputerEdgeService,
  type ComputerTargetDriver,
} from '../src/computer/edge-service.js';
import {
  edgeCanonical,
  edgeDigest,
  signEdge,
  type EdgeActor,
  type EdgeExecute,
  type EdgeReceipt,
} from '../src/shared/computer-edge-protocol.js';
const token = 'fixture-derived-dot-credential-0123456789';
const binding = {
  ownerId: 'owner',
  dotId: 'dot',
  executorId: 'computer',
  principalId: 'principal',
  profileId: 'profile',
  agentId: 'agent',
};
const owner: EdgeActor = {
  kind: 'owner',
  ownerId: 'owner',
  authSessionId: 'owner-session',
  authRevision: 1,
};
const agent: Extract<EdgeActor, { kind: 'agent' }> = {
  kind: 'agent',
  liveSessionId: 'live-session',
  authority: {
    principal_id: 'principal',
    profile_id: 'profile',
    agent_id: 'agent',
    runtime_session_id: 'durable-session',
    run_id: 'run',
    generation: 1,
    policy_digest: 'f'.repeat(64),
  },
};
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
});
async function fixture(path = ':memory:') {
  const db = new DatabaseSync(path);
  cleanups.push(() => db.close());
  const store = new ComputerEdgeStore(db, 'dot', 'computer');
  let execute: ComputerTargetDriver['execute'] = async (_a, _i, edge) => {
    edge.guard();
    return { text: 'ok' };
  };
  const calls = vi.fn<ComputerTargetDriver['execute']>((...args) =>
    execute(...args),
  );
  const driver: ComputerTargetDriver = {
    actions: ['files_write', 'snapshot', 'human_click', 'exec'],
    execute: calls,
    observe: async (_a, _i, id, e) => {
      e.guard();
      return { snapshotId: id, tree: 'button' };
    },
  };
  const service = new ComputerEdgeService(store, driver, token);
  let seq = 0;
  const request = (
    path: string,
    body: unknown,
    role: 'agent' | 'owner' = 'owner',
    secret = token,
  ) =>
    new Request('http://target' + path, {
      method: 'POST',
      body: JSON.stringify(
        signEdge(
          path,
          {
            version: 1,
            dotId: 'dot',
            executorId: 'computer',
            role,
            expiresAt: Date.now() + 60000,
            body,
          },
          secret,
        ),
      ),
    });
  const call = async (
    path: string,
    body: unknown,
    role: 'agent' | 'owner' = 'owner',
  ) => {
    const res = await service.fetch(request(path, body, role));
    return {
      status: res.status,
      body: (await res.json()) as Record<string, unknown>,
    };
  };
  const change = async (change: unknown) =>
    call('/edge/change', {
      operationId: 'change-' + ++seq,
      actor: owner,
      expectedGrantRevision: store.state().grantRevision,
      expectedControlRevision: store.state().controlRevision,
      change,
    });
  if (!store.binding()) await change({ kind: 'bind', binding });
  await change({
    kind: 'permissions',
    permissions: { enabled: true, browser: true, files: true, shell: true },
  });
  const snapshot = async (actor: EdgeActor = agent) =>
    call(
      '/edge/observe',
      {
        actor,
        action: 'snapshot',
        input: {},
        expectedGrantRevision: store.state().grantRevision,
        expectedControlRevision: store.state().controlRevision,
      },
      actor.kind,
    );
  await snapshot();
  const command = (id = 'operation', actor: EdgeActor = agent): EdgeExecute => {
    const s = store.state(),
      input = { path: 'note.txt', contents: 'approved', append: false };
    const scope = {
      kind: 'computer',
      executor_id: 'computer',
      action: 'files_write',
      expected_grant_revision: s.grantRevision,
      expected_control_revision: s.controlRevision,
      snapshot_id: s.snapshotId,
      snapshot_sha256: s.snapshotSha256,
    };
    const proposal = { ...scope, input };
    const action = {
      name: 'runtime.dots.computer.execute',
      arguments: proposal,
      operation_class: 'dots_computer_action',
      resource_roots: [],
      destination: `dots:${edgeDigest(scope)}`,
      destination_purpose: 'dots_computer',
      contract_digest: edgeDigest({
        schema_version: 1,
        kind: 'computer',
        scope,
      }),
    };
    return {
      operationId: id,
      actor,
      action: 'files_write',
      input,
      fence: {
        grantRevision: s.grantRevision,
        controlRevision: s.controlRevision,
        snapshotId: s.snapshotId,
        snapshotSha256: s.snapshotSha256,
      },
      identity:
        actor.kind === 'owner'
          ? null
          : {
              schema_version: 1,
              ...agent.authority,
              operation_id: id,
              effect_id: 'effect-' + id,
              approval_id: 'approval-' + id,
              approval_digest: 'a'.repeat(64),
              action_digest: edgeDigest(action),
              input_digest: edgeDigest(proposal),
              policy_version: 'v1',
              adapter_kind: 'computer',
              adapter_id: 'computer',
              grant_revision: s.grantRevision,
              scope_json: edgeCanonical(scope),
              content_sha256: edgeDigest(input),
              content_size: Buffer.byteLength(edgeCanonical(input)),
            },
    };
  };
  return {
    db,
    store,
    service,
    calls,
    request,
    call,
    change,
    snapshot,
    command,
    handle: (fn: typeof execute) => (execute = fn),
  };
}
it('runs the target protocol once and recovers exactly the same durable receipt', async () => {
  const f = await fixture(),
    command = f.command();
  const first = await f.call('/edge/execute', command, 'agent');
  expect(first.status).toBe(200);
  expect(first.body.state).toBe('committed');
  const again = await f.call('/edge/execute', command, 'agent');
  expect(again).toEqual(first);
  expect(f.calls).toHaveBeenCalledTimes(1);
  const inspect = await f.call(
    '/edge/inspect',
    { actor: agent, operationId: command.operationId },
    'agent',
  );
  expect(inspect.body.receipt).toEqual(first.body);
  expect(f.store.state().resumeSnapshotRequired).toBe(true);
});
it('refuses unsigned legacy routes, route replay, wrong role, scope and changed bytes', async () => {
  const f = await fixture();
  expect(
    (
      await f.service.fetch(
        new Request('http://target/exec', { method: 'POST', body: '{}' }),
      )
    ).status,
  ).toBe(404);
  const command = f.command();
  expect(
    (
      await f.service.fetch(
        f.request('/edge/execute', command, 'agent', 'wrong-secret'),
      )
    ).status,
  ).toBe(409);
  expect((await f.call('/edge/execute', command, 'owner')).status).toBe(409);
  expect(
    (
      await f.call(
        '/edge/execute',
        {
          ...command,
          input: { ...(command.input as object), contents: 'changed' },
        },
        'agent',
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await f.call(
        '/edge/execute',
        {
          ...command,
          actor: {
            ...agent,
            authority: { ...agent.authority, agent_id: 'foreign' },
          },
        },
        'agent',
      )
    ).status,
  ).toBe(409);
  const signed = signEdge(
    '/edge/status',
    {
      version: 1,
      dotId: 'dot',
      executorId: 'computer',
      role: 'agent',
      expiresAt: Date.now() + 10000,
      body: command,
    },
    token,
  );
  expect(
    (
      await f.service.fetch(
        new Request('http://target/edge/execute', {
          method: 'POST',
          body: JSON.stringify(signed),
        }),
      )
    ).status,
  ).toBe(409);
  expect(f.calls).not.toHaveBeenCalled();
});
it('checks the target fence after async preparation and before the real primitive', async () => {
  const f = await fixture();
  let prepared!: () => void;
  let release!: () => void;
  const atPrepare = new Promise<void>((r) => (prepared = r)),
    resume = new Promise<void>((r) => (release = r));
  let effects = 0;
  f.handle(async (_a, _i, edge) => {
    prepared();
    await resume;
    edge.guard();
    effects++;
    return {};
  });
  const work = f.call('/edge/execute', f.command(), 'agent');
  await atPrepare;
  await f.change({
    kind: 'permissions',
    permissions: { enabled: false, browser: false, files: false, shell: false },
  });
  release();
  expect((await work).body.state).toBe('not_applied');
  expect(effects).toBe(0);
});
it('retains post-dispatch uncertainty and fences every later write, including owner', async () => {
  const f = await fixture();
  f.handle(async (_a, _i, edge) => {
    edge.guard();
    throw new Error('lost browser result');
  });
  const first = f.command();
  expect((await f.call('/edge/execute', first, 'agent')).body.state).toBe(
    'unknown',
  );
  expect(f.store.busy()).toBe(true);
  expect(
    (await f.call('/edge/execute', f.command('second'), 'agent')).body.reason,
  ).toBe('busy');
  expect(
    (await f.call('/edge/execute', f.command('owner', owner), 'owner')).body
      .reason,
  ).toBe('busy');
  expect(f.calls).toHaveBeenCalledTimes(1);
});
it('retains both before-dispatch and after-dispatch admissions across process restart without retry', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'edge-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'state.db'),
    first = await fixture(path),
    before = first.command('before');
  first.store.tx(() => first.store.admit(before, null));
  const restarted = await fixture(path);
  expect(
    (await restarted.call('/edge/execute', before, 'agent')).body.state,
  ).toBe('unknown');
  expect(restarted.calls).not.toHaveBeenCalled();
  expect(() => first.store.state()).toThrow('Stale');
});
it('requires a new real snapshot after takeover and handback, including owner human actions', async () => {
  const f = await fixture(),
    old = f.command();
  await f.change({ kind: 'control', holder: 'human' });
  expect((await f.call('/edge/execute', old, 'agent')).body.state).toBe(
    'not_applied',
  );
  await f.snapshot(owner);
  const human = f.command('human', owner);
  human.action = 'human_click';
  human.input = { x: 1, y: 2 };
  expect((await f.call('/edge/execute', human, 'owner')).body.state).toBe(
    'committed',
  );
  await f.change({ kind: 'control', holder: 'bot' });
  expect(f.store.state().resumeSnapshotRequired).toBe(true);
  expect(
    (await f.call('/edge/execute', f.command('stale'), 'agent')).body.state,
  ).toBe('not_applied');
  await f.snapshot();
  expect(
    (await f.call('/edge/execute', f.command('fresh'), 'agent')).body.state,
  ).toBe('committed');
});
it('records owner identity separately and rejects pretending an owner action is an effect', async () => {
  const f = await fixture(),
    command = f.command('owner', owner);
  expect((await f.call('/edge/execute', command, 'owner')).body).toMatchObject({
    identity: null,
    actor: owner,
    state: 'committed',
  });
  const bad = f.command('bad', owner);
  bad.identity = f.command('agent').identity;
  expect((await f.call('/edge/execute', bad, 'owner')).status).toBe(409);
});
it('redacts reflected escaped secrets, removes command, and refuses oversized proof', async () => {
  const f = await fixture();
  f.handle(async (_a, _i, e) => {
    e.guard();
    return { text: token, command: 'secret' };
  });
  const result = await f.call('/edge/execute', f.command(), 'agent');
  expect(result.body.result).toEqual({ text: '[redacted]' });
  await f.snapshot();
  f.handle(async (_a, _i, e) => {
    e.guard();
    return { text: 'x'.repeat(65537) };
  });
  expect(
    (await f.call('/edge/execute', f.command('large'), 'agent')).body.state,
  ).toBe('unknown');
  expect(edgeCanonical(f.store.inspect('large'))).not.toContain('xxxxx');
});
it('returns persisted proof after a real loopback HTTP response is lost without a second execution', async () => {
  const f = await fixture();
  let dispatched!: () => void;
  const started = new Promise<void>((r) => (dispatched = r));
  let finish!: () => void;
  const ready = new Promise<void>((r) => (finish = r));
  f.handle(async (_a, _i, e) => {
    e.guard();
    dispatched();
    await ready;
    return { applied: true };
  });
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.from(c));
    const request = new Request('http://target' + req.url, {
      method: 'POST',
      body: Buffer.concat(chunks),
    });
    const response = await f.service.fetch(request);
    res.writeHead(response.status, { 'content-type': 'application/json' });
    res.end(await response.text());
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  try {
    const command = f.command();
    const controller = new AbortController();
    const signed = await f.request('/edge/execute', command, 'agent').text();
    const work = fetch(`http://127.0.0.1:${port}/edge/execute`, {
      method: 'POST',
      body: signed,
      signal: controller.signal,
    }).catch(() => null);
    await started;
    controller.abort();
    await work;
    finish();
    await vi.waitFor(() =>
      expect(f.store.inspect(command.operationId)?.state).toBe('committed'),
    );
    const proof = await f.call(
      '/edge/inspect',
      { actor: agent, operationId: command.operationId },
      'agent',
    );
    expect((proof.body.receipt as EdgeReceipt).result).toEqual({
      applied: true,
    });
    expect(f.calls).toHaveBeenCalledTimes(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
