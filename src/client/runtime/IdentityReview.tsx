import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { api } from '../api';
import { sameScope, type RuntimeScope } from '../../shared/runtime/contracts';
import {
  canDecideReview,
  type RuntimeReview,
} from '../../shared/runtime/reviews';
import {
  type IdentityReview,
  type IdentityAction,
  type IdentityReceipt,
} from '../../shared/runtime/identity';
import {
  runtimeExactReviewSchema,
  conversationRuntimePath,
} from './control-contracts';
import { requireAccepted } from './identity-client';
import type { IdentityRun } from './ScopedMemory';

const proposalSchema = z.object({
  artifact_id: z.string(),
  version: z.number().int(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().nonnegative(),
  mime: z.string(),
  approval_id: z.string(),
  approval_digest: z.string().regex(/^[a-f0-9]{64}$/),
  expires_at: z.number().finite(),
});
const publicationSchema = z.object({
  workflow_run_id: z.string(),
  pin_json: z.string(),
  proposals: z.array(proposalSchema).min(1).max(32),
  publication_atomic: z.literal(false),
});
export function identityReviewAction(review: IdentityReview): IdentityAction {
  switch (review.method) {
    case 'runtime.workflow.decision.prepare':
      return 'workflows.accept';
    case 'runtime.workflow.delivery.prepare':
      return 'workflows.deliver.commit';
    case 'runtime.specialist.preview':
      return 'specialists.handoff';
    case 'runtime.workflow.run.prepare':
      return 'workflows.publish';
  }
}
export function canCommitIdentityReview(
  review: IdentityReview,
  scope: RuntimeScope,
  outputs: RuntimeReview[] = [],
  now = Date.now(),
) {
  if (!sameScope(review.scope, scope) || !Number.isFinite(now)) return false;
  if (review.method === 'runtime.workflow.run.prepare') {
    const parsed = publicationSchema.safeParse(review.result);
    return (
      parsed.success &&
      outputs.length === parsed.data.proposals.length &&
      new Set(outputs.map((output) => output.id)).size === outputs.length &&
      new Set(parsed.data.proposals.map((proposal) => proposal.approval_id))
        .size === parsed.data.proposals.length &&
      parsed.data.proposals.every(
        (proposal) =>
          proposal.expires_at * 1000 > now &&
          outputs.some(
            (output) =>
              output.id === proposal.approval_id &&
              output.approvalDigest === proposal.approval_digest &&
              canDecideReview(output, scope, now),
          ),
      )
    );
  }
  const selection = review.result.selection;
  const expires =
    review.method === 'runtime.specialist.preview' &&
    selection &&
    typeof selection === 'object' &&
    'expires_at' in selection
      ? selection.expires_at
      : review.result.expires_at;
  return (
    typeof expires === 'number' &&
    Number.isFinite(expires) &&
    expires * 1000 > now
  );
}

export function IdentityReviewCard({
  review,
  scope,
  busy,
  run,
  onComplete,
}: {
  review: IdentityReview;
  scope: RuntimeScope;
  busy: boolean;
  run: IdentityRun;
  onComplete: (receipt?: IdentityReceipt) => void;
}) {
  const [outputs, setOutputs] = useState<RuntimeReview[]>([]);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);
  const [choice, setChoice] = useState<IdentityAction>();
  const [now, setNow] = useState(() => Date.now());
  const lock = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (review.method !== 'runtime.workflow.run.prepare') return;
    const controller = new AbortController();
    void (async () => {
      const prepared = publicationSchema.parse(review.result);
      const loaded: RuntimeReview[] = [];
      for (const proposal of prepared.proposals) {
        const row = runtimeExactReviewSchema.parse(
          await api<unknown>(
            conversationRuntimePath(
              review.conversationId,
              `reviews/${encodeURIComponent(proposal.approval_id)}`,
            ) +
              (scope.project
                ? `?projectId=${encodeURIComponent(scope.project)}`
                : ''),
            'GET',
            undefined,
            controller.signal,
          ),
        );
        if (
          !sameScope(row.scope, scope) ||
          row.conversationId !== review.conversationId ||
          !row.review ||
          row.decisionUnavailableReason ||
          row.review.id !== proposal.approval_id ||
          row.review.approvalDigest !== proposal.approval_digest
        )
          throw new Error(
            `Full exact output review unavailable: ${row.decisionUnavailableReason ?? row.detail.detail.unavailable_reason ?? 'publication scope or identity mismatch'}. No publication was sent.`,
          );
        loaded.push(row.review);
      }
      if (!controller.signal.aborted) setOutputs(loaded);
    })().catch((cause) => {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : 'Output review unavailable.',
        );
    });
    return () => controller.abort();
  }, [review.reviewOperationId, review.reviewDigest, JSON.stringify(scope)]);
  const publication = review.method === 'runtime.workflow.run.prepare';
  const handoff = review.method === 'runtime.specialist.preview';
  const delivery = review.method === 'runtime.workflow.delivery.prepare';
  const fresh = canCommitIdentityReview(review, scope, outputs, now);
  const submit = async (action: IdentityAction) => {
    const inspectOnly = !!choice;
    if (
      lock.current ||
      busy ||
      (!inspectOnly &&
        (!checked ||
          !canCommitIdentityReview(review, scope, outputs, Date.now())))
    )
      return;
    lock.current = true;
    setChoice(action);
    setError('');
    try {
      const receipt = await run(
        action,
        {
          reviewOperationId: review.reviewOperationId,
          reviewDigest: review.reviewDigest,
        },
        review.scope,
        inspectOnly,
      );
      requireAccepted(receipt);
      onComplete(receipt);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Decision outcome unknown. Inspect the original operation.',
      );
    } finally {
      lock.current = false;
    }
  };
  return (
    <section
      className="page-review-card"
      aria-label="Exact identity and workflow review"
    >
      <h3>
        {handoff
          ? 'Review named specialist handoff'
          : publication
            ? 'Review complete publication outputs'
            : delivery
              ? 'Review version-pinned skill delivery'
              : 'Review immutable workflow decision'}
      </h3>
      <p>
        Agent {review.scope.agent} · project {review.scope.project ?? 'none'} ·
        conversation {review.conversationId} · generation{' '}
        {review.scope.generation}
      </p>
      <p>
        Original operation {review.reviewOperationId} · exact review SHA-256{' '}
        {review.reviewDigest}
      </p>
      <pre className="identity-json">
        {JSON.stringify(review.result, null, 2)}
      </pre>
      {publication && (
        <p>
          Every output’s full prepared bytes must be shown below before
          publication is enabled. Publication is non-atomic and does not
          complete the mission.
        </p>
      )}
      {outputs.map((output) => (
        <article key={output.id} aria-label="Exact prepared output bytes">
          <h4>{output.action}</h4>
          <p>
            Target {output.target} · approval {output.id} · digest{' '}
            {output.approvalDigest}
          </p>
          <p>Expires {new Date(output.expiresAt).toISOString()}</p>
          <pre className="identity-json">{output.content}</pre>
        </article>
      ))}
      {delivery && (
        <p>
          Delivery activates in the next session. It grants no execution
          authority and shares no personal memory. Rollback must name an earlier
          previously delivered approved version.
        </p>
      )}
      {handoff && (
        <p>
          Only the displayed objective, explicit references and constraints are
          delegated. Admission is not completion. Broader teams are unavailable.
        </p>
      )}
      {!fresh && (
        <p className="notice">
          Review is expired, changed, or missing full output bytes. Prepare a
          fresh review; old review history does not restore authority.
        </p>
      )}
      <label className="permission-row">
        <input
          type="checkbox"
          checked={checked}
          disabled={busy || !!choice || !fresh}
          onChange={(event) => setChecked(event.target.checked)}
        />
        <span>
          I reviewed the exact target, scope, version and content shown above
        </span>
      </label>
      {choice ? (
        <button disabled={busy} onClick={() => void submit(choice)}>
          Inspect original decision
        </button>
      ) : (
        <div className="task-controls">
          <button
            disabled={busy || !checked || !fresh}
            onClick={() => void submit(identityReviewAction(review))}
          >
            {handoff
              ? 'Hand off named task'
              : publication
                ? 'Publish exact reviewed outputs'
                : delivery
                  ? 'Confirm exact delivery / rollback'
                  : 'Accept exact workflow decision'}
          </button>
          {!handoff && !publication && (
            <button
              disabled={busy || !checked || !fresh}
              onClick={() => void submit('workflows.decline')}
            >
              Decline and cancel this preparation
            </button>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
