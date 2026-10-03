import { z } from 'zod';
import { api } from '../api';
import {
  computerInputs,
  computerPermissionsSchema,
} from '../../shared/computer-types';
import { contractVersion, sameScope } from '../../shared/runtime/contracts';
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
  const operationId =
    stored === null ? crypto.randomUUID() : z.uuid().parse(stored);
  if (stored === null) sessionStorage.setItem(key, operationId);
  let value: unknown;
  try {
    value =
      stored === null
        ? await api(
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
          )
        : await api(
            `/runtime/computer-operations/${encodeURIComponent(operationId)}`,
          );
  } catch {
    // Network loss does not establish failure. Keep identity for reconciliation.
    return {
      version: contractVersion,
      scope: status.scope,
      executorId: status.executorId,
      revision: status.revision,
      operationId,
      intentDigest,
      effectId: null,
      state: 'unknown',
      output: null,
    };
  }
  const effect = effectSchema.parse(value);
  if (
    !sameScope(effect.scope, status.scope) ||
    effect.executorId !== status.executorId ||
    effect.operationId !== operationId ||
    effect.intentDigest !== intentDigest ||
    effect.revision < status.revision
  )
    throw new Error(
      'Computer operation response does not match this executor and intent.',
    );
  return effect;
}
