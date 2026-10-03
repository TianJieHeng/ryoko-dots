import { z } from 'zod';
import {
  pendingCommandSchema,
  receiptSchema,
  sameScope,
  type CommandIntent,
  type CommandReceipt,
  type PendingCommand,
  type RuntimeScope,
  type TranscriptMessage,
} from '../../shared/runtime/contracts';
import {
  prepareCommand,
  releasePreparedCommand,
  retainPreparedCommand,
  validateReceipt,
} from './commands';

export const commandRecoveryLimit = 32;
const recordSchema = z.strictObject({
  pending: pendingCommandSchema,
  receipt: receiptSchema.optional(),
});
const recordsSchema = z.array(recordSchema).max(commandRecoveryLimit);
export type RecoveredCommand = z.infer<typeof recordSchema>;
type CommandStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const keyOf = (scope: RuntimeScope, conversationId: string) =>
  `ryoko-command-recovery:v1:${JSON.stringify([scope, conversationId])}`;
export function commandIsTerminal(receipt?: CommandReceipt) {
  return (
    !!receipt &&
    (receipt.status === 'rejected' ||
      receipt.status === 'cancelled' ||
      ['completed', 'failed', 'blocked', 'cancelled'].includes(
        receipt.executionStatus ?? '',
      ))
  );
}
export function commandIsAdmitted(receipt?: CommandReceipt) {
  return (
    !!receipt &&
    ['accepted', 'cancel_requested', 'cancelled'].includes(receipt.status)
  );
}
export function recoverCommands(
  scope: RuntimeScope,
  conversationId: string,
  storage: CommandStorage = sessionStorage,
): RecoveredCommand[] {
  const raw = storage.getItem(keyOf(scope, conversationId));
  const records = raw ? recordsSchema.parse(JSON.parse(raw)) : [];
  const legacy = storage.getItem(
    `ryoko-pending:${JSON.stringify([scope, conversationId])}`,
  );
  if (legacy) {
    const pending = pendingCommandSchema.parse(JSON.parse(legacy));
    if (
      !records.some(
        (record) => record.pending.operationId === pending.operationId,
      )
    ) {
      if (records.length >= commandRecoveryLimit)
        throw new Error('Browser recovery queue is full.');
      records.push({ pending });
    }
  }
  const ids = new Set<string>();
  for (const record of records) {
    if (
      !sameScope(scope, record.pending.scope) ||
      record.pending.intent.conversationId !== conversationId ||
      ids.has(record.pending.operationId)
    )
      throw new Error(
        'Saved operations do not match this conversation and binding.',
      );
    if (record.receipt) validateReceipt(record.receipt, record.pending);
    ids.add(record.pending.operationId);
  }
  return records;
}
function save(
  scope: RuntimeScope,
  conversationId: string,
  records: RecoveredCommand[],
  storage: CommandStorage,
) {
  storage.setItem(
    keyOf(scope, conversationId),
    JSON.stringify(recordsSchema.parse(records)),
  );
  const legacyKey = `ryoko-pending:${JSON.stringify([scope, conversationId])}`;
  const legacy = storage.getItem(legacyKey);
  if (
    legacy &&
    records.some(
      (record) =>
        record.pending.operationId ===
        pendingCommandSchema.parse(JSON.parse(legacy)).operationId,
    )
  )
    storage.removeItem(legacyKey);
}
export async function prepareTrackedCommand(
  scope: RuntimeScope,
  intent: CommandIntent,
  storage: CommandStorage = sessionStorage,
) {
  const records = recoverCommands(scope, intent.conversationId, storage);
  // A full unresolved queue stops before creating an identity or sending anything.
  if (
    records.length >= commandRecoveryLimit &&
    !records.some((record) => commandIsTerminal(record.receipt))
  )
    throw new Error(
      'Browser recovery queue is full. Inspect pending work before sending more.',
    );
  const prepared = await prepareCommand(scope, intent, storage);
  if (
    !records.some(
      (record) => record.pending.operationId === prepared.pending.operationId,
    )
  ) {
    while (records.length >= commandRecoveryLimit) {
      const index = records.findIndex((record) =>
        commandIsTerminal(record.receipt),
      );
      const [removed] = records.splice(index, 1);
      releasePreparedCommand(removed.pending, storage);
    }
    records.push({ pending: prepared.pending });
    // If this write fails, the prepared identity remains inspect-only. Never send.
    save(scope, intent.conversationId, records, storage);
  }
  return prepared;
}
export function recordCommandReceipt(
  pending: PendingCommand,
  value: CommandReceipt,
  storage: CommandStorage = sessionStorage,
) {
  const receipt = validateReceipt(value, pending);
  const records = recoverCommands(
    pending.scope,
    pending.intent.conversationId,
    storage,
  );
  const index = records.findIndex(
    (record) => record.pending.operationId === pending.operationId,
  );
  if (index < 0) throw new Error('Operation recovery identity is unavailable.');
  const previous = records[index].receipt;
  if (previous?.runId && receipt.runId && previous.runId !== receipt.runId)
    throw new Error('Receipt target run changed. Inspect the original run.');
  if (
    previous &&
    (previous.durableRevision > receipt.durableRevision ||
      (commandIsTerminal(previous) && !commandIsTerminal(receipt)) ||
      (commandIsAdmitted(previous) && receipt.status === 'outcome_unknown'))
  )
    return previous;
  records[index] = { pending, receipt };
  save(pending.scope, pending.intent.conversationId, records, storage);
  // Inspection must not turn a retained uncertain draft into a new submission.
  // Release accepted identities only when the UI acknowledges/clears that draft.
  if (receipt.status === 'rejected') releasePreparedCommand(pending, storage);
  return receipt;
}
/** Controls use the selected run's newest receipt, never a mission or conversation ID. */
export function controllableRuns(records: RecoveredCommand[]) {
  // A control receipt describes that control command, not the target run's
  // execution lifecycle. Only its original submit can prove terminal state.
  return records
    .filter(
      (record) =>
        record.pending.intent.operation === 'submit' &&
        record.receipt?.runId &&
        record.receipt.status !== 'rejected' &&
        !commandIsTerminal(record.receipt),
    )
    .map((record) => {
      let durableRevision = record.receipt!.durableRevision;
      let cancelRequested = false;
      for (const control of records) {
        if (
          control.pending.intent.operation === 'submit' ||
          control.pending.intent.runId !== record.receipt!.runId ||
          !control.receipt ||
          control.receipt.status === 'rejected'
        )
          continue;
        durableRevision = Math.max(
          durableRevision,
          control.receipt.durableRevision,
        );
        if (
          control.receipt.status === 'cancel_requested' &&
          !['blocked', 'failed', 'cancelled'].includes(
            control.receipt.executionStatus ?? '',
          )
        )
          cancelRequested = true;
      }
      return {
        ...record,
        receipt: {
          ...record.receipt!,
          durableRevision,
          status: cancelRequested
            ? ('cancel_requested' as const)
            : record.receipt!.status,
        },
      };
    });
}

