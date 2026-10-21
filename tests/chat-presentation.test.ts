import { expect, it } from 'vitest';
import {
  chatProgress,
  pendingChatMessages,
} from '../src/client/runtime/chat-presentation';
import type { RecoveredCommand } from '../src/client/runtime/command-recovery';
import type { TranscriptMessage } from '../src/shared/runtime/contracts';
const record = (executionStatus = 'claimed') =>
  ({
    pending: {
      operationId: 'op',
      createdAt: 1,
      intent: { operation: 'submit', text: 'hello' },
    },
    receipt: { status: 'accepted', executionStatus },
  }) as RecoveredCommand;
it('shows delivery and thinking, then removes status on completion', () => {
  expect(chatProgress([], [], 'Ryoko', true)?.text).toBe(
    'Sending your message…',
  );
  expect(chatProgress([record('accepted')], [], 'Ryoko')?.text).toContain(
    'Message received',
  );
  expect(chatProgress([record()], [], 'Ryoko')?.text).toBe(
    'Ryoko is thinking…',
  );
  expect(chatProgress([record('completed')], [], 'Ryoko')).toBeNull();
  expect(chatProgress([record('failed')], [], 'Ryoko')?.needsCheck).toBe(true);
});
it('shows pending text until committed input replaces it', () => {
  expect(pendingChatMessages([record()], [])).toHaveLength(1);
  const message = {
    commandId: 'op',
    role: 'user',
    committed: true,
    internal: false,
    parts: [{ kind: 'text', text: 'hello' }],
  } as TranscriptMessage;
  expect(pendingChatMessages([record()], [message])).toHaveLength(0);
});
it('does not let an older uncertain delivery mask a newer completed reply', () => {
  const unknown = record();
  unknown.receipt = {
    ...unknown.receipt!,
    status: 'outcome_unknown',
    executionStatus: null,
  };
  const completed = record('completed');
  completed.pending = {
    ...completed.pending,
    operationId: 'new',
    createdAt: 2,
  };
  expect(chatProgress([completed, unknown], [], 'Ryoko')).toBeNull();
  expect(chatProgress([unknown], [], 'Ryoko')?.text).toContain(
    'Delivery could not be confirmed',
  );
});
