import { useEffect, useRef, useState } from 'react';
import type { RuntimeScope } from '../../shared/runtime/contracts';
import {
  canDecideReview,
  reviewSchema,
  type RuntimeReview,
} from '../../shared/runtime/reviews';

type Props = {
  review: RuntimeReview;
  scope: RuntimeScope;
  decide: (
    review: RuntimeReview,
    choice: 'once' | 'deny',
    inspectOnly?: boolean,
  ) => Promise<void>;
  refresh: () => void;
};

export function ExactReviewCard(props: Props) {
  const parsed = reviewSchema.safeParse(props.review);
  if (!parsed.success) {
    return <p role="alert">This review is invalid. Refresh to inspect it.</p>;
  }
  // A changed exact review or binding gets an independent display. An old
  // request cannot write its result into the replacement review.
  const identity = JSON.stringify([
    parsed.data,
    props.scope.owner,
    props.scope.gateway,
    props.scope.agent,
    props.scope.project,
    props.scope.generation,
  ]);
  return <ReviewBody key={identity} {...props} review={parsed.data} />;
}

function ReviewBody({ review, scope, decide, refresh }: Props) {
  const locked = useRef(false);
  const choiceRef = useRef<'once' | 'deny' | undefined>(undefined);
  const active = useRef(true);
  const [phase, setPhase] = useState<'idle' | 'busy' | 'sent' | 'unknown'>(
    'idle',
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    active.current = true;
    // Recheck at expiration even if the surrounding conversation is idle.
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active.current = false;
      clearInterval(timer);
    };
  }, []);

  const choose = async (choice: 'once' | 'deny') => {
    if (
      !active.current ||
      locked.current ||
      !canDecideReview(review, scope, Date.now())
    ) {
      return;
    }
    // Lock synchronously before invoking the durable operation owned by parent.
    // Keep locked on success AND ambiguous failure: refresh/recovery must inspect
    // the receipt, never blindly replay the same decision.
    locked.current = true;
    choiceRef.current = choice;
    setPhase('busy');
    try {
      await decide(review, choice);
      if (!active.current) return;
      setPhase('sent');
      refresh();
    } catch {
      if (active.current) setPhase('unknown');
    }
  };
  const enabled = phase === 'idle' && canDecideReview(review, scope, now);
  return (
    <section className="page-review-card" aria-label="Exact action review">
      <header>
        <strong>Review exact action</strong>
        <span>{review.status}</span>
      </header>
      <div className="page-review-body">
        <dl>
          <dt>Review ID</dt>
          <dd>{review.id}</dd>
          <dt>Action</dt>
          <dd style={{ whiteSpace: 'pre-wrap' }}>{review.action}</dd>
          <dt>Exact target</dt>
          <dd style={{ whiteSpace: 'pre-wrap' }}>{review.target}</dd>
          <dt>Revision</dt>
          <dd>{review.revision}</dd>
          <dt>Approval digest (SHA-256)</dt>
          <dd>{review.approvalDigest}</dd>
          <dt>Action/content digest (SHA-256)</dt>
          <dd>{review.actionDigest}</dd>
          <dt>Expires</dt>
          <dd>
            {new Date(review.expiresAt).toISOString()} ({review.expiresAt})
          </dd>
          <dt>Scope owner</dt>
          <dd>{review.scope.owner}</dd>
          <dt>Gateway</dt>
          <dd>{review.scope.gateway}</dd>
          <dt>Agent</dt>
          <dd>{review.scope.agent}</dd>
          <dt>Project</dt>
          <dd>{review.scope.project ?? '(none)'}</dd>
          <dt>Generation</dt>
          <dd>{review.scope.generation}</dd>
        </dl>
        <h3>Exact content</h3>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {review.content}
        </pre>
      </div>
      {phase === 'unknown' && (
        <p role="alert">
          Decision outcome unknown. Inspect and recover the existing operation
          before proceeding. Do not replay this decision.
        </p>
      )}
      {phase === 'sent' && (
        <p role="status">
          Decision sent. Refresh to inspect the recorded outcome.
        </p>
      )}
      {!canDecideReview(review, scope, now) && (
        <p role="status">
          This review is expired, already decided, or belongs to a different
          scope. Refresh to inspect the current review.
        </p>
      )}
      <footer>
        <button
          type="button"
          className="review-primary"
          disabled={!enabled}
          onClick={() => void choose('once')}
        >
          {phase === 'busy' ? 'Sending decision…' : 'Approve once'}
        </button>
        <button
          type="button"
          disabled={!enabled}
          onClick={() => void choose('deny')}
        >
          Deny
        </button>
        {phase === 'unknown' && (
          <button
            type="button"
            onClick={async () => {
              if (!choiceRef.current || !active.current) return;
              setPhase('busy');
              try {
                await decide(review, choiceRef.current, true);
                if (active.current) {
                  setPhase('sent');
                  refresh();
                }
              } catch {
                if (active.current) setPhase('unknown');
              }
            }}
          >
            Inspect decision receipt
          </button>
        )}
        <button type="button" onClick={refresh}>
          Refresh review
        </button>
      </footer>
    </section>
  );
}
