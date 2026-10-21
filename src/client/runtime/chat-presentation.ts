import type { TranscriptMessage } from '../../shared/runtime/contracts';
import {
  commandIsAdmitted,
  commandIsTerminal,
  hasCommittedInput,
  type RecoveredCommand,
} from './command-recovery';

export function pendingChatMessages(
  records: RecoveredCommand[],
  messages: TranscriptMessage[],
) {
  return records.filter(
    (record) =>
      record.pending.intent.operation !== 'cancel' &&
      record.receipt?.status !== 'rejected' &&
      !hasCommittedInput(record, messages),
  );
}

export function chatProgress(
  records: RecoveredCommand[],
  messages: TranscriptMessage[],
  name: string,
  sending = false,
): { text: string; thinking: boolean; needsCheck: boolean } | null {
  if (sending)
    return {
      text: 'Sending your message…',
      thinking: false,
      needsCheck: false,
    };
  const active = records
    .filter((record) => record.pending.intent.operation !== 'cancel')
    .sort((a, b) => a.pending.createdAt - b.pending.createdAt);
  const record =
    [...active]
      .reverse()
      .find(
        (record) =>
          commandIsAdmitted(record.receipt) &&
          !commandIsTerminal(record.receipt),
      ) ?? active.at(-1);
  if (!record) return null;
  const receipt = record.receipt;
  if (
    receipt?.reason ===
    'This message exceeded its start deadline. Check message details before sending again.'
  )
    return { text: receipt.reason, thinking: false, needsCheck: true };
  const reply = messages.some(
    (message) =>
      message.role === 'assistant' &&
      message.committed &&
      !message.internal &&
      message.commandId === record.pending.operationId &&
      message.parts.some((part) => part.kind === 'text' && part.text.trim()),
  );
  if (receipt?.executionStatus === 'completed' || (reply && !receipt))
    return null;
  if (receipt?.status === 'rejected' || receipt?.executionStatus === 'failed')
    return {
      text: `${name} couldn't finish this reply. Check message details below.`,
      thinking: false,
      needsCheck: true,
    };
  if (receipt?.executionStatus === 'blocked')
    return {
      text: `${name} needs your attention before continuing. Check Activity or message details.`,
      thinking: false,
      needsCheck: true,
    };
  if (
    receipt?.status === 'cancelled' ||
    receipt?.executionStatus === 'cancelled'
  )
    return { text: 'Response stopped.', thinking: false, needsCheck: false };
  if (receipt?.status === 'cancel_requested')
    return {
      text: 'Stopping the response…',
      thinking: false,
      needsCheck: false,
    };
  if (commandIsAdmitted(receipt))
    return {
      text:
        receipt?.executionStatus === 'claimed'
          ? `${name} is thinking…`
          : `Message received. ${name} is getting ready…`,
      thinking: true,
      needsCheck: false,
    };
  return {
    text:
      receipt?.status === 'outcome_unknown'
        ? 'Delivery could not be confirmed. Check message details before sending again.'
        : 'Checking whether your message was received…',
    thinking: false,
    needsCheck: true,
  };
}
