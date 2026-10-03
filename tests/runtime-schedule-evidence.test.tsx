import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { contractVersion } from '../src/shared/runtime/contracts';
import {
  canActivateScheduleEvidence,
  canEditScheduleEvidence,
  commandScheduleRecordSchema,
  formatScheduleInstant,
  formatScheduleRecurrence,
  scheduleMutationConfigSchema,
  schedulesEvidenceSchema,
  schedulerStatusSchema,
} from '../src/shared/runtime/schedule-evidence';
import {
  ScheduleForm,
  ScheduleEvidenceCard,
  SchedulerEvidence,
  SchedulesPanel,
} from '../src/client/runtime/SchedulesPanel';
import { checkScheduleBinding } from '../src/client/runtime/use-schedules';
import type { RuntimeConnection } from '../src/client/runtime/use-runtime';
import {
  scheduleConfig,
  scheduleFixture,
  scheduleNow,
  scheduleScope,
  schedulerFixture,
} from './fixtures/runtime/schedule-evidence';
afterEach(() => vi.useRealTimers());
describe('recurrence-aware schedule evidence', () => {
  it('accepts existing interval intent and explicit once/calendar without a fabricated interval', () => {
    expect(
      scheduleMutationConfigSchema.parse(scheduleConfig).intervalSeconds,
    ).toBe(3600);
    const base = { ...scheduleConfig, intervalSeconds: undefined };
    const once = scheduleMutationConfigSchema.parse({
      ...base,
      trigger: { kind: 'at', at: scheduleNow / 1000 + 600 },
    });
    expect(once.intervalSeconds).toBeUndefined();
    expect(
      scheduleMutationConfigSchema.parse({
        ...base,
        trigger: {
          kind: 'calendar',
          hour: 1,
          minute: 30,
          weekdays: [6],
          fold: 'second',
          gap: 'skip',
        },
      }).trigger?.kind,
    ).toBe('calendar');
    for (const change of [
      {},
      {
        trigger: {
          kind: 'calendar',
          hour: 1,
          minute: 30,
          weekdays: [6],
          gap: 'skip',
        },
      },
      {
        trigger: {
          kind: 'calendar',
          hour: 1,
          minute: 30,
          weekdays: [],
          fold: 'first',
          gap: 'skip',
        },
      },
      { timeZone: 'Mars/Olympus', intervalSeconds: 60 },
      { trigger: { kind: 'at', at: scheduleNow / 1000 }, intervalSeconds: 60 },
    ])
      expect(
        scheduleMutationConfigSchema.safeParse({ ...base, ...change }).success,
      ).toBe(false);
  });
  it('preserves raw skipped/cancelled/unknown states, accepted time, delivery and incomplete history', () => {
    for (const state of ['skipped', 'cancelled', 'outcome_unknown'] as const) {
      const row = scheduleFixture();
      row.occurrences[0].state = state;
      const result = commandScheduleRecordSchema.parse(row);
      expect(result.occurrences[0]).toMatchObject({
        state,
        accepted_at: row.occurrences[0].accepted_at,
        delivery_state: 'retry_wait',
      });
      expect(result.history_truncated).toBe(true);
      expect(result.remaining_checks).toBe(3);
    }
    const row = scheduleFixture();
    expect(
      commandScheduleRecordSchema.safeParse({
        ...row,
        history_truncated: false,
      }).success,
    ).toBe(false);
    expect(
      commandScheduleRecordSchema.safeParse({ ...row, remaining_checks: 101 })
        .success,
    ).toBe(false);
  });
  it('uses remaining budget even with capped history and requires real readiness', () => {
    const row = scheduleFixture(),
      scheduler = schedulerFixture();
    expect(canActivateScheduleEvidence(row, scheduler, scheduleNow)).toBe(true);
    expect(
      canActivateScheduleEvidence(
        { ...row, remaining_checks: 0 },
        scheduler,
        scheduleNow,
      ),
    ).toBe(false);
    expect(canActivateScheduleEvidence(row, undefined, scheduleNow)).toBe(
      false,
    );
    expect(
      canActivateScheduleEvidence(
        row,
        { ...scheduler, recurring_admission_ready: false },
        scheduleNow,
      ),
    ).toBe(false);
    expect(
      canActivateScheduleEvidence(
        row,
        scheduler,
        row.definition.expires_at * 1000,
      ),
    ).toBe(false);
    expect(
      canActivateScheduleEvidence(
        { ...row, last_error: 'occurrence_outcome_unknown' },
        scheduler,
        scheduleNow,
      ),
    ).toBe(false);
    expect(
      canActivateScheduleEvidence(
        { ...row, state: 'revoked' },
        scheduler,
        scheduleNow,
      ),
    ).toBe(false);
    expect(canEditScheduleEvidence({ ...row, state: 'active' })).toBe(false);
  });
  it('fails closed for pending legacy cutover and unknown outcomes', () => {
    const row = scheduleFixture();
    row.import_declaration = {
      authority: 'dots_runner',
      source_id: 'old',
      source_state: 'paused',
      unresolved_occurrences: [],
      occurrences: [],
    };
    row.foreign_cutover_verified = false;
    expect(
      canActivateScheduleEvidence(row, schedulerFixture(), scheduleNow),
    ).toBe(false);
    expect(canEditScheduleEvidence(row)).toBe(false);
    row.cutover_attestation = {
      source_id: 'old',
      retirement_receipt: 'receipt',
    };
    expect(
      canActivateScheduleEvidence(row, schedulerFixture(), scheduleNow),
    ).toBe(true);
    row.occurrences[0].state = 'outcome_unknown';
    expect(
      canActivateScheduleEvidence(row, schedulerFixture(), scheduleNow),
    ).toBe(false);
    expect(canEditScheduleEvidence(row)).toBe(false);
  });
  it('rejects config-only, stale maintenance and foreign-owner scheduler readiness', () => {
    for (const patch of [
      { enabled: false },
      { maintenance_live: false },
      { maintenance_started: false },
      { last_tick_succeeded_at: null },
      { other_gateway_owner_live: true },
      { state: 'lock_busy' },
      { surface: 'other' },
    ])
      expect(
        schedulerStatusSchema.safeParse({ ...schedulerFixture(), ...patch })
          .success,
      ).toBe(false);
    expect(
      schedulerStatusSchema.safeParse({
        ...schedulerFixture(),
        state: 'disabled',
        enabled: false,
        recurring_admission_ready: false,
      }).success,
    ).toBe(true);
  });
  it('formats runtime instants and explicit calendar DST choices without deriving next due', () => {
    expect(
      formatScheduleInstant(
        Date.parse('2026-11-01T05:30Z') / 1000,
        'America/New_York',
      ),
    ).toContain('EDT');
    expect(
      formatScheduleInstant(
        Date.parse('2026-11-01T06:30Z') / 1000,
        'America/New_York',
      ),
    ).toContain('EST');
    const row = scheduleFixture();
    row.definition.trigger = {
      kind: 'calendar',
      hour: 1,
      minute: 30,
      weekdays: [6],
      fold: 'second',
      gap: 'skip',
    };
    expect(formatScheduleRecurrence(row)).toBe(
      'Sun at 01:30 America/New_York; repeated DST time: second; missing DST time: skip',
    );
    row.definition.trigger = { kind: 'at', at: scheduleNow / 1000 };
    expect(formatScheduleRecurrence(row)).toMatch(/^Once at/);
  });
  it('rejects foreign or falsely complete snapshots, keeping the declared cap', () => {
    const envelope = {
      version: contractVersion,
      scope: scheduleScope,
      conversationId: 'chat',
      schedules: [scheduleFixture()],
      complete: false,
      limit: 100,
    };
    expect(schedulesEvidenceSchema.safeParse(envelope).success).toBe(true);
    for (const patch of [
      { complete: true },
      { limit: 500 },
      { schedules: [scheduleFixture(), scheduleFixture()] },
      { scope: { ...scheduleScope, project: 'other' } },
    ])
      expect(
        schedulesEvidenceSchema.safeParse({ ...envelope, ...patch }).success,
      ).toBe(false);
  });
  it('allows only server-resolved project enrichment with every other scope field fixed', () => {
    const envelope = { scope: scheduleScope, conversationId: 'chat' };
    expect(() =>
      checkScheduleBinding(
        envelope,
        { ...scheduleScope, project: null },
        'chat',
      ),
    ).not.toThrow();
    for (const patch of [
      { agent: 'other' },
      { owner: 'other' },
      { gateway: 'other' },
      { generation: 2 },
      { project: null },
    ])
      expect(() =>
        checkScheduleBinding(
          { ...envelope, scope: { ...scheduleScope, ...patch } },
          { ...scheduleScope, project: null },
          'chat',
        ),
      ).toThrow();
    expect(() =>
      checkScheduleBinding(
        envelope,
        { ...scheduleScope, project: 'different' },
        'chat',
      ),
    ).toThrow();
    expect(() =>
      checkScheduleBinding(envelope, scheduleScope, 'other-chat'),
    ).toThrow();
  });
});
describe('schedule display', () => {
  it('renders raw evidence, budget, truncation and separate cancellation without collapsing outcomes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(scheduleNow);
    const html = renderToStaticMarkup(
      <ScheduleEvidenceCard
        schedule={scheduleFixture()}
        scheduler={schedulerFixture()}
        busy={false}
        onAction={() => {}}
        onEdit={() => {}}
      />,
    );
    for (const text of [
      'Remaining accepted-occurrence budget: 3 of 100',
      'History is truncated',
      'status skipped',
      'delivery state retry_wait',
      'execution start not reported',
      'Resume exact revision 5',
      'Edit paused definition',
      'Already accepted commands and deliveries are retained',
      'definition version 2',
    ])
      expect(html).toContain(text);
    expect(html).not.toContain('status held');
    expect(html).not.toContain('Cancel running mission');
  });
  it('disables resume with absent scheduler proof and never offers edit for an active definition', () => {
    vi.useFakeTimers();
    vi.setSystemTime(scheduleNow);
    const html = renderToStaticMarkup(
      <ScheduleEvidenceCard
        schedule={scheduleFixture()}
        busy={false}
        onAction={() => {}}
        onEdit={() => {}}
      />,
    );
    expect(html).toContain(
      '<button disabled="">Resume exact revision 5</button>',
    );
    const active = renderToStaticMarkup(
      <ScheduleEvidenceCard
        schedule={{ ...scheduleFixture(), state: 'active' }}
        busy={false}
        onAction={() => {}}
        onEdit={() => {}}
      />,
    );
    expect(active).toContain('Pause future occurrences');
    expect(active).not.toContain('Edit paused definition');
  });
  it('renders paused creation and exact once/calendar time semantics', () => {
    const connection = {
      setup: { scope: scheduleScope },
      available: () => false,
    } as unknown as RuntimeConnection;
    const once = scheduleFixture();
    once.definition.trigger = { kind: 'at', at: scheduleNow / 1000 + 60.123 };
    const onceHtml = renderToStaticMarkup(
      <ScheduleForm
        connection={connection}
        threadId="chat"
        initial={once}
        onDone={() => {}}
      />,
    );
    expect(onceHtml).toContain('One-time instant (UTC)');
    expect(onceHtml).toContain('2026-10-03T18:01:00.123');
    expect(onceHtml).toContain('Save new paused definition');
    const calendar = scheduleFixture();
    calendar.definition.trigger = {
      kind: 'calendar',
      hour: 1,
      minute: 30,
      weekdays: [6],
      fold: 'second',
      gap: 'skip',
    };
    const calendarHtml = renderToStaticMarkup(
      <ScheduleForm
        connection={connection}
        threadId="chat"
        initial={calendar}
        onDone={() => {}}
      />,
    );
    expect(calendarHtml).toContain('Repeated time when clocks move back');
    expect(calendarHtml).toContain(
      'Missing local times when clocks move forward are skipped',
    );
    expect(calendarHtml).toContain('value="second" selected=""');
    const create = renderToStaticMarkup(
      <ScheduleForm
        connection={connection}
        threadId="chat"
        onDone={() => {}}
      />,
    );
    expect(create).toContain('Create paused schedule');
    expect(create).toContain('explicitly resume its exact revision');
  });
  it('shows actual readiness and asks for a selected conversation rather than a global list', () => {
    const html = renderToStaticMarkup(
      <SchedulerEvidence
        scheduler={{
          ...schedulerFixture(),
          enabled: false,
          state: 'disabled',
          recurring_admission_ready: false,
        }}
      />,
    );
    expect(html).toContain('recurring admission not ready');
    expect(html).toContain('Last successful locked tick');
    const empty = renderToStaticMarkup(
      <SchedulesPanel connection={{} as RuntimeConnection} />,
    );
    expect(empty).toContain('Choose an existing conversation');
  });
});
