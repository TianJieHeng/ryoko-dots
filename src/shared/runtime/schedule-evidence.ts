import { z } from 'zod';
import { contractVersion, scopeSchema } from './contracts.js';
import { scheduleConfigSchema } from './schedules.js';

/** Bounded browser DTO for the inspected producer's opaque schedule record_json.
 * These inner evidence records are not generated OpenRPC contracts. */
const id = z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const instant = z.number().positive().lt(253402214400);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const zone = scheduleConfigSchema.shape.timeZone;
export const scheduleTriggerSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('at'), at: instant }),
  z.strictObject({
    kind: z.literal('interval'),
    anchor: instant,
    seconds: z
      .number()
      .int()
      .min(60)
      .max(366 * 86400),
  }),
  z.strictObject({
    kind: z.literal('calendar'),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    fold: z.enum(['first', 'second']),
    gap: z.literal('skip'),
  }),
]);
export const commandScheduleDefinitionSchema = z
  .strictObject({
    schema_version: z.literal(1),
    schedule_id: id,
    version: z
      .number()
      .int()
      .positive()
      .lt(2 ** 31),
    project_id: id,
    timezone: zone,
    trigger: scheduleTriggerSchema,
    policy: z.strictObject({
      missed_run: z.enum(['skip', 'run_once']),
      grace_seconds: z.number().int().min(0).max(86400),
      overlap: z.enum(['skip', 'queue']),
    }),
    budget: z.strictObject({
      max_checks: z.number().int().min(1).max(1000),
      max_bytes: z.number().int().min(1).max(2097152),
      deadline_seconds: z.number().int().min(1).max(3600),
    }),
    expires_at: instant,
    kind: z.literal('command'),
    specification: z.strictObject({
      prompt: z.string().min(1).max(16000),
      session_id: id,
      authority_description: z.string().min(1).max(2000),
    }),
  })
  .refine(
    (value) =>
      new TextEncoder().encode(value.specification.prompt).byteLength <=
      value.budget.max_bytes,
    'Prompt exceeds admitted bytes',
  );
export type CommandScheduleDefinition = z.infer<
  typeof commandScheduleDefinitionSchema
>;
export const legacyScheduleDeclarationSchema = z
  .strictObject({
    authority: z.literal('dots_runner'),
    source_id: id,
    source_state: z.enum(['paused', 'retired']),
    unresolved_occurrences: z.array(id).length(0),
    occurrences: z
      .array(
        z.strictObject({
          source_occurrence_id: id,
          due_at: instant,
          state: z.enum(['completed', 'failed', 'cancelled', 'skipped']),
        }),
      )
      .max(100),
  })
  .refine(
    (value) =>
      new Set(value.occurrences.map((item) => item.source_occurrence_id))
        .size === value.occurrences.length,
    'Duplicate legacy occurrence',
  );
export type LegacyScheduleDeclaration = z.infer<
  typeof legacyScheduleDeclarationSchema
>;
const occurrenceSchema = z.strictObject({
  occurrence_id: id,
  version: integer,
  due_at: instant,
  session_id: id,
  command_id: id.nullable(),
  run_id: id.nullable(),
  state: z.enum([
    'accepted',
    'claimed',
    'completed',
    'failed',
    'blocked',
    'cancelled',
    'skipped',
    'outcome_unknown',
  ]),
  generation: integer.nullable(),
  accepted_at: instant,
  mission_id: id.nullable(),
  detail: z.record(z.string(), z.unknown()),
  delivery_id: id.nullable(),
  delivery_state: z.string().max(128),
});
export const commandScheduleRecordSchema = z
  .strictObject({
    schedule_id: id,
    project_id: id,
    version: integer,
    revision: integer,
    state: z.enum(['active', 'paused', 'revoked']),
    next_due: instant.nullable(),
    remaining_checks: integer,
    health: z.string().max(128),
    last_success: instant.nullable(),
    last_error: z.string().max(4096).nullable(),
    owner_agent_id: id,
    sha256,
    definition: commandScheduleDefinitionSchema,
    authority: z.literal('runtime_command_queue'),
    occurrences: z.array(occurrenceSchema).max(50),
    occurrences_total: integer,
    history_truncated: z.boolean(),
    import_declaration: legacyScheduleDeclarationSchema.nullable(),
    cutover_attestation: z
      .strictObject({
        source_id: id,
        retirement_receipt: z.string().min(1).max(2048),
      })
      .nullable(),
    foreign_cutover_verified: z.literal(false).nullable(),
    scheduler_pause_cancels_running: z.literal(false),
    external_effect_authority: z.literal('existing_runtime_policy'),
    execution_requires_live_owned_session: z.literal(true),
  })
  .superRefine((value, ctx) => {
    if (
      value.schedule_id !== value.definition.schedule_id ||
      value.project_id !== value.definition.project_id ||
      value.version !== value.definition.version ||
      value.remaining_checks > value.definition.budget.max_checks ||
      value.occurrences_total < value.occurrences.length ||
      value.history_truncated !==
        value.occurrences_total > value.occurrences.length ||
      new Set(value.occurrences.map((item) => item.occurrence_id)).size !==
        value.occurrences.length ||
      value.occurrences.some(
        (item) => item.session_id !== value.definition.specification.session_id,
      ) ||
      !!value.import_declaration !==
        (value.foreign_cutover_verified === false) ||
      (value.cutover_attestation &&
        value.cutover_attestation.source_id !==
          value.import_declaration?.source_id)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Inconsistent schedule evidence',
      });
  });
export type CommandScheduleRecord = z.infer<typeof commandScheduleRecordSchema>;

