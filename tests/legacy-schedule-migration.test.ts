import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/server/store.js';
import { Runner } from '../src/server/runner.js';
import { WorkspaceStore } from '../src/server/workspace.js';
import {
  LegacyScheduleMigration,
  legacyScheduleId,
  type LegacyMigrationAuthorization,
  type LegacyMigrationOptions,
} from '../src/server/runtime/legacy-schedule-migration.js';

const now = 1791040000000;
const result = { text: 'Original result', sources: [], sample: true };
const cleanups: (() => void)[] = [];
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup()),
);
function fixture(
  options: LegacyMigrationOptions = {},
  interval: number | null = 60,
) {
  const dir = mkdtempSync(join(tmpdir(), 'dots-legacy-migration-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'state.sqlite');
  const workspace = new WorkspaceStore(path, 'owner');
  cleanups.push(() => workspace.close());
  const dot = workspace.dots()[0];
  workspace.runtimeBindings.bindAgent({
    dotId: dot.id,
    gatewayId: 'gateway',
    principalId: 'principal',
    profileId: 'profile',
    agentId: 'agent',
    privilegeClass: 'primary',
  });
  workspace.runtimeBindings.bindProject({
    spaceId: dot.spaceId,
    gatewayId: 'gateway',
    profileId: 'profile',
    projectId: 'project',
  });
  const conversation = {
    conversationId: 'conversation',
    dotId: dot.id,
    spaceId: dot.spaceId,
    durableSessionId: 'durable',
    liveSessionId: 'live-a',
    liveGeneration: 1,
  };
  workspace.bindThread(
    conversation.conversationId,
    dot.id,
    'Original conversation',
  );
  const scope = workspace.runtimeBindings.bindConversation(conversation);
  const store = new Store(path);
  cleanups.push(() => store.close());
  const task = store.createTask('Original legacy prompt', interval);
  workspace.bindTask(task.id, conversation.conversationId);
  const connector = new LegacyScheduleMigration(workspace, path, {
    now: () => now,
    ...options,
  });
  cleanups.push(() => connector.close());
  const authorization: LegacyMigrationAuthorization = {
    timezone: 'UTC',
    trigger:
      interval === null
        ? { kind: 'at', at: now / 1000 + 600 }
        : { kind: 'interval', anchor: now / 1000 + 600, seconds: interval },
    policy: { missed_run: 'skip', grace_seconds: 60, overlap: 'skip' },
    budget: { max_checks: 3, max_bytes: 10000, deadline_seconds: 60 },
    expires_at: now / 1000 + 86400,
    authority_description: 'Reviewed bounded migration authority',
    sourceMapping: 'existing_task_thread',
    recurrenceAcknowledgement:
      interval === null
        ? 'one_time'
        : 'fixed_anchor_replaces_completion_relative',
  };
  const db = new DatabaseSync(path);
  cleanups.push(() => db.close());
  return {
    path,
    workspace,
    scope,
    conversation,
    store,
    task,
    connector,
    authorization,
    db,
  };
}

describe('trusted legacy admission retirement', () => {
  it('opening the connector does not freeze, retire, import or execute legacy tasks', async () => {
    const { store, task, connector, scope } = fixture();
    expect(store.legacyFreeze(task.id)).toBeUndefined();
    await expect(connector.resolveLegacy(task.id, scope)).rejects.toThrow(
      'no trusted admission freeze',
    );
    expect(store.detail(task.id)?.runs).toEqual([]);
    expect(store.claim(now)?.id).toBe(task.id);
  });
  it('durably freezes new admissions and mutations while leaving other tasks claimable', () => {
    const { store, task, connector, scope, authorization } = fixture();
    const frozen = connector.prepare(task.id, scope, authorization);
    expect(frozen.snapshot).toBe(JSON.stringify(store.detail(task.id)));
    expect(connector.prepare(task.id, scope, authorization)).toEqual(frozen);
    expect(() => store.action(task.id, 'run')).toThrow('frozen');
    expect(() => store.schedule(task.id, 120)).toThrow('frozen');
    expect(store.claim(now)).toBeNull();
    const another = store.createTask('Unmigrated task');
    expect(store.claim(now)?.id).toBe(another.id);
  });
  it('fences preexisting old SQL connections and prepared claim statements, including INSERT OR REPLACE', () => {
    const { db, task, connector, scope, authorization, store } = fixture();
    const oldClaim = db.prepare(
      "UPDATE tasks SET status='running',lease=?,leaseUntil=? WHERE id=?",
    );
    const oldRun = db.prepare(
      "INSERT INTO runs VALUES (?, ?, 'running', ?, NULL, NULL, NULL)",
    );
    connector.prepare(task.id, scope, authorization);
    expect(() => oldClaim.run('old-claim', now + 180000, task.id)).toThrow(
      'frozen',
    );
    expect(() => oldRun.run('old-claim', task.id, now)).toThrow('frozen');
    expect(() =>
      db
        .prepare('INSERT OR REPLACE INTO tasks SELECT * FROM tasks WHERE id=?')
        .run(task.id),
    ).toThrow('frozen');
    expect(() =>
      db.prepare('DELETE FROM tasks WHERE id=?').run(task.id),
    ).toThrow('read-only');
    expect(() => db.exec('DELETE FROM legacy_schedule_freezes')).toThrow(
      'permanent',
    );
    expect(() =>
      db.exec(
        'INSERT OR REPLACE INTO legacy_schedule_freezes SELECT * FROM legacy_schedule_freezes',
      ),
    ).toThrow('permanent');
    expect(store.detail(task.id)?.runs).toHaveLength(0);
  });
  it('does not reclaim an expired frozen active claim; it permits the original result to finish', async () => {
    const { store, task, connector, scope, authorization } = fixture();
    const claim = store.claim(now)!;
    connector.prepare(task.id, scope, authorization);
    expect(store.claim(now + 180001)).toBeNull();
    expect(store.owns(claim)).toBe(true);
    expect(() => connector.retire(task.id, scope)).toThrow('reconciliation');
    await expect(connector.resolveLegacy(task.id, scope)).rejects.toThrow(
      'reconciliation',
    );
    expect(store.finish(claim, result, now + 190000)).toBe(true);
    const evidence = await connector.resolveLegacy(task.id, scope);
    expect(evidence.declaration.occurrences).toEqual([
      {
        source_occurrence_id: claim.lease,
        due_at: now / 1000,
        state: 'completed',
      },
    ]);
    expect(evidence.definition.schedule_id).toBe(legacyScheduleId(task.id));
    expect(evidence.definition.specification.prompt).toBe(task.prompt);
    expect(evidence.retirementReceipt).toBeNull();
    expect(() => evidence.assertRetired()).toThrow('retirement receipt');
    expect(store.claim(now + 1_000_000)).toBeNull();
  });
  it('finishes real in-process runner work before retirement without introducing another timer', async () => {
    const { store, task, connector, scope, authorization } = fixture();
    let complete!: (value: typeof result) => void;
    const execute = vi.fn(
      () =>
        new Promise<typeof result>((resolve) => {
          complete = resolve;
        }),
    );
    const runner = new Runner(store, { mode: 'sample', baseUrl: '' }, execute);
    const tick = runner.tick();
    connector.prepare(task.id, scope, authorization);
    expect(() => connector.retire(task.id, scope)).toThrow('reconciliation');
    complete(result);
    await tick;
    const retired = connector.retire(task.id, scope);
    await runner.tick();
    expect(execute).toHaveBeenCalledOnce();
    expect(retired.retirementReceipt).toMatch(
      /^dots-retirement-v1:[a-f0-9]{64}$/,
    );
    runner.stop();
  });
  it('does not translate interrupted work or stopped runner into cancelled effects', async () => {
    const { store, task, connector, scope, authorization } = fixture();
    const claim = store.claim(now)!;
    connector.prepare(task.id, scope, authorization);
    store.release(claim, 'Worker stopped; outcome not verified');
    const before = store.detail(task.id);
    expect(before?.runs[0].status).toBe('interrupted');
    expect(connector.inspect(task.id, scope).unresolvedOccurrences).toEqual([
      claim.lease,
    ]);
    await expect(
      connector.reconcile(task.id, claim.lease, scope),
    ).rejects.toThrow('Independent legacy outcome');
    expect(() => connector.retire(task.id, scope)).toThrow('reconciliation');
    expect(store.detail(task.id)).toEqual(before);
  });
  it('records independently verified reconciliation separately, fences late completion and preserves original history', async () => {
    const verifyReconciliation = vi.fn(async () => ({
      outcome: 'failed' as const,
      executionStopped: true as const,
      receipt: 'server-audit:worker-exited-and-no-effect:123',
    }));
    const { store, task, connector, scope, authorization, db } = fixture({
      verifyReconciliation,
    });
    const claim = store.claim(now)!;
    connector.prepare(task.id, scope, authorization);
    const originalRun = store.detail(task.id)!.runs[0];
    const reconciliation = await connector.reconcile(
      task.id,
      claim.lease,
      scope,
    );
    expect(reconciliation.originalRun).toBe(JSON.stringify(originalRun));
    expect(await connector.reconcile(task.id, claim.lease, scope)).toEqual(
      reconciliation,
    );
    expect(verifyReconciliation).toHaveBeenCalledOnce();
    expect(store.finish(claim, result)).toBe(false);
    expect(store.detail(task.id)?.runs[0]).toEqual(originalRun);
    expect(connector.inspect(task.id, scope).unresolvedOccurrences).toEqual([]);
    const retired = connector.retire(task.id, scope);
    const evidence = await connector.resolveLegacy(task.id, scope);
    expect(evidence.declaration.occurrences[0].state).toBe('failed');
    expect(evidence.retirementReceipt).toBe(retired.retirementReceipt);
    expect(() => evidence.assertRetired()).not.toThrow();
    expect(() =>
      db.exec('DELETE FROM legacy_occurrence_reconciliations'),
    ).toThrow('immutable');
    expect(() =>
      db.exec(
        'INSERT OR REPLACE INTO legacy_occurrence_reconciliations SELECT * FROM legacy_occurrence_reconciliations',
      ),
    ).toThrow();
  });
  it('rejects reconciliation when source changes during independent verification', async () => {
    const { store, task, connector, scope, authorization } = fixture({
      verifyReconciliation: async () => {
        finish();
        return {
          outcome: 'cancelled',
          executionStopped: true,
          receipt: 'superseded-server-evidence',
        };
      },
    });
    const claim = store.claim(now)!;
    const finish = () => {
      store.finish(claim, result, now + 1);
    };
    connector.prepare(task.id, scope, authorization);
    await expect(
      connector.reconcile(task.id, claim.lease, scope),
    ).rejects.toThrow('changed during reconciliation');
    expect(store.legacyReconciliations(task.id)).toEqual([]);
    expect(store.detail(task.id)?.runs[0].status).toBe('completed');
  });
  it('rejects a verifier that did not establish stopped execution', async () => {
    const { store, task, connector, scope, authorization } = fixture({
      verifyReconciliation: (async () => ({
        outcome: 'cancelled',
        executionStopped: false,
        receipt: 'not-quiescent',
      })) as unknown as NonNullable<
        LegacyMigrationOptions['verifyReconciliation']
      >,
    });
    const claim = store.claim(now)!;
    connector.prepare(task.id, scope, authorization);
    await expect(
      connector.reconcile(task.id, claim.lease, scope),
    ).rejects.toThrow();
    expect(store.owns(claim)).toBe(true);
    expect(store.legacyReconciliations(task.id)).toEqual([]);
  });
  it('retains immutable retirement and exact original result/event history through reconnect and restart', async () => {
    const {
      path,
      workspace,
      store,
      task,
      connector,
      scope,
      conversation,
      authorization,
      db,
    } = fixture();
    const claim = store.claim(now)!;
    store.finish(claim, result, now + 1000);
    connector.prepare(task.id, scope, authorization);
    const before = await connector.resolveLegacy(task.id, scope);
    const retired = connector.retire(task.id, scope);
    expect(connector.retire(task.id, scope)).toEqual(retired);
    expect(() => before.assertFrozen()).toThrow('evidence changed');
    const reconnectedScope = workspace.runtimeBindings.bindConversation(
      { ...conversation, liveSessionId: 'live-b', liveGeneration: 2 },
      1,
    );
    const reopened = new LegacyScheduleMigration(workspace, path);
    cleanups.push(() => reopened.close());
    const secondStore = new Store(path);
    cleanups.push(() => secondStore.close());
    const evidence = await reopened.resolveLegacy(task.id, reconnectedScope);
    expect(evidence.retirementReceipt).toBe(retired.retirementReceipt);
    expect(evidence.declaration.source_state).toBe('retired');
    expect(() => evidence.assertRetired()).not.toThrow();
    expect(secondStore.claim(now + 1_000_000)).toBeNull();
    const history = connector.inspect(task.id, reconnectedScope);
    expect(history.detail.runs[0].result).toEqual(result);
    expect(history.historyTruncated).toBe(false);
    expect(history.occurrenceTimeBasis).toBe('legacy_admission_started_at');
    expect(() =>
      db.prepare("UPDATE runs SET result='{}' WHERE id=?").run(claim.lease),
    ).toThrow('read-only');
    expect(() =>
      db.prepare('DELETE FROM events WHERE taskId=?').run(task.id),
    ).toThrow('read-only');
    expect(() => store.event(task.id, null, 'Late mutation')).toThrow(
      'read-only',
    );
    expect(() =>
      db.exec("UPDATE legacy_schedule_freezes SET retirementReceipt='forged'"),
    ).toThrow('immutable');
  });
  it('keeps one-time source history inspectable with original occurrence IDs', async () => {
    const { store, task, connector, scope, authorization } = fixture({}, null);
    const claim = store.claim(now)!;
    store.finish(claim, result, now + 1);
    connector.prepare(task.id, scope, authorization);
    connector.retire(task.id, scope);
    const evidence = await connector.resolveLegacy(task.id, scope);
    expect(evidence.definition.trigger.kind).toBe('at');
    expect(evidence.declaration.occurrences[0].source_occurrence_id).toBe(
      claim.lease,
    );
    expect(
      connector.inspect(task.id, scope).detail.task.intervalSeconds,
    ).toBeNull();
  });
  it('refuses ambiguous recurrence changes, foreign bindings and missing explicit unbound mappings', async () => {
    const { store, task, connector, scope, authorization, db } = fixture();
    expect(() =>
      connector.prepare(task.id, scope, {
        ...authorization,
        recurrenceAcknowledgement: 'one_time',
      }),
    ).toThrow('recurrence');
    expect(() =>
      connector.prepare(
        task.id,
        { ...scope, ownerId: 'foreign' },
        authorization,
      ),
    ).toThrow('scope');
    expect(() =>
      connector.prepare(task.id, scope, {
        ...authorization,
        expires_at: now / 1000 - 1,
      }),
    ).toThrow('expired');
    db.prepare('DELETE FROM task_threads WHERE taskId=?').run(task.id);
    expect(() => connector.prepare(task.id, scope, authorization)).toThrow(
      'mapping',
    );
    expect(store.legacyFreeze(task.id)).toBeUndefined();
    connector.prepare(task.id, scope, {
      ...authorization,
      sourceMapping: 'verified_unbound_task',
    });
    await expect(
      connector.resolveLegacy(task.id, {
        ...scope,
        durableSessionId: 'foreign',
      }),
    ).rejects.toThrow('Stale');
  });
  it('does not truncate histories beyond the producer import bound', () => {
    const { store, task, connector, scope, authorization, db } = fixture();
    const insert = db.prepare(
      "INSERT INTO runs VALUES (?, ?, 'completed', ?, ?, NULL, NULL)",
    );
    for (let i = 0; i < 101; i++)
      insert.run(`source-run-${i}`, task.id, now + i, now + i + 1);
    expect(() => connector.prepare(task.id, scope, authorization)).toThrow(
      'no history was truncated',
    );
    expect(store.legacyFreeze(task.id)).toBeUndefined();
    expect(store.detail(task.id)?.runs).toHaveLength(101);
  });
  it('binds unchanged source bytes atomically and refuses a stale pre-freeze snapshot', () => {
    const { store, task } = fixture();
    const before = JSON.stringify(store.task(task.id));
    store.schedule(task.id, 120);
    expect(() =>
      store.freezeLegacyTask(task.id, 'owner', '{}', '{}', now, before),
    ).toThrow('changed before admission freeze');
    expect(store.legacyFreeze(task.id)).toBeUndefined();
  });
  it('revalidates grants on every synchronous fence and does not grant authority from stored evidence', async () => {
    const { workspace, task, connector, scope, authorization } = fixture();
    connector.prepare(task.id, scope, authorization);
    const evidence = await connector.resolveLegacy(task.id, scope);
    workspace.runtimeBindings.revoke(
      'project',
      scope.spaceId!,
      scope.projectRevision!,
    );
    expect(() => evidence.assertFrozen()).toThrow('Space access');
    await expect(connector.resolveLegacy(task.id, scope)).rejects.toThrow(
      'Space access',
    );
  });
  it('rejects moving unrelated task/run rows into frozen history with old SQL', () => {
    const { store, task, connector, scope, authorization, db } = fixture();
    const claim = store.claim(now)!;
    store.finish(claim, result, now + 1);
    connector.prepare(task.id, scope, authorization);
    const other = store.createTask('Other source');
    db.prepare(
      "INSERT INTO runs VALUES ('other-run', ?, 'completed', ?, ?, NULL, NULL)",
    ).run(other.id, now, now + 1);
    expect(() =>
      db
        .prepare('UPDATE OR REPLACE tasks SET id=? WHERE id=?')
        .run(task.id, other.id),
    ).toThrow('frozen');
    expect(() =>
      db.prepare("UPDATE runs SET taskId=? WHERE id='other-run'").run(task.id),
    ).toThrow('frozen');
    expect(() =>
      db
        .prepare("UPDATE OR REPLACE runs SET id=? WHERE id='other-run'")
        .run(claim.lease),
    ).toThrow('frozen');
    expect(store.detail(task.id)?.runs).toHaveLength(1);
  });
  it('rejects altered returned evidence and opening another source database with a valid workspace scope', async () => {
    const { task, connector, scope, authorization, workspace } = fixture();
    connector.prepare(task.id, scope, authorization);
    const evidence = await connector.resolveLegacy(task.id, scope);
    evidence.definition.specification.prompt = 'Unreviewed mutation';
    expect(() => evidence.assertFrozen()).toThrow('evidence changed');
    const separate = new LegacyScheduleMigration(workspace, ':memory:');
    cleanups.push(() => separate.close());
    await expect(separate.resolveLegacy(task.id, scope)).rejects.toThrow(
      'database owner',
    );
  });
});
