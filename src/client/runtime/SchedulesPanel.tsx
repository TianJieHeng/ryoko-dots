import { useEffect, useRef, useState } from 'react';
import {
  canActivateScheduleEvidence,
  canEditScheduleEvidence,
  formatScheduleInstant,
  formatScheduleRecurrence,
  scheduleMutationConfigSchema,
  scheduleNeedsCutover,
  scheduleNeedsReconciliation,
  schedulesEvidenceSchema,
  schedulerEvidenceSchema,
  type CommandScheduleRecord,
  type ScheduleActionName,
  type SchedulerStatus,
} from '../../shared/runtime/schedule-evidence';
import { sameScope, type RuntimeScope } from '../../shared/runtime/contracts';
import { RuntimeStatus } from './RuntimeStatus';
import type { RuntimeConnection } from './use-runtime';
import { useSchedulesResource } from './use-schedules';
import {
  inspectScheduleOperation,
  performScheduleOperation,
  readPendingScheduleOperation,
  type ScheduleOperation,
} from './schedule-actions';

function useScheduleOperations(
  scope: RuntimeScope | undefined,
  conversationId: string,
) {
  const [pending, setPending] = useState<ScheduleOperation>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const generation = useRef(0);
  const key = JSON.stringify([scope, conversationId]);
  useEffect(() => {
    generation.current++;
    setMessage('');
    try {
      setPending(
        scope ? readPendingScheduleOperation(scope, conversationId) : undefined,
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : 'Original operation cannot be read.',
      );
    }
    return () => {
      generation.current++;
    };
  }, [key]);
  const run = async (
    action?: ScheduleActionName,
    payload: Record<string, unknown> = {},
    revision = 0,
    scheduleId?: string,
  ) => {
    if (!scope || lock.current) return false;
    lock.current = true;
    const current = generation.current;
    setBusy(true);
    setMessage('');
    try {
      const result = action
        ? await performScheduleOperation(
            scope,
            conversationId,
            action,
            payload,
            revision,
            scheduleId,
          )
        : await inspectScheduleOperation(scope, conversationId);
      if (generation.current !== current) return false;
      setMessage(
        result.reason ||
          (result.status === 'accepted'
            ? 'Original operation accepted; execution and delivery are separate.'
            : result.status),
      );
      return result.status === 'accepted';
    } catch (cause) {
      if (generation.current === current)
        setMessage(
          cause instanceof Error
            ? cause.message
            : 'Outcome unknown. Inspect the original operation.',
        );
      return false;
    } finally {
      lock.current = false;
      if (generation.current === current) {
        setBusy(false);
        try {
          setPending(readPendingScheduleOperation(scope, conversationId));
        } catch {
          setMessage(
            'Original operation could not be read. No new action will be sent.',
          );
        }
      }
    }
  };
  return { pending, busy, message, run };
}
type Operations = ReturnType<typeof useScheduleOperations>;
function OperationRecovery({
  operation,
  onAccepted,
}: {
  operation: Operations;
  onAccepted: () => void;
}) {
  return (
    <>
      {operation.message && <p role="status">{operation.message}</p>}
      {operation.pending && (
        <aside className="notice" aria-label="Original schedule operation">
          <p>
            Original {operation.pending.intent.action} operation{' '}
            {operation.pending.operationId} · expected revision{' '}
            {operation.pending.intent.expectedRevision}
          </p>
          <p>
            The outcome is unresolved. Changes and repeated submissions are
            blocked. Inspection only reads the original receipt and never
            resends the action.
          </p>
          <button
            type="button"
            disabled={operation.busy}
            onClick={async () => {
              if (await operation.run()) onAccepted();
            }}
          >
            Inspect original schedule operation
          </button>
        </aside>
      )}
    </>
  );
}
const utcInput = (seconds: number) =>
  new Date(seconds * 1000).toISOString().slice(0, -1);
