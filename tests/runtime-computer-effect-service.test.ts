import { afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { computerInputs } from '../src/shared/computer-types.js';
import {
  ComputerEffectService,
  computerCanonical,
  type NativeComputerEdge,
  type NativeComputerPeer,
} from '../src/server/runtime/computer-effect-service.js';
import type {
  DotsComputerProposal,
  DotsDispatchRequest,
  DotsEffectIdentity,
  DotsComputerObserveRequest,
} from '../src/shared/runtime/producer/wire.generated.js';
const resources: Array<() => void> = [];
afterEach(() => {
  resources
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
});
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const hash = (v: unknown) => sha(computerCanonical(v));
const binding = {
  ownerId: 'owner',
  dotId: 'dot-a',
  executorId: 'computer-a',
  principalId: 'principal',
  profileId: 'profile',
  agentId: 'agent-a',
};
function fixture(path = ':memory:') {
  const db = new DatabaseSync(path);
  resources.push(() => {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  });
  db.exec(
    "CREATE TABLE IF NOT EXISTS workspace_owner(singleton INTEGER PRIMARY KEY, ownerId TEXT NOT NULL); INSERT OR IGNORE INTO workspace_owner VALUES(1,'owner');",
  );
  let now = Date.now();
  const peer: NativeComputerPeer = {
    sessionId: 'live',
    principalId: 'principal',
    profileId: 'profile',
    agentId: 'agent-a',
    runtimeSessionId: 'durable',
    policyDigest: 'b'.repeat(64),
    runId: 'run',
    generation: 2,
    grantRevision: 1,
    assertCurrent: () => {},
    canAccess: () => true,
  };
  let exec: NativeComputerEdge['execute'] = async (_a, _i, e) => {
    e.beforeSend();
    return { text: 'actual fixture result' };
  };
  let observe: NativeComputerEdge['observe'] = async () => ({
    snapshotId: 7,
    output: { snapshotId: 7, refs: ['ref-1'] },
  });
  const edge: NativeComputerEdge = {
    dotId: 'dot-a',
    executorId: 'computer-a',
    qualified: true,
    qualifiedActions: Object.keys(computerInputs) as Array<
      keyof typeof computerInputs
    >,
    available: () => true,
    execute: vi.fn((...args: Parameters<NativeComputerEdge['execute']>) =>
      exec(...args),
    ),
    observe: vi.fn((...args: Parameters<NativeComputerEdge['observe']>) =>
      observe(...args),
    ),
  };
  const service = new ComputerEffectService(
    db,
    binding,
    edge,
    () => ['master-secret', 'child-secret', 'a"secret'],
    () => now,
  );
  if (service.fence().grantRevision === 0)
    service.permissions(
      { enabled: true, browser: true, files: true, shell: true },
      0,
      () => {},
    );
  const authority = () => ({
    principal_id: peer.principalId,
    profile_id: peer.profileId,
    agent_id: peer.agentId,
    runtime_session_id: peer.runtimeSessionId,
    run_id: 'run',
    policy_digest: peer.policyDigest,
    generation: peer.generation,
  });
  const read = (
    action: DotsComputerObserveRequest['scope']['action'] = 'snapshot',
    effectId: string | null = null,
  ) => ({
    session_id: peer.sessionId,
    authority: authority(),
    scope: {
      executor_id: binding.executorId,
      expected_grant_revision: peer.grantRevision,
      action,
      input: {},
      effect_id: effectId,
    },
    deadline_at: now / 1000 + 60,
  });
  const snapshot = () => service.observe(read(), peer);
  const request = (
    options: {
      action?: DotsComputerProposal['action'];
      input?: DotsComputerProposal['input'];
      id?: string;
      proposal?: DotsComputerProposal;
    } = {},
  ): DotsDispatchRequest => {
    const fence = service.fence();
    const proposal: DotsComputerProposal = options.proposal ?? {
      kind: 'computer',
      executor_id: 'computer-a',
      expected_grant_revision: fence.grantRevision,
      expected_control_revision: fence.controlRevision,
      snapshot_id: fence.snapshotId ?? 7,
      snapshot_sha256: fence.snapshotSha256 ?? 'a'.repeat(64),
      action: options.action ?? 'exec',
      input: options.input ?? { command: 'printf fixture', timeoutMs: 1000 },
    };
    const { input, ...scope } = proposal;
    const content = computerCanonical(input);
    const identity: DotsEffectIdentity = {
      schema_version: 1,
      ...authority(),
      operation_id: `op-${options.id ?? '1'}`,
      effect_id: `effect-${options.id ?? '1'}`,
      approval_id: `approval-${options.id ?? '1'}`,
      approval_digest: 'c'.repeat(64),
      action_digest: hash({
        name: 'runtime.dots.computer.execute',
        arguments: proposal,
        operation_class: 'dots_computer_action',
        resource_roots: [],
        destination: `dots:${hash(scope)}`,
        destination_purpose: 'dots_computer',
        contract_digest: hash({ schema_version: 1, kind: 'computer', scope }),
      }),
      input_digest: hash(proposal),
      policy_version: 'v1',
      adapter_id: 'computer-a',
      adapter_kind: 'computer',
      grant_revision: proposal.expected_grant_revision,
      scope_json: computerCanonical(scope),
      content_sha256: sha(content),
      content_size: Buffer.byteLength(content),
    };
    return {
      session_id: peer.sessionId,
      identity,
      proposal,
      content_json: content,
      deadline_at: now / 1000 + 60,
    };
  };
  return {
    db,
    peer,
    edge,
    service,
    snapshot,
    request,
    read,
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    setExec: (fn: typeof exec) => {
      exec = fn;
    },
    setObserve: (fn: typeof observe) => {
      observe = fn;
    },
  };
}
function inspect(f: ReturnType<typeof fixture>, r: DotsDispatchRequest) {
  return f.service.inspect(
    {
      session_id: f.peer.sessionId,
      identity: r.identity,
      deadline_at: f.now() / 1000 + 60,
    },
    f.peer,
  );
}
it('matches exact Unicode canonical content and action digests from pinned producer dots_action', () => {
  const f = fixture();
  const p: DotsComputerProposal = {
    kind: 'computer',
    executor_id: 'computer-a',
    expected_grant_revision: 1,
    expected_control_revision: 0,
    snapshot_id: 7,
    snapshot_sha256: 'a'.repeat(64),
    action: 'files_write',
    input: { path: 'café.txt', contents: 'hello 🦊', append: false },
  };
  const r = f.request({ proposal: p });
  expect(r.content_json).toBe(
    '{"append":false,"contents":"hello \\ud83e\\udd8a","path":"caf\\u00e9.txt"}',
  );
  expect(r.identity.content_sha256).toBe(
    '88da96c077008c3cad4b058d464b089a438a5a8f32e50e6a41c566e3c5aad94c',
  );
  expect(r.identity.input_digest).toBe(
    'a497dc88158d9473c349aff6eb154df97a33fd6b77af15e4345730b33f8f5cb9',
  );
  expect(r.identity.action_digest).toBe(
    'd98a739650fbbe0ec992921a9f3db85020a881b832d3f278168fe0a1e9e8b691',
  );
});
it('dispatches once after durable acceptance, returns exact durable proof, and invalidates the snapshot', async () => {
  const f = fixture();
  await f.snapshot();
  const r = f.request();
  f.setExec(async (_a, _i, e) => {
    expect(
      f.db.prepare('SELECT receipt FROM runtime_computer_effects').get()
        ?.receipt,
    ).toBe(null);
    expect(
      f.db
        .prepare('SELECT operationId FROM runtime_computer_reservations')
        .get()?.operationId,
    ).toBe('op-1');
    e.beforeSend();
    return { text: 'complete' };
  });
  const result = await f.service.dispatch(r, f.peer);
  expect(result).toMatchObject({
    identity: r.identity,
    state: 'committed',
    reason: 'committed',
    content_sha256: r.identity.content_sha256,
    result_sha256: hash({ text: 'complete' }),
  });
  expect(f.service.fence().resumeSnapshotRequired).toBe(true);
  expect(await f.service.dispatch(r, f.peer)).toEqual(result);
  expect(inspect(f, r)).toEqual(result);
  expect(f.edge.execute).toHaveBeenCalledTimes(1);
});
it('keeps lost write responses unknown across restart, and never resends', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dots-be08-'));
  resources.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'db');
  const f = fixture(path);
  await f.snapshot();
  const r = f.request();
  f.setExec(async (_a, _i, e) => {
    e.beforeSend();
    throw new Error('write executed, response lost master-secret');
  });
  expect((await f.service.dispatch(r, f.peer)).state).toBe('outcome_unknown');
  f.db.close();
  const next = fixture(path);
  expect(inspect(next, r).state).toBe('outcome_unknown');
  expect((await next.service.dispatch(r, next.peer)).state).toBe(
    'outcome_unknown',
  );
  await next.snapshot();
  expect(
    (await next.service.dispatch(next.request({ id: 'new' }), next.peer))
      .reason,
  ).toBe('conflict');
  expect(next.edge.execute).not.toHaveBeenCalled();
  expect(
    JSON.stringify(
      next.db.prepare('SELECT * FROM runtime_computer_effects').all(),
    ),
  ).not.toContain('master-secret');
});
it('recovers committed receipt after restart without another executor call', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dots-be08-'));
  resources.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'db');
  const f = fixture(path);
  await f.snapshot();
  const r = f.request();
  const receipt = await f.service.dispatch(r, f.peer);
  f.db.close();
  const next = fixture(path);
  next.peer.generation = 99;
  next.peer.policyDigest = 'f'.repeat(64);
  expect(inspect(next, r)).toEqual(receipt);
  expect(next.edge.execute).not.toHaveBeenCalled();
  await expect(next.service.dispatch(r, next.peer)).rejects.toThrow(
    'authority',
  );
});
it('does not infer missing effects as not-applied or insert them on inspection', () => {
  const f = fixture();
  const r = f.request();
  expect(inspect(f, r).state).toBe('outcome_unknown');
  expect(
    f.db.prepare('SELECT count(*) AS n FROM runtime_computer_effects').get()?.n,
  ).toBe(0);
});
it('rejects changed bytes, identity, digest, reference and non-normalized defaults before execution', async () => {
  const f = fixture();
  await f.snapshot();
  for (const mutate of [
    (r: DotsDispatchRequest) => {
      r.content_json += ' ';
    },
    (r: DotsDispatchRequest) => {
      r.identity.action_digest = '0'.repeat(64);
    },
    (r: DotsDispatchRequest) => {
      r.identity.content_size++;
    },
    (r: DotsDispatchRequest) => {
      r.identity.adapter_id = 'foreign';
    },
  ]) {
    const r = f.request();
    mutate(r);
    await expect(f.service.dispatch(r, f.peer)).rejects.toThrow();
  }
  await expect(
    f.service.dispatch(
      f.request({ action: 'click', input: { ref: 'ref-1', snapshotId: 99 } }),
      f.peer,
    ),
  ).rejects.toThrow('changed');
  await expect(
    f.service.dispatch(
      f.request({
        action: 'type',
        input: { ref: 'ref-1', snapshotId: 7, text: 'x' },
      }),
      f.peer,
    ),
  ).rejects.toThrow('normalized');
  expect(f.edge.execute).not.toHaveBeenCalled();
});
it('rejects operation, approval and global namespace collisions', async () => {
  const f = fixture();
  await f.snapshot();
  const r = f.request();
  await f.service.dispatch(r, f.peer);
  const altered = structuredClone(r);
  altered.identity.policy_version = 'changed';
  await expect(f.service.dispatch(altered, f.peer)).rejects.toThrow(
    'identity conflict',
  );
  const other = f.request({ id: '2' });
  other.identity.operation_id = r.identity.operation_id;
  await expect(f.service.dispatch(other, f.peer)).rejects.toThrow(
    'already admitted',
  );
  other.identity.operation_id = 'op-2';
  other.identity.approval_id = r.identity.approval_id;
  await expect(f.service.dispatch(other, f.peer)).rejects.toThrow(
    'already admitted',
  );
  f.db
    .prepare('INSERT INTO runtime_operation_registry VALUES(?,?,?,?,?)')
    .run('op-3', 'owner', 'command', 'different', 'different');
  await expect(
    f.service.dispatch(f.request({ id: '3' }), f.peer),
  ).rejects.toThrow('another authority');
});
it('isolates principal/profile/agent, durable/live session and current generation', async () => {
  const f = fixture();
  await f.snapshot();
  for (const field of [
    'principal_id',
    'profile_id',
    'agent_id',
    'runtime_session_id',
    'run_id',
  ] as const) {
    const r = f.request();
    r.identity[field] = 'foreign';
    await expect(f.service.dispatch(r, f.peer)).rejects.toThrow('authority');
  }
  const r = f.request();
  r.session_id = 'foreign';
  await expect(f.service.dispatch(r, f.peer)).rejects.toThrow('authority');
  r.session_id = 'live';
  r.identity.generation++;
  await expect(f.service.dispatch(r, f.peer)).rejects.toThrow('authority');
  expect(
    () =>
      new ComputerEffectService(f.db, { ...binding, dotId: 'wrong' }, f.edge),
  ).toThrow('another Dot');
  expect(
    () =>
      new ComputerEffectService(f.db, { ...binding, ownerId: 'wrong' }, f.edge),
  ).toThrow('owner mismatch');
  expect(
    () =>
      new ComputerEffectService(f.db, { ...binding, agentId: 'wrong' }, f.edge),
  ).toThrow('rebound');
});
it('rejects unsafe file paths, human actions, oversized producer writes and fractional canonical input', async () => {
  const f = fixture();
  await f.snapshot();
  for (const path of ['../secret', '/etc/passwd', 'a/../b', 'a\\b', 'a\0b'])
    await expect(
      f.service.dispatch(
        f.request({
          action: 'files_write',
          input: { path, contents: 'x', append: false },
        }),
        f.peer,
      ),
    ).rejects.toThrow();
  await expect(
    f.service.dispatch(
      f.request({
        action: 'files_write',
        input: { path: 'a', contents: 'x'.repeat(24001), append: false },
      }),
      f.peer,
    ),
  ).rejects.toThrow();
  expect(() => computerCanonical({ deltaY: 0.25 })).toThrow('safe integers');
  const r = f.request();
  (r.proposal as { action: string }).action = 'human_click';
  await expect(f.service.dispatch(r, f.peer)).rejects.toThrow();
  expect(f.edge.execute).not.toHaveBeenCalled();
});
it('requires fresh snapshot exact digest and control revision before every mutation', async () => {
  const f = fixture();
  expect((await f.service.dispatch(f.request(), f.peer)).reason).toBe(
    'stale_snapshot',
  );
  await f.snapshot();
  const r = f.request({ id: 'fresh' });
  f.advance(15001);
  expect((await f.service.dispatch(r, f.peer)).reason).toBe('stale_snapshot');
  await f.snapshot();
  const wrong = f.request({ id: 'digest' });
  const p = wrong.proposal as DotsComputerProposal;
  p.snapshot_sha256 = '0'.repeat(64);
  expect(
    (await f.service.dispatch(f.request({ id: 'digest', proposal: p }), f.peer))
      .reason,
  ).toBe('stale_snapshot');
  expect(f.edge.execute).not.toHaveBeenCalled();
});
it('requires owner handback acknowledgement and a newer actual snapshot after takeover', async () => {
  const f = fixture();
  await f.snapshot();
  const original = f.request();
  f.service.controlFence('human', false, 0, () => {});
  expect((await f.service.dispatch(original, f.peer)).reason).toBe('takeover');
  await expect(f.snapshot()).rejects.toThrow('unavailable');
  f.service.controlFence('bot', true, 1, () => {});
  await expect(f.snapshot()).rejects.toThrow('unavailable');
  f.service.controlFence('bot', false, 2, () => {});
  expect(
    (await f.service.dispatch(f.request({ id: 'after-release' }), f.peer))
      .reason,
  ).toBe('stale_snapshot');
  await f.snapshot();
  expect(
    (await f.service.dispatch(f.request({ id: 'after-snapshot' }), f.peer))
      .state,
  ).toBe('committed');
});
it('fences permission revocation during queued send with durable not-applied proof', async () => {
  const f = fixture();
  await f.snapshot();
  const r = f.request();
  f.setExec(async (_a, _i, e) => {
    f.service.permissions({ shell: false }, 1, () => {});
    e.beforeSend();
    return { text: 'must not arrive' };
  });
  const receipt = await f.service.dispatch(r, f.peer);
  expect(receipt).toMatchObject({
    state: 'not_applied',
    reason: 'grant_revoked',
  });
  expect(inspect(f, r)).toEqual(receipt);
});
it('preserves post-send revoke and takeover as unknown, even if native completion returns', async () => {
  for (const mode of ['revoke', 'take']) {
    const f = fixture();
    await f.snapshot();
    const r = f.request();
    f.setExec(async (_a, _i, e) => {
      e.beforeSend();
      if (mode === 'revoke')
        f.service.permissions({ enabled: false }, 1, () => {});
      else f.service.controlFence('human', false, 0, () => {});
      return { text: 'possibly completed' };
    });
    expect((await f.service.dispatch(r, f.peer)).state).toBe('outcome_unknown');
    expect(inspect(f, r).state).toBe('outcome_unknown');
  }
});
it('reads cross-connection permission revocation while a request is in flight', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dots-be08-'));
  resources.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'db');
  const f = fixture(path);
  const other = fixture(path);
  await f.snapshot();
  f.setExec(async (_a, _i, e) => {
    e.beforeSend();
    return new Promise(() => {});
  });
  const result = f.service.dispatch(f.request(), f.peer);
  other.service.permissions({ shell: false }, 1, () => {});
  expect((await result).state).toBe('outcome_unknown');
});
it('never calls a missing or unqualified executor and leaves unavailable terminal proof', async () => {
  const f = fixture();
  await f.snapshot();
  const service = new ComputerEffectService(f.db, binding, null);
  expect((await service.dispatch(f.request(), f.peer)).reason).toBe(
    'unavailable',
  );
  const unqualified = new ComputerEffectService(f.db, binding, {
    ...f.edge,
    qualified: false,
  });
  expect(
    (await unqualified.dispatch(f.request({ id: '2' }), f.peer)).reason,
  ).toBe('unavailable');
  expect(f.edge.execute).not.toHaveBeenCalled();
});
it('redacts reflected secrets and command before receipt hashing, persistence and result retrieval', async () => {
  const f = fixture();
  await f.snapshot();
  const r = f.request();
  f.setExec(async (_a, _i, e) => {
    e.beforeSend();
    return {
      command: 'private shell',
      text: 'master-secret child-secret a"secret',
      'master-secret': 'key',
    };
  });
  const receipt = await f.service.dispatch(r, f.peer);
  const result = await f.service.observe(
    f.read('result', r.identity.effect_id),
    f.peer,
  );
  expect(result.content_sha256).toBe(receipt.result_sha256);
  expect(result.content_json).not.toMatch(
    /master-secret|child-secret|private shell|a\\"secret/,
  );
  expect(result.content_json).toContain('[redacted]');
  expect(
    JSON.stringify(
      f.db.prepare('SELECT resultJson FROM runtime_computer_effects').all(),
    ),
  ).not.toContain('master-secret');
});
it('oversized or invalid outputs and executor protocol violations stay unknown', async () => {
  for (const mode of ['oversized', 'nan', 'missing-send', 'double-send']) {
    const f = fixture();
    await f.snapshot();
    f.setExec(async (_a, _i, e) => {
      if (mode !== 'missing-send') e.beforeSend();
      if (mode === 'double-send') {
        try {
          e.beforeSend();
        } catch {
          /* intentionally bad fixture */
        }
      }
      return mode === 'oversized'
        ? { text: 'x'.repeat(65536) }
        : mode === 'nan'
          ? { value: NaN }
          : { text: 'x' };
    });
    expect((await f.service.dispatch(f.request(), f.peer)).state).toBe(
      'outcome_unknown',
    );
  }
});
it('bounds deadlines even if the native promise ignores its abort signal', async () => {
  const f = fixture();
  await f.snapshot();
  const r = f.request();
  r.deadline_at = (f.now() + 15) / 1000;
  f.setExec(async (_a, _i, e) => {
    e.beforeSend();
    return new Promise(() => {});
  });
  expect((await f.service.dispatch(r, f.peer)).state).toBe('outcome_unknown');
  expect(f.edge.execute).toHaveBeenCalledTimes(1);
});
it('serializes concurrent executor writes and leaves unresolved reservation durable', async () => {
  const f = fixture();
  await f.snapshot();
  let release!: () => void;
  f.setExec(async (_a, _i, e) => {
    e.beforeSend();
    await new Promise<void>((r) => {
      release = r;
    });
    return { text: 'done' };
  });
  const first = f.service.dispatch(f.request(), f.peer);
  expect(
    (await f.service.dispatch(f.request({ id: '2' }), f.peer)).reason,
  ).toBe('conflict');
  release();
  expect((await first).state).toBe('committed');
  expect(f.edge.execute).toHaveBeenCalledTimes(1);
});
it('owner direct actions require explicit current owner guard and remain separately recorded', async () => {
  const f = fixture();
  await f.snapshot();
  await expect(
    f.service.ownerAction(
      'owner-1',
      'exec',
      { command: 'printf owner', timeoutMs: 1000 },
      0,
      1,
      () => {
        throw new Error('owner denied');
      },
    ),
  ).rejects.toThrow('owner denied');
  const auth = vi.fn();
  const result = await f.service.ownerAction(
    'owner-1',
    'exec',
    { command: 'printf owner', timeoutMs: 1000 },
    0,
    1,
    auth,
  );
  expect(result.state).toBe('committed');
  expect(auth.mock.calls.length).toBeGreaterThan(2);
  expect(
    f.db.prepare('SELECT count(*) AS n FROM runtime_computer_effects').get()?.n,
  ).toBe(0);
  expect(
    f.db
      .prepare(
        'SELECT action,state,ownerId FROM runtime_computer_owner_actions',
      )
      .get(),
  ).toMatchObject({ action: 'exec', state: 'committed', ownerId: 'owner' });
  expect(
    await f.service.ownerAction(
      'owner-1',
      'exec',
      { command: 'printf owner', timeoutMs: 1000 },
      0,
      1,
      auth,
    ),
  ).toEqual(result);
  expect(f.edge.execute).toHaveBeenCalledTimes(1);
  await expect(
    f.service.ownerAction(
      'owner-1',
      'exec',
      { command: 'changed', timeoutMs: 1000 },
      0,
      1,
      auth,
    ),
  ).rejects.toThrow('conflict');
});
it('owner human actions need observed human control and never mint agent approval authority', async () => {
  const f = fixture();
  f.service.controlFence('human', false, 0, () => {});
  const result = await f.service.ownerAction(
    'human-1',
    'human_click',
    { x: 1, y: 2 },
    1,
    1,
    () => {},
  );
  expect(result.state).toBe('committed');
  expect(
    f.db.prepare('SELECT count(*) AS n FROM runtime_computer_effects').get()?.n,
  ).toBe(0);
  expect(
    f.db
      .prepare(
        'SELECT action FROM runtime_computer_owner_fences ORDER BY rowid DESC',
      )
      .get()?.action,
  ).toBe('control_fence');
});
it('a permission or control race during snapshot cannot restore control', async () => {
  const f = fixture();
  f.setObserve(async () => {
    f.service.controlFence('human', false, 0, () => {});
    return { snapshotId: 8, output: { snapshotId: 8 } };
  });
  await expect(f.snapshot()).rejects.toThrow();
  expect(f.service.fence()).toMatchObject({
    holder: 'human',
    resumeSnapshotRequired: true,
    snapshotId: null,
  });
});
it('rejects revoked receipt access and detects stored result corruption', async () => {
  const f = fixture();
  await f.snapshot();
  const r = f.request();
  await f.service.dispatch(r, f.peer);
  f.peer.canAccess = () => false;
  expect(() => inspect(f, r)).toThrow('authority');
  f.peer.canAccess = () => true;
  f.db.exec('DROP TRIGGER runtime_computer_receipt_immutable');
  f.db
    .prepare('UPDATE runtime_computer_effects SET resultJson=?')
    .run('{"text":"tampered"}');
  expect(() => inspect(f, r)).toThrow('proof');
});
it('interrupted acceptance without a reservation is still unresolved and blocks another write', async () => {
  const f = fixture();
  await f.snapshot();
  const r = f.request();
  f.db
    .prepare(
      'INSERT INTO runtime_computer_effects VALUES(?,?,?,?,?,?,NULL,NULL,?)',
    )
    .run(
      r.identity.effect_id,
      r.identity.operation_id,
      r.identity.approval_id,
      binding.executorId,
      computerCanonical(r.identity),
      r.identity.input_digest,
      f.now(),
    );
  expect((await f.service.dispatch(r, f.peer)).state).toBe('outcome_unknown');
  expect(
    (await f.service.dispatch(f.request({ id: 'other' }), f.peer)).reason,
  ).toBe('conflict');
  expect(f.edge.execute).not.toHaveBeenCalled();
});
it('exposes only individually qualified browser/files/shell operations', async () => {
  const f = fixture();
  await f.snapshot();
  const service = new ComputerEffectService(f.db, binding, {
    ...f.edge,
    qualifiedActions: ['snapshot', 'read'],
  });
  expect((await service.dispatch(f.request(), f.peer)).reason).toBe(
    'unavailable',
  );
  expect(f.edge.execute).not.toHaveBeenCalled();
});
it('checks fixed per-Dot stable actor identity even with a second executor binding', () => {
  const f = fixture();
  const otherBinding = {
    ...binding,
    dotId: 'other-dot',
    executorId: 'other-executor',
  };
  expect(() => new ComputerEffectService(f.db, otherBinding, null)).toThrow(
    'rebound',
  );
});

