import { z } from 'zod';
import { api, getAuthenticationGeneration } from '../api';
import {
  contractVersion,
  sameScope,
  scopeSchema,
  type RuntimeScope,
} from '../../shared/runtime/contracts';
import { runtimeDeliverySchema } from './control-contracts';

export const runtimeResultByteLimit = 8 * 1024 * 1024;
const id = z.string().min(1).max(256);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const resultSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  conversationId: id,
  commandId: id,
  artifact: z.strictObject({
    artifactId: id,
    version: z.number().int().positive(),
    sha256: digest,
    size: z.number().int().nonnegative().max(runtimeResultByteLimit),
    mime: z.literal('application/json'),
    dataBase64: z.string().max(Math.ceil(runtimeResultByteLimit / 3) * 4),
  }),
  finalResponse: z.string().max(runtimeResultByteLimit).nullable(),
  publicationState: z.enum(['committed', 'published_uncommitted']),
  delivery: runtimeDeliverySchema.shape.delivery.nullable(),
  browserReceiptId: z.uuid().nullable(),
});
const ackSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  conversationId: id,
  deliveryId: id,
  receiptId: z.uuid(),
  status: z.enum(['accepted', 'rejected', 'outcome_unknown']),
  delivery: runtimeDeliverySchema.shape.delivery.nullable(),
  humanReadConfirmed: z.literal(false),
});
const pendingAckSchema = z.strictObject({
  receiptId: z.uuid(),
  sha256: digest,
  textReceived: z.boolean(),
  artifactReceived: z.literal(true),
});
export type VerifiedRuntimeResult = z.infer<typeof resultSchema> & {
  artifactBytes: Uint8Array<ArrayBuffer>;
};
const encodeId = (value: string) => {
  id.parse(value);
  if (value === '.' || value === '..')
    throw new Error('Invalid result identity.');
  return encodeURIComponent(value);
};
const resultPath = (conversationId: string, commandId: string) =>
  `/runtime/conversations/${encodeId(conversationId)}/results/${encodeId(commandId)}`;
const ackPath = (conversationId: string, deliveryId: string) =>
  `/runtime/conversations/${encodeId(conversationId)}/deliveries/${encodeId(deliveryId)}/ack`;

/** Verify complete immutable bytes before showing text, offering download, or claiming browser receipt. */
export async function verifyRuntimeResult(
  value: unknown,
  scope: RuntimeScope,
  conversationId: string,
  commandId: string,
): Promise<VerifiedRuntimeResult> {
  const result = resultSchema.parse(value);
  if (
    !sameScope(scope, result.scope) ||
    result.conversationId !== conversationId ||
    result.commandId !== commandId
  )
    throw new Error('Result belongs to another conversation or command.');
  let binary: string;
  try {
    binary = atob(result.artifact.dataBase64);
  } catch {
    throw new Error('Invalid result byte encoding.');
  }
  if (
    btoa(binary) !== result.artifact.dataBase64 ||
    binary.length !== result.artifact.size
  )
    throw new Error('Result byte size or encoding changed.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  if (sha256 !== result.artifact.sha256)
    throw new Error('Result digest mismatch.');
  let content: Record<string, unknown>;
  try {
    content = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    );
    if (
      !content ||
      typeof content !== 'object' ||
      Array.isArray(content) ||
      ('final_response' in content &&
        typeof content.final_response !== 'string')
    )
      throw new Error();
  } catch {
    throw new Error('Result is not a supported JSON object.');
  }
  if ((content.final_response ?? null) !== result.finalResponse)
    throw new Error('Displayed result differs from the verified artifact.');
  const delivery = result.delivery;
  if (
    (result.publicationState === 'committed') !== (delivery !== null) ||
    (result.browserReceiptId && !delivery)
  )
    throw new Error('Result publication evidence is incomplete.');
  if (
    delivery &&
    (delivery.artifact_id !== result.artifact.artifactId ||
      delivery.version !== result.artifact.version ||
      delivery.sha256 !== sha256 ||
      delivery.destination.session_id !== conversationId ||
      delivery.destination.agent_id !== scope.agent)
  )
    throw new Error('Delivery does not match this immutable result.');
  return { ...result, artifactBytes: bytes };
}
export async function readRuntimeResult(
  scope: RuntimeScope,
  conversationId: string,
  commandId: string,
  signal?: AbortSignal,
) {
  const generation = getAuthenticationGeneration();
  const value = await api(
    resultPath(conversationId, commandId),
    'GET',
    undefined,
    signal,
  );
  const result = await verifyRuntimeResult(
    value,
    scope,
    conversationId,
    commandId,
  );
  if (signal?.aborted || generation !== getAuthenticationGeneration())
    throw new Error('Result access changed while verifying its bytes.');
  return result;
}

