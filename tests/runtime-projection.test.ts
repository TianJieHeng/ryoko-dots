import { describe, expect, it } from 'vitest';
import {
  contractVersion,
  type RuntimeConversation,
  type RuntimeHistory,
  type TranscriptMessage,
} from '../src/shared/runtime/contracts';
import {
  applyRuntimeEvent,
  mergeConversations,
  mergeMessages,
  projectionFromHistory,
  type RuntimeEvent,
} from '../src/client/runtime/projection';

const history: RuntimeHistory = {
  version: contractVersion,
  scope: {
    owner: 'owner',
    gateway: 'gateway',
    agent: 'agent',
    project: null,
    generation: 3,
  },
  conversationId: 'conversation',
  lineageId: 'lineage',
  messages: [],
  nextCursor: 'history-page-2',
  sessionSequence: 5,
  runtimeCursor: 'live-5',
  truncated: false,
  interruption: null,
};

const event = (overrides: Partial<RuntimeEvent> = {}): RuntimeEvent => ({
  version: contractVersion,
  scope: history.scope,
  conversationId: history.conversationId,
  sequence: 6,
  cursor: 'live-6',
  kind: 'history_changed',
  ...overrides,
});

const message = (id: string, revision = 1): TranscriptMessage => ({
  id,
  revision,
  role: 'assistant',
  parts: [{ kind: 'text', text: `${id}-${revision}` }],
  internal: false,
  committed: true,
});

const conversation = (id: string, revision = 1): RuntimeConversation => ({
  id,
  revision,
  dotId: 'agent',
  title: `${id}-${revision}`,
  createdAt: 1,
  lineageId: `lineage-${id}`,
  archived: false,
  origin: 'web',
});

describe('canonical runtime projection', () => {
  it('ignores foreign scope, conversation, and both stale/new generations', () => {
    const state = projectionFromHistory(history);
    for (const scope of [
      { ...history.scope, owner: 'foreign' },
      { ...history.scope, gateway: 'foreign' },
      { ...history.scope, agent: 'foreign' },
      { ...history.scope, project: 'foreign' },
      { ...history.scope, generation: 2 },
      { ...history.scope, generation: 4 },
    ]) {
      expect(applyRuntimeEvent(state, event({ scope }))).toBe(state);
    }
    expect(applyRuntimeEvent(state, event({ conversationId: 'foreign' }))).toBe(
      state,
    );
  });

  it('deduplicates messages and accepts strictly higher revisions only', () => {
    const original = message('a', 2);
    const previous = Object.freeze([original, message('b')]);
    const newer = message('b', 3);
    const result = mergeMessages(previous, [
      { ...message('a', 2), parts: [] },
      message('a', 1),
      newer,
      message('b', 2),
    ]);
    expect(result).toEqual([original, newer]);
    expect(result[0]).toBe(original);
    expect(previous[1].revision).toBe(1);
  });

  it('merges overlapping pagination without reordering existing stable IDs', () => {
    expect(
      mergeConversations(
        [conversation('a'), conversation('b', 2)],
        [conversation('b'), conversation('c'), conversation('a', 2)],
      ),
    ).toEqual([conversation('a', 2), conversation('b', 2), conversation('c')]);
    expect(
      mergeMessages([message('a'), message('b')], [message('b'), message('c')]),
    ).toEqual([message('a'), message('b'), message('c')]);
  });

  it('requires a snapshot on a gap and keeps the last contiguous cursor', () => {
    const state = projectionFromHistory(history);
    const gap = applyRuntimeEvent(
      state,
      event({ sequence: 8, cursor: 'live-8' }),
    );
    expect(gap.snapshotRequired).toBe(true);
    expect(gap.needsHistoryRefresh).toBe(true);
    expect(gap.sessionSequence).toBe(5);
    expect(gap.runtimeCursor).toBe('live-5');
    expect(applyRuntimeEvent(gap, event())).toBe(gap);
  });

  it('fences snapshot_required until reset with a canonical history response', () => {
    const state = applyRuntimeEvent(
      projectionFromHistory(history),
      event({ kind: 'snapshot_required' }),
    );
    expect(state.snapshotRequired).toBe(true);
    expect(applyRuntimeEvent(state, event({ sequence: 7 }))).toBe(state);
    const reset = projectionFromHistory({ ...history, sessionSequence: 7 });
    expect(reset.snapshotRequired).toBe(false);
    expect(reset.needsHistoryRefresh).toBe(false);
  });

  it('advances only live cursors and ignores duplicate or older event sequences', () => {
    const state = applyRuntimeEvent(projectionFromHistory(history), event());
    expect(state.sessionSequence).toBe(6);
    expect(state.runtimeCursor).toBe('live-6');
    expect(state.nextCursor).toBe('history-page-2');
    expect(state.needsHistoryRefresh).toBe(true);
    expect(state.messages).toEqual([]);
    expect(applyRuntimeEvent(state, event())).toBe(state);
    expect(applyRuntimeEvent(state, event({ sequence: 4 }))).toBe(state);
    const status = applyRuntimeEvent(
      projectionFromHistory(history),
      event({ kind: 'status_changed' }),
    );
    expect(status.needsHistoryRefresh).toBe(false);
    expect(status.nextCursor).toBe('history-page-2');
  });
});
