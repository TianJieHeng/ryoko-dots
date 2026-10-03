import { z } from 'zod';
import { contractVersion, scopeSchema } from './contracts.js';

const id = z.string().trim().min(1).max(256);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
// JavaScript Dates cannot represent milliseconds outside this range.
const epochMilliseconds = z.number().int().nonnegative().max(8640000000000000);
const deliveryState = z.enum([
  'held',
  'queued',
  'delivered',
  'failed',
  'unknown',
]);
const timeZone = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
      return true;
    } catch {
      return false;
    }
  }, 'Unsupported time zone');

/** Configuration is a bounded intent; only the runtime schedules occurrences. */
export const scheduleConfigSchema = z.strictObject({
  prompt: z.string().trim().min(1).max(16000),
  threadId: id,
  intervalSeconds: z.number().int().min(60).max(31536000),
  timeZone,
  missedRunPolicy: z.enum(['skip', 'run_once']),
  overlapPolicy: z.enum(['skip', 'queue']),
  authorityDescription: z.string().trim().min(1).max(2000),
  authorityExpiresAt: epochMilliseconds,
  maxOccurrences: z.number().int().min(1).max(1000),
});
export type RuntimeScheduleConfig = z.infer<typeof scheduleConfigSchema>;

export const occurrenceSchema = z.strictObject({
  id,
  missionId: id.nullable(),
  status: z.enum([
    'scheduled',
    'running',
    'held',
    'completed',
    'failed',
    'unknown',
  ]),
  startedAt: epochMilliseconds.nullable(),
  delivery: deliveryState,
});
export type RuntimeOccurrence = z.infer<typeof occurrenceSchema>;

export const scheduleSchema = scheduleConfigSchema.extend({
  id,
  revision,
  state: z.enum([
    'active',
    'paused',
    'cancelled',
    'awaiting_reconciliation',
    'imported_paused',
  ]),
  nextOccurrenceAt: epochMilliseconds.nullable(),
  allowedActions: z
    .array(z.enum(['edit', 'run_now', 'pause', 'resume', 'cancel']))
    .max(5)
    .refine(
      (values) => new Set(values).size === values.length,
      'Duplicate actions',
    ),
  occurrences: z
    .array(occurrenceSchema)
    .max(1000)
    .refine(
      (values) =>
        new Set(values.map((value) => value.id)).size === values.length,
      'Duplicate occurrences',
    ),
});
export type RuntimeSchedule = z.infer<typeof scheduleSchema>;
export const schedulesSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  schedules: z
    .array(scheduleSchema)
    .max(500)
    .refine(
      (values) =>
        new Set(values.map((value) => value.id)).size === values.length,
      'Duplicate schedules',
    ),
});
export type RuntimeSchedules = z.infer<typeof schedulesSchema>;

export const noticeSchema = z
  .strictObject({
    id,
    revision,
    text: z.string().max(16000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteLength: z.number().int().nonnegative().max(64000),
    state: deliveryState,
    allowedActions: z
      .array(z.enum(['retry_delivery', 'acknowledge_rendered']))
      .max(2)
      .refine(
        (values) => new Set(values).size === values.length,
        'Duplicate actions',
      ),
  })
  .refine(
    (value) =>
      new TextEncoder().encode(value.text).byteLength === value.byteLength,
    'Notice byte length does not match text',
  );
export type RuntimeNotice = z.infer<typeof noticeSchema>;
export const notificationsSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  notices: z
    .array(noticeSchema)
    .max(500)
    .refine(
      (values) =>
        new Set(values.map((value) => value.id)).size === values.length,
      'Duplicate notices',
    ),
});
export type RuntimeNotifications = z.infer<typeof notificationsSchema>;

/** UI affordance only. The runtime must recheck authority when admitting work. */
export function canActivateSchedule(schedule: unknown, now: number): boolean {
  const parsed = scheduleSchema.safeParse(schedule);
  if (!parsed.success || !epochMilliseconds.safeParse(now).success)
    return false;
  const value = parsed.data;
  return (
    value.authorityExpiresAt > now &&
    value.occurrences.length < value.maxOccurrences &&
    ((value.state === 'active' && value.allowedActions.includes('run_now')) ||
      (value.state === 'paused' && value.allowedActions.includes('resume')))
  );
}

/** Display a runtime-owned instant; never derive recurrence or use browser timers. */
export function formatOccurrence(schedule: RuntimeSchedule): string {
  if (schedule.nextOccurrenceAt === null) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: schedule.timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(schedule.nextOccurrenceAt);
}
