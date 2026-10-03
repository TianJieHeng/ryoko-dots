import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { computerInputs, computerPermissionsSchema } from './computer-types.js';

export const edgeId = z.string().min(1).max(256);
const revision = z.number().int().nonnegative().safe();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const edgeBindingSchema = z
  .object({
    ownerId: edgeId,
    dotId: edgeId,
    executorId: edgeId,
    principalId: edgeId,
    profileId: edgeId,
    agentId: edgeId,
  })
  .strict();
export type EdgeBinding = z.infer<typeof edgeBindingSchema>;
const authoritySchema = z
  .object({
    principal_id: edgeId,
    profile_id: edgeId,
    agent_id: edgeId,
    runtime_session_id: edgeId,
    run_id: edgeId,
    generation: revision,
    policy_digest: hash,
  })
  .strict();
export const effectIdentitySchema = authoritySchema
  .extend({
    schema_version: z.literal(1),
    operation_id: edgeId,
    effect_id: edgeId,
    approval_id: edgeId,
    approval_digest: hash,
    action_digest: hash,
    input_digest: hash,
    policy_version: edgeId,
    adapter_id: edgeId,
    adapter_kind: z.literal('computer'),
    grant_revision: revision,
    scope_json: z.string().max(32768),
    content_sha256: hash,
    content_size: revision,
  })
  .strict();
export const edgeActorSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('agent'),
      liveSessionId: edgeId,
      authority: authoritySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('owner'),
      ownerId: edgeId,
      authSessionId: edgeId,
      authRevision: revision,
    })
    .strict(),
]);
export type EdgeActor = z.infer<typeof edgeActorSchema>;
export const edgeFenceSchema = z
  .object({
    grantRevision: revision,
    controlRevision: revision,
    snapshotId: revision.nullable(),
    snapshotSha256: hash.nullable(),
  })
  .strict();
export const edgeStateSchema = edgeFenceSchema
  .extend({
    revision,
    permissions: computerPermissionsSchema,
    holder: z.enum(['bot', 'human']),
    transitioning: z.boolean(),
    resumeSnapshotRequired: z.boolean(),
    snapshotAt: revision.nullable(),
    bootId: edgeId,
  })
  .strict();
export type EdgeState = z.infer<typeof edgeStateSchema>;
export const edgeExecuteSchema = z
  .object({
    operationId: edgeId,
    actor: edgeActorSchema,
    identity: effectIdentitySchema.nullable(),
    action: z.enum(
      Object.keys(computerInputs) as [
        keyof typeof computerInputs,
        ...(keyof typeof computerInputs)[],
      ],
    ),
    input: z.unknown(),
    fence: edgeFenceSchema,
  })
  .strict();
export type EdgeExecute = z.infer<typeof edgeExecuteSchema>;
/** Immutable verification reference without command/input bytes or credentials. */
export type EdgeProofRequest = Pick<
  EdgeExecute,
  'operationId' | 'identity' | 'actor'
> & { requestSha256: string };
export function edgeProofRequest(request: EdgeExecute): EdgeProofRequest {
  return {
    operationId: request.operationId,
    identity: request.identity,
    actor: request.actor,
    requestSha256: edgeDigest(request),
  };
}
export const edgeObserveSchema = z
  .object({
    actor: edgeActorSchema,
    action: z.enum([
      'snapshot',
      'read',
      'screenshot',
      'files_list',
      'files_read',
    ]),
    input: z.unknown(),
    expectedGrantRevision: revision,
    expectedControlRevision: revision,
  })
  .strict();
export type EdgeObserve = z.infer<typeof edgeObserveSchema>;
export const edgeChangeSchema = z
  .object({
    operationId: edgeId,
    actor: edgeActorSchema,
    expectedGrantRevision: revision,
    expectedControlRevision: revision,
    change: z.discriminatedUnion('kind', [
      z
        .object({ kind: z.literal('bind'), binding: edgeBindingSchema })
        .strict(),
      z
        .object({
          kind: z.literal('permissions'),
          permissions: computerPermissionsSchema,
        })
        .strict(),
      z
        .object({
          kind: z.literal('control'),
          holder: z.enum(['bot', 'human']),
        })
        .strict(),
    ]),
  })
  .strict();
export type EdgeChange = z.infer<typeof edgeChangeSchema>;
export const edgeReceiptSchema = z
  .object({
    operationId: edgeId,
    requestSha256: hash,
    identity: effectIdentitySchema.nullable(),
    actor: edgeActorSchema,
    state: z.enum(['committed', 'not_applied', 'unknown']),
    reason: z.enum(['committed', 'fenced', 'busy', 'unknown', 'unavailable']),
    result: z.unknown().nullable(),
    resultSha256: hash.nullable(),
    receiptId: edgeId.nullable(),
  })
  .strict();
