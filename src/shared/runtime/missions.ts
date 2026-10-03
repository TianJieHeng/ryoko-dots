import { z } from 'zod';
import { contractVersion, scopeSchema } from './contracts.js';
import { reviewSchema } from './reviews.js';
export const missionSchema = z.strictObject({
  id: z.string().min(1).max(256),
  conversationId: z.string().min(1).max(256),
  revision: z.number().int().nonnegative(),
  title: z.string().max(1000),
  state: z.enum([
    'accepted',
    'running',
    'waiting',
    'ready_to_review',
    'partial',
    'completed',
    'failed',
    'cancel_requested',
    'cancelled',
  ]),
  output: z.enum(['none', 'pending', 'committed', 'verified']),
  delivery: z.enum(['held', 'queued', 'delivered', 'failed', 'unknown']),
  unresolvedEffects: z
    .array(
      z.strictObject({
        id: z.string().max(256),
        target: z.string().max(1000),
        state: z.enum(['prepared', 'dispatched', 'unknown', 'reconciled']),
      }),
    )
    .max(100),
  events: z
    .array(
      z.strictObject({
        id: z.string().max(256),
        time: z.number().int().nonnegative(),
        summary: z.string().max(2000),
      }),
    )
    .max(500),
  allowedActions: z
    .array(z.enum(['resume', 'new_run', 'retry_delivery', 'pause', 'cancel']))
    .max(5),
  reviews: z.array(reviewSchema).max(100),
});
export const missionsSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  missions: z.array(missionSchema).max(500),
  truncated: z.boolean(),
});
export const controlSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  revision: z.number().int().nonnegative(),
  admission: z.enum(['open', 'pause_requested', 'paused', 'resume_requested']),
  schedules: z.enum(['open', 'paused', 'unknown']),
  inFlight: z.enum(['continues', 'stopping', 'unknown']),
});
