import { z } from 'zod';
import { api, getAuthenticationGeneration } from '../api';
import {
  contractVersion,
  sameScope,
  scopeSchema,
  type RuntimeScope,
} from '../../shared/runtime/contracts';
import {
  scheduleMutationConfigSchema,
  type ScheduleActionName,
} from '../../shared/runtime/schedule-evidence';

const id = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !['.', '..'].includes(value));
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const intentSchema = z.strictObject({
  path: z.string(),
  action: z.enum(['create', 'edit', 'pause', 'resume', 'cancel', 'run_now']),
  payload: z.record(z.string(), z.unknown()),
  expectedRevision: revision,
});
const operationSchema = z.strictObject({
  scope: scopeSchema,
  conversationId: id,
  operationId: z.uuid(),
  intentDigest: digest,
  intent: intentSchema,
});
const receiptSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  operationId: z.uuid(),
  intentDigest: digest,
  status: z.enum(['accepted', 'rejected', 'outcome_unknown']),
  reason: z.string().max(1000),
});
export type ScheduleOperation = z.infer<typeof operationSchema>;
export type ScheduleReceipt = z.infer<typeof receiptSchema>;

export function schedulePath(conversationId: string, scheduleId?: string) {
  const base = `/runtime/conversations/${encodeURIComponent(id.parse(conversationId))}/schedules`;
  return scheduleId === undefined
    ? base
    : `${base}/${encodeURIComponent(id.parse(scheduleId))}/actions`;
}
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
async function intentDigest(intent: ScheduleOperation['intent']) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(canonical(intent))),
      ),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}
const prefix = (scope: RuntimeScope, conversationId: string) =>
  `ryoko-schedule:${JSON.stringify(scope)}:${conversationId}`;
const pendingKey = (scope: RuntimeScope, conversationId: string) =>
  `${prefix(scope, conversationId)}:pending`;
function readStored(scope: RuntimeScope, conversationId: string, hash: string) {
  const stored = sessionStorage.getItem(
    `${prefix(scope, conversationId)}:${digest.parse(hash)}`,
  );
  if (!stored)
    throw new Error(
      'Original schedule operation is missing. No action was sent.',
    );
  const operation = operationSchema.parse(JSON.parse(stored));
  if (
    !sameScope(operation.scope, scope) ||
    operation.conversationId !== conversationId ||
    operation.intentDigest !== hash
  )
    throw new Error(
      'Stored schedule operation belongs to another authenticated binding.',
    );
  return operation;
}
export function readPendingScheduleOperation(
  scope: RuntimeScope,
  conversationId: string,
) {
  if (typeof sessionStorage === 'undefined') return undefined;
  const hash = sessionStorage.getItem(pendingKey(scope, conversationId));
  return hash ? readStored(scope, conversationId, hash) : undefined;
}
async function send(
  operation: ScheduleOperation,
  inspectOnly: boolean,
  auth: number,
) {
  const {
    scope,
    conversationId,
    intent,
    operationId,
    intentDigest: hash,
  } = operation;
  const computedDigest = await intentDigest(intent);
  if (auth !== getAuthenticationGeneration() || computedDigest !== hash)
    throw new Error(
      'Schedule authentication or original intent changed. No action was sent.',
    );
  const receipt = receiptSchema.parse(
    await api<unknown>(
      inspectOnly
        ? `/runtime/operations/${encodeURIComponent(operationId)}`
        : intent.path,
      inspectOnly ? 'GET' : 'POST',
      inspectOnly
        ? undefined
        : {
            operationId,
            intentDigest: hash,
            action: intent.action,
            payload: intent.payload,
            expectedRevision: intent.expectedRevision,
            expectedGeneration: scope.generation,
          },
    ),
  );
  if (
    auth !== getAuthenticationGeneration() ||
    !sameScope(scope, receipt.scope) ||
    receipt.operationId !== operationId ||
    receipt.intentDigest !== hash
  )
    throw new Error(
      'Schedule receipt does not match the original authenticated operation.',
    );
  if (
    receipt.status !== 'outcome_unknown' &&
    sessionStorage.getItem(pendingKey(scope, conversationId)) === hash
  )
    sessionStorage.removeItem(pendingKey(scope, conversationId));
  return receipt;
}
/** Persist exact intent before dispatch. Any ambiguity or repeated action only inspects; never resend. */
export async function performScheduleOperation(
  scope: RuntimeScope,
  conversationId: string,
  action: ScheduleActionName,
  payload: Record<string, unknown>,
  expectedRevision: number,
  scheduleId?: string,
) {
  const auth = getAuthenticationGeneration();
  scopeSchema.parse(scope);
  if (!scope.project)
    throw new Error(
      'A verified conversation project is required before a schedule action.',
    );
  if ((action === 'create') !== (scheduleId === undefined))
    throw new Error('Schedule action target does not match its intent.');
  const config =
    action === 'create' || action === 'edit'
      ? scheduleMutationConfigSchema.parse(payload)
      : z.strictObject({}).parse(payload);
  if ('threadId' in config && config.threadId !== conversationId)
    throw new Error('Schedule belongs to another conversation.');
  const intent = intentSchema.parse({
    path: schedulePath(conversationId, scheduleId),
    action,
    payload: config,
    expectedRevision,
  });
  const hash = await intentDigest(intent);
  if (auth !== getAuthenticationGeneration())
    throw new Error('Authentication changed. No schedule action was sent.');
  const unresolved = readPendingScheduleOperation(scope, conversationId);
  if (unresolved && unresolved.intentDigest !== hash)
    throw new Error(
      'Inspect the unresolved original schedule operation before submitting a different intent.',
    );
  const key = `${prefix(scope, conversationId)}:${hash}`;
  const existing = sessionStorage.getItem(key);
  const operation = existing
    ? readStored(scope, conversationId, hash)
    : operationSchema.parse({
        scope,
        conversationId,
        operationId: crypto.randomUUID(),
        intentDigest: hash,
        intent,
      });
  if (!existing) sessionStorage.setItem(key, JSON.stringify(operation));
  sessionStorage.setItem(pendingKey(scope, conversationId), hash);
  return send(operation, !!existing, auth);
}
/** Reload/navigation recovery is GET-only, even when the first response was lost before admission. */
export async function inspectScheduleOperation(
  scope: RuntimeScope,
  conversationId: string,
) {
  const auth = getAuthenticationGeneration();
  const operation = readPendingScheduleOperation(scope, conversationId);
  if (!operation)
    throw new Error(
      'No original schedule operation is available to inspect. No action was sent.',
    );
  return send(operation, true, auth);
}