export type EdgeReceipt = z.infer<typeof edgeReceiptSchema>;
export const edgeTargetIdentitySchema = z
  .object({
    buildSha256: hash,
    configurationSha256: hash,
    evidence: z.enum(['target-host', 'synthetic']),
  })
  .strict();
export type EdgeTargetIdentity = z.infer<typeof edgeTargetIdentitySchema>;
export const computerHostQualificationSchema = edgeTargetIdentitySchema
  .extend({
    protocol: z.literal('dots-computer-edge/1'),
    dotId: edgeId,
    executorId: edgeId,
    receiptSha256: hash,
    actions: z.array(edgeExecuteSchema.shape.action),
  })
  .strict();
export const edgeEnvelopeSchema = z
  .object({
    version: z.literal(1),
    dotId: edgeId,
    executorId: edgeId,
    role: z.enum(['agent', 'owner']),
    expiresAt: revision,
    expectedTarget: edgeTargetIdentitySchema.nullable().optional(),
    body: z.unknown(),
    signature: hash,
  })
  .strict();
export type EdgeEnvelope = z.infer<typeof edgeEnvelopeSchema>;

export function edgeCanonical(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, normalize(x)]),
      );
    if (typeof v === 'number' && (!Number.isSafeInteger(v) || Object.is(v, -0)))
      throw new Error('Exact integers required.');
    if (v !== null && !['boolean', 'number', 'string'].includes(typeof v))
      throw new Error('Invalid JSON.');
    return v;
  };
  return JSON.stringify(normalize(value)).replace(
    /[\u007f-\uffff]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
export const edgeHash = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
export const edgeDigest = (value: unknown) => edgeHash(edgeCanonical(value));
function signature(
  path: string,
  payload: Omit<EdgeEnvelope, 'signature'>,
  token: string,
) {
  const roleKey = createHmac('sha256', token)
    .update(`dots-edge-v1:${payload.role}`)
    .digest();
  return createHmac('sha256', roleKey)
    .update(path + '\n' + edgeCanonical(payload))
    .digest('hex');
}
export function signEdge(
  path: string,
  payload: Omit<EdgeEnvelope, 'signature'>,
  token: string,
): EdgeEnvelope {
  return { ...payload, signature: signature(path, payload, token) };
}
export function verifyEdge(
  path: string,
  value: unknown,
  token: string,
  dotId: string,
  executorId: string,
  now = Date.now(),
) {
  const envelope = edgeEnvelopeSchema.parse(value);
  const { signature: mac, ...payload } = envelope;
  if (
    envelope.dotId !== dotId ||
    envelope.executorId !== executorId ||
    envelope.expiresAt <= now ||
    envelope.expiresAt > now + 70000 ||
    !timingSafeEqual(
      Buffer.from(mac, 'hex'),
      Buffer.from(signature(path, payload, token), 'hex'),
    )
  )
    throw new Error('Unauthenticated edge request.');
  return envelope;
}
export function edgeKind(action: string): 'browser' | 'files' | 'shell' {
  return action === 'exec'
    ? 'shell'
    : action.startsWith('files_')
      ? 'files'
      : 'browser';
}
/** Parse, but never silently trim/default or rewrite approved bytes. */
export function exactEdgeInput(
  action: keyof typeof computerInputs,
  input: unknown,
) {
  const parsed = computerInputs[action].parse(input);
  if (edgeCanonical(parsed) !== edgeCanonical(input))
    throw new Error('Input is not normalized.');
  return parsed;
}
export function sanitizeEdgeResult(
  value: unknown,
  secrets: readonly string[],
  maxBytes = 65536,
): unknown {
  let bytes = edgeCanonical(value);
  if (Buffer.byteLength(bytes) > Math.max(4_000_000, maxBytes))
    throw new Error('Result too large.');
  for (const secret of secrets)
    if (secret)
      bytes = bytes
        .split(edgeCanonical(secret).slice(1, -1))
        .join('[redacted]');
  const copy = JSON.parse(bytes) as unknown;
  if (copy && typeof copy === 'object' && !Array.isArray(copy))
    delete (copy as Record<string, unknown>).command;
  if (Buffer.byteLength(edgeCanonical(copy)) > maxBytes)
    throw new Error('Result too large.');
  return copy;
}
