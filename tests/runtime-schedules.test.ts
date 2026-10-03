import { describe, expect, it } from 'vitest';
import { contractVersion } from '../src/shared/runtime/contracts';
import {
  canActivateSchedule,
  formatOccurrence,
  notificationsSchema,
  scheduleConfigSchema,
  scheduleSchema,
  schedulesSchema,
} from '../src/shared/runtime/schedules';

const now = Date.parse('2026-03-01T00:00:00Z');
const config = {
  prompt: 'Check for changes',
  threadId: 'thread',
  intervalSeconds: 3600,
  timeZone: 'America/New_York',
  missedRunPolicy: 'skip',
  overlapPolicy: 'queue',
  authorityDescription: 'Check and report to this private thread',
  authorityExpiresAt: now + 86400000,
  maxOccurrences: 5,
};
const schedule = {
  ...config,
  id: 'schedule',
  revision: 2,
  state: 'active',
  nextOccurrenceAt: now + 3600000,
  allowedActions: ['edit', 'run_now', 'pause', 'cancel'],
  occurrences: [],
};
const scope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'agent',
  project: null,
  generation: 1,
};

// These contracts advertise runtime actions; they never create a browser scheduler.
describe('runtime schedules and notifications', () => {
  it('validates explicit time zones and bounded configuration', () => {
    expect(scheduleConfigSchema.safeParse(config).success).toBe(true);
    for (const change of [
      { timeZone: 'Mars/Olympus' },
      { intervalSeconds: 59 },
      { intervalSeconds: 31536001 },
      { intervalSeconds: 60.5 },
      { prompt: 'x'.repeat(16001) },
      { authorityDescription: ' ' },
      { maxOccurrences: 0 },
      { maxOccurrences: 1001 },
      { authorityExpiresAt: 8640000000000001 },
    ])
      expect(
        scheduleConfigSchema.safeParse({ ...config, ...change }).success,
      ).toBe(false);
    expect(
      schedulesSchema.safeParse({
        version: contractVersion,
        scope,
        schedules: [schedule],
      }).success,
    ).toBe(true);
  });

  it('formats supplied instants across DST without computing recurrence', () => {
    const before = scheduleSchema.parse({
      ...schedule,
      nextOccurrenceAt: Date.parse('2026-03-08T06:30:00Z'),
    });
    const after = scheduleSchema.parse({
      ...schedule,
      nextOccurrenceAt: Date.parse('2026-03-08T07:30:00Z'),
    });
    expect(formatOccurrence(before)).toContain('1:30 AM EST');
    expect(formatOccurrence(after)).toContain('3:30 AM EDT');
    expect(formatOccurrence({ ...before, nextOccurrenceAt: null })).toBe(
      'Not scheduled',
    );
    expect(after.nextOccurrenceAt).toBe(Date.parse('2026-03-08T07:30:00Z'));
  });

  it('denies revoked, expired, exhausted, and cancelled activation', () => {
    expect(canActivateSchedule(schedule, now)).toBe(true);
    expect(canActivateSchedule({ ...schedule, allowedActions: [] }, now)).toBe(
      false,
    );
    expect(
      canActivateSchedule({ ...schedule, authorityExpiresAt: now }, now),
    ).toBe(false);
    expect(canActivateSchedule({ ...schedule, state: 'cancelled' }, now)).toBe(
      false,
    );
    expect(canActivateSchedule(schedule, Number.NaN)).toBe(false);
    expect(
      canActivateSchedule(
        {
          ...schedule,
          maxOccurrences: 1,
          occurrences: [
            {
              id: 'occurrence',
              missionId: 'mission',
              status: 'completed',
              startedAt: now,
              delivery: 'unknown',
            },
          ],
        },
        now,
      ),
    ).toBe(false);
  });

  it('cannot manually resume imported or unreconciled schedules', () => {
    for (const state of ['imported_paused', 'awaiting_reconciliation']) {
      expect(
        canActivateSchedule(
          { ...schedule, state, allowedActions: ['resume', 'run_now'] },
          now,
        ),
      ).toBe(false);
    }
    expect(
      canActivateSchedule(
        { ...schedule, state: 'paused', allowedActions: ['resume'] },
        now,
      ),
    ).toBe(true);
    expect(
      canActivateSchedule(
        { ...schedule, state: 'paused', allowedActions: ['run_now'] },
        now,
      ),
    ).toBe(false);
  });

  it('preserves unknown notice delivery and validates UTF-8 byte counts', () => {
    const envelope = {
      version: contractVersion,
      scope,
      notices: [
        {
          id: 'notice',
          revision: 1,
          text: 'Café',
          sha256: 'a'.repeat(64),
          byteLength: 5,
          state: 'unknown',
          allowedActions: ['acknowledge_rendered'],
        },
      ],
    };
    expect(notificationsSchema.parse(envelope).notices[0].state).toBe(
      'unknown',
    );
    expect(
      notificationsSchema.safeParse({
        ...envelope,
        notices: [{ ...envelope.notices[0], byteLength: 4 }],
      }).success,
    ).toBe(false);
    expect(
      notificationsSchema.safeParse({
        ...envelope,
        notices: [{ ...envelope.notices[0], state: 'read' }],
      }).success,
    ).toBe(false);
  });

  it('rejects unsupported fields and duplicate runtime identifiers', () => {
    expect(
      scheduleConfigSchema.safeParse({ ...config, cron: '* * * * *' }).success,
    ).toBe(false);
    expect(
      scheduleSchema.safeParse({ ...schedule, browserTimer: true }).success,
    ).toBe(false);
    expect(
      schedulesSchema.safeParse({
        version: contractVersion,
        scope,
        schedules: [schedule, schedule],
      }).success,
    ).toBe(false);
    expect(
      notificationsSchema.safeParse({
        version: contractVersion,
        scope,
        notices: [],
        unreadCount: 1,
      }).success,
    ).toBe(false);
    expect(
      scheduleSchema.safeParse({
        ...schedule,
        allowedActions: ['resume', 'resume'],
      }).success,
    ).toBe(false);
  });
});
