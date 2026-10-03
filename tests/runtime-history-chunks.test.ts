import { describe, expect, it } from 'vitest';
import {
  contractVersion,
  conversationListSchema,
  historySchema,
  messageSchema,
  type RuntimeHistory,
  type TranscriptMessage,
} from '../src/shared/runtime/contracts';
import {
  HistoryLimitError,
  historyByteLimit,
  historyChunkLimit,
  mergeHistoryPage,
  mergeMessages,
  projectionFromHistory,
} from '../src/client/runtime/projection';

const history: RuntimeHistory = {
  version: contractVersion,
  scope: {
    owner: 'owner',
    gateway: 'gateway',
    agent: 'agent',
    project: null,
    generation: 1,
  },
  conversationId: 'conversation',
  lineageId: 'lineage',
  messages: [],
  nextCursor: null,
  sessionSequence: 0,
  runtimeCursor: null,
  truncated: false,
  interruption: null,
};
const chunk = (
  id: string,
  text: string,
  offset: number,
  nextOffset: number | undefined,
  complete = false,
  overrides: Partial<NonNullable<TranscriptMessage['chunk']>> = {},
): TranscriptMessage => ({
  id,
  revision: 0,
  role: 'assistant',
  parts: [{ kind: 'text', text }],
  internal: false,
  committed: true,
  chunk: {
    offset,
    ...(nextOffset === undefined ? {} : { nextOffset }),
    complete,
    sanitized: false,
    nonTextOmitted: false,
    physicalSessionId: 'physical-session',
    ...overrides,
  },
});
const textOf = (message: TranscriptMessage) =>
  message.parts
    .filter((part) => part.kind === 'text')
    .map((part) => part.text)
    .join('');

describe('canonical conversation chunk contract', () => {
  it('permits 2048-character pagination cursors without widening IDs or live cursors', () => {
    const cursor = 'x'.repeat(2048);
    expect(
      historySchema.parse({ ...history, nextCursor: cursor }).nextCursor,
    ).toBe(cursor);
    expect(
      conversationListSchema.parse({
        version: contractVersion,
        scope: history.scope,
        conversations: [],
        nextCursor: cursor,
      }).nextCursor,
    ).toBe(cursor);
    expect(
      historySchema.safeParse({ ...history, nextCursor: `${cursor}x` }).success,
    ).toBe(false);
    expect(
      conversationListSchema.safeParse({
        version: contractVersion,
        scope: history.scope,
        conversations: [],
        nextCursor: `${cursor}x`,
      }).success,
    ).toBe(false);
    expect(
      historySchema.safeParse({ ...history, conversationId: cursor }).success,
    ).toBe(false);
    expect(
      historySchema.safeParse({ ...history, runtimeCursor: cursor }).success,
    ).toBe(false);
  });

  it('validates optional source byte offsets and strict chunk metadata', () => {
    const item = chunk('a', '🙂', 0, 4, true);
    expect(messageSchema.parse(item)).toEqual(item);
    expect(
      messageSchema.parse(chunk('a', 'old producer', 0, undefined, true)).chunk
        ?.nextOffset,
    ).toBeUndefined();
    const legacy = { ...item };
    delete legacy.chunk;
    expect(messageSchema.parse(legacy)).toEqual(legacy);
    for (const change of [
      { offset: -1 },
      { offset: 0.5 },
      { offset: Number.MAX_SAFE_INTEGER + 1 },
      { nextOffset: -1 },
      { nextOffset: 0, complete: false },
      { offset: 4, nextOffset: 3 },
      { physicalSessionId: '' },
      { credential: 'forbidden' },
    ]) {
      expect(
        messageSchema.safeParse({
          ...item,
          chunk: { ...item.chunk, ...change },
        }).success,
      ).toBe(false);
    }
    expect(
      messageSchema.parse(chunk('empty', '', 0, 0, true)).chunk?.complete,
    ).toBe(true);
  });
});

