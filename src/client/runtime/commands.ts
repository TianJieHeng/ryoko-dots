import { api } from '../api';
import {
  commandIntentSchema,
  contractVersion,
  pendingCommandSchema,
  receiptSchema,
  sameScope,
  scopeSchema,
  type CommandIntent,
  type CommandReceipt,
  type PendingCommand,
  type RuntimeScope,
} from '../../shared/runtime/contracts';

/** Stable property order; hash the validated intent, including normalized text. */
function canonicalIntent(intent: CommandIntent): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(intent).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    ),
  );
}
async function digestIntent(intent: CommandIntent): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalIntent(intent));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/**
 * Persist admission identity before any network request. Existing identities must
 * be inspected by the UI, never automatically replayed. Different intents retain
 * independent records so an unresolved command cannot be overwritten by edits.
 */
export async function prepareCommand(
  scope: RuntimeScope,
  intent: CommandIntent,
  storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage,
): Promise<{ pending: PendingCommand; existing: boolean }> {
  const validatedScope = scopeSchema.parse(scope);
  const validatedIntent = commandIntentSchema.parse(intent);
  const intentDigest = await digestIntent(validatedIntent);
  const key = `ryoko-command:${JSON.stringify([
    validatedScope.owner,
    validatedScope.gateway,
    validatedScope.agent,
    validatedScope.project,
    validatedScope.generation,
    validatedIntent.conversationId,
    intentDigest,
  ])}`;
  const stored = storage.getItem(key);
  if (stored !== null) {
    const pending = pendingCommandSchema.parse(JSON.parse(stored));
    if (
      !sameScope(pending.scope, validatedScope) ||
      pending.intentDigest !== intentDigest ||
      canonicalIntent(pending.intent) !== canonicalIntent(validatedIntent)
    )
      throw new Error('Stored command does not match this binding and intent.');
    return { pending, existing: true };
  }
  const pending = pendingCommandSchema.parse({
    version: contractVersion,
    scope: validatedScope,
    operationId: crypto.randomUUID(),
    intentDigest,
    intent: validatedIntent,
    createdAt: Date.now(),
  });
  // A storage failure aborts preparation. There is deliberately no memory fallback.
  storage.setItem(key, JSON.stringify(pending));
  return { pending, existing: false };
}

async function validatePending(value: PendingCommand): Promise<PendingCommand> {
  const pending = pendingCommandSchema.parse(value);
  if ((await digestIntent(pending.intent)) !== pending.intentDigest)
    throw new Error('Command intent does not match its persisted digest.');
  return pending;
}
function validateReceipt(
  value: unknown,
  pending: PendingCommand,
): CommandReceipt {
  const receipt = receiptSchema.parse(value);
  if (
    !sameScope(receipt.scope, pending.scope) ||
    receipt.operationId !== pending.operationId ||
    receipt.intentDigest !== pending.intentDigest
  )
    throw new Error('Command receipt does not match this binding and intent.');
  return receipt;
}

/** One explicit attempt only. Failures retain the persisted identity for inspection. */
export async function sendCommand(
  value: PendingCommand,
): Promise<CommandReceipt> {
  const pending = await validatePending(value);
  const result = await api<unknown>(
    `/runtime/conversations/${encodeURIComponent(pending.intent.conversationId)}/commands`,
    'POST',
    {
      operationId: pending.operationId,
      intentDigest: pending.intentDigest,
      intent: pending.intent,
      expectedGeneration: pending.scope.generation,
    },
  );
  return validateReceipt(result, pending);
}

export async function inspectCommand(
  value: PendingCommand,
): Promise<CommandReceipt> {
  const pending = await validatePending(value);
  const result = await api<unknown>(
    `/runtime/commands/${encodeURIComponent(pending.operationId)}`,
  );
  return validateReceipt(result, pending);
}
