import { z } from 'zod';
import { api } from '../api';
import {
  computerInputs,
  computerPermissionsSchema,
} from '../../shared/computer-types';
import {
  contractVersion,
  sameScope,
  type RuntimeScope,
} from '../../shared/runtime/contracts';
import {
  computerStatusSchema,
  effectSchema,
  type RuntimeComputerEffect,
  type RuntimeComputerStatus,
} from '../../shared/runtime/computers';

const controls = z.enum([
  'start',
  'stop',
  'take',
  'release',
  'emergency_stop',
  'permissions',
]);
const empty = z.strictObject({});
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

const operationReferenceSchema = effectSchema.pick({
  version: true,
  scope: true,
  executorId: true,
  revision: true,
  operationId: true,
  intentDigest: true,
});
export type ComputerOperationReference = z.infer<
  typeof operationReferenceSchema
>;
const pendingSchema = z.array(operationReferenceSchema).max(1000);

function pendingKey(status: { scope: RuntimeScope; executorId: string }) {
  return `ryoko-computer-pending:${canonical({
    scope: status.scope,
    executorId: status.executorId,
  })}`;
}

/** Metadata only: reloads retain unresolved admissions without storing their input. */
export function pendingComputerOperations(status: RuntimeComputerStatus) {
  const raw = sessionStorage.getItem(pendingKey(status));
  const pending = raw === null ? [] : pendingSchema.parse(JSON.parse(raw));
  if (
    pending.some(
      (item) =>
        !sameScope(item.scope, status.scope) ||
        item.executorId !== status.executorId,
    )
  )
    throw new Error('Computer recovery records belong to another binding.');
  return pending;
}

function rememberOperation(
  status: RuntimeComputerStatus,
  operation: ComputerOperationReference,
) {
  const pending = pendingComputerOperations(status);
  if (!pending.some((item) => item.operationId === operation.operationId)) {
    sessionStorage.setItem(
      pendingKey(status),
      JSON.stringify(pendingSchema.parse([...pending, operation])),
    );
  }
}

function settleOperation(
  status: RuntimeComputerStatus,
  effect: RuntimeComputerEffect,
) {
  if (effect.state === 'reconciled' || effect.state === 'failed') {
    sessionStorage.setItem(
      pendingKey(status),
      JSON.stringify(
        pendingComputerOperations(status).filter(
          (item) => item.operationId !== effect.operationId,
        ),
      ),
    );
  }
  return effect;
}

function parseOwnerReceipt(
  value: unknown,
  operation: ComputerOperationReference,
) {
  const effect = effectSchema.parse(value);
  if (
    !sameScope(effect.scope, operation.scope) ||
    effect.executorId !== operation.executorId ||
    effect.operationId !== operation.operationId ||
    effect.intentDigest !== operation.intentDigest ||
    effect.revision < operation.revision ||
    effect.effectId !== null
  )
    throw new Error(
      'Computer operation response does not match this executor and intent.',
    );
  return effect;
}

function unknownOperation(
  operation: ComputerOperationReference,
): RuntimeComputerEffect {
  return { ...operation, effectId: null, state: 'unknown', output: null };
}

/** Recovery cannot submit an action, even after a permission or revision change. */
export async function inspectComputerOperation(
  statusValue: RuntimeComputerStatus,
  operationValue: ComputerOperationReference,
): Promise<RuntimeComputerEffect> {
  const status = computerStatusSchema.parse(statusValue);
  const operation = operationReferenceSchema.parse(operationValue);
  if (
    !sameScope(status.scope, operation.scope) ||
    status.executorId !== operation.executorId
  )
    throw new Error('Computer recovery belongs to another binding.');
  let value: unknown;
  try {
    value = await api(
      `/runtime/computer-operations/${encodeURIComponent(operation.operationId)}`,
    );
  } catch {
    return unknownOperation(operation);
  }
  return settleOperation(status, parseOwnerReceipt(value, operation));
}

