import { SchedulesPanel } from './SchedulesPanel';
import { useRef, useState } from 'react';
import { missionsSchema } from '../../shared/runtime/missions';
import { useResource } from './use-resource';
import { runtimeAction } from './actions';
import { ExactReviewCard } from './ExactReviewCard';
import { RuntimeStatus } from './RuntimeStatus';
import type { RuntimeConnection } from './use-runtime';
const labels = {
  resume: 'Resume mission',
  new_run: 'Start a new run',
  retry_delivery: 'Retry delivery only',
  pause: 'Request pause',
  cancel: 'Request cancellation',
};
export function MissionsPanel({
  connection,
}: {
  connection: RuntimeConnection;
}) {
  const data = useResource(
    '/runtime/missions',
    missionsSchema,
    connection,
    'missions',
  );
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const scope = connection.setup?.scope;
  const mission = data.data?.missions.find((item) => item.id === selected);
  const run = async (
    path: string,
    action: string,
    payload: Record<string, unknown>,
    revision: number,
    inspectOnly = false,
  ) => {
    if (!scope || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await runtimeAction(scope, path, action, payload, revision, inspectOnly);
      await data.reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Outcome unknown. Inspect before retrying.',
      );
      throw cause;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <section aria-label="Runtime missions">
      <h2>Durable work</h2>
      <p>
        Execution, verified output, delivery and unresolved effects are separate
        facts.
      </p>
      {!connection.available('missions') && (
        <RuntimeStatus connection={connection} compact />
      )}
      {(data.error || error) && (
        <p className="chat-error" role="alert">
          {data.error || error}
        </p>
      )}
      <label className="search-box">
        Search work
        <input
          aria-label="Search runtime missions"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {data.data?.truncated && (
        <p className="notice">
          This bounded mission view is incomplete. Refine the search or inspect
          the runtime archive.
        </p>
      )}
      <div className="task-list">
        {data.data?.missions
          .filter((item) =>
            item.title.toLowerCase().includes(search.toLowerCase()),
          )
          .map((item) => (
            <button
              key={item.id}
              className="task-row"
              onClick={() => setSelected(item.id)}
            >
              <strong>{item.title}</strong>
              <span>{item.state.replaceAll('_', ' ')}</span>
              <small>
                Output {item.output} · Delivery {item.delivery}
              </small>
            </button>
          ))}
      </div>
      {mission && (
        <section className="task-detail-card">
          <h3>{mission.title}</h3>
          <p>
            Mission {mission.id} · revision {mission.revision}
          </p>
          <p>
            Execution: {mission.state.replaceAll('_', ' ')} · Output:{' '}
            {mission.output} · Delivery: {mission.delivery}
          </p>
          <div className="task-controls">
            {mission.allowedActions.map((action) => (
              <button
                key={action}
                disabled={busy}
                onClick={() => {
                  if (
                    action === 'new_run' &&
                    !window.confirm(
                      'Start a new mission? This can repeat work and external effects; delivery recovery is a separate action.',
                    )
                  )
                    return;
                  void run(
                    `/runtime/missions/${encodeURIComponent(mission.id)}/actions`,
                    action,
                    {},
                    mission.revision,
                  ).catch(() => {});
                }}
              >
                {labels[action]}
              </button>
            ))}
          </div>
          {mission.unresolvedEffects.length > 0 && (
            <>
              <h4>Unresolved effects</h4>
              {mission.unresolvedEffects.map((effect) => (
                <p key={effect.id}>
                  {effect.target} · {effect.state} · {effect.id}
                </p>
              ))}
            </>
          )}
          {scope &&
            mission.reviews.map((review) => (
              <ExactReviewCard
                key={`${review.id}:${review.revision}`}
                review={review}
                scope={scope}
                refresh={() => void data.reload()}
                decide={(current, choice, inspectOnly) =>
                  run(
                    `/runtime/reviews/${encodeURIComponent(current.id)}/decision`,
                    'approval.resolve',
                    { approvalDigest: current.approvalDigest, choice },
                    current.revision,
                    inspectOnly,
                  )
                }
              />
            ))}
          <h4>Event history</h4>
          {mission.events.map((event) => (
            <p key={event.id}>
              <time>{new Date(event.time).toLocaleString()}</time> ·{' '}
              {event.summary}
            </p>
          ))}
        </section>
      )}
      <SchedulesPanel connection={connection} />
    </section>
  );
}
