/** Dots consumer contract candidate v1. These are NOT existing Hermes endpoints.
 * BE00 must qualify mapping to the pinned producer before any capability is ready.
 * Strict allowlists prevent accidental propagation of credentials/raw runtime state.
 */
import { z } from 'zod';

export const contractVersion = 'ryoko-dots/1' as const;
const id = z.string().min(1).max(256);
const revision = z.number().int().nonnegative();
export const scopeSchema = z.strictObject({
  owner: id,
  gateway: id,
  agent: id,
  project: id.nullable(),
  generation: revision,
});
export type RuntimeScope = z.infer<typeof scopeSchema>;
export const capabilitySchema = z.strictObject({
  state: z.enum([
    'ready',
    'unconfigured',
    'disconnected',
    'degraded',
    'unsupported',
    'permission_denied',
  ]),
  reason: z.string().max(1000),
});
export const featureNames = [
  'conversations',
  'commands',
  'missions',
  'reviews',
  'artifacts',
  'specialists',
  'memory',
  'learning',
  'schedules',
  'computer',
  'research',
  'voice',
  'slack',
  'migration',
] as const;
export type Feature = (typeof featureNames)[number];
export const setupSchema = z.strictObject({
  version: z.literal(contractVersion),
  runtimeOwner: z.literal('ryoko'),
  scope: scopeSchema.nullable(),
  controlPlane: capabilitySchema,
  binding: capabilitySchema,
  compatibility: capabilitySchema,
  features: z.record(z.enum(featureNames), capabilitySchema),
  qualified: z.boolean(),
});
export type RuntimeSetup = z.infer<typeof setupSchema>;
export const conversationSchema = z.strictObject({
  id,
  dotId: id,
  title: z.string().max(500),
  createdAt: revision,
  lineageId: id,
  revision,
  archived: z.boolean(),
  origin: z.enum(['web', 'page', 'voice', 'slack', 'import']),
});
export type RuntimeConversation = z.infer<typeof conversationSchema>;
export const conversationListSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  conversations: z.array(conversationSchema).max(100),
  nextCursor: id.nullable(),
});
export const transcriptPartSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), text: z.string().max(262144) }),
  z.strictObject({
    kind: z.literal('tool'),
    id,
    name: z.string().max(256),
    summary: z.string().max(10000),
    state: z.enum([
      'prepared',
      'dispatched',
      'unknown',
      'reconciled',
      'failed',
    ]),
  }),
  z.strictObject({
    kind: z.literal('source'),
    title: z.string().max(500),
    url: z.url().refine((v) => /^https?:\/\//.test(v)),
    excerpt: z.string().max(10000),
    sample: z.boolean(),
  }),
]);
export const messageSchema = z.strictObject({
  id,
  revision,
  role: z.enum(['user', 'assistant', 'tool']),
  parts: z.array(transcriptPartSchema).max(100),
  internal: z.boolean(),
  committed: z.boolean(),
});
export type TranscriptMessage = z.infer<typeof messageSchema>;
export const historySchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  conversationId: id,
  lineageId: id,
  messages: z.array(messageSchema).max(500),
  nextCursor: id.nullable(),
  sessionSequence: revision,
  runtimeCursor: id.nullable(),
  truncated: z.boolean(),
  interruption: z.string().max(1000).nullable(),
});
export type RuntimeHistory = z.infer<typeof historySchema>;
export const receiptSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  operationId: id,
  intentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum([
    'accepted',
    'rejected',
    'outcome_unknown',
    'cancel_requested',
    'cancelled',
  ]),
  missionId: id.nullable(),
  messageId: id.nullable(),
  reason: z.string().max(1000),
});
export type CommandReceipt = z.infer<typeof receiptSchema>;
export const eventSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  conversationId: id,
  sequence: revision,
  cursor: id,
  kind: z.enum(['history_changed', 'status_changed', 'snapshot_required']),
});
export function sameScope(
  a: RuntimeScope | null,
  b: RuntimeScope | null,
): boolean {
  return (
    !!a &&
    !!b &&
    a.owner === b.owner &&
    a.gateway === b.gateway &&
    a.agent === b.agent &&
    a.project === b.project &&
    a.generation === b.generation
  );
}
export function canUse(
  setup: RuntimeSetup | undefined,
  feature: Feature,
): boolean {
  return (
    !!setup?.scope &&
    setup.qualified &&
    [
      setup.controlPlane,
      setup.binding,
      setup.compatibility,
      setup.features[feature],
    ].every((item) => item.state === 'ready')
  );
}

/** Actor/owner/grants are deliberately absent: gateway authentication owns them. */
export const commandIntentSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal('submit'),
    conversationId: id,
    text: z.string().trim().min(1).max(16000),
    sourceUrl: z
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password
        );
      })
      .nullable(),
  }),
  z.strictObject({
    operation: z.literal('steer'),
    conversationId: id,
    missionId: id,
    text: z.string().trim().min(1).max(16000),
  }),
  z.strictObject({
    operation: z.literal('cancel'),
    conversationId: id,
    missionId: id,
  }),
]);
export type CommandIntent = z.infer<typeof commandIntentSchema>;
export const pendingCommandSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  operationId: z.uuid(),
  intentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  intent: commandIntentSchema,
  createdAt: revision,
});
export type PendingCommand = z.infer<typeof pendingCommandSchema>;