/** Dot IDs select a binding; only the authenticated server supplies executor identity. */
export async function discoverComputerStatus(
  dotId: string,
  scope: RuntimeScope,
  signal?: AbortSignal,
): Promise<RuntimeComputerStatus> {
  const status = computerStatusSchema.parse(
    await api<unknown>(
      `/runtime/computers?dotId=${encodeURIComponent(dotId)}`,
      'GET',
      undefined,
      signal,
    ),
  );
  if (!sameScope(scope, status.scope))
    throw new Error('Computer belongs to another binding.');
  return status;
}

export async function loadComputerStatus(
  executorId: string,
  scope: RuntimeScope,
  signal?: AbortSignal,
): Promise<RuntimeComputerStatus> {
  const status = computerStatusSchema.parse(
    await api<unknown>(
      `/runtime/computers/${encodeURIComponent(executorId)}`,
      'GET',
      undefined,
      signal,
    ),
  );
  if (!sameScope(scope, status.scope) || status.executorId !== executorId)
    throw new Error('Computer belongs to another binding or executor.');
  return status;
}

/** One admission per exact intent/revision. A repeat only inspects that operation. */
export async function runComputerOperation(
  statusValue: RuntimeComputerStatus,
  action: string,
  input: unknown = {},
): Promise<RuntimeComputerEffect> {
  const status = computerStatusSchema.parse(statusValue);
  let validatedInput: unknown;
  if (Object.hasOwn(computerInputs, action)) {
    validatedInput =
      computerInputs[action as keyof typeof computerInputs].parse(input);
    const permission = action.startsWith('files_')
      ? 'files'
      : action === 'exec'
        ? 'shell'
        : 'browser';
    if (
      !status.configured ||
      status.state !== 'running' ||
      !status.permissions.enabled ||
      !status.permissions[permission] ||
      status.control.transitioning ||
      (permission === 'browser' &&
        !action.startsWith('human_') &&
        action !== 'snapshot' &&
        status.control.resumeSnapshotRequired) ||
      (permission === 'browser' &&
        (action.startsWith('human_')
          ? status.control.holder !== 'human'
          : status.control.holder !== 'bot'))
    )
      throw new Error(
        'This executor does not currently allow that computer action.',
      );
  } else {
    controls.parse(action);
    validatedInput =
      action === 'permissions'
        ? computerPermissionsSchema.partial().strict().parse(input)
        : empty.parse(input);
    if (
      !status.configured ||
      (status.state === 'unavailable' &&
        action !== 'take' &&
        action !== 'emergency_stop') ||
      status.state === 'not_configured' ||
      (action === 'start' && !status.permissions.enabled)
    )
      throw new Error(
        'This executor is not available for that control action.',
      );
  }
  const intent = {
    scope: status.scope,
    executorId: status.executorId,
    revision: status.revision,
    action,
    input: validatedInput,
  };
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical(intent)),
  );
  const intentDigest = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  // No raw command, URL, typed text, or file content is persisted in the browser.
  const key = `ryoko-computer-operation:${intentDigest}`;
  const stored = sessionStorage.getItem(key);
  if (
    stored === null &&
    action !== 'take' &&
    action !== 'emergency_stop' &&
    pendingComputerOperations(status).length > 0
  )
    throw new Error(
      'Inspect the unresolved computer operation before another action.',
    );
  const operationId =
    stored === null ? crypto.randomUUID() : z.uuid().parse(stored);
  if (stored === null) sessionStorage.setItem(key, operationId);
  const operation: ComputerOperationReference = {
    version: contractVersion,
    scope: status.scope,
    executorId: status.executorId,
    revision: status.revision,
    operationId,
    intentDigest,
  };
  rememberOperation(status, operation);
  if (stored !== null) return inspectComputerOperation(status, operation);
  let value: unknown;
  try {
    value = await api(
      `/runtime/computers/${encodeURIComponent(status.executorId)}/${action === 'take' || action === 'emergency_stop' ? 'control' : 'actions'}`,
      'POST',
      {
        operationId,
        intentDigest,
        action,
        input: validatedInput,
        expectedRevision: status.revision,
        expectedGeneration: status.scope.generation,
      },
    );
  } catch {
    // Network loss does not establish failure. Keep identity for reconciliation.
    return unknownOperation(operation);
  }
  return settleOperation(status, parseOwnerReceipt(value, operation));
}