const weekdayNames = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export function ScheduleForm({
  connection,
  threadId,
  initial,
  onDone,
}: {
  connection: RuntimeConnection;
  threadId: string;
  initial?: CommandScheduleRecord;
  onDone: () => void;
}) {
  const definition = initial?.definition;
  const trigger = definition?.trigger;
  const scheduler = useSchedulesResource(
    threadId,
    '/scheduler',
    schedulerEvidenceSchema,
    connection,
  );
  const operation = useScheduleOperations(scheduler.data?.scope, threadId);
  const [prompt, setPrompt] = useState(definition?.specification.prompt ?? '');
  const [kind, setKind] = useState<'interval' | 'at' | 'calendar'>(
    trigger?.kind ?? 'interval',
  );
  const [seconds, setSeconds] = useState(
    String(trigger?.kind === 'interval' ? trigger.seconds : 86400),
  );
  const [once, setOnce] = useState(
    trigger?.kind === 'at' ? utcInput(trigger.at) : '',
  );
  const [hour, setHour] = useState(
    String(trigger?.kind === 'calendar' ? trigger.hour : 9),
  );
  const [minute, setMinute] = useState(
    String(trigger?.kind === 'calendar' ? trigger.minute : 0),
  );
  const [weekdays, setWeekdays] = useState<number[]>(
    trigger?.kind === 'calendar' ? trigger.weekdays : [0, 1, 2, 3, 4],
  );
  const [fold, setFold] = useState<'first' | 'second'>(
    trigger?.kind === 'calendar' ? trigger.fold : 'first',
  );
  const [zone, setZone] = useState(
    definition?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [missed, setMissed] = useState<'skip' | 'run_once'>(
    definition?.policy.missed_run ?? 'skip',
  );
  const [overlap, setOverlap] = useState<'skip' | 'queue'>(
    definition?.policy.overlap ?? 'skip',
  );
  const [authority, setAuthority] = useState(
    definition?.specification.authority_description ??
      'Prepare a draft for review; do not publish or send externally.',
  );
  const [expires, setExpires] = useState(
    utcInput(definition?.expires_at ?? Date.now() / 1000 + 30 * 86400),
  );
  const [limit, setLimit] = useState(
    String(definition?.budget.max_checks ?? 30),
  );
  const [error, setError] = useState('');
  const editable = !initial || canEditScheduleEvidence(initial);
  const unavailable =
    !connection.available('schedules') ||
    !scheduler.data?.scope ||
    !editable ||
    !!(
      initial &&
      scheduler.data &&
      (initial.project_id !== scheduler.data.scope.project ||
        initial.owner_agent_id !== scheduler.data.scope.agent)
    );
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (operation.busy || operation.pending || unavailable) return;
        setError('');
        try {
          const config = scheduleMutationConfigSchema.parse({
            prompt,
            threadId,
            ...(kind === 'interval'
              ? { intervalSeconds: Number(seconds) }
              : {
                  trigger:
                    kind === 'at'
                      ? { kind, at: Date.parse(`${once}Z`) / 1000 }
                      : {
                          kind,
                          hour: Number(hour),
                          minute: Number(minute),
                          weekdays,
                          fold,
                          gap: 'skip',
                        },
                }),
            timeZone: zone,
            missedRunPolicy: missed,
            overlapPolicy: overlap,
            authorityDescription: authority,
            authorityExpiresAt: Date.parse(`${expires}Z`),
            maxOccurrences: Number(limit),
          });
          if (config.authorityExpiresAt <= Date.now())
            throw new Error('Authority expiration must be in the future.');
          if (
            config.trigger?.kind === 'at' &&
            (config.trigger.at * 1000 <= Date.now() ||
              config.trigger.at * 1000 >= config.authorityExpiresAt)
          )
            throw new Error(
              'The one-time instant must be in the future and before authority expires.',
            );
          if (
            await operation.run(
              initial ? 'edit' : 'create',
              config,
              initial?.revision ?? 0,
              initial?.schedule_id,
            )
          )
            onDone();
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Invalid schedule configuration.',
          );
        }
      }}
    >
      <p>
        Saved schedules start paused. Review the stored definition, then
        explicitly resume its exact revision. Editing creates a new immutable
        definition version and leaves it paused.
      </p>
      {!editable && (
        <p role="alert">Pause and reconcile this schedule before editing.</p>
      )}
      <fieldset disabled={operation.busy || !!operation.pending || unavailable}>
        <legend>
          {initial
            ? `New definition after version ${initial.version}, revision ${initial.revision}`
            : 'Bounded schedule intent'}
        </legend>
        <label className="field-label">
          Task in this conversation
          <textarea
            required
            maxLength={16000}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
        <label className="field-label">
          Recurrence
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            <option value="interval">Elapsed interval</option>
            <option value="at">One-time instant</option>
            <option value="calendar">Weekly calendar time</option>
          </select>
        </label>
        {kind === 'interval' && (
          <label className="field-label">
            Repeat interval (seconds)
            <input
              type="number"
              min="60"
              max="31536000"
              step="1"
              required
              value={seconds}
              onChange={(event) => setSeconds(event.target.value)}
            />
          </label>
        )}
        {kind === 'at' && (
          <label className="field-label">
            One-time instant (UTC)
            <input
              type="datetime-local"
              step="0.001"
              required
              value={once}
              onChange={(event) => setOnce(event.target.value)}
            />
            <span>
              Enter UTC explicitly. The runtime-owned instant is displayed in
              the selected IANA timezone.
            </span>
          </label>
        )}
        {kind === 'calendar' && (
          <>
            <label className="field-label">
              Local hour in selected timezone
              <input
                type="number"
                min="0"
                max="23"
                required
                value={hour}
                onChange={(event) => setHour(event.target.value)}
              />
            </label>
            <label className="field-label">
              Local minute
              <input
                type="number"
                min="0"
                max="59"
                required
                value={minute}
                onChange={(event) => setMinute(event.target.value)}
              />
            </label>
            <fieldset>
              <legend>Local weekdays</legend>
              {weekdayNames.map((name, day) => (
                <label key={name}>
                  <input
                    type="checkbox"
                    checked={weekdays.includes(day)}
                    onChange={(event) =>
                      setWeekdays(
                        event.target.checked
                          ? [...weekdays, day].sort()
                          : weekdays.filter((value) => value !== day),
                      )
                    }
                  />
                  {name}
                </label>
              ))}
            </fieldset>
            <label className="field-label">
              Repeated time when clocks move back
              <select
                value={fold}
                onChange={(event) => setFold(event.target.value as typeof fold)}
              >
                <option value="first">First occurrence</option>
                <option value="second">Second occurrence</option>
              </select>
            </label>
            <p>
              Missing local times when clocks move forward are skipped. The
              runtime applies these DST rules and computes the next instant.
            </p>
          </>
        )}
        <label className="field-label">
          IANA timezone
          <input
            required
            value={zone}
            onChange={(event) => setZone(event.target.value)}
            placeholder="America/New_York"
          />
        </label>
        <label className="field-label">
          Missed run policy
          <select
            value={missed}
            onChange={(event) => setMissed(event.target.value as typeof missed)}
          >
            <option value="skip">Skip missed occurrences</option>
            <option value="run_once">
              Run at most one missed occurrence within grace
            </option>
          </select>
        </label>
        <label className="field-label">
          Overlap policy
          <select
            value={overlap}
            onChange={(event) =>
              setOverlap(event.target.value as typeof overlap)
            }
          >
            <option value="skip">Skip while previous work runs</option>
            <option value="queue">Queue under runtime limits</option>
          </select>
        </label>
        <label className="field-label">
          Requested authority boundary
          <textarea
            required
            maxLength={2000}
            value={authority}
            onChange={(event) => setAuthority(event.target.value)}
          />
        </label>
        <label className="field-label">
          Authority expires (UTC)
          <input
            type="datetime-local"
            step="0.001"
            required
            value={expires}
            onChange={(event) => setExpires(event.target.value)}
          />
        </label>
        <label className="field-label">
          Maximum accepted occurrences for this definition
          <input
            type="number"
            min="1"
            max="1000"
            required
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
          />
        </label>
        <p className="muted">
          The runtime validates existing grants. Scheduling never grants new
          permission to publish or send outputs. It freezes interval anchors and
          computes all next times.
        </p>
        <button className="primary">
          {operation.busy
            ? 'Awaiting schedule receipt…'
            : initial
              ? 'Save new paused definition'
              : 'Create paused schedule'}
        </button>
      </fieldset>
      {(error || scheduler.error) && (
        <p role="alert">{error || scheduler.error}</p>
      )}
      <OperationRecovery operation={operation} onAccepted={onDone} />
    </form>
  );
}

