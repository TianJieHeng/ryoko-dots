import { describe, it, expect } from 'vitest';
import { chatInputText } from '../src/server/runtime/chat-input';
import type { CommandRecord } from '../src/server/runtime/command-ledger';

describe('chat input display', () => {
  const input = 'Hello 🌸 [Untrusted page context, reference data only]';
  const payload =
    input +
    '\n\n[Untrusted page context, reference data only]\nprivate context\n[/Untrusted page context]';
  const record: CommandRecord = {
    operationId: 'op',
    ownerId: 'owner',
    conversationId: 'chat',
    authority: '{}',
    digest: 'digest',
    intent: JSON.stringify({ operation: 'submit', text: input }),
    payload: JSON.stringify({ text: payload }),
    createdAt: 1,
    state: 'accepted',
    result: null,
  };
  const chunk = {
    role: 'user',
    command_id: 'op',
    text: payload,
    text_offset: 0,
    next_text_offset: Buffer.byteLength(payload),
    text_sanitized: false,
  };
  it('hides appended context while retaining literal user markers and unicode', () => {
    expect(chatInputText('chat', chunk, record)).toBe(input);
  });
  it('preserves source offsets across chunks, including context-only chunks', () => {
    const offset = Buffer.byteLength(input);
    expect(
      chatInputText(
        'chat',
        { ...chunk, text: payload.slice(input.length), text_offset: offset },
        record,
      ),
    ).toBe('');
    expect(chunk.next_text_offset).toBe(Buffer.byteLength(payload));
  });
  it('does not guess at unrelated, sanitized, or unmatched input', () => {
    expect(chatInputText('other', chunk, record)).toBe(payload);
    expect(chatInputText('chat', chunk)).toBe(payload);
    expect(chatInputText('chat', { ...chunk, role: 'assistant' }, record)).toBe(
      payload,
    );
    expect(
      chatInputText('chat', { ...chunk, text_sanitized: true }, record),
    ).toBe(payload);
    expect(chatInputText('chat', { ...chunk, text: 'different' }, record)).toBe(
      'different',
    );
  });
});