/** A deliberate click records client receipt only, never human reading. Unknown attempts retain their exact claim. */
export async function acknowledgeRuntimeResult(
  result: VerifiedRuntimeResult,
  inspectOnly = false,
  storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage,
) {
  const delivery = result.delivery;
  if (!delivery)
    throw new Error('No committed delivery is available to acknowledge.');
  const key = `ryoko-result-receipt:${JSON.stringify([result.scope, result.conversationId, delivery.delivery_id, result.artifact.sha256])}`;
  const saved = storage.getItem(key);
  if (!saved && (inspectOnly || !result.browserReceiptId))
    throw new Error(
      'No exact delivery attempt is available. Inspect or explicitly retry the immutable delivery first.',
    );
  const pending = saved
    ? pendingAckSchema.parse(JSON.parse(saved))
    : pendingAckSchema.parse({
        receiptId: result.browserReceiptId,
        sha256: result.artifact.sha256,
        textReceived: result.finalResponse !== null,
        artifactReceived: true,
      });
  if (
    pending.sha256 !== result.artifact.sha256 ||
    pending.textReceived !== (result.finalResponse !== null)
  )
    throw new Error('Saved receipt claim differs from this result.');
  if (!saved) storage.setItem(key, JSON.stringify(pending));
  const response = ackSchema.parse(
    await api(
      ackPath(result.conversationId, delivery.delivery_id),
      'POST',
      pending,
    ),
  );
  if (
    !sameScope(result.scope, response.scope) ||
    response.conversationId !== result.conversationId ||
    response.deliveryId !== delivery.delivery_id ||
    response.receiptId !== pending.receiptId
  )
    throw new Error('Acknowledgment receipt belongs to another attempt.');
  if (
    response.delivery &&
    (response.delivery.artifact_id !== result.artifact.artifactId ||
      response.delivery.version !== result.artifact.version ||
      response.delivery.sha256 !== result.artifact.sha256 ||
      response.delivery.destination.session_id !== result.conversationId ||
      response.delivery.destination.agent_id !== result.scope.agent)
  )
    throw new Error('Acknowledgment changed the immutable delivery.');
  if (
    response.status === 'accepted' &&
    (!response.delivery ||
      response.delivery.acknowledgment_level !== 'client_received' ||
      response.delivery.components.artifact !== 'client_received' ||
      (pending.textReceived &&
        response.delivery.components.text !== 'client_received'))
  )
    throw new Error('Client receipt acknowledgment was not established.');
  return response;
}
export function canRetryRuntimeResult(result: VerifiedRuntimeResult) {
  return (
    !!result.delivery &&
    result.delivery.result_available &&
    [
      'pending',
      'failed',
      'awaiting_ack',
      'partial',
      'outcome_unknown',
    ].includes(result.delivery.state)
  );
}

const retryIntentSchema = z.strictObject({
  deliveryId: id,
  artifactId: id,
  version: z.number().int().positive(),
  sha256: digest,
  attempt: z.number().int().nonnegative(),
});
const retryKey = (result: VerifiedRuntimeResult) =>
  `ryoko-result-retry:${JSON.stringify([result.scope, result.conversationId, result.commandId, result.artifact.sha256])}`;
export function hasPendingDeliveryRetry(
  result: VerifiedRuntimeResult,
  storage: Pick<Storage, 'getItem'> = sessionStorage,
) {
  return storage.getItem(retryKey(result)) !== null;
}
/** Preserve the original revision even if a lost response is followed by a newer delivery status. */
export async function retryRuntimeResult(
  result: VerifiedRuntimeResult,
  dispatch: (
    suffix: string,
    action: string,
    payload: Record<string, unknown>,
    revision: number,
    inspectOnly?: boolean,
  ) => Promise<void>,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = sessionStorage,
) {
  const key = retryKey(result),
    saved = storage.getItem(key),
    delivery = result.delivery;
  if (!delivery || (!saved && !canRetryRuntimeResult(result)))
    throw new Error('This immutable delivery cannot be retried.');
  const intent = saved
    ? retryIntentSchema.parse(JSON.parse(saved))
    : retryIntentSchema.parse({
        deliveryId: delivery.delivery_id,
        artifactId: delivery.artifact_id,
        version: delivery.version,
        sha256: delivery.sha256,
        attempt: delivery.attempt_count,
      });
  if (
    intent.deliveryId !== delivery.delivery_id ||
    intent.artifactId !== result.artifact.artifactId ||
    intent.version !== result.artifact.version ||
    intent.sha256 !== result.artifact.sha256
  )
    throw new Error('Saved delivery retry belongs to another result.');
  if (!saved) storage.setItem(key, JSON.stringify(intent));
  await dispatch(
    `deliveries/${encodeId(intent.deliveryId)}/actions`,
    'retry_delivery',
    {
      artifactId: intent.artifactId,
      version: intent.version,
      sha256: intent.sha256,
    },
    intent.attempt,
    !!saved,
  );
  storage.removeItem(key);
}
