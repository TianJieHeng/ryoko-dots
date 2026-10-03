import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  RuntimeScheduleService,
  canonicalScheduleIntent,
  type ScheduleAction,
  type ScheduleParams,
  type ScheduleResults,
  type ScheduleTransport,
  type CommandScheduleRecord,
  type CommandScheduleDefinition,
  type VerifiedLegacySchedule,
} from '../src/server/runtime/schedule-service.js';
import type { ControlBinding } from '../src/server/runtime/control-service.js';
import { intentDigest } from '../src/server/runtime/conversation-ledger.js';
const cleanups: (() => void)[] = [];
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach((fn) => fn()),
);
const now = 1791040000000;
function row(definition: CommandScheduleDefinition): CommandScheduleRecord {
  return {
    schedule_id: definition.schedule_id,
    project_id: definition.project_id,
    version: definition.version,
    revision: 1,
    state: 'paused',
    next_due:
      definition.trigger.kind === 'interval'
        ? definition.trigger.anchor
        : definition.trigger.kind === 'at'
          ? definition.trigger.at
          : now / 1000 + 600,
    remaining_checks: definition.budget.max_checks,
    health: 'unknown',
    last_success: null,
    last_error: null,
    owner_agent_id: 'agent-1',
    sha256: 'a'.repeat(64),
    definition,
    authority: 'runtime_command_queue',
    occurrences: [],
    occurrences_total: 0,
    history_truncated: false,
    import_declaration: null,
    cutover_attestation: null,
    foreign_cutover_verified: null,
    scheduler_pause_cancels_running: false,
    external_effect_authority: 'existing_runtime_policy',
    execution_requires_live_owned_session: true,
  };
}
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'be07-service-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const database = join(directory, 'state.sqlite');
  const bound: ControlBinding = {
    scope: {
      ownerId: 'owner-1',
      dotId: 'dot-1',
      gatewayId: 'gateway-1',
      principalId: 'principal-1',
      profileId: 'profile-1',
      agentId: 'agent-1',
      privilegeClass: 'primary',
      agentRevision: 1,
      authorityRevision: 1,
      grantRevision: 1,
      spaceId: 'space-1',
      projectId: 'project-1',
      projectRevision: 1,
      conversationId: 'conversation-1',
      durableSessionId: 'conversation-1',
      liveSessionId: 'live-1',
      liveGeneration: 1,
      revision: 1,
      archived: false,
    },
    binding: {
      key: 'conversation-1',
      liveSessionId: 'live-1',
      durableSessionId: 'conversation-1',
      generation: 1,
    },
    epoch: 1,
  };
  let revoked = false,
    lost = false,
    scheduler = true,
    corrupt = false;
  let migration: VerifiedLegacySchedule | undefined;
  let statusOverride: Partial<
    ScheduleResults['runtime.schedule.scheduler.status']
  > = {};
  const rows = new Map<string, CommandScheduleRecord>();
  const receipts = new Map<
    string,
    ScheduleResults['runtime.command.receipt']
  >();
  const calls: {
    method: keyof ScheduleParams;
    params: Record<string, unknown>;
  }[] = [];
  const transport: ScheduleTransport = {
    config: {
      checkout: '/producer',
      python: '/python',
      home: '/profile',
      runtimeDirectory: '/runtime',
      ownerId: 'owner-1',
      dotId: 'dot-1',
      gatewayId: 'gateway-1',
      identity: {
        principal_id: 'principal-1',
        profile_id: 'profile-1',
        agent_id: 'agent-1',
        policy_digest: 'a'.repeat(64),
        config_digest: 'b'.repeat(64),
      },
    },
    connected: true,
    epoch: 1,
    async call<M extends keyof ScheduleParams>(
      method: M,
      input: ScheduleParams[M],
    ): Promise<ScheduleResults[M]> {
      const params = input as unknown as Record<string, unknown>;
      calls.push({ method, params: structuredClone(params) });
      if (method === 'runtime.schedule.scheduler.status')
        return {
          schema_version: 1,
          authority: 'runtime_cron',
          enabled: scheduler,
          surface: 'stdio',
          state: scheduler ? 'healthy' : 'disabled',
          maintenance_started: true,
          maintenance_live: true,
          recurring_admission_ready: scheduler,
          tick_lock_held: false,
          other_gateway_owner_live: false,
          poll_interval_seconds: 60,
          last_maintenance_at: now / 1000,
          last_tick_started_at: now / 1000,
          last_tick_completed_at: now / 1000,
          last_tick_succeeded_at: scheduler ? now / 1000 : null,
          last_error_code: null,
          execution_requires_live_owned_session: true,
          scheduler_pause_cancels_running: false,
          dispatch_performed: false,
          ...statusOverride,
        } as ScheduleResults[M];
      if (method === 'runtime.command.receipt')
        return structuredClone(
          receipts.get(String(params.command_id)) ?? {
            schema_version: 1,
            command_id: params.command_id,
            found: false,
            receipt: null,
            status: null,
            durable_revision: 0,
            accepted_input: null,
            messages: [],
            messages_has_more: false,
            next_message_cursor: null,
          },
        ) as ScheduleResults[M];
      if (method === 'runtime.schedule.list')
        return {
          record_json: JSON.stringify({ schedules: [...rows.values()] }),
        } as ScheduleResults[M];
      if (method === 'runtime.schedule.get')
        return {
          record_json: JSON.stringify(rows.get(String(params.schedule_id))),
        } as ScheduleResults[M];
      let output: unknown;
      if (
        method === 'runtime.schedule.create' ||
        method === 'runtime.schedule.import'
      ) {
        const definition = JSON.parse(
          String(params.definition_json),
        ) as CommandScheduleDefinition;
        const previous = rows.get(definition.schedule_id);
        const value = row(definition);
        value.revision = (previous?.revision ?? 0) + 1;
        if (method === 'runtime.schedule.import') {
          value.import_declaration = JSON.parse(String(params.import_json));
          value.foreign_cutover_verified = false;
        }
        rows.set(value.schedule_id, value);
        output = value;
      } else if (method === 'runtime.schedule.update') {
        const value = rows.get(String(params.schedule_id))!;
        value.state = params.state as CommandScheduleRecord['state'];
        value.revision++;
        output = value;
      } else if (method === 'runtime.schedule.cutover') {
        const value = rows.get(String(params.schedule_id))!;
        value.revision++;
        value.cutover_attestation = {
          source_id: String(params.source_id),
          retirement_receipt: String(params.retirement_receipt),
        };
        output = value;
      } else if (method === 'runtime.schedule.run_now') {
        const value = rows.get(String(params.schedule_id))!;
        value.revision++;
        value.remaining_checks--;
        output = {
          schedule_id: value.schedule_id,
          occurrence_id: 'occ-1',
          session_id: 'conversation-1',
          command_id: params.command_id,
          command_receipt: {
            schema_version: 1,
            command_id: params.command_id,
            status: 'accepted',
            durable_revision: 5,
            run_id: 'run-1',
          },
          state: 'accepted',
          dispatch_performed: false,
        };
      }
      receipts.set(String(params.command_id), {
        schema_version: 1,
        command_id: String(params.command_id),
        found: true,
        receipt: {
          schema_version: 1,
          command_id: String(params.command_id),
          status: 'accepted',
          durable_revision: 5,
          run_id: 'run-1',
        },
        status:
          method === 'runtime.schedule.run_now' ? 'accepted' : 'completed',
        durable_revision: 5,
        accepted_input: null,
        messages: [],
        messages_has_more: false,
        next_message_cursor: null,
      });
      if (lost) throw new Error('connection lost after commit');
      if (corrupt) output = {};
      return { record_json: JSON.stringify(output) } as ScheduleResults[M];
    },
  };
  const services: RuntimeScheduleService[] = [];
  const open = () => {
    const service = new RuntimeScheduleService(
      'owner-1',
      database,
      transport,
      async () => bound,
      (_scope, auth) => {
        auth();
        if (revoked) throw new Error('Revoked');
      },
      {
        now: () => now,
        assertSchedulerOwner: () => {
          if (!scheduler) throw new Error('No verified scheduler owner');
        },
        resolveLegacy: async () => {
          if (!migration) throw new Error('No migration');
          return migration;
        },
      },
    );
    services.push(service);
    return service;
  };
  cleanups.push(() =>
    services.forEach((service) => {
      try {
        service.close();
      } catch {
        /* closed for restart */
      }
    }),
  );
  const config = {
    prompt: 'Prepare a private summary',
    threadId: 'conversation-1',
    intervalSeconds: 60,
    timeZone: 'America/New_York',
    missedRunPolicy: 'run_once',
    overlapPolicy: 'skip',
    authorityDescription: 'Private draft only',
    authorityExpiresAt: now + 3600000,
    maxOccurrences: 3,
  };
  const make = (
    action: ScheduleAction['action'],
    path = '/runtime/schedules',
    payload: Record<string, unknown> = config,
    revision = 0,
    operationId: string = randomUUID(),
  ): ScheduleAction => ({
    operationId,
    intentDigest: intentDigest(
      canonicalScheduleIntent({
        path,
        action,
        payload,
        expectedRevision: revision,
      }),
    ),
    action,
    payload,
    expectedRevision: revision,
    expectedGeneration: 1,
  });
  return {
    open,
    rows,
    receipts,
    calls,
    bound,
    transport,
    database,
    config,
    make,
    setLost: (value: boolean) => (lost = value),
    setRevoked: (value: boolean) => (revoked = value),
    setScheduler: (value: boolean) => (scheduler = value),
    setCorrupt: (value: boolean) => (corrupt = value),
    setMigration: (value: VerifiedLegacySchedule) => (migration = value),
    setStatus: (value: typeof statusOverride) => (statusOverride = value),
  };
}
async function create(
  f: ReturnType<typeof fixture>,
  service: RuntimeScheduleService,
) {
  const action = f.make('create');
  expect(
    (
      await service.admit(
        'conversation-1',
        '/runtime/schedules',
        action,
        () => {},
      )
    ).status,
  ).toBe('accepted');
  return [...f.rows.values()][0];
}
describe('BE07 schedule adapter', () => {
  it('creates one immutable paused interval on the canonical bound conversation', async () => {
    const f = fixture(),
      service = f.open(),
      value = await create(f, service);
    expect(value.state).toBe('paused');
    expect(value.definition.trigger).toEqual({
      kind: 'interval',
      seconds: 60,
      anchor: now / 1000 + 60,
    });
    expect(value.definition.specification.session_id).toBe('conversation-1');
    expect(value.definition.policy).toEqual({
      missed_run: 'run_once',
      grace_seconds: 120,
      overlap: 'skip',
    });
    expect(f.calls.map((call) => call.method)).toEqual([
      'runtime.schedule.create',
    ]);
  });
  it('recovers a lost create response across adapter restart using the original receipt only', async () => {
    const f = fixture();
    let service = f.open();
    const action = f.make('create');
    f.setLost(true);
    expect(
      (
        await service.admit(
          'conversation-1',
          '/runtime/schedules',
          action,
          () => {},
        )
      ).status,
    ).toBe('outcome_unknown');
    service.close();
    service = f.open();
    f.setLost(false);
    f.bound.scope.liveSessionId = f.bound.binding.liveSessionId = 'live-2';
    f.bound.scope.liveGeneration++;
    f.bound.epoch = 2;
    Object.assign(f.transport, { epoch: 2 });
    expect(
      (
        await service.admit(
          'conversation-1',
          '/runtime/schedules',
          action,
          () => {},
        )
      ).status,
    ).toBe('accepted');
    expect(
      f.calls.filter((call) => call.method === 'runtime.schedule.create'),
    ).toHaveLength(1);
    expect(f.calls.at(-1)?.method).toBe('runtime.command.receipt');
  });
  it('cannot claim a global operation ID from another family', async () => {
    const f = fixture(),
      service = f.open(),
      action = f.make('create');
    const db = new DatabaseSync(f.database);
    db.prepare('INSERT INTO runtime_operation_registry VALUES(?,?,?,?,?)').run(
      action.operationId,
      'owner-1',
      'command',
      action.intentDigest,
      'other',
    );
    db.close();
    await expect(
      service.admit('conversation-1', '/runtime/schedules', action, () => {}),
    ).rejects.toThrow('conflicts');
    expect(f.calls).toHaveLength(0);
  });
  it('rejects changed intent and forged conversation without dispatch', async () => {
    const f = fixture(),
      service = f.open(),
      action = f.make('create');
    await service.admit(
      'conversation-1',
      '/runtime/schedules',
      action,
      () => {},
    );
    await expect(
      service.admit(
        'conversation-1',
        '/runtime/schedules',
        f.make(
          'create',
          '/runtime/schedules',
          { ...f.config, prompt: 'Changed' },
          0,
          action.operationId,
        ),
        () => {},
      ),
    ).rejects.toThrow('conflicts');
    await expect(
      service.admit(
        'conversation-1',
        '/runtime/schedules',
        f.make('create', '/runtime/schedules', {
          ...f.config,
          threadId: 'foreign',
        }),
        () => {},
      ),
    ).rejects.toThrow('conversation mismatch');
    expect(
      f.calls.filter((call) => call.method === 'runtime.schedule.create'),
    ).toHaveLength(1);
  });
  it('gates recurring activation on verified scheduler ownership and leaves pause distinct from mission cancellation', async () => {
    const f = fixture(),
      service = f.open(),
      value = await create(f, service),
      path = `/runtime/schedules/${value.schedule_id}/actions`;
    f.setScheduler(false);
    await expect(
      service.admit(
        'conversation-1',
        path,
        f.make('resume', path, {}, value.revision),
        () => {},
      ),
    ).rejects.toThrow('scheduler');
    f.setScheduler(true);
    await service.admit(
      'conversation-1',
      path,
      f.make('resume', path, {}, value.revision),
      () => {},
    );
    await service.admit(
      'conversation-1',
      path,
      f.make('pause', path, {}, value.revision),
      () => {},
    );
    await service.admit(
      'conversation-1',
      path,
      f.make('cancel', path, {}, value.revision),
      () => {},
    );
    expect(
      f.calls
        .filter((call) => call.method === 'runtime.schedule.update')
        .map((call) => call.params.state),
    ).toEqual(['active', 'paused', 'revoked']);
    expect(
      f.calls.every((call) => !String(call.method).includes('mission')),
    ).toBe(true);
  });
  it('retains one run-now identity on response loss and does not replay on delivery failure', async () => {
    const f = fixture(),
      service = f.open(),
      value = await create(f, service),
      path = `/runtime/schedules/${value.schedule_id}/actions`;
    await service.admit(
      'conversation-1',
      path,
      f.make('resume', path, {}, value.revision),
      () => {},
    );
    const action = f.make('run_now', path, {}, value.revision);
    f.setLost(true);
    expect(
      (await service.admit('conversation-1', path, action, () => {})).status,
    ).toBe('outcome_unknown');
    f.setLost(false);
    expect((await service.inspect(action.operationId, () => {})).status).toBe(
      'accepted',
    );
    await service.admit('conversation-1', path, action, () => {});
    expect(
      f.calls.filter((call) => call.method === 'runtime.schedule.run_now'),
    ).toHaveLength(1);
    expect(value.remaining_checks).toBe(2);
  });
  it('never invents acceptance when original operation is absent', async () => {
    const f = fixture(),
      service = f.open(),
      action = f.make('create');
    f.setLost(true);
    await service.admit(
      'conversation-1',
      '/runtime/schedules',
      action,
      () => {},
    );
    f.receipts.clear();
    expect((await service.inspect(action.operationId, () => {})).status).toBe(
      'outcome_unknown',
    );
    expect(
      f.calls.filter((call) => call.method === 'runtime.schedule.create'),
    ).toHaveLength(1);
  });
  it('keeps malformed post-dispatch evidence unknown and permits later exact recovery', async () => {
    const f = fixture(),
      service = f.open(),
      action = f.make('create');
    f.setCorrupt(true);
    expect(
      (
        await service.admit(
          'conversation-1',
          '/runtime/schedules',
          action,
          () => {},
        )
      ).status,
    ).toBe('outcome_unknown');
    expect((await service.inspect(action.operationId, () => {})).status).toBe(
      'accepted',
    );
  });
  it('rejects expired authority, stale revision, and revoked owner before mutation', async () => {
    const f = fixture(),
      service = f.open();
    await expect(
      service.admit(
        'conversation-1',
        '/runtime/schedules',
        f.make('create', '/runtime/schedules', {
          ...f.config,
          authorityExpiresAt: now - 1,
        }),
        () => {},
      ),
    ).rejects.toThrow('expired');
    const value = await create(f, service),
      path = `/runtime/schedules/${value.schedule_id}/actions`;
    await expect(
      service.admit(
        'conversation-1',
        path,
        f.make('pause', path, {}, 99),
        () => {},
      ),
    ).rejects.toThrow('revision');
    f.setRevoked(true);
    await expect(
      service.readSchedules('conversation-1', () => {}),
    ).rejects.toThrow('Revoked');
    expect(
      f.calls.filter((call) => call.method === 'runtime.schedule.update'),
    ).toHaveLength(0);
  });
  it('preserves one-time/calendar trigger and explicit fold/gap policy without inventing recurrence', async () => {
    const f = fixture(),
      service = f.open();
    const triggers = [
      { kind: 'at', at: now / 1000 + 300 },
      {
        kind: 'calendar',
        hour: 1,
        minute: 30,
        weekdays: [6],
        fold: 'second',
        gap: 'skip',
      },
    ];
    for (const trigger of triggers) {
      await service.admit(
        'conversation-1',
        '/runtime/schedules',
        f.make('create', '/runtime/schedules', {
          ...Object.fromEntries(
            Object.entries(f.config).filter(
              ([key]) => key !== 'intervalSeconds',
            ),
          ),
          trigger,
        }),
        () => {},
      );
    }
    expect(
      [...f.rows.values()].map((value) => value.definition.trigger),
    ).toEqual(triggers);
    const list = await service.readSchedules('conversation-1', () => {});
    expect(list.complete).toBe(false);
    expect(list.schedules).toHaveLength(2);
    expect(() =>
      service.projectInterval(list.schedules[0], 'conversation-1'),
    ).toThrow('recurrence-aware');
  });
  it('preserves remaining budget and admission-versus-start evidence in the FE compatibility view', async () => {
    const f = fixture(),
      service = f.open(),
      value = await create(f, service);
    value.state = 'active';
    value.remaining_checks = 0;
    expect(
      service.projectInterval(value, 'conversation-1').allowedActions,
    ).toEqual(['cancel', 'pause']);
    expect(
      service.projectInterval(value, 'conversation-1').nextOccurrenceAt,
    ).toBeNull();
  });
  it('requires observed producer scheduler health even when deployment configuration is enabled', async () => {
    const f = fixture(),
      service = f.open(),
      value = await create(f, service);
    const path = `/runtime/schedules/${value.schedule_id}/actions`;
    f.setStatus({
      enabled: true,
      recurring_admission_ready: false,
      state: 'awaiting_maintenance',
      last_tick_succeeded_at: null,
    });
    const proof = await service.readSchedulerStatus('conversation-1', () => {});
    expect(proof.scheduler.enabled).toBe(true);
    expect(proof.scheduler.recurring_admission_ready).toBe(false);
    await expect(
      service.admit(
        'conversation-1',
        path,
        f.make('resume', path, {}, value.revision),
        () => {},
      ),
    ).rejects.toThrow('not currently qualified');
    expect(
      f.calls.filter((call) => call.method === 'runtime.schedule.update'),
    ).toHaveLength(0);
  });
  it('rejects a contradictory claimed-ready scheduler proof', async () => {
    const f = fixture(),
      service = f.open(),
      value = await create(f, service);
    const path = `/runtime/schedules/${value.schedule_id}/actions`;
    f.setStatus({ recurring_admission_ready: true, maintenance_live: false });
    await expect(
      service.admit(
        'conversation-1',
        path,
        f.make('resume', path, {}, value.revision),
        () => {},
      ),
    ).rejects.toThrow('Inconsistent scheduler');
    expect(
      f.calls.filter((call) => call.method === 'runtime.schedule.update'),
    ).toHaveLength(0);
  });
  it('requires trusted frozen migration and separate immutable retirement attestation', async () => {
    const f = fixture(),
      service = f.open(),
      original = await create(f, service);
    const sourceId = 'legacy-task-1';
    const scheduleId = `import_${intentDigest(JSON.stringify(sourceId)).slice(0, 32)}`;
    let frozen = true,
      retired = false;
    const migration: VerifiedLegacySchedule = {
      declaration: {
        authority: 'dots_runner',
        source_id: sourceId,
        source_state: 'paused',
        unresolved_occurrences: [],
        occurrences: [
          {
            source_occurrence_id: 'legacy-run-1',
            due_at: now / 1000 - 60,
            state: 'completed',
          },
        ],
      },
      definition: { ...original.definition, schedule_id: scheduleId },
      retirementReceipt: 'retirement-1',
      assertFrozen: () => {
        if (!frozen) throw new Error('Old runner still admits');
      },
      assertRetired: () => {
        if (!retired) throw new Error('Old runner still owns');
      },
    };
    f.setMigration(migration);
    const op = randomUUID();
    await service.importLegacy('conversation-1', op, sourceId, 1, () => {});
    await service.importLegacy('conversation-1', op, sourceId, 1, () => {});
    expect(
      f.calls.filter((call) => call.method === 'runtime.schedule.import'),
    ).toHaveLength(1);
    const imported = f.rows.get(scheduleId)!,
      path = `/runtime/schedules/${scheduleId}/actions`;
    await expect(
      service.admit(
        'conversation-1',
        path,
        f.make('resume', path, {}, imported.revision),
        () => {},
      ),
    ).rejects.toThrow('reconciliation');
    await expect(
      service.cutoverLegacy(
        'conversation-1',
        randomUUID(),
        sourceId,
        scheduleId,
        imported.revision,
        1,
        () => {},
      ),
    ).rejects.toThrow('still owns');
    retired = true;
    await service.cutoverLegacy(
      'conversation-1',
      randomUUID(),
      sourceId,
      scheduleId,
      imported.revision,
      1,
      () => {},
    );
    expect(imported.cutover_attestation).toEqual({
      source_id: sourceId,
      retirement_receipt: 'retirement-1',
    });
    frozen = false;
    await expect(
      service.importLegacy(
        'conversation-1',
        randomUUID(),
        sourceId,
        1,
        () => {},
      ),
    ).rejects.toThrow('still admits');
  });
});