export function SchedulerEvidence({
  scheduler,
}: {
  scheduler: SchedulerStatus;
}) {
  return (
    <aside className="notice" aria-label="Runtime scheduler readiness">
      <p>
        Runtime scheduler: {scheduler.state} · recurring admission{' '}
        {scheduler.recurring_admission_ready ? 'ready' : 'not ready'}
      </p>
      <p>
        Configured: {scheduler.enabled ? 'enabled' : 'disabled'} · maintenance:{' '}
        {scheduler.maintenance_live ? 'live' : 'not live'} · shared tick lock:{' '}
        {scheduler.tick_lock_held ? 'held' : 'not observed held'} · other
        gateway owner:{' '}
        {scheduler.other_gateway_owner_live ? 'live' : 'not observed live'}
      </p>
      <p>
        Last successful locked tick:{' '}
        {formatScheduleInstant(scheduler.last_tick_succeeded_at, 'UTC')} · last
        maintenance:{' '}
        {formatScheduleInstant(scheduler.last_maintenance_at, 'UTC')}
      </p>
      {scheduler.last_error_code && (
        <p>Scheduler error: {scheduler.last_error_code}</p>
      )}
      <p>
        Readiness is a runtime observation, not a guarantee of future execution.
        Dispatch requires a live owned session and current authorization.
      </p>
    </aside>
  );
}
export function ScheduleEvidenceCard({
  schedule,
  scheduler,
  busy,
  onEdit,
  onAction,
}: {
  schedule: CommandScheduleRecord;
  scheduler?: SchedulerStatus;
  busy: boolean;
  onEdit: () => void;
  onAction: (action: ScheduleActionName) => void;
}) {
  const definition = schedule.definition;
  const activate = canActivateScheduleEvidence(schedule, scheduler, Date.now());
  return (
    <article
      className="task-detail-card"
      aria-label={`Schedule ${schedule.schedule_id}`}
    >
      <h3>{definition.specification.prompt}</h3>
      <p>
        Schedule {schedule.schedule_id} · definition version {schedule.version}{' '}
        · revision {schedule.revision} · {schedule.state}
      </p>
      <p>{formatScheduleRecurrence(schedule)}</p>
      <p>
        Runtime next due:{' '}
        {formatScheduleInstant(schedule.next_due, definition.timezone)} ·
        timezone {definition.timezone}
        {schedule.state !== 'active' &&
          ' · admissions are stopped while this schedule is not active'}
      </p>
      <p>
        Remaining accepted-occurrence budget: {schedule.remaining_checks} of{' '}
        {definition.budget.max_checks} · recorded occurrence total:{' '}
        {schedule.occurrences_total}
      </p>
      <p>
        Missed: {definition.policy.missed_run} · grace:{' '}
        {definition.policy.grace_seconds} seconds · overlap:{' '}
        {definition.policy.overlap}
      </p>
      <p>
        Authority: {definition.specification.authority_description} · expires{' '}
        {formatScheduleInstant(definition.expires_at, definition.timezone)}
      </p>
      <p>
        Per-occurrence bounds: {definition.budget.max_bytes} bytes ·{' '}
        {definition.budget.deadline_seconds} seconds · health: {schedule.health}
      </p>
      {schedule.last_error && <p>Runtime error: {schedule.last_error}</p>}
      {scheduleNeedsReconciliation(schedule) && (
        <p role="status">
          An occurrence outcome is unknown. Inspect accepted command and
          delivery evidence; do not replay it or activate more work.
        </p>
      )}
      {scheduleNeedsCutover(schedule) && (
        <p role="status">
          Legacy ownership retirement is not attested. This import cannot be
          activated.
        </p>
      )}
      {schedule.import_declaration && (
        <p>
          Imported from {schedule.import_declaration.source_id} · source{' '}
          {schedule.import_declaration.source_state} · retirement{' '}
          {schedule.cutover_attestation
            ? 'attested by trusted Dots connector'
            : 'not attested'}{' '}
          · foreign retirement independently verified by producer: no
        </p>
      )}
      <div className="task-controls">
        {schedule.state === 'active' && (
          <button disabled={busy} onClick={() => onAction('pause')}>
            Pause future occurrences
          </button>
        )}
        {schedule.state === 'paused' && (
          <>
            <button
              disabled={busy || !canEditScheduleEvidence(schedule)}
              onClick={onEdit}
            >
              Edit paused definition
            </button>
            <button
              disabled={busy || !activate}
              onClick={() => onAction('resume')}
            >
              Resume exact revision {schedule.revision}
            </button>
          </>
        )}
        {schedule.state === 'active' && (
          <button
            disabled={busy || !activate}
            onClick={() => onAction('run_now')}
          >
            Run once now
          </button>
        )}
        {schedule.state !== 'revoked' && (
          <button disabled={busy} onClick={() => onAction('cancel')}>
            Revoke future occurrences
          </button>
        )}
      </div>
      <p>
        Pause or revoke stops future admissions. Already accepted commands and
        deliveries are retained; request mission cancellation separately in
        Durable work above.
      </p>
      <details>
        <summary>
          Occurrence history ({schedule.occurrences.length} shown of{' '}
          {schedule.occurrences_total})
        </summary>
        {schedule.history_truncated && (
          <p role="status">
            History is truncated. Budget comes from the runtime remaining count,
            not the displayed rows.
          </p>
        )}
        {schedule.occurrences.map((occurrence) => (
          <div key={occurrence.occurrence_id}>
            <p>
              {occurrence.occurrence_id} · definition version{' '}
              {occurrence.version} · status {occurrence.state}
            </p>
            <p>
              Due{' '}
              {formatScheduleInstant(occurrence.due_at, definition.timezone)} ·
              accepted{' '}
              {formatScheduleInstant(
                occurrence.accepted_at,
                definition.timezone,
              )}{' '}
              · execution start not reported
            </p>
            <p>
              Command {occurrence.command_id ?? 'not reported'} · run{' '}
              {occurrence.run_id ?? 'not reported'} · mission{' '}
              {occurrence.mission_id ?? 'not reported'}
            </p>
            <p>
              Delivery {occurrence.delivery_id ?? 'not reported'} · delivery
              state {occurrence.delivery_state}
            </p>
          </div>
        ))}
      </details>
    </article>
  );
}
export function SchedulesPanel({
  connection,
  conversationId,
}: {
  connection: RuntimeConnection;
  conversationId?: string;
}) {
  return (
    <section aria-label="Schedules and delivery">
      <h2>Schedules</h2>
      {conversationId ? (
        <ConversationSchedules
          key={JSON.stringify([conversationId, connection.setup?.scope])}
          connection={connection}
          conversationId={conversationId}
        />
      ) : (
        <p>Choose an existing conversation above to inspect its schedules.</p>
      )}
    </section>
  );
}
function ConversationSchedules({
  connection,
  conversationId,
}: {
  connection: RuntimeConnection;
  conversationId: string;
}) {
  const schedules = useSchedulesResource(
    conversationId,
    '',
    schedulesEvidenceSchema,
    connection,
  );
  const scheduler = useSchedulesResource(
    conversationId,
    '/scheduler',
    schedulerEvidenceSchema,
    connection,
  );
  const scope =
    scheduler.data &&
    schedules.data &&
    sameScope(scheduler.data.scope, schedules.data.scope)
      ? scheduler.data.scope
      : undefined;
  const operation = useScheduleOperations(scope, conversationId);
  const [editing, setEditing] = useState<CommandScheduleRecord>();
  const [error, setError] = useState('');
  const refresh = () => {
    void schedules.reload();
    void scheduler.reload();
  };
  const observedScheduler =
    Date.now() - scheduler.observedAt < 15000
      ? scheduler.data?.scheduler
      : undefined;
  return (
    <>
      <p>
        Create a schedule from its conversation. The runtime owns each
        occurrence. Delivery retries are inspected separately in Durable work
        and never rerun the schedule.
      </p>
      {!connection.available('schedules') && (
        <RuntimeStatus connection={connection} compact />
      )}
      {scheduler.data && (
        <SchedulerEvidence scheduler={scheduler.data.scheduler} />
      )}
      {(error || schedules.error || scheduler.error) && (
        <p role="alert">{error || schedules.error || scheduler.error}</p>
      )}
      <button disabled={operation.busy} onClick={refresh}>
        Refresh schedule evidence
      </button>
      <OperationRecovery operation={operation} onAccepted={refresh} />
      {schedules.data && (
        <p>
          The runtime returns a capped project snapshot of at most{' '}
          {schedules.data.limit} schedules, filtered to this conversation. This
          list is not complete.
        </p>
      )}
      {schedules.data?.schedules.map((schedule) => (
        <ScheduleEvidenceCard
          key={schedule.schedule_id}
          schedule={schedule}
          scheduler={observedScheduler}
          busy={operation.busy || !!operation.pending || !scope}
          onEdit={() => setEditing(schedule)}
          onAction={async (action) => {
            if (
              ['resume', 'run_now'].includes(action) &&
              !canActivateScheduleEvidence(
                schedule,
                Date.now() - scheduler.observedAt < 15000
                  ? scheduler.data?.scheduler
                  : undefined,
                Date.now(),
              )
            ) {
              setError(
                'Fresh scheduler readiness and unexpired, reconciled budget are required.',
              );
              return;
            }
            setError('');
            if (
              await operation.run(
                action,
                {},
                schedule.revision,
                schedule.schedule_id,
              )
            )
              refresh();
          }}
        />
      ))}
      {editing && (
        <section className="task-detail-card">
          <h3>Edit paused schedule</h3>
          <ScheduleForm
            key={`${editing.schedule_id}:${editing.revision}`}
            connection={connection}
            threadId={conversationId}
            initial={editing}
            onDone={() => {
              setEditing(undefined);
              refresh();
            }}
          />
          <button onClick={() => setEditing(undefined)}>Close edit</button>
        </section>
      )}
    </>
  );
}
