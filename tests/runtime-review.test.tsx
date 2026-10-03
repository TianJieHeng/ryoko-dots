import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExactReviewCard } from '../src/client/runtime/ExactReviewCard';
import {
  canDecideReview,
  reviewSchema,
  type RuntimeReview,
} from '../src/shared/runtime/reviews';

const scope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'agent',
  project: null,
  generation: 7,
};
const review: RuntimeReview = {
  id: 'review-1',
  revision: 4,
  approvalDigest: 'a'.repeat(64),
  actionDigest: 'b'.repeat(64),
  scope,
  target: 'person@example.test',
  action: 'Send message',
  content: '<script>alert("x")</script>\n[link](https://example.test)',
  expiresAt: Date.now() + 60000,
  status: 'pending',
};
function render(value = review, currentScope = scope) {
  return renderToStaticMarkup(
    <ExactReviewCard
      review={value}
      scope={currentScope}
      decide={async () => {}}
      refresh={() => {}}
    />,
  );
}

it('shows exact review material as escaped plain text, not HTML or Markdown', () => {
  const html = render();
  expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  expect(html).toContain('[link](https://example.test)');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<a ');
  for (const value of [
    review.target,
    review.approvalDigest,
    review.actionDigest,
    'Revision',
    'Generation',
    new Date(review.expiresAt).toISOString(),
  ])
    expect(html).toContain(value);
  expect(html).not.toContain('disabled=""');
});

it('disables both decisions for expired, foreign and nonpending reviews', () => {
  const cases = [
    render({ ...review, expiresAt: 0 }),
    render(review, { ...scope, owner: 'another' }),
    ...(['approved', 'denied', 'consumed', 'invalidated'] as const).map(
      (status) => render({ ...review, status }),
    ),
  ];
  for (const html of cases) expect(html.match(/disabled=""/g)).toHaveLength(2);
});

it('rechecks exact scope generation and expiration at decision time', () => {
  expect(canDecideReview(review, scope, review.expiresAt - 1)).toBe(true);
  expect(canDecideReview(review, scope, review.expiresAt)).toBe(false);
  expect(
    canDecideReview(review, { ...scope, generation: scope.generation + 1 }, 0),
  ).toBe(false);
  expect(
    canDecideReview(
      { ...review, scope: { ...scope, generation: 8 } },
      scope,
      0,
    ),
  ).toBe(false);
  expect(canDecideReview(review, scope, NaN)).toBe(false);
});

it('strictly bounds review fields and rejects unapproved runtime material', () => {
  expect(reviewSchema.parse(review).content).toBe(review.content);
  expect(
    reviewSchema.safeParse({ ...review, credentials: 'secret' }).success,
  ).toBe(false);
  expect(
    reviewSchema.safeParse({ ...review, approvalDigest: 'not-a-digest' })
      .success,
  ).toBe(false);
  expect(
    reviewSchema.safeParse({ ...review, target: 'x'.repeat(4097) }).success,
  ).toBe(false);
  expect(
    reviewSchema.safeParse({ ...review, expiresAt: Infinity }).success,
  ).toBe(false);
  expect(
    reviewSchema.safeParse({ ...review, scope: { ...scope, token: 'secret' } })
      .success,
  ).toBe(false);
});
