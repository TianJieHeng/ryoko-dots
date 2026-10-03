import { z } from 'zod';
import { api, getAuthenticationGeneration } from '../api';
import { sameScope, type RuntimeScope } from '../../shared/runtime/contracts';
import {
  identityMethods,
  identityReadActions,
  identityEnvelopeSchema,
  identityReceiptSchema,
  identityReviewSchema,
  memoryRecordSchema,
  type IdentityAction,
  type IdentityReceipt,
} from '../../shared/runtime/identity';

export function identityPath(conversationId: string, action: IdentityAction) {
  if (
    !conversationId ||
    conversationId.length > 256 ||
    ['.', '..'].includes(conversationId) ||
    !Object.hasOwn(identityMethods, action)
  )
    throw new Error('Invalid identity operation target.');
  return `/runtime/conversations/${encodeURIComponent(conversationId)}/identity/${action}`;
}

/** Match server lexical canonicalization, including non-ASCII strings. */
export function canonicalIdentity(value: unknown, depth = 0): string {
  const canonical = (item: unknown, level: number): unknown => {
    if (level > 32) throw new Error('Identity JSON exceeds its depth limit.');
    if (Array.isArray(item))
      return item.map((child) => canonical(child, level + 1));
    if (item && typeof item === 'object') {
      if (
        Object.getPrototypeOf(item) !== Object.prototype &&
        Object.getPrototypeOf(item) !== null
      )
        throw new Error('Expected plain identity JSON.');
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, child]) => [key, canonical(child, level + 1)]),
      );
    }
    if (
      item === null ||
      typeof item === 'string' ||
      typeof item === 'boolean' ||
      (typeof item === 'number' && Number.isFinite(item))
    )
      return item;
    throw new Error('Expected finite identity JSON.');
  };
  const result = JSON.stringify(canonical(value, depth));
  if (new TextEncoder().encode(result).byteLength > 1_000_000)
    throw new Error('Identity JSON exceeds its byte limit.');
  return result;
}
export async function identityDigest(value: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(canonicalIdentity(value)),
      ),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}
function checkBinding(
  value: { scope: RuntimeScope; conversationId: string },
  scope: RuntimeScope,
  conversationId: string,
) {
  if (!sameScope(value.scope, scope) || value.conversationId !== conversationId)
    throw new Error(
      'Identity response belongs to another conversation, agent, project or authority generation.',
    );
}
export async function readIdentity<T>(
  scope: RuntimeScope,
  conversationId: string,
  action: IdentityAction,
  payload: Record<string, unknown>,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!identityReadActions.has(action))
    throw new Error('This action is not a read operation.');
  const response = identityEnvelopeSchema(schema).parse(
    await api<unknown>(
      identityPath(conversationId, action),
      'POST',
      { payload, ...(scope.project ? { projectId: scope.project } : {}) },
      signal,
    ),
  );
  checkBinding(response, scope, conversationId);
  return response.result;
}

