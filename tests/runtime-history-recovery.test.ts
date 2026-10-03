import { describe, expect, it, vi } from 'vitest';
import {
  contractVersion,
  type RuntimeHistory,
  type TranscriptMessage,
} from '../src/shared/runtime/contracts';
import {
  historyPageLimit,
  HistoryTraversalError,
  readHistoryTail,
  reconcileHistory,
} from '../src/client/runtime/history-loader';
import {
  applyRuntimeEvent,
  mergeHistoryPage,
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
  conversationId: 'chat',
  lineageId: 'lineage',
  messages: [],
  nextCursor: null,
  sessionSequence: 5,
  runtimeCursor: 'event-5',
  truncated: false,
  interruption: null,
};
const message = (
  id: string,
  text: string,
  revision = 1,
): TranscriptMessage => ({
  id,
  revision,
  role: 'assistant',
  internal: false,
  committed: true,
  parts: [{ kind: 'text', text }],
});
const chunk = (
  text: string,
  offset: number,
  nextOffset: number,
  complete = false,
): TranscriptMessage => ({
  ...message('chunked', text),
  chunk: {
    offset,
    nextOffset,
    complete,
    sanitized: false,
    nonTextOmitted: false,
    physicalSessionId: 'physical',
  },
});

describe('full-tail canonical history recovery', () => {
  it('reaches latest output across oldest-first UTF-8 pages and pins first journal watermark', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        ...history,
        messages: [chunk('🙂', 0, 4)],
        nextCursor: 'page2',
      })
      .mockResolvedValueOnce({
        ...history,
        sessionSequence: 8,
        runtimeCursor: 'event-8',
        messages: [chunk('終', 4, 7, true)],
        nextCursor: 'page3',
      })
      .mockResolvedValueOnce({
        ...history,
        sessionSequence: 10,
        runtimeCursor: 'event-10',
        messages: [message('latest', 'Canonical final output')],
      });
    const result = await readHistoryTail(history.scope, 'chat', read);
    expect(read.mock.calls).toEqual([[undefined], ['page2'], ['page3']]);
    expect(result.messages.map((row) => row.id)).toEqual(['chunked', 'latest']);
    expect(result.messages[0].parts).toEqual([{ kind: 'text', text: '🙂終' }]);
    expect(result).toMatchObject({
      sessionSequence: 5,
      runtimeCursor: 'event-5',
      nextCursor: null,
    });
    const invalidated = applyRuntimeEvent(projectionFromHistory(result), {
      version: contractVersion,
      scope: history.scope,
      conversationId: 'chat',
      sequence: 6,
      cursor: 'event-6',
      kind: 'history_changed',
    });
    expect(invalidated.needsHistoryRefresh).toBe(true);
  });
  it('preserves loaded history throughout refresh and reconciles newer canonical finals by stable ID', async () => {
    const previous = {
      ...history,
      messages: [
        message('older-loaded', 'retained'),
        message('answer', 'partial producer output', 1),
      ],
    };
    let finish!: (value: RuntimeHistory) => void;
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        ...history,
        sessionSequence: 9,
        runtimeCursor: 'event-9',
        messages: [message('answer', 'canonical final', 2)],
        nextCursor: 'tail',
      })
      .mockImplementationOnce(
        () =>
          new Promise<RuntimeHistory>((resolve) => {
            finish = resolve;
          }),
      );
    const refreshing = readHistoryTail(history.scope, 'chat', read);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(previous.messages).toHaveLength(2);
    expect(previous.messages[1].parts).toEqual([
      { kind: 'text', text: 'partial producer output' },
    ]);
    finish({
      ...history,
      sessionSequence: 11,
      runtimeCursor: 'event-11',
      messages: [message('new-tail', 'latest')],
    });
    const result = reconcileHistory(previous, await refreshing);
    expect(result.messages.map((row) => row.id)).toEqual([
      'older-loaded',
      'answer',
      'new-tail',
    ]);
    expect(result.messages[1].parts).toEqual([
      { kind: 'text', text: 'canonical final' },
    ]);
    expect(result).toMatchObject({
      sessionSequence: 9,
      runtimeCursor: 'event-9',
    });
  });
  it('keeps the first watermark across manual continuation, independently of transcript revisions', () => {
    const first = {
      ...history,
      messages: [message('row', 'older', 200)],
      runtimeCursor: null,
      sessionSequence: 0,
    };
    const merged = mergeHistoryPage(first, {
      ...history,
      sessionSequence: 70,
      runtimeCursor: 'event-70',
      messages: [message('tail', 'new', 201)],
    });
    expect(merged.sessionSequence).toBe(0);
    expect(merged.runtimeCursor).toBeNull();
    expect(merged.messages[1].revision).toBe(201);
  });
  it('detects cyclic cursors rather than silently appending or looping', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ ...history, nextCursor: 'a' })
      .mockResolvedValueOnce({ ...history, nextCursor: 'b' })
      .mockResolvedValueOnce({ ...history, nextCursor: 'a' });
    await expect(readHistoryTail(history.scope, 'chat', read)).rejects.toThrow(
      'cursor did not advance',
    );
    expect(read).toHaveBeenCalledTimes(3);
  });
  it('returns only validated partial pages on failure and never mutates the previous snapshot', async () => {
    const previous = { ...history, messages: [message('old', 'retained')] };
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        ...history,
        messages: [message('first', 'loaded')],
        nextCursor: 'next',
      })
      .mockRejectedValueOnce(new Error('Disconnected'));
    try {
      await readHistoryTail(history.scope, 'chat', read);
      throw new Error('Expected failure');
    } catch (cause) {
      expect(cause).toBeInstanceOf(HistoryTraversalError);
      expect((cause as HistoryTraversalError).partial?.messages[0].id).toBe(
        'first',
      );
      expect(previous.messages).toEqual([message('old', 'retained')]);
    }
  });
  it('caps a traversal and makes the unloaded tail explicit', async () => {
    let index = 0;
    const read = vi.fn(async () => ({
      ...history,
      messages: [message(String(index), 'bounded')],
      nextCursor: `next-${++index}`,
    }));
    await expect(
      readHistoryTail(history.scope, 'chat', read),
    ).rejects.toMatchObject({
      limitReached: false,
      partial: { nextCursor: `next-${historyPageLimit}` },
    });
    expect(read).toHaveBeenCalledTimes(historyPageLimit);
  });
  it('rejects a foreign scope or lineage before adopting its continuation', async () => {
    for (const change of [
      { scope: { ...history.scope, generation: 2 } },
      { lineageId: 'foreign' },
      { conversationId: 'other' },
    ]) {
      const read = vi
        .fn()
        .mockResolvedValueOnce({ ...history, nextCursor: 'next' })
        .mockResolvedValueOnce({ ...history, ...change });
      await expect(
        readHistoryTail(history.scope, 'chat', read),
      ).rejects.toThrow(/another conversation|another conversation or lineage/);
    }
  });
});
