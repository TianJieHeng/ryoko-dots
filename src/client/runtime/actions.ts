import { z } from 'zod';
import {
  contractVersion,
  sameScope,
  scopeSchema,
  type RuntimeScope,
} from '../../shared/runtime/contracts';
import { api } from '../api';
const actionReceiptSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  operationId: z.uuid(),
  intentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['accepted', 'rejected', 'outcome_unknown']),
  reason: z.string().max(1000),
});
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value;
/** Explicit UI action only. Existing intent always inspects; no automatic effect replay. */
export async function runtimeAction(
  scope: RuntimeScope,
  path: string,
  action: string,
  payload: Record<string, unknown>,
  expectedRevision: number,
  inspectOnly = false,
) {
  if (
    !path.startsWith('/runtime/') ||
    path.includes('..') ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  )
    throw new Error('Invalid scoped runtime operation.');
  const intent = { path, action, payload, expectedRevision };
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(intent)));
  const intentDigest = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  const key = `ryoko-action:${JSON.stringify(scope)}:${intentDigest}`;
  const stored = sessionStorage.getItem(key);
  if (inspectOnly && !stored)
    throw new Error(
      'No persisted operation is available to inspect. No action was sent.',
    );
  const operationId = stored ? z.uuid().parse(stored) : crypto.randomUUID();
  if (!stored) sessionStorage.setItem(key, operationId);
  const receipt = actionReceiptSchema.parse(
    await api<unknown>(
      stored ? `/runtime/operations/${encodeURIComponent(operationId)}` : path,
      stored ? 'GET' : 'POST',
      stored
        ? undefined
        : {
            operationId,
            intentDigest,
            action,
            payload,
            expectedRevision,
            expectedGeneration: scope.generation,
          },
    ),
  );
  if (
    !sameScope(scope, receipt.scope) ||
    receipt.operationId !== operationId ||
    receipt.intentDigest !== intentDigest
  )
    throw new Error(
      'The operation receipt does not match the displayed action.',
    );
  if (receipt.status !== 'accepted')
    throw new Error(
      receipt.reason ||
        'Outcome is not confirmed. Inspect this same operation before retrying.',
    );
  return receipt;
}
