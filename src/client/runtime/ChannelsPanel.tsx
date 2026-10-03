import { useRef, useState } from 'react';
import {
  canRetryDelivery,
  channelStatusSchema,
  deliveriesSchema,
  provenanceSchema,
  verifiedSlackOrigin,
} from '../../shared/runtime/channels';
import { useResource } from './use-resource';
import { runtimeAction } from './actions';
import type { RuntimeConnection } from './use-runtime';
import { RuntimeStatus } from './RuntimeStatus';
export function ConversationOrigins({
  connection,
  conversationId,
}: {
  connection: RuntimeConnection;
  conversationId: string;
}) {
  const provenance = useResource(
    `/runtime/conversations/${encodeURIComponent(conversationId)}/provenance`,
    provenanceSchema,
    connection,
    'conversations',
  );
  const channel = useResource(
    '/runtime/channels/slack',
    channelStatusSchema,
    connection,
    'slack',
  );
  if (!provenance.data || provenance.data.conversationId !== conversationId)
    return provenance.error ? (
      <p className="notice">Conversation provenance is unavailable.</p>
    ) : null;
  return (
    <section className="page-chat-context" aria-label="Conversation origin">
      {provenance.data.origins.map((origin, index) => (
        <span key={`${origin.surface}:${origin.providerEventId ?? index}`}>
          {origin.surface === 'slack' ? (
            verifiedSlackOrigin(origin, channel.data) ? (
              <>
                {origin.permalink ? (
                  <a href={origin.permalink} target="_blank" rel="noreferrer">
                    Verified Slack thread
                  </a>
                ) : (
                  'Verified Slack thread'
                )}{' '}
                · actor {origin.actorId} · event {origin.providerEventId}
              </>
            ) : (
              'Slack provenance is unverified or its mapping was revoked'
            )
          ) : (
            `${origin.surface} · ${origin.verified ? 'verified origin' : 'unverified origin'}`
          )}
        </span>
      ))}
      {provenance.data.reviewPath && (
        <a href={provenance.data.reviewPath}>Open authenticated exact review</a>
      )}
    </section>
  );
}
export function ChannelsPanel({
  connection,
}: {
  connection: RuntimeConnection;
}) {
  const status = useResource(
    '/runtime/channels/slack',
    channelStatusSchema,
    connection,
    'slack',
  );
  const deliveries = useResource(
    '/runtime/channel-deliveries',
    deliveriesSchema,
    connection,
    'slack',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  return (
    <section aria-label="Self-hosted Slack and delivery">
      <h3>Slack continuity</h3>
      {!connection.available('slack') && (
        <RuntimeStatus connection={connection} compact />
      )}
      <p>
        Only verified created messages from allowed human users/channels can
        enter the runtime. Names, reactions, edits and forwarded results never
        become action approval.
      </p>
      {status.data && (
        <>
          <p>
            {status.data.state} · {status.data.transport} ·{' '}
            {status.data.qualified
              ? 'qualified adapter'
              : 'qualification required'}
          </p>
          <p>
            Team {status.data.teamId ?? 'unconfigured'} · human users{' '}
            {status.data.allowedHumanUserIds.join(', ') || 'none'} · channels{' '}
            {status.data.allowedChannelIds.join(', ') || 'none'}
          </p>
          <p>
            Created messages only · bots ignored · durable event deduplication{' '}
            {status.data.ingressDeduplicated ? 'declared' : 'unavailable'}
          </p>
        </>
      )}
      {(status.error || deliveries.error || error) && (
        <p role="alert" className="chat-error">
          {status.error || deliveries.error || error}
        </p>
      )}
      {deliveries.data?.deliveries.map((delivery) => (
        <article className="task-detail-card" key={delivery.id}>
          <h4>{delivery.destination}</h4>
          <p>
            {delivery.state} · mission {delivery.missionId} · immutable output{' '}
            {delivery.outputVersion}
          </p>
          <p>Provider receipt: {delivery.providerReceipt ?? 'not confirmed'}</p>
          {delivery.reviewPath && (
            <a href={delivery.reviewPath}>
              Review exact content in this workspace
            </a>
          )}
          {delivery.allowedActions.includes('inspect') && (
            <button onClick={() => void deliveries.reload()}>
              Inspect delivery state
            </button>
          )}
          {canRetryDelivery(delivery) && (
            <button
              disabled={busy}
              onClick={async () => {
                if (!connection.setup?.scope || lock.current) return;
                lock.current = true;
                setBusy(true);
                setError('');
                try {
                  await runtimeAction(
                    connection.setup.scope,
                    `/runtime/channel-deliveries/${encodeURIComponent(delivery.id)}/actions`,
                    'retry_delivery',
                    { outputVersion: delivery.outputVersion },
                    delivery.revision,
                  );
                  await deliveries.reload();
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : 'Delivery outcome unknown; inspect the original attempt.',
                  );
                } finally {
                  lock.current = false;
                  setBusy(false);
                }
              }}
            >
              Retry delivery of this output only
            </button>
          )}
          {delivery.state === 'unknown' && (
            <p className="notice">
              Send acknowledgment is unknown. Inspect the provider receipt
              before any new attempt; the successful mission is retained.
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
