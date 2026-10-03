import { useEffect, useRef, useState } from 'react';
import { PageEffectReceipt } from './PageEffectReceipt';
import { SchedulesPanel } from './SchedulesPanel';
import { CommandResults } from './CommandResults';
import { useResource } from './use-resource';
import { runtimeAction } from './actions';
import { RuntimeStatus } from './RuntimeStatus';
import type { RuntimeConnection } from './use-runtime';
import {
  conversationRuntimePath,
  forConversation,
  runtimeControlSchema,
  runtimeEffectsSchema,
  runtimeMissionsSchema,
  runtimeReviewsSchema,
} from './control-contracts';
import {
  MissionDetail,
  ReviewDetail,
  DeliveryDetail,
  type ControlAction,
} from './MissionDetails';

type Props = {
  connection: RuntimeConnection;
  conversationId?: string;
  conversations: { id: string; title: string }[];
  onConversationChange: (id: string) => void;
};
export function MissionsPanel({
  connection,
  conversationId,
  conversations,
  onConversationChange,
}: Props) {
  const selected = conversations.find((row) => row.id === conversationId);
  return (
    <section aria-label="Runtime missions">
      <h2>Durable work</h2>
      <p>
        Execution, verified output, delivery and unresolved effects are separate
        facts.
      </p>
      <label>
        Activity conversation
        <select
          aria-label="Activity conversation"
          value={selected?.id ?? ''}
          onChange={(event) => onConversationChange(event.target.value)}
        >
          <option value="">Choose a conversation</option>
          {conversations.map((row) => (
            <option key={row.id} value={row.id}>
              {row.title}
            </option>
          ))}
        </select>
      </label>
      {selected && connection.setup?.scope ? (
        <ConversationActivity
          key={JSON.stringify([selected.id, connection.setup.scope])}
          conversationId={selected.id}
          connection={connection}
        />
      ) : (
        <p className="notice">
          Choose an existing conversation for this specialist, then connect it
          to inspect runtime work.
        </p>
      )}
      {!connection.available('conversations') && (
        <RuntimeStatus connection={connection} compact />
      )}
      <SchedulesPanel connection={connection} />
    </section>
  );
}

