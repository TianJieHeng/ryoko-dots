import type { z } from 'zod';
import {
  sameScope,
  type eventSchema,
  type RuntimeConversation,
  type RuntimeHistory,
  type TranscriptMessage,
} from '../../shared/runtime/contracts';

export type RuntimeEvent = z.infer<typeof eventSchema>;

/** A read-only client projection, never a source of runtime authority. */
export type RuntimeProjection = Readonly<RuntimeHistory> & {
  readonly snapshotRequired: boolean;
  readonly needsHistoryRefresh: boolean;
};

/** Seed/reset only from a validated, current-scope canonical history response. */
export function projectionFromHistory(
  history: RuntimeHistory,
): RuntimeProjection {
  return {
    ...history,
    messages: mergeMessages([], history.messages),
    snapshotRequired: false,
    needsHistoryRefresh: false,
  };
}

/** Preserve canonical insertion order and accept only strictly newer revisions. */
function mergeRevisions<T extends { id: string; revision: number }>(
  previous: readonly T[],
  next: readonly T[],
): T[] {
  const merged = new Map<string, T>();
  for (const item of [...previous, ...next]) {
    const current = merged.get(item.id);
    if (!current || item.revision > current.revision) merged.set(item.id, item);
  }
  return [...merged.values()];
}

/** Callers must validate page scope before combining conversation pages. */
export function mergeConversations(
  previous: readonly RuntimeConversation[],
  next: readonly RuntimeConversation[],
): RuntimeConversation[] {
  return mergeRevisions(previous, next);
}

/** Callers must validate scope, conversation and lineage before merging pages. */
export function mergeMessages(
  previous: readonly TranscriptMessage[],
  next: readonly TranscriptMessage[],
): TranscriptMessage[] {
  return mergeRevisions(previous, next);
}

/**
 * Events invalidate canonical data; they never synthesize transcript messages.
 * A changed generation needs a new setup/history, not an implicit scope switch.
 * On gaps, retain the last contiguous cursor and fence until a fresh snapshot.
 * nextCursor is history pagination only and is never updated from live events.
 */
export function applyRuntimeEvent(
  state: RuntimeProjection,
  event: RuntimeEvent,
): RuntimeProjection {
  if (
    state.snapshotRequired ||
    !sameScope(state.scope, event.scope) ||
    state.conversationId !== event.conversationId ||
    event.sequence <= state.sessionSequence
  ) {
    return state;
  }

  if (
    event.kind === 'snapshot_required' ||
    event.sequence !== state.sessionSequence + 1
  ) {
    return { ...state, snapshotRequired: true, needsHistoryRefresh: true };
  }

  return {
    ...state,
    sessionSequence: event.sequence,
    runtimeCursor: event.cursor,
    needsHistoryRefresh:
      state.needsHistoryRefresh || event.kind === 'history_changed',
  };
}
