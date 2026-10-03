import { useRef, useState } from 'react';
import {
  canActivateSchedule,
  formatOccurrence,
  notificationsSchema,
  scheduleConfigSchema,
  schedulesSchema,
  type RuntimeSchedule,
} from '../../shared/runtime/schedules';
import { useResource } from './use-resource';
import { runtimeAction } from './actions';
import { RuntimeStatus } from './RuntimeStatus';
import type { RuntimeConnection } from './use-runtime';
export function ScheduleForm({
  connection,
  threadId,
  initial,
  onDone,
}: {
  connection: RuntimeConnection;
  threadId: string;
  initial?: RuntimeSchedule;
  onDone: () => void;
}) {
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [minutes, setMinutes] = useState(
    String((initial?.intervalSeconds ?? 86400) / 60),
  );
  const [zone, setZone] = useState(
    initial?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [missed, setMissed] = useState<'skip' | 'run_once'>(
    initial?.missedRunPolicy ?? 'skip',
  );
  const [overlap, setOverlap] = useState<'skip' | 'queue'>(
    initial?.overlapPolicy ?? 'skip',
  );
  const [authority, setAuthority] = useState(
    initial?.authorityDescription ??
      'Prepare a draft for review; do not publish or send externally.',
  );
  const [expires, setExpires] = useState(
    new Date(initial?.authorityExpiresAt ?? Date.now() + 30 * 86400000)
      .toISOString()
      .slice(0, 16),
  );
  const [limit, setLimit] = useState(String(initial?.maxOccurrences ?? 30));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          lock.current ||
          !connection.setup?.scope ||
          !connection.available('schedules')
        )
          return;
        lock.current = true;
        setBusy(true);
        setError('');
        try {
          const config = scheduleConfigSchema.parse({
            prompt,
            threadId,
            intervalSeconds: Number(minutes) * 60,
            timeZone: zone,
            missedRunPolicy: missed,
            overlapPolicy: overlap,
            authorityDescription: authority,
            authorityExpiresAt: Date.parse(`${expires}Z`),
            maxOccurrences: Number(limit),
          });
          if (config.authorityExpiresAt <= Date.now())
            throw new Error('Authority expiration must be in the future.');
          await runtimeAction(
            connection.setup.scope,
            initial
              ? `/runtime/schedules/${encodeURIComponent(initial.id)}/actions`
              : '/runtime/schedules',
            initial ? 'edit' : 'create',
            config,
            initial?.revision ?? 0,
          );
          onDone();
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Schedule outcome unknown. Inspect the original operation.',
          );
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
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
        Repeat interval (minutes)
        <input
          type="number"
          min="1"
          max="525600"
          required
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
        />
      </label>
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
          <option value="run_once">Run at most one missed occurrence</option>
        </select>
      </label>
      <label className="field-label">
        Overlap policy
        <select
          value={overlap}
          onChange={(event) => setOverlap(event.target.value as typeof overlap)}
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
          required
          value={expires}
          onChange={(event) => setExpires(event.target.value)}
        />
      </label>
      <label className="field-label">
        Maximum occurrences
        <input
          type="number"
          required
          min="1"
          max="1000"
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
        />
      </label>
      <p className="muted">
        The runtime validates existing grants and calculates the next
        occurrence. Scheduling never grants new permission to publish or send
        outputs.
      </p>
      {error && (
        <p role="alert" className="chat-error">
          {error}
        </p>
      )}
      <button
        className="primary"
        disabled={busy || !connection.available('schedules')}
      >
        {busy
          ? 'Awaiting schedule receipt…'
          : initial
            ? 'Save exact revision'
            : 'Create bounded schedule'}
      </button>
    </form>
  );
}
export function SchedulesPanel({
  connection,
}: {
  connection: RuntimeConnection;
}) {
  const schedules = useResource(
    '/runtime/schedules',
    schedulesSchema,
    connection,
    'schedules',
  );
  const notices = useResource(
    '/runtime/notifications',
    notificationsSchema,
    connection,
    'schedules',
  );
  const [editing, setEditing] = useState<RuntimeSchedule>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const textNodes = useRef(new Map<string, HTMLParagraphElement>());
  const act = async (
    path: string,
    action: string,
    payload: Record<string, unknown>,
    revision: number,
  ) => {
    if (!connection.setup?.scope || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await runtimeAction(
        connection.setup.scope,
        path,
        action,
        payload,
        revision,
      );
      await Promise.all([schedules.reload(), notices.reload()]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unknown outcome; inspect the same operation.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section aria-label="Schedules and delivery">
      <h2>Schedules</h2>
      <p>
        Create a schedule from its conversation. Occurrence ownership stays on
        the runtime.
      </p>
      {!connection.available('schedules') && (
        <RuntimeStatus connection={connection} compact />
      )}
      {(error || schedules.error || notices.error) && (
        <p role="alert" className="chat-error">
          {error || schedules.error || notices.error}
        </p>
      )}
      {schedules.data?.schedules.map((schedule) => (
        <article className="task-detail-card" key={schedule.id}>
          <h3>{schedule.prompt}</h3>
          <p>
            {schedule.state.replaceAll('_', ' ')} · every{' '}
            {schedule.intervalSeconds / 60} minutes · {schedule.timeZone}
          </p>
          <p>Next occurrence: {formatOccurrence(schedule)}</p>
          <p>
            Missed: {schedule.missedRunPolicy} · overlap:{' '}
            {schedule.overlapPolicy} · maximum {schedule.maxOccurrences}{' '}
            occurrences
          </p>
          <p>
            Authority: {schedule.authorityDescription} · expires{' '}
            {new Date(schedule.authorityExpiresAt).toISOString()}
          </p>
          <div className="task-controls">
            {schedule.allowedActions.map((action) => (
              <button
                key={action}
                disabled={
                  busy ||
                  (['run_now', 'resume'].includes(action) &&
                    !canActivateSchedule(schedule, Date.now()))
                }
                onClick={() => {
                  if (
                    ['run_now', 'resume'].includes(action) &&
                    !canActivateSchedule(schedule, Date.now())
                  ) {
                    setError(
                      'Schedule authority expired or requires reconciliation.',
                    );
                    return;
                  }
                  if (action === 'edit') setEditing(schedule);
                  else
                    void act(
                      `/runtime/schedules/${encodeURIComponent(schedule.id)}/actions`,
                      action,
                      {},
                      schedule.revision,
                    );
                }}
              >
                {action.replaceAll('_', ' ')}
              </button>
            ))}
          </div>
          <details>
            <summary>Occurrence history</summary>
            {schedule.occurrences.map((occurrence) => (
              <p key={occurrence.id}>
                {occurrence.id} · {occurrence.status} · mission{' '}
                {occurrence.missionId ?? 'not admitted'} · delivery{' '}
                {occurrence.delivery}
              </p>
            ))}
          </details>
        </article>
      ))}
      {editing && (
        <section className="task-detail-card">
          <h3>Edit schedule revision {editing.revision}</h3>
          <ScheduleForm
            key={`${editing.id}:${editing.revision}`}
            connection={connection}
            threadId={editing.threadId}
            initial={editing}
            onDone={() => {
              setEditing(undefined);
              void schedules.reload();
            }}
          />
          <button onClick={() => setEditing(undefined)}>Cancel edit</button>
        </section>
      )}
      <h2>Notification delivery</h2>
      <p>
        Delivered transport bytes and displayed text do not prove human reading.
        Held drafts are reviewed in Activity without rerunning their missions.
      </p>
      {notices.data?.notices.map((notice) => (
        <article className="task-detail-card" key={notice.id}>
          <p
            ref={(node) => {
              if (node) textNodes.current.set(notice.id, node);
              else textNodes.current.delete(notice.id);
            }}
          >
            {notice.text}
          </p>
          <p>
            {notice.state} · notice {notice.id} · revision {notice.revision}
          </p>
          {notice.allowedActions.includes('retry_delivery') && (
            <button
              disabled={busy}
              onClick={() =>
                void act(
                  `/runtime/notifications/${encodeURIComponent(notice.id)}/actions`,
                  'retry_delivery',
                  {},
                  notice.revision,
                )
              }
            >
              Retry delivery only
            </button>
          )}
          {notice.allowedActions.includes('acknowledge_rendered') && (
            <button
              disabled={busy}
              onClick={async () => {
                try {
                  const node = textNodes.current.get(notice.id);
                  if (
                    !node?.isConnected ||
                    document.hidden ||
                    node.textContent !== notice.text
                  )
                    throw new Error(
                      'Notice is not currently rendered completely.',
                    );
                  const bytes = new TextEncoder().encode(notice.text);
                  const digest = Array.from(
                    new Uint8Array(
                      await crypto.subtle.digest('SHA-256', bytes),
                    ),
                    (byte) => byte.toString(16).padStart(2, '0'),
                  ).join('');
                  if (
                    bytes.length !== notice.byteLength ||
                    digest !== notice.sha256
                  )
                    throw new Error('Notice bytes failed validation.');
                  await act(
                    `/runtime/notifications/${encodeURIComponent(notice.id)}/actions`,
                    'acknowledge_rendered',
                    {
                      sha256: digest,
                      byteLength: bytes.length,
                      humanRead: false,
                    },
                    notice.revision,
                  );
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : 'Notice validation failed.',
                  );
                }
              }}
            >
              Acknowledge displayed text
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