function ConversationActivity({
  connection,
  conversationId,
}: {
  connection: RuntimeConnection;
  conversationId: string;
}) {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedMission, setSelectedMission] = useState('');
  const [selectedReview, setSelectedReview] = useState('');
  const [selectedDelivery, setSelectedDelivery] = useState('');
  const lock = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    const select = () => {
      const match = location.hash.match(
        /^#\/missions\/([A-Za-z0-9_-]+)(?:\/reviews\/([A-Za-z0-9_-]+))?$/,
      );
      if (match) {
        setSelectedMission(match[1]);
        setSelectedReview(match[2] ?? '');
      }
    };
    select();
    window.addEventListener('hashchange', select);
    return () => window.removeEventListener('hashchange', select);
  }, []);
  const path = (suffix: string) =>
    conversationRuntimePath(conversationId, suffix);
  const control = useResource(
    path('control'),
    forConversation(runtimeControlSchema, conversationId),
    connection,
    'missions',
    connected,
  );
  const missions = useResource(
    path('missions'),
    forConversation(runtimeMissionsSchema, conversationId),
    connection,
    'missions',
    connected,
  );
  const effects = useResource(
    path('effects'),
    forConversation(runtimeEffectsSchema, conversationId),
    connection,
    'missions',
    connected,
  );
  const reviews = useResource(
    path('reviews'),
    forConversation(runtimeReviewsSchema, conversationId),
    connection,
    'reviews',
    connected,
  );
  const scope = connection.setup?.scope;
  const refresh = () =>
    Promise.all([
      control.reload(),
      missions.reload(),
      effects.reload(),
      reviews.reload(),
    ]);
  const connect = async () => {
    if (lock.current || !scope) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await connection.connect(conversationId);
      if (active.current) setConnected(true);
    } catch (cause) {
      if (active.current) {
        setConnected(false);
        setError(
          cause instanceof Error
            ? cause.message
            : 'The selected conversation could not be connected.',
        );
      }
    } finally {
      if (active.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  const run: ControlAction = async (
    suffix,
    action,
    payload,
    revision,
    inspectOnly = false,
  ) => {
    if (!scope || !connected || lock.current || !active.current) {
      const error = new Error(
        'No action was sent because the selected conversation is disconnected or another operation is pending.',
      );
      error.name = 'OperationNotDispatched';
      throw error;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await runtimeAction(
        scope,
        path(suffix),
        action,
        payload,
        revision,
        inspectOnly,
      );
      if (active.current) await refresh();
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Outcome unknown. Inspect the original operation before retrying.',
        );
      throw cause;
    } finally {
      if (active.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  const mission = missions.data?.missions.find(
    (row) => row.mission_id === selectedMission,
  );
  const review = reviews.data?.approvals.find(
    (row) => row.approval_id === selectedReview,
  );
  const hasDelivery = missions.data?.missions.some((row) =>
    row.delivery_refs.some((ref) => ref.delivery_id === selectedDelivery),
  );
  const failures = [
    error,
    control.error,
    missions.error,
    effects.error,
    reviews.error,
  ].filter(Boolean);
  return (
    <>
      <div className="notice">
        <p>
          {connected
            ? 'This conversation is connected. Reads inspect saved runtime state without resubmitting work.'
            : 'Connect this selected conversation explicitly before inspecting or controlling its runtime work.'}
        </p>
        <button
          disabled={busy || !scope || !connection.available('conversations')}
          onClick={() => void connect()}
        >
          {busy && !connected
            ? 'Connecting runtime…'
            : connected
              ? 'Reconnect selected conversation'
              : 'Connect selected conversation'}
        </button>
        <button disabled={!connected || busy} onClick={() => void refresh()}>
          Refresh runtime state
        </button>
      </div>
      {connected && !connection.available('missions') && (
        <p className="notice">
          {connection.setup?.features.missions.reason ||
            'Mission controls are unavailable for this runtime.'}
        </p>
      )}
      {failures.length > 0 && (
        <p className="chat-error" role="alert">
          {[...new Set(failures)].join(' ')}
        </p>
      )}
      {control.data && (
        <section
          className="task-detail-card"
          aria-label="Owner and profile pause"
        >
          <h3>Owner/profile admissions</h3>
          <p>
            Revision {control.data.control.revision} ·{' '}
            {control.data.control.paused
              ? 'Pause acknowledged'
              : 'Admissions open'}
          </p>
          <p>
            New commands:{' '}
            {control.data.control.admission_blocked ? 'blocked' : 'allowed'} ·
            Scheduled dispatch:{' '}
            {control.data.control.scheduled_dispatch_blocked
              ? 'blocked'
              : 'allowed'}
          </p>
          <p>
            In-flight dispatch:{' '}
            {control.data.control.in_flight_dispatch.replaceAll('_', ' ')}.
            Accepted work is retained; already dispatched work may complete.
            Pause does not cancel the provider or undo remote effects.
          </p>
          <p>
            Accepted commands {control.data.control.accepted_commands} · Claimed
            commands {control.data.control.claimed_commands}
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void run(
                'control',
                control.data!.control.paused ? 'resume' : 'pause',
                {},
                control.data!.control.revision,
              ).catch(() => {})
            }
          >
            {control.data.control.paused
              ? 'Resume owner/profile admissions'
              : 'Pause owner/profile admissions'}
          </button>
        </section>
      )}
      <label className="search-box">
        Search work
        <input
          aria-label="Search runtime missions"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {missions.data && (
        <p className="notice">
          This is a bounded runtime history, not a complete archive.
          {missions.data.limit_reached ? ' The mission limit was reached.' : ''}
        </p>
      )}
      {missions.data?.missions.length === 0 && (
        <p>
          No canonical missions are recorded in this conversation. A command or
          run is not automatically a mission.
        </p>
      )}
      {selectedMission && missions.data && !mission && (
        <p className="notice">
          This mission is not in the selected conversation’s authorized history.
        </p>
      )}
      <div className="task-list">
        {missions.data?.missions
          .filter((row) =>
            row.outcome.toLowerCase().includes(search.toLowerCase()),
          )
          .map((row) => (
            <button
              key={row.mission_id}
              className="task-row"
              onClick={() => {
                setSelectedMission(row.mission_id);
                setSelectedDelivery('');
              }}
            >
              <strong>{row.outcome}</strong>
              <span>
                {row.state.replaceAll('_', ' ')}
                {row.archived ? ' · archived' : ''}
              </span>
              <small>
                Execution {row.execution_status} · Acceptance{' '}
                {row.acceptance_status} · Delivery {row.delivery_status}
              </small>
            </button>
          ))}
      </div>
      {mission && (
        <MissionDetail
          mission={mission}
          busy={busy}
          run={run}
          inspectDelivery={setSelectedDelivery}
        />
      )}
      <section aria-label="Exact runtime reviews">
        <h3>Exact action reviews</h3>
        {connected && !connection.available('reviews') && (
          <p>
            {connection.setup?.features.reviews.reason ||
              'Exact reviews are unavailable.'}
          </p>
        )}
        {reviews.data?.truncated && (
          <p className="notice">
            Review results are incomplete at the runtime limit.
          </p>
        )}
        {reviews.data?.approvals.length === 0 && (
          <p>No review records were returned for this conversation.</p>
        )}
        {reviews.data?.approvals.map((row) => (
          <button
            key={row.approval_id}
            className="task-row"
            onClick={() => setSelectedReview(row.approval_id)}
          >
            <strong>Review {row.approval_id}</strong>
            <span>
              {row.status}
              {row.expired ? ' · expired' : ''}
            </span>
            <small>
              Run {row.run_id} · Mission {row.mission_id ?? 'none'}
            </small>
          </button>
        ))}
        {selectedReview && reviews.data && !review && (
          <p className="notice">
            This review is not in the selected conversation’s current review
            list.
          </p>
        )}
        {review && scope && (
          <ReviewDetail
            key={review.approval_id}
            conversationId={conversationId}
            reviewId={review.approval_id}
            connection={connection}
            busy={busy}
            run={run}
          />
        )}
      </section>
      <section aria-label="Unresolved runtime effects">
        <h3>Unresolved effects</h3>
        <p>
          An uncertain effect is not safe to replay. Cancellation and pause do
          not prove rollback.
        </p>
        {effects.data?.truncated && (
          <p className="notice">
            Effect results are incomplete at the runtime limit.
          </p>
        )}
        {effects.data?.effects.length === 0 && (
          <p>No unresolved effects were returned in this bounded read.</p>
        )}
        {effects.data?.effects.map((effect) => (
          <article key={effect.effect_id} className="task-detail-card">
            <strong>
              {effect.operation_type.replaceAll('_', ' ')} ·{' '}
              {effect.state.replaceAll('_', ' ')}
            </strong>
            <p>
              Effect {effect.effect_id} · Run {effect.run_id}
            </p>
            <p>Action digest {effect.action_digest}</p>
            <p>Target digest {effect.target_digest}</p>
            {effect.operation_type === 'dots_page_publish' && scope && (
              <PageEffectReceipt
                scope={scope}
                conversationId={conversationId}
                effectId={effect.effect_id}
                disabled={busy}
              />
            )}
            {effect.approval_id && (
              <button onClick={() => setSelectedReview(effect.approval_id!)}>
                Inspect associated review
              </button>
            )}
          </article>
        ))}
      </section>
      {connected && connection.available('missions') && (
        <CommandResults
          conversationId={conversationId}
          connection={connection}
          run={run}
        />
      )}
      {hasDelivery && (
        <DeliveryDetail
          key={selectedDelivery}
          conversationId={conversationId}
          deliveryId={selectedDelivery}
          connection={connection}
        />
      )}
    </>
  );
}