it('process death at native send preserves unknown admission and reservation on restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dots-be08-kill-'));
  resources.push(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'db');
  const f = fixture(dbPath);
  await f.snapshot();
  const r = f.request();
  f.db.close();
  const source = fileURLToPath(
    new URL(
      '../src/server/runtime/computer-effect-service.ts',
      import.meta.url,
    ),
  );
  const child = join(dir, 'kill.mjs');
  writeFileSync(
    child,
    `
    import { DatabaseSync } from 'node:sqlite';
    import { ComputerEffectService } from ${JSON.stringify(source)};
    const db = new DatabaseSync(${JSON.stringify(dbPath)});
    const edge = {dotId:'dot-a',executorId:'computer-a',qualified:true,qualifiedActions:['exec'],available:()=>true,
      execute:async(a,i,e)=>{e.beforeSend();process.kill(process.pid,'SIGKILL');},observe:async()=>{throw new Error('not used');}};
    const peer = ${JSON.stringify(f.peer)};
    peer.assertCurrent = () => {}; peer.canAccess = () => true;
    const service = new ComputerEffectService(db,${JSON.stringify(binding)},edge);
    await service.dispatch(${JSON.stringify(r)},peer);
  `,
  );
  const killed = spawnSync(process.execPath, ['--import', 'tsx', child], {
    cwd: process.cwd(),
    timeout: 5000,
  });
  expect(killed.signal).toBe('SIGKILL');
  const next = fixture(dbPath);
  expect(inspect(next, r).state).toBe('outcome_unknown');
  expect(
    next.db
      .prepare('SELECT operationId FROM runtime_computer_reservations')
      .get()?.operationId,
  ).toBe('op-1');
  expect((await next.service.dispatch(r, next.peer)).state).toBe(
    'outcome_unknown',
  );
  expect(next.edge.execute).not.toHaveBeenCalled();
});
it('owner GET recovery is authenticated, scoped and read-only, with result integrity checks', async () => {
  const f = fixture();
  expect(() => f.service.ownerOperation('missing', () => {})).toThrow(
    'unavailable',
  );
  expect(f.edge.execute).not.toHaveBeenCalled();
  await f.service.ownerAction(
    'owner-get',
    'exec',
    { command: 'fixture', timeoutMs: 1000 },
    0,
    1,
    () => {},
  );
  expect(f.service.ownerOperation('owner-get', () => {})).toMatchObject({
    operationId: 'owner-get',
    state: 'committed',
  });
  expect(() =>
    f.service.ownerOperation('owner-get', () => {
      throw new Error('owner revoked');
    }),
  ).toThrow('revoked');
  f.db
    .prepare('UPDATE runtime_computer_owner_actions SET resultJson=?')
    .run('{"text":"corrupt"}');
  expect(() => f.service.ownerOperation('owner-get', () => {})).toThrow(
    'integrity',
  );
  expect(f.edge.execute).toHaveBeenCalledTimes(1);
});