/** Interval compatibility intent remains valid; once/calendar never need a fake interval. */
export const scheduleMutationConfigSchema = scheduleConfigSchema
  .omit({ intervalSeconds: true })
  .extend({
    intervalSeconds: scheduleConfigSchema.shape.intervalSeconds.optional(),
    trigger: scheduleTriggerSchema.optional(),
  })
  .refine(
    (value) =>
      value.trigger
        ? value.intervalSeconds === undefined ||
          (value.trigger.kind === 'interval' &&
            value.trigger.seconds === value.intervalSeconds)
        : value.intervalSeconds !== undefined,
    'Choose one explicit recurrence; interval fields must agree.',
  );
export type ScheduleMutationConfig = z.infer<
  typeof scheduleMutationConfigSchema
>;
const envelope = {
  version: z.literal(contractVersion),
  scope: scopeSchema,
  conversationId: z.string().min(1).max(256),
};
export const scheduleEvidenceSchema = z.strictObject({
  ...envelope,
  schedule: commandScheduleRecordSchema,
});
export const schedulesEvidenceSchema = z
  .strictObject({
    ...envelope,
    schedules: z.array(commandScheduleRecordSchema).max(100),
    complete: z.literal(false),
    limit: z.literal(100),
  })
  .refine(
    (value) =>
      new Set(value.schedules.map((row) => row.schedule_id)).size ===
        value.schedules.length &&
      value.schedules.every(
        (row) =>
          row.project_id === value.scope.project &&
          row.owner_agent_id === value.scope.agent,
      ),
    'Duplicate or foreign schedule evidence',
  );
export const schedulerStatusSchema = z
  .strictObject({
    schema_version: z.literal(1),
    authority: z.literal('runtime_cron'),
    enabled: z.boolean(),
    surface: z.enum(['stdio', 'other']),
    state: z.enum([
      'disabled',
      'awaiting_maintenance',
      'waiting',
      'ticking',
      'healthy',
      'lock_busy',
      'standby_other_owner',
      'paused',
      'draining',
      'retired',
      'error',
      'stopping',
      'unsupported_surface',
    ]),
    maintenance_started: z.boolean(),
    maintenance_live: z.boolean(),
    recurring_admission_ready: z.boolean(),
    tick_lock_held: z.boolean(),
    other_gateway_owner_live: z.boolean(),
    poll_interval_seconds: z.number().finite().positive().nullable(),
    last_maintenance_at: instant.nullable(),
    last_tick_started_at: instant.nullable(),
    last_tick_completed_at: instant.nullable(),
    last_tick_succeeded_at: instant.nullable(),
    last_error_code: z.enum(['invalid_config', 'tick_failed']).nullable(),
    execution_requires_live_owned_session: z.literal(true),
    scheduler_pause_cancels_running: z.literal(false),
    dispatch_performed: z.literal(false),
  })
  .refine(
    (value) =>
      !value.recurring_admission_ready ||
      (value.enabled &&
        value.surface === 'stdio' &&
        value.maintenance_started &&
        value.maintenance_live &&
        value.last_tick_succeeded_at !== null &&
        !value.other_gateway_owner_live &&
        ['healthy', 'waiting', 'ticking'].includes(value.state)),
    'Scheduler readiness lacks current maintenance and tick evidence',
  );
export type SchedulerStatus = z.infer<typeof schedulerStatusSchema>;
export const schedulerEvidenceSchema = z.strictObject({
  ...envelope,
  scheduler: schedulerStatusSchema,
});
export type ScheduleActionName =
  'create' | 'edit' | 'pause' | 'resume' | 'cancel' | 'run_now';

export function scheduleNeedsReconciliation(row: CommandScheduleRecord) {
  return (
    row.last_error === 'occurrence_outcome_unknown' ||
    row.occurrences.some((item) => item.state === 'outcome_unknown')
  );
}
export function scheduleNeedsCutover(row: CommandScheduleRecord) {
  return !!row.import_declaration && !row.cutover_attestation;
}
/** UI affordance only; the authenticated runtime rechecks the exact revision and authority. */
export function canActivateScheduleEvidence(
  row: CommandScheduleRecord,
  scheduler: SchedulerStatus | undefined,
  now: number,
) {
  return (
    Number.isFinite(now) &&
    (row.state === 'active' || row.state === 'paused') &&
    row.definition.expires_at * 1000 > now &&
    row.remaining_checks > 0 &&
    !scheduleNeedsReconciliation(row) &&
    !scheduleNeedsCutover(row) &&
    scheduler?.recurring_admission_ready === true
  );
}
export function canEditScheduleEvidence(row: CommandScheduleRecord) {
  return (
    row.state === 'paused' &&
    !scheduleNeedsReconciliation(row) &&
    !scheduleNeedsCutover(row)
  );
}

export function formatScheduleInstant(
  seconds: number | null,
  timeZone: string,
) {
  if (seconds === null) return 'Not reported';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(seconds * 1000);
}
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function formatScheduleRecurrence(row: CommandScheduleRecord) {
  const trigger = row.definition.trigger;
  if (trigger.kind === 'interval')
    return `Every ${trigger.seconds} seconds; anchor ${formatScheduleInstant(trigger.anchor, row.definition.timezone)}`;
  if (trigger.kind === 'at')
    return `Once at ${formatScheduleInstant(trigger.at, row.definition.timezone)}`;
  return `${trigger.weekdays.map((day) => weekdays[day]).join(', ')} at ${String(trigger.hour).padStart(2, '0')}:${String(trigger.minute).padStart(2, '0')} ${row.definition.timezone}; repeated DST time: ${trigger.fold}; missing DST time: skip`;
}
