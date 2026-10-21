import type { CommandRecord } from './command-ledger.js';

type Chunk = {
  role: string;
  command_id: string | null;
  text: string;
  text_offset: number;
  next_text_offset: number;
  text_sanitized: boolean;
};

/** Hide only context appended by our own ingress, proven against the exact
 * committed source chunk. Never strip marker-looking text typed by the user.
 * Original byte offsets/cursors and the model's input remain unchanged. */
export function chatInputText(
  conversationId: string,
  message: Chunk,
  record?: CommandRecord,
): string {
  if (
    message.role !== 'user' ||
    message.text_sanitized ||
    !record ||
    record.conversationId !== conversationId ||
    record.operationId !== message.command_id
  )
    return message.text;
  try {
    const intent = JSON.parse(record.intent);
    const payload = JSON.parse(record.payload);
    if (
      intent.operation !== 'submit' ||
      typeof intent.text !== 'string' ||
      typeof payload.text !== 'string' ||
      !payload.text.startsWith(intent.text)
    )
      return message.text;
    const bytes = Buffer.from(payload.text);
    if (
      bytes
        .subarray(message.text_offset, message.next_text_offset)
        .toString('utf8') !== message.text
    )
      return message.text;
    const end = Math.min(
      message.next_text_offset,
      Buffer.byteLength(intent.text),
    );
    return end <= message.text_offset
      ? ''
      : bytes.subarray(message.text_offset, end).toString('utf8');
  } catch {
    return message.text;
  }
}