describe('oldest-first chunk projection', () => {
  it('joins source-offset chunks without injecting newlines or changing stable message order', () => {
    const first = chunk('a', 'hello ', 0, 6);
    const second = chunk('a', 'world', 6, 11, true);
    let page = mergeHistoryPage(undefined, {
      ...history,
      messages: [first],
      nextCursor: 'page-2',
    });
    page = mergeHistoryPage(page, {
      ...history,
      messages: [second, chunk('b', 'later', 0, 5, true)],
    });
    expect(page.messages.map((item) => item.id)).toEqual(['a', 'b']);
    expect(textOf(page.messages[0])).toBe('hello world');
    expect(page.messages[0].chunk).toMatchObject({
      offset: 0,
      nextOffset: 11,
      complete: true,
    });
    expect(textOf(first)).toBe('hello ');
    expect(page.nextCursor).toBeNull();
    expect(projectionFromHistory(page).messages).toEqual(page.messages);
  });

  it('deduplicates replayed offsets across several pages, including after projection', () => {
    const a = chunk('a', 'one', 0, 3);
    const b = chunk('a', 'two', 3, 6);
    const c = chunk('a', 'three', 6, 11, true);
    let messages = mergeMessages([], [a, a, b]);
    messages = mergeMessages(messages, [b, c, a]);
    messages = mergeMessages(messages, [a, b, c]);
    expect(messages).toHaveLength(1);
    expect(textOf(messages[0])).toBe('onetwothree');
    expect(() =>
      mergeMessages(messages, [
        { ...b, parts: [{ kind: 'text', text: 'changed' }] },
      ]),
    ).toThrow('conflicting chunks');
    expect(textOf(messages[0])).toBe('onetwothree');
  });

  it('uses original UTF-8 offsets rather than sanitized display length', () => {
    const first = chunk('a', '[removed]', 0, 90, false, { sanitized: true });
    const second = chunk('a', '🙂', 90, 94, true, { nonTextOmitted: true });
    const [message] = mergeMessages([], [second, first]);
    expect(textOf(message)).toBe('[removed]🙂');
    expect(message.chunk).toMatchObject({
      nextOffset: 94,
      complete: true,
      sanitized: true,
      nonTextOmitted: true,
    });
  });

  it('supports old producers without inventing source offsets from sanitized text', () => {
    const [message] = mergeMessages(
      [],
      [
        chunk('a', '[redacted]', 0, undefined, false, { sanitized: true }),
        chunk('a', 'end', 100, undefined, true),
      ],
    );
    expect(textOf(message)).toBe('[redacted]end');
    expect(message.chunk?.nextOffset).toBeUndefined();
  });

  it('rejects absent prefixes, source gaps, overlapping ranges and chunks after completion', () => {
    expect(() => mergeMessages([], [chunk('a', 'tail', 3, 7, true)])).toThrow(
      'first text chunk',
    );
    for (const following of [
      chunk('a', 'tail', 2, 6, true),
      chunk('a', 'tail', 4, 8, true),
    ]) {
      expect(() =>
        mergeMessages([chunk('a', 'abc', 0, 3)], [following]),
      ).toThrow('overlap or have a source offset gap');
    }
    expect(() =>
      mergeMessages(
        [chunk('a', 'abc', 0, 3, true)],
        [chunk('a', 'd', 3, 4, true)],
      ),
    ).toThrow('overlap or have a source offset gap');
  });

  it('rejects identity and same-offset metadata changes', () => {
    const first = chunk('a', 'abc', 0, 3);
    for (const change of [
      { complete: true },
      { sanitized: true },
      { nonTextOmitted: true },
      { nextOffset: 4 },
      { physicalSessionId: 'other' },
    ]) {
      expect(() =>
        mergeMessages(
          [first],
          [{ ...first, chunk: { ...first.chunk!, ...change } }],
        ),
      ).toThrow('conflicting chunks');
    }
    expect(() =>
      mergeMessages(
        [first],
        [chunk('a', 'def', 3, 6, true, { physicalSessionId: 'other' })],
      ),
    ).toThrow('conflicting message identity');
    expect(() =>
      mergeMessages(
        [first],
        [{ ...chunk('a', 'def', 3, 6, true), role: 'user' }],
      ),
    ).toThrow('conflicting message identity');
    expect(() =>
      mergeMessages([first], [{ ...first, chunk: undefined }]),
    ).toThrow('mixes chunked and unchunked');
    expect(() =>
      mergeMessages(
        [],
        [
          {
            ...first,
            parts: [
              {
                kind: 'tool',
                id: 'tool',
                name: 'tool',
                summary: '',
                state: 'prepared',
              },
            ],
          },
        ],
      ),
    ).toThrow('unsupported message content');
  });

  it('refuses foreign conversation, scope or lineage before combining pages', () => {
    for (const change of [
      { conversationId: 'other' },
      { lineageId: 'other' },
      { scope: { ...history.scope, generation: 2 } },
    ]) {
      expect(() =>
        mergeHistoryPage(history, { ...history, ...change }),
      ).toThrow('another conversation or lineage');
    }
  });

  it('preserves prior server omission notices after later clean pages', () => {
    const first = {
      ...history,
      truncated: true,
      interruption: 'Part of this transcript is unavailable.',
    };
    expect(mergeHistoryPage(first, history)).toMatchObject({
      truncated: true,
      interruption: first.interruption,
    });
  });

  it('permits many pages but caps accumulated UTF-8 bytes without altering prior history', () => {
    const text = '🙂'.repeat(65536);
    let current = history;
    for (let index = 0; index < 30; index++) {
      current = mergeHistoryPage(current, {
        ...history,
        messages: [chunk(String(index), text, 0, 262144, true)],
        nextCursor: `page-${index + 1}`,
      });
    }
    expect(current.messages).toHaveLength(30);
    expect(historyByteLimit).toBe(8 * 1024 * 1024);
    const previous = current;
    expect(() =>
      mergeHistoryPage(previous, {
        ...history,
        messages: [chunk('overflow', text.repeat(3), 0, 786432, true)],
      }),
    ).toThrow(HistoryLimitError);
    expect(previous.messages).toHaveLength(30);
    expect(previous.nextCursor).toBe('page-30');
    expect(
      mergeHistoryPage(previous, {
        ...history,
        messages: [chunk('0', text, 0, 262144, true)],
      }).messages,
    ).toHaveLength(30);
  });

  it('also bounds empty-message accumulation', () => {
    const messages = Array.from({ length: historyChunkLimit + 1 }, (_, index) =>
      chunk(String(index), '', 0, 0, true),
    );
    expect(() => mergeHistoryPage(undefined, { ...history, messages })).toThrow(
      HistoryLimitError,
    );
  });
});
