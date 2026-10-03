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

// Keep original source chunks out of the wire DTO and release them with the
// projected message. Source offsets cannot be recovered from sanitized text.
const sourceChunks = new WeakMap<
  TranscriptMessage,
  readonly TranscriptMessage[]
>();
const chunksOf = (message: TranscriptMessage) =>
  sourceChunks.get(message) ?? [message];

function identicalChunk(a: TranscriptMessage, b: TranscriptMessage): boolean {
  return (
    a.role === b.role &&
    a.internal === b.internal &&
    a.committed === b.committed &&
    a.chunk?.nextOffset === b.chunk?.nextOffset &&
    a.chunk?.complete === b.chunk?.complete &&
    a.chunk?.sanitized === b.chunk?.sanitized &&
    a.chunk?.nonTextOmitted === b.chunk?.nonTextOmitted &&
    a.chunk?.physicalSessionId === b.chunk?.physicalSessionId &&
    JSON.stringify(a.parts) === JSON.stringify(b.parts)
  );
}

function projectChunks(
  chunks: readonly TranscriptMessage[],
): TranscriptMessage {
  const byOffset = new Map<number, TranscriptMessage>();
  for (const message of chunks) {
    if (!message.chunk || message.parts.some((part) => part.kind !== 'text'))
      throw new Error('History chunk contains unsupported message content.');
    const existing = byOffset.get(message.chunk.offset);
    if (existing && !identicalChunk(existing, message))
      throw new Error(
        'History has conflicting chunks at the same source offset.',
      );
    byOffset.set(message.chunk.offset, message);
  }
  const ordered = [...byOffset.values()].sort(
    (a, b) => a.chunk!.offset - b.chunk!.offset,
  );
  const first = ordered[0];
  const last = ordered.at(-1)!;
  if (first.chunk!.offset !== 0)
    throw new Error('History message is missing its first text chunk.');
  for (let index = 0; index < ordered.length; index++) {
    const current = ordered[index];
    const preceding = ordered[index - 1];
    if (
      current.role !== first.role ||
      current.internal !== first.internal ||
      current.committed !== first.committed ||
      current.chunk!.physicalSessionId !== first.chunk!.physicalSessionId
    )
      throw new Error('History chunks have conflicting message identity.');
    if (
      preceding &&
      (preceding.chunk!.complete ||
        (preceding.chunk!.nextOffset !== undefined &&
          preceding.chunk!.nextOffset !== current.chunk!.offset))
    )
      throw new Error(
        'History text chunks overlap or have a source offset gap.',
      );
  }
  const message: TranscriptMessage = {
    ...first,
    parts: [
      {
        kind: 'text',
        text: ordered
          .flatMap((item) => item.parts)
          .map((part) => (part.kind === 'text' ? part.text : ''))
          .join(''),
      },
    ],
    chunk: {
      ...first.chunk!,
      ...(last.chunk!.nextOffset === undefined
        ? { nextOffset: undefined }
        : { nextOffset: last.chunk!.nextOffset }),
      complete: last.chunk!.complete,
      sanitized: ordered.some((item) => item.chunk!.sanitized),
      nonTextOmitted: ordered.some((item) => item.chunk!.nonTextOmitted),
    },
  };
  sourceChunks.set(message, ordered);
  return message;
}

/** Append oldest-first pages without changing stable message insertion order. */
export function mergeMessages(
  previous: readonly TranscriptMessage[],
  next: readonly TranscriptMessage[],
): TranscriptMessage[] {
  const groups = new Map<string, TranscriptMessage[]>();
  for (const item of [...previous, ...next]) {
    const group = groups.get(item.id);
    if (!group || item.revision > group[0].revision) {
      groups.set(item.id, [...chunksOf(item)]);
    } else if (item.revision === group[0].revision) {
      if (!!item.chunk !== !!group[0].chunk)
        throw new Error(
          'History mixes chunked and unchunked message revisions.',
        );
      if (item.chunk) group.push(...chunksOf(item));
    }
  }
  return [...groups.values()].map((group) =>
    group[0].chunk ? projectChunks(group) : group[0],
  );
}

// Many full 256 KiB producer pages fit; empty-message streams also have
// an explicit object bound. Stop rather than silently evicting transcript text.
export const historyByteLimit = 8 * 1024 * 1024;
export const historyChunkLimit = 20_000;
export const historyLimitNotice =
  'Browser history limit reached (8 MiB or 20,000 message chunks). Only the loaded portion is shown. Reload history to start again.';
export class HistoryLimitError extends Error {
  constructor() {
    super(historyLimitNotice);
  }
}

/** Scope and lineage are mandatory before joining independent server pages. */
export function mergeHistoryPage(
  previous: RuntimeHistory | undefined,
  page: RuntimeHistory,
): RuntimeHistory {
  if (
    previous &&
    (!sameScope(previous.scope, page.scope) ||
      previous.conversationId !== page.conversationId ||
      previous.lineageId !== page.lineageId)
  )
    throw new Error('History page belongs to another conversation or lineage.');
  const messages = mergeMessages(previous?.messages ?? [], page.messages);
  const encoder = new TextEncoder();
  let bytes = 0;
  let count = 0;
  for (const message of messages) {
    for (const source of chunksOf(message)) {
      count++;
      bytes += encoder.encode(JSON.stringify(source)).byteLength;
      if (bytes > historyByteLimit || count > historyChunkLimit)
        throw new HistoryLimitError();
    }
  }
  return {
    ...page,
    // Journal watermark belongs to the start of this traversal, not a later
    // transcript page. Otherwise events concurrent with pagination disappear.
    sessionSequence: previous?.sessionSequence ?? page.sessionSequence,
    runtimeCursor: previous ? previous.runtimeCursor : page.runtimeCursor,
    messages,
    truncated: !!previous?.truncated || page.truncated,
    interruption: page.interruption ?? previous?.interruption ?? null,
  };
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
