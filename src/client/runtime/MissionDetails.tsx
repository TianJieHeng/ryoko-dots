import { ExactReviewCard } from './ExactReviewCard';
import { useResource } from './use-resource';
import type { RuntimeConnection } from './use-runtime';
import {
  conversationRuntimePath,
  forConversation,
  runtimeDeliverySchema,
  runtimeExactReviewSchema,
  type RuntimeMission,
} from './control-contracts';

export type ControlAction = (
  suffix: string,
  action: string,
  payload: Record<string, unknown>,
  revision: number,
  inspectOnly?: boolean,
) => Promise<void>;

export function MissionDetail({
  mission,
  busy,
  run,
  inspectDelivery,
}: {
  mission: RuntimeMission;
  busy: boolean;
  run: ControlAction;
  inspectDelivery: (id: string) => void;
}) {
  const terminal = ['completed', 'cancelled', 'failed'].includes(mission.state);
  return (
    <section
      className="task-detail-card"
      aria-label="Canonical mission details"
    >
      <h3>{mission.outcome}</h3>
      <p>
        Mission {mission.mission_id} · revision {mission.revision} ·{' '}
        {mission.state.replaceAll('_', ' ')}
      </p>
      <p>
        Execution: {mission.execution_status} · Acceptance:{' '}
        {mission.acceptance_status} · Delivery: {mission.delivery_status}
      </p>
      <p>
        Verification evidence:{' '}
        {mission.verification_current === null
          ? 'not available'
          : mission.verification_current
            ? 'current'
            : 'not current'}
      </p>
      <p>Next step: {mission.next_step || 'not recorded'}</p>
      {mission.paused_reason && <p>Paused: {mission.paused_reason}</p>}
      {mission.blockers.length > 0 && (
        <>
          <h4>Blockers</h4>
          {mission.blockers.map((blocker, index) => (
            <p key={index}>{blocker}</p>
          ))}
        </>
      )}
      {!mission.archived && !terminal && (
        <div className="task-controls">
          <button
            disabled={busy}
            onClick={() =>
              void run(
                `missions/${encodeURIComponent(mission.mission_id)}/actions`,
                mission.state === 'paused' ? 'resume' : 'pause',
                {},
                mission.revision,
              ).catch(() => {})
            }
          >
            {mission.state === 'paused' ? 'Resume mission' : 'Pause mission'}
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(
                `missions/${encodeURIComponent(mission.mission_id)}/actions`,
                'cancel',
                {},
                mission.revision,
              ).catch(() => {})
            }
          >
            Request mission cancellation
          </button>
        </div>
      )}
      <h4>Required outputs</h4>
      {mission.deliverables.map((item) => (
        <p key={item.deliverable_id}>
          {item.description || item.deliverable_id} ·{' '}
          {item.required ? 'required' : 'optional'} ·{' '}
          {item.artifact_ref
            ? `Artifact ${item.artifact_ref.artifact_id} version ${item.artifact_ref.version}`
            : 'no artifact reference'}
        </p>
      ))}
      <h4>Plan and checkpoints</h4>
      {mission.plan_steps.map((step) => (
        <p key={step.step_id}>
          {step.checkpoint ? 'Checkpoint · ' : ''}
          {step.description || step.step_id} · {step.status}
        </p>
      ))}
      <h4>Artifact references</h4>
      {mission.artifact_refs.map((ref) => (
        <p key={`${ref.artifact_id}:${ref.version}`}>
          {ref.artifact_id} · version {ref.version} · SHA-256 {ref.digest}
        </p>
      ))}
      {mission.effect_refs_truncated && (
        <p>Mission effect references are incomplete.</p>
      )}
      {mission.effect_refs.map((ref) => (
        <p key={ref.effect_id}>
          Effect {ref.effect_id} · {ref.state.replaceAll('_', ' ')}
        </p>
      ))}
      <h4>Local runtime deliveries</h4>
      {mission.delivery_refs_truncated && (
        <p>Mission delivery references are incomplete.</p>
      )}
      {mission.delivery_refs.map((ref) => (
        <button
          key={ref.delivery_id}
          onClick={() => inspectDelivery(ref.delivery_id)}
        >
          Inspect delivery {ref.delivery_id} · {ref.state}
        </button>
      ))}
      <p>
        Inspecting or controlling this mission never starts a new run or retries
        an external effect.
      </p>
    </section>
  );
}

