import { useEffect, useRef, useState } from 'react';
import { sameScope, type RuntimeScope } from '../../shared/runtime/contracts';
import {
  agentSessionSchema,
  identityProjectsSchema,
  legacyEnrollmentSchema,
  type IdentityReceipt,
} from '../../shared/runtime/identity';
import { useResource } from './use-resource';
import { useIdentityResource } from './use-identity-resource';
import { actIdentity, inspectIdentityOperation } from './identity-client';
import { ScopedMemory, type IdentityRun } from './ScopedMemory';
import { ReviewedLearning } from './ReviewedLearning';
import { NamedSpecialists } from './NamedSpecialists';
import { LegacyMemoryInventory } from './LegacyMemoryInventory';
import { RuntimeStatus } from './RuntimeStatus';
import type { RuntimeConnection } from './use-runtime';

type Props = {
  connection: RuntimeConnection;
  dotId?: string;
  conversationId?: string;
  conversations?: { id: string; title: string }[];
  spaces?: { id: string; name: string }[];
  onConversationChange?: (id: string) => void;
};
export function MemoryLearning({
  connection,
  dotId = '',
  conversationId,
  conversations = [],
  spaces = [],
  onConversationChange,
}: Props) {
  const projects = useResource(
    `/runtime/identity/projects?dotId=${encodeURIComponent(dotId)}`,
    identityProjectsSchema,
    connection,
    'specialists',
    !!dotId,
  );
  const legacy = useResource(
    `/runtime/identity/legacy?dotId=${encodeURIComponent(dotId)}`,
    legacyEnrollmentSchema,
    connection,
    'specialists',
    !!dotId,
  );
  const selected = conversations.find((row) => row.id === conversationId);
  const [project, setProject] = useState('');
  const scope = connection.setup?.scope;
  const allowed = projects.data?.projects.find(
    (row) => row.projectId === project,
  );
  return (
    <section aria-label="Scoped memory and Learning">
      <h2>Agent memory and reviewed skills</h2>
      <p>
        Owner {scope?.owner ?? 'unavailable'} · stable agent{' '}
        {scope?.agent ?? 'unavailable'}
      </p>
      <label className="field-label">
        Identity conversation
        <select
          value={selected?.id ?? ''}
          onChange={(e) => onConversationChange?.(e.target.value)}
        >
          <option value="">Choose an existing conversation</option>
          {conversations.map((row) => (
            <option key={row.id} value={row.id}>
              {row.title}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        Explicit project scope
        <select
          value={allowed?.projectId ?? ''}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">Individual memory / no project</option>
          {projects.data?.projects.map((row) => (
            <option key={row.projectId} value={row.projectId}>
              {spaces.find((space) => space.id === row.spaceId)?.name ??
                row.spaceId}{' '}
              · {row.projectId}
            </option>
          ))}
        </select>
      </label>
      {projects.error && <p role="alert">{projects.error}</p>}
      {selected && scope ? (
        <IdentityWorkspace
          key={JSON.stringify([selected.id, scope, allowed?.projectId])}
          connection={connection}
          conversationId={selected.id}
          scope={{ ...scope, project: allowed?.projectId ?? null }}
        />
      ) : (
        <>
          <p className="notice">
            Choose an existing conversation for the selected Dot, then
            explicitly connect it. No personal-memory fallback or automatic
            enrollment is used.
          </p>
          <h3>Assigned memory</h3>
          <p>
            Inspect the actual personal-harness status or this specialist’s
            isolated built-in namespace, with versioned corrections, tombstone
            deletion and verified export where supported.
          </p>
          <h3>Reviewed Learning</h3>
          <p>
            Explicit evidence, finite immutable drafts, held-out evaluation,
            exact accept/decline, output publication and version-pinned
            delivery/rollback become available after a qualified connection.
          </p>
          <h3>Named specialist handoff</h3>
          <p>
            Prepare a bounded objective and explicit project references, review
            the exact selection, then inspect admission and completion
            separately.
          </p>
        </>
      )}
      {!connection.available('specialists') && (
        <RuntimeStatus connection={connection} compact />
      )}
      <details>
        <summary>Frozen legacy enrollment evidence</summary>
        <p>
          Historical container and opt-in metadata is read-only evidence. It
          does not authorize current enrollment, private-transcript ingestion,
          personal-memory access or delivery.
        </p>
        {legacy.error && <p role="alert">{legacy.error}</p>}
        {legacy.data?.enrollments.map((row) => (
          <article key={`${row.evidence.kind}:${row.evidence.id}`}>
            <p>
              {row.evidence.kind} {row.evidence.id} · container{' '}
              {row.evidence.legacyContainerId ?? 'none'} · historical delivery{' '}
              {row.evidence.legacySkillDeliveryEnabled === null
                ? 'not recorded'
                : row.evidence.legacySkillDeliveryEnabled
                  ? 'enabled'
                  : 'disabled'}
            </p>
            <p>
              Frozen SHA-256 {row.digest} · review required · enrollment not
              authorized
            </p>
          </article>
        ))}
      </details>
    </section>
  );
}

function IdentityWorkspace({
  connection,
  conversationId,
  scope,
}: {
  connection: RuntimeConnection;
  conversationId: string;
  scope: RuntimeScope;
}) {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'memory' | 'learning' | 'specialists'>(
    'memory',
  );
  const [receipt, setReceipt] = useState<IdentityReceipt>();
  const [recoveryId, setRecoveryId] = useState('');
  const lock = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const ready = connected && connection.available('specialists');
  const session = useIdentityResource(
    { ...scope, project: null },
    conversationId,
    'session',
    {},
    agentSessionSchema.refine((value) => value.agent_id === scope.agent),
    ready,
  );
  const run: IdentityRun = async (
    action,
    payload,
    actionScope,
    inspectOnly = false,
  ) => {
    if (
      !active.current ||
      lock.current ||
      !ready ||
      !session.data?.authority_current ||
      !sameScope({ ...actionScope, project: scope.project }, scope)
    )
      throw new Error(
        'No action sent: identity is disconnected, revoked, busy or changed.',
      );
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await actIdentity(
        actionScope,
        conversationId,
        action,
        payload,
        inspectOnly,
      );
      if (!active.current)
        throw new Error(
          'Selection changed while the original operation completed. Inspect its original receipt.',
        );
      setReceipt(result);
      return result;
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error ? cause.message : 'Operation outcome unknown.',
        );
      throw cause;
    } finally {
      if (active.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  return (
    <>
      <button
        disabled={busy || !connection.available('conversations')}
        onClick={() => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError('');
          void connection
            .connect(conversationId)
            .then(() => {
              if (active.current) setConnected(true);
            })
            .catch((cause) => {
              if (active.current) {
                setConnected(false);
                setError(String(cause.message ?? cause));
              }
            })
            .finally(() => {
              if (active.current) {
                lock.current = false;
                setBusy(false);
              }
            });
        }}
      >
        {connected
          ? 'Recheck connected identity'
          : 'Connect selected identity conversation'}
      </button>
      {session.data && (
        <section aria-label="Verified session identity">
          <p>
            {session.data.role} · {session.data.agent_id} ·{' '}
            {session.data.memory_backend} · authority{' '}
            {session.data.authority_current ? 'current' : 'revoked'}
          </p>
          <p>
            Active configuration{' '}
            {session.data.active_configuration_revision ?? 'none'} · desired
            configuration{' '}
            {session.data.desired_configuration_revision ?? 'none'} · activation
            next session
          </p>
          <details>
            <summary>Frozen active and desired skill pins</summary>
            <pre className="identity-json">
              {JSON.stringify(
                {
                  active: session.data.active_workflows,
                  desired: session.data.desired_workflows,
                },
                null,
                2,
              )}
            </pre>
          </details>
          <button disabled={busy} onClick={() => void session.reload()}>
            Refresh desired session pins
          </button>
        </section>
      )}
      {(error || session.error) && <p role="alert">{error || session.error}</p>}
      <div className="pane-tabs">
        <button
          aria-pressed={tab === 'memory'}
          onClick={() => setTab('memory')}
        >
          Memory
        </button>
        <button
          aria-pressed={tab === 'learning'}
          onClick={() => setTab('learning')}
        >
          Reviewed Learning
        </button>
        <button
          aria-pressed={tab === 'specialists'}
          onClick={() => setTab('specialists')}
        >
          Named specialists
        </button>
      </div>
      {tab === 'memory' ? (
        <ScopedMemory
          scope={scope}
          conversationId={conversationId}
          session={session.data}
          ready={ready}
          busy={busy}
          run={run}
        />
      ) : tab === 'learning' ? (
        <ReviewedLearning
          scope={scope}
          conversationId={conversationId}
          ready={ready}
          busy={busy}
          run={run}
        />
      ) : (
        <NamedSpecialists
          scope={scope}
          conversationId={conversationId}
          ready={ready}
          busy={busy}
          run={run}
        />
      )}
      {session.data?.role === 'primary' && (
        <LegacyMemoryInventory
          connection={connection}
          dotId={connection.selector}
        />
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (lock.current || !ready) return;
          lock.current = true;
          setBusy(true);
          setError('');
          void inspectIdentityOperation(scope, conversationId, recoveryId)
            .then((result) => {
              if (active.current) setReceipt(result);
            })
            .catch((cause) => {
              if (active.current)
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Original operation inspection unavailable.',
                );
            })
            .finally(() => {
              if (active.current) {
                lock.current = false;
                setBusy(false);
              }
            });
        }}
      >
        <label className="field-label">
          Original identity operation ID
          <input
            value={recoveryId}
            required
            onChange={(event) => setRecoveryId(event.target.value)}
          />
        </label>
        <button disabled={busy || !ready}>
          Inspect original operation only
        </button>
        <p>
          Use the original conversation and project scope. Inspection never
          starts or retries an effect.
        </p>
      </form>
      {receipt && (
        <details open>
          <summary>Original operation receipt · {receipt.status}</summary>
          <p>{receipt.reason}</p>
          <pre className="identity-json">
            {JSON.stringify(receipt, null, 2)}
          </pre>
        </details>
      )}
    </>
  );
}
