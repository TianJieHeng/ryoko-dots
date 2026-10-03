import { useEffect, useState } from 'react';
import { z } from 'zod';
import type { RuntimeScope } from '../../shared/runtime/contracts';
import {
  specialistCatalogSchema,
  specialistStatusSchema,
  type IdentityReview,
} from '../../shared/runtime/identity';
import { useIdentityResource } from './use-identity-resource';
import { presentIdentityReview, requireAccepted } from './identity-client';
import { IdentityReviewCard } from './IdentityReview';
import type { IdentityRun } from './ScopedMemory';

const references = z
  .array(
    z.strictObject({
      id: z.string().min(1).max(256),
      version: z.number().int().positive(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  )
  .max(100);
export function NamedSpecialists({
  scope,
  conversationId,
  ready,
  busy,
  run,
}: {
  scope: RuntimeScope;
  conversationId: string;
  ready: boolean;
  busy: boolean;
  run: IdentityRun;
}) {
  const enabled = ready && !!scope.project;
  const catalog = useIdentityResource(
    scope,
    conversationId,
    'specialists.catalog',
    { project_id: scope.project },
    specialistCatalogSchema,
    enabled,
  );
  const [target, setTarget] = useState('');
  const [objective, setObjective] = useState('');
  const [constraints, setConstraints] = useState('');
  const [artifacts, setArtifacts] = useState('[]');
  const [evidence, setEvidence] = useState('[]');
  const [review, setReview] = useState<IdentityReview>();
  const [commandId, setCommandId] = useState('');
  const [lookup, setLookup] = useState('');
  const [error, setError] = useState('');
  const status = useIdentityResource(
    scope,
    conversationId,
    'specialists.status',
    { command_id: commandId },
    specialistStatusSchema.refine(
      (value) =>
        value.command_id === commandId && value.project_id === scope.project,
    ),
    enabled && !!commandId,
  );
  const pending =
    status.data && ['accepted', 'claimed'].includes(status.data.status);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      if (!document.hidden) void status.reload();
    }, 5000);
    return () => clearInterval(timer);
  }, [pending, commandId, status.reload]);
  return (
    <section aria-label="Named specialist handoff">
      <h2>Named specialists</h2>
      <p>
        One explicitly named local specialist receives the reviewed objective,
        project references and constraints. Private memory and transcripts are
        not copied. Broader teams, team budgets and synthesis are unavailable.
      </p>
      {!scope.project && (
        <p className="notice">
          Choose an explicitly granted project before preparing a handoff.
        </p>
      )}
      {(error || catalog.error || status.error) && (
        <p role="alert">{error || catalog.error || status.error}</p>
      )}
      <button disabled={!enabled || busy} onClick={() => void catalog.reload()}>
        Refresh named specialist catalog
      </button>
      {catalog.data?.unavailable.map((row) => (
        <p key={row.agent_id}>
          {row.agent_id}: {row.code}
        </p>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          void (async () => {
            try {
              const receipt = await run(
                'specialists.preview',
                {
                  project_id: scope.project,
                  specialist_id: target,
                  objective,
                  artifacts: references.parse(JSON.parse(artifacts)),
                  evidence: references.parse(JSON.parse(evidence)),
                  constraints: constraints
                    .split('\n')
                    .map((x) => x.trim())
                    .filter(Boolean),
                },
                scope,
              );
              requireAccepted(receipt);
              setReview(
                await presentIdentityReview(
                  scope,
                  conversationId,
                  receipt,
                  'runtime.specialist.preview',
                ),
              );
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : 'Handoff preview unavailable.',
              );
            }
          })();
        }}
      >
        <label className="field-label">
          Named specialist
          <select
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Choose a specialist</option>
            {catalog.data?.specialists.map((row) => (
              <option key={row.agent_id} value={row.agent_id}>
                {row.agent_id} · {row.responsibility}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Explicit objective
          <textarea
            required
            value={objective}
            maxLength={20000}
            onChange={(e) => setObjective(e.target.value)}
          />
        </label>
        <label className="field-label">
          Constraints, one per line
          <textarea
            value={constraints}
            maxLength={10000}
            onChange={(e) => setConstraints(e.target.value)}
          />
        </label>
        <details>
          <summary>Explicit versioned context</summary>
          <p>
            References require id, version and sha256. Only the references
            listed here are delegated.
          </p>
          <label className="field-label">
            Artifact references JSON
            <textarea
              value={artifacts}
              onChange={(e) => setArtifacts(e.target.value)}
            />
          </label>
          <label className="field-label">
            Evidence references JSON
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </label>
        </details>
        <button disabled={!enabled || busy || !target || !objective.trim()}>
          Prepare named handoff review
        </button>
      </form>
      {review && (
        <IdentityReviewCard
          key={review.reviewOperationId}
          review={review}
          scope={scope}
          busy={busy}
          run={run}
          onComplete={(receipt) => {
            if (receipt) {
              const value = z
                .object({
                  command_id: z.string(),
                  status: z.enum(['accepted', 'duplicate', 'rejected']),
                })
                .safeParse(receipt.result);
              if (value.success) {
                setCommandId(value.data.command_id);
                setLookup(value.data.command_id);
              }
            }
            setReview(undefined);
          }}
        />
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setCommandId(lookup);
        }}
      >
        <label className="field-label">
          Original handoff command ID
          <input
            required
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
          />
        </label>
        <button disabled={!enabled || busy}>Inspect existing handoff</button>
      </form>
      {commandId && (
        <button
          disabled={!enabled || busy}
          onClick={() => void status.reload()}
        >
          Refresh original handoff status
        </button>
      )}
      {status.data && (
        <article
          className="task-detail-card"
          aria-label="Original specialist task status"
        >
          <h3>
            {status.data.specialist_id} · {status.data.status}
          </h3>
          <p>
            Outcome {status.data.outcome} · command {status.data.command_id} ·
            run {status.data.run_id}
          </p>
          <p>Manifest SHA-256 {status.data.manifest_sha256}</p>
          {status.data.completion ? (
            <>
              <p>{status.data.completion.summary}</p>
              <p>
                Schema verification:{' '}
                {status.data.completion.schema_valid === null
                  ? 'unavailable'
                  : status.data.completion.schema_valid
                    ? 'valid'
                    : 'invalid'}{' '}
                · parent review required
              </p>
              {status.data.completion.summary_truncated && (
                <p>Completion summary is truncated.</p>
              )}
            </>
          ) : (
            <p>The task was admitted; completion has not been established.</p>
          )}
          <p>Inspecting status does not restart or resume execution.</p>
        </article>
      )}
    </section>
  );
}