export function ReviewDetail({
  conversationId,
  reviewId,
  connection,
  busy,
  run,
}: {
  conversationId: string;
  reviewId: string;
  connection: RuntimeConnection;
  busy: boolean;
  run: ControlAction;
}) {
  const schema = forConversation(
    runtimeExactReviewSchema,
    conversationId,
  ).refine((value) => value.detail.approval.approval_id === reviewId, {
    message: 'Review response belongs to another approval.',
  });
  const exact = useResource(
    conversationRuntimePath(
      conversationId,
      `reviews/${encodeURIComponent(reviewId)}`,
    ),
    schema,
    connection,
    'reviews',
  );
  if (exact.error) return <p role="alert">{exact.error}</p>;
  if (!exact.data) return <p>Loading exact review material…</p>;
  if (!exact.data.review || !connection.setup?.scope)
    return (
      <p className="notice">
        Exact review is unavailable:{' '}
        {exact.data.detail.detail.unavailable_reason?.replaceAll('_', ' ') ||
          'the runtime did not provide reviewable material'}
        . No approval can be sent.
      </p>
    );
  return (
    <ExactReviewCard
      review={exact.data.review}
      scope={connection.setup.scope}
      disabled={busy}
      refresh={() => void exact.reload()}
      decide={async (review, choice, inspectOnly) => {
        await run(
          `reviews/${encodeURIComponent(review.id)}/decision`,
          'approval.resolve',
          { approvalDigest: review.approvalDigest, choice },
          review.revision,
          inspectOnly,
        );
        await exact.reload();
      }}
    />
  );
}

export function DeliveryDetail({
  conversationId,
  deliveryId,
  connection,
}: {
  conversationId: string;
  deliveryId: string;
  connection: RuntimeConnection;
}) {
  const schema = forConversation(runtimeDeliverySchema, conversationId).refine(
    (value) =>
      value.delivery.delivery_id === deliveryId &&
      value.delivery.destination.session_id === conversationId,
    { message: 'Delivery response belongs to another target.' },
  );
  const data = useResource(
    conversationRuntimePath(
      conversationId,
      `deliveries/${encodeURIComponent(deliveryId)}`,
    ),
    schema,
    connection,
    'missions',
  );
  const delivery = data.data?.delivery;
  return (
    <section
      className="task-detail-card"
      aria-label="Local runtime delivery receipt"
    >
      <h3>Local runtime delivery</h3>
      {data.error && <p role="alert">{data.error}</p>}
      {delivery && (
        <>
          <p>
            Delivery {delivery.delivery_id} ·{' '}
            {delivery.state.replaceAll('_', ' ')}
          </p>
          <p>
            Immutable artifact {delivery.artifact_id} · version{' '}
            {delivery.version} · SHA-256 {delivery.sha256}
          </p>
          <p>
            Acknowledgment: {delivery.acknowledgment_level.replaceAll('_', ' ')}{' '}
            · Text: {delivery.components.text.replaceAll('_', ' ')} · Artifact:{' '}
            {delivery.components.artifact.replaceAll('_', ' ')}
          </p>
          <p>
            Attempt {delivery.attempt_count} of {delivery.max_attempts} · Result{' '}
            {delivery.result_available ? 'available' : 'unavailable'}
          </p>
          {delivery.last_error && <p>{delivery.last_error}</p>}
          {delivery.state === 'outcome_unknown' && (
            <p>
              Delivery acknowledgment is unknown. Inspect the existing attempt
              before any retry.
            </p>
          )}
        </>
      )}
      <button onClick={() => void data.reload()} disabled={data.loading}>
        Inspect delivery receipt
      </button>
      <p className="notice">
        This is a local runtime receipt, separate from Slack. Open its command
        under Immutable command results to receive verified output bytes, record
        an exact browser receipt, or explicitly retry that immutable delivery.
        Inspection never acknowledges receipt or reruns inference.
      </p>
    </section>
  );
}
