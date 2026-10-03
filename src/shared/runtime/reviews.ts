import { z } from 'zod';
import { sameScope, scopeSchema, type RuntimeScope } from './contracts';

/** Browser-safe, exact review material. Never trim or interpret reviewed text. */
export const reviewSchema = z.strictObject({
  id: z.string().min(1).max(256),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  approvalDigest: z.string().regex(/^[a-f0-9]{64}$/),
  actionDigest: z.string().regex(/^[a-f0-9]{64}$/),
  scope: scopeSchema,
  target: z.string().min(1).max(4096),
  action: z.string().min(1).max(1000),
  content: z.string().max(262144),
  expiresAt: z.number().int().nonnegative().max(8640000000000000),
  status: z.enum(['pending', 'approved', 'denied', 'consumed', 'invalidated']),
});
export type RuntimeReview = z.infer<typeof reviewSchema>;

export function canDecideReview(
  review: RuntimeReview,
  scope: RuntimeScope,
  now = Date.now(),
): boolean {
  return (
    review.status === 'pending' &&
    Number.isFinite(now) &&
    now < review.expiresAt &&
    sameScope(review.scope, scope)
  );
}