/** Import bounded server-owned identities before any inspection, never submission. */
export function mergeRecoveredCommands(
  scope: RuntimeScope,
  conversationId: string,
  incoming: PendingCommand[],
  storage: CommandStorage = sessionStorage,
) {
  const records = recoverCommands(scope, conversationId, storage);
  const added: PendingCommand[] = [];
  const removed: PendingCommand[] = [];
  for (const pending of incoming) {
    if (
      !sameScope(scope, pending.scope) ||
      pending.intent.conversationId !== conversationId
    )
      throw new Error('Recovered operation belongs to another binding.');
    const existing = records.find(
      (record) => record.pending.operationId === pending.operationId,
    );
    if (existing) {
      if (
        existing.pending.intentDigest !== pending.intentDigest ||
        JSON.stringify(existing.pending.intent) !==
          JSON.stringify(pending.intent)
      )
        throw new Error('Recovered operation identity changed.');
      continue;
    }
    while (records.length >= commandRecoveryLimit) {
      const index = records.findIndex((record) =>
        commandIsTerminal(record.receipt),
      );
      if (index < 0)
        throw new Error(
          'Browser recovery queue is full. Inspect saved work before loading more commands.',
        );
      removed.push(records.splice(index, 1)[0].pending);
    }
    records.push({ pending });
    added.push(pending);
  }
  save(scope, conversationId, records, storage);
  for (const pending of removed) releasePreparedCommand(pending, storage);
  for (const pending of added) retainPreparedCommand(pending, storage);
  return records;
}

/** Only canonical linkage replaces accepted input; equal text is not identity. */
export function hasCommittedInput(
  record: RecoveredCommand,
  messages: readonly TranscriptMessage[],
) {
  return messages.some(
    (message) =>
      message.committed &&
      !message.internal &&
      (message.commandId === record.pending.operationId ||
        (!!record.receipt?.messageId &&
          message.id === record.receipt.messageId)),
  );
}

export function acknowledgeCommand(
  pending: PendingCommand,
  storage: CommandStorage = sessionStorage,
) {
  const saved = recoverCommands(
    pending.scope,
    pending.intent.conversationId,
    storage,
  ).find((record) => record.pending.operationId === pending.operationId);
  if (!commandIsAdmitted(saved?.receipt))
    throw new Error(
      'Admission is not confirmed. Inspect before starting a new request.',
    );
  releasePreparedCommand(pending, storage);
}
