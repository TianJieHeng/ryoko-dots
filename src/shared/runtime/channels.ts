import { z } from 'zod';
import { contractVersion, scopeSchema } from './contracts.js';

const id = z.string().min(1).max(256);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/** Local review routes cannot escape into external navigation or encoded paths. */
export const channelReviewPathSchema = z
  .string()
  .max(1024)
  .regex(/^\/#\/missions\/[A-Za-z0-9_-]+\/reviews\/[A-Za-z0-9_-]+$/);
const slackPermalinkSchema = z
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.slack\.com$/i.test(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^\/archives\/[A-Za-z0-9_-]+\/p[0-9]+$/.test(url.pathname) &&
      !url.hash &&
      [...url.searchParams.keys()].every((key) =>
        ['thread_ts', 'cid'].includes(key),
      )
    );
  });

/** Public self-hosted channel readiness; no transport credentials are exposed. */
export const channelStatusSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  provider: z.literal('slack'),
  transport: z.literal('self_hosted'),
  state: z.enum([
    'unconfigured',
    'disconnected',
    'ready',
    'degraded',
    'permission_denied',
    'unsupported',
  ]),
  qualified: z.boolean(),
  teamId: id.nullable(),
  allowedHumanUserIds: z.array(id).max(1000),
  allowedChannelIds: z.array(id).max(1000),
  createdMessagesOnly: z.literal(true),
  ignoreBots: z.literal(true),
  ingressDeduplicated: z.boolean(),
});
export type RuntimeChannelStatus = z.infer<typeof channelStatusSchema>;

export const channelOriginSchema = z.strictObject({
  surface: z.enum(['web', 'voice', 'slack']),
  actorId: id.nullable(),
  teamId: id.nullable(),
  channelId: id.nullable(),
  providerEventId: id.nullable(),
  providerThreadId: id.nullable(),
  verified: z.boolean(),
  permalink: slackPermalinkSchema.nullable(),
});
export type RuntimeChannelOrigin = z.infer<typeof channelOriginSchema>;
export const provenanceSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  conversationId: id,
  origins: z.array(channelOriginSchema).max(500),
  reviewPath: channelReviewPathSchema.nullable(),
});
export type RuntimeProvenance = z.infer<typeof provenanceSchema>;

export const deliverySchema = z.strictObject({
  id,
  revision,
  conversationId: id,
  missionId: id,
  outputVersion: id,
  destination: z.string().min(1).max(1000),
  state: z.enum(['held', 'queued', 'delivered', 'failed', 'unknown']),
  providerReceipt: id.nullable(),
  reviewPath: channelReviewPathSchema.nullable(),
  allowedActions: z.array(z.enum(['retry_delivery', 'inspect'])).max(2),
});
export type RuntimeDelivery = z.infer<typeof deliverySchema>;
export const deliveriesSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  deliveries: z.array(deliverySchema).max(500),
});
export type RuntimeDeliveries = z.infer<typeof deliveriesSchema>;

/** An unknown send acknowledgment must be inspected, never replayed. */
export function canRetryDelivery(delivery: unknown): boolean {
  const parsed = deliverySchema.safeParse(delivery);
  return (
    parsed.success &&
    parsed.data.state === 'failed' &&
    parsed.data.allowedActions.includes('retry_delivery')
  );
}

/** Display names and client-claimed owners are never transport authority. */
export function verifiedSlackOrigin(origin: unknown, status: unknown): boolean {
  const parsedOrigin = channelOriginSchema.safeParse(origin);
  const parsedStatus = channelStatusSchema.safeParse(status);
  if (!parsedOrigin.success || !parsedStatus.success) return false;
  const source = parsedOrigin.data;
  const channel = parsedStatus.data;
  return (
    channel.qualified &&
    channel.state === 'ready' &&
    channel.ingressDeduplicated &&
    source.verified &&
    source.surface === 'slack' &&
    source.actorId !== null &&
    channel.allowedHumanUserIds.includes(source.actorId) &&
    channel.teamId !== null &&
    source.teamId === channel.teamId &&
    source.channelId !== null &&
    channel.allowedChannelIds.includes(source.channelId) &&
    source.providerEventId !== null
  );
}