/** Persist before dispatch. Repeated/ambiguous actions only inspect the original receipt. */
export async function actIdentity(
  scope: RuntimeScope,
  conversationId: string,
  action: IdentityAction,
  payload: Record<string, unknown>,
  inspectOnly = false,
): Promise<IdentityReceipt> {
  const path = identityPath(conversationId, action);
  if (identityReadActions.has(action))
    throw new Error('Read operations cannot create mutation receipts.');
  const intentDigest = await identityDigest({
    method: identityMethods[action],
    payload,
  });
  const key = `ryoko-identity:${canonicalIdentity(scope)}:${conversationId}:${intentDigest}`;
  const stored = sessionStorage.getItem(key);
  if (inspectOnly && !stored)
    throw new Error(
      'No original operation is available to inspect. No action was sent.',
    );
  const operationId = stored ? z.uuid().parse(stored) : crypto.randomUUID();
  if (!stored) sessionStorage.setItem(key, operationId);
  const result = identityReceiptSchema.parse(
    await api<unknown>(
      stored ? `/runtime/operations/${encodeURIComponent(operationId)}` : path,
      stored ? 'GET' : 'POST',
      stored
        ? undefined
        : {
            operationId,
            intentDigest,
            expectedGeneration: scope.generation,
            payload,
            ...(scope.project ? { projectId: scope.project } : {}),
          },
    ).catch((cause) => {
      throw new Error(
        `${cause instanceof Error ? cause.message : 'Identity operation outcome unknown.'} Original operation: ${operationId}. Inspect this ID before retrying.`,
      );
    }),
  );
  checkBinding(result, scope, conversationId);
  if (
    result.operationId !== operationId ||
    result.intentDigest !== intentDigest
  )
    throw new Error('Receipt does not match the original identity operation.');
  return result;
}
export async function presentIdentityReview(
  scope: RuntimeScope,
  conversationId: string,
  receipt: IdentityReceipt,
  expectedMethod: string,
) {
  checkBinding(receipt, scope, conversationId);
  if (receipt.status !== 'accepted') throw new Error(receipt.reason);
  const result = identityReviewSchema.parse(
    await api<unknown>(
      `/runtime/identity/operations/${encodeURIComponent(receipt.operationId)}/review`,
    ),
  );
  checkBinding(result, scope, conversationId);
  if (
    result.reviewOperationId !== receipt.operationId ||
    result.method !== expectedMethod ||
    (await identityDigest(result.result)) !== result.reviewDigest ||
    (await identityDigest(receipt.result)) !== result.reviewDigest
  )
    throw new Error('Exact review differs from its prepared operation.');
  return result;
}
export function requireAccepted(receipt: IdentityReceipt) {
  if (receipt.status !== 'accepted')
    throw new Error(
      `${receipt.reason} Original operation: ${receipt.operationId}`,
    );
  return receipt.result;
}

/** Read a known durable operation after reload; this route can never dispatch it again. */
export async function inspectIdentityOperation(
  scope: RuntimeScope,
  conversationId: string,
  operationId: string,
) {
  z.uuid().parse(operationId);
  const receipt = identityReceiptSchema.parse(
    await api<unknown>(
      `/runtime/operations/${encodeURIComponent(operationId)}`,
    ),
  );
  checkBinding(receipt, scope, conversationId);
  if (receipt.operationId !== operationId)
    throw new Error('Inspection returned another original operation.');
  return receipt;
}

export async function exportIdentityMemory(
  scope: RuntimeScope,
  conversationId: string,
  signal?: AbortSignal,
) {
  identityPath(conversationId, 'memory.status');
  const generation = getAuthenticationGeneration();
  const current = () => {
    if (signal?.aborted || generation !== getAuthenticationGeneration())
      throw new Error('Memory export authority changed.');
  };
  const response = await fetch(
    `/api/runtime/conversations/${encodeURIComponent(conversationId)}/identity/memory/export?includeDeleted=false${scope.project ? `&projectId=${encodeURIComponent(scope.project)}` : ''}`,
    {
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal,
    },
  );
  const reader = response.body?.getReader();
  try {
    current();
    if (
      !response.ok ||
      response.redirected ||
      !reader ||
      response.headers.get('content-type')?.split(';')[0] !== 'application/json'
    )
      throw new Error('Verified memory export is unavailable.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const next = await reader.read();
      current();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 8 * 1024 * 1024)
        throw new Error('Memory export exceeds its byte limit.');
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const sha = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    if (sha !== response.headers.get('X-Content-SHA256'))
      throw new Error('Memory export digest mismatch.');
    const snapshot = z
      .object({
        revision: z.number().int().nonnegative(),
        records: z.array(memoryRecordSchema),
      })
      .parse(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
      );
    if (
      String(snapshot.revision) !== response.headers.get('X-Memory-Revision') ||
      snapshot.records.some(
        (row) =>
          row.owner_agent_id !== scope.agent ||
          (row.scope !== 'individual' &&
            (!scope.project || row.scope !== `project:${scope.project}`)),
      )
    )
      throw new Error(
        'Memory export contains another agent, project or revision.',
      );
    current();
    return {
      blob: new Blob([bytes], { type: 'application/json' }),
      sha256: sha,
      revision: snapshot.revision,
    };
  } catch (cause) {
    await reader?.cancel().catch(() => {});
    throw cause;
  } finally {
    reader?.releaseLock();
  }
}
