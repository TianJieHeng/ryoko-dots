import {
  historySchema,
  sameScope,
  type RuntimeHistory,
  type RuntimeScope,
} from '../../shared/runtime/contracts';
import { HistoryLimitError, mergeHistoryPage } from './projection';

export const historyPageLimit = 128;
export class HistoryTraversalError extends Error {
  constructor(
    message: string,
    readonly partial: RuntimeHistory | undefined,
    readonly limitReached = false,
  ) {
    super(message);
  }
}
/** Traverse oldest-first to the real tail, pinning the first journal watermark. */
export async function readHistoryTail(
  scope: RuntimeScope,
  conversationId: string,
  read: (cursor?: string) => Promise<unknown>,
  previous?: RuntimeHistory,
): Promise<RuntimeHistory> {
  let history = previous;
  let cursor = previous?.nextCursor ?? undefined;
  const seen = new Set<string>();
  try {
    for (let pages = 0; pages < historyPageLimit; pages++) {
      if (cursor) seen.add(cursor);
      const page = historySchema.parse(await read(cursor));
      if (
        !sameScope(scope, page.scope) ||
        page.conversationId !== conversationId
      )
        throw new Error('History belongs to another conversation or binding.');
      if (page.nextCursor && seen.has(page.nextCursor))
        throw new Error('History cursor did not advance.');
      history = mergeHistoryPage(history, page);
      if (!page.nextCursor) return history;
      cursor = page.nextCursor;
    }
    throw new HistoryTraversalError(
      'History page limit reached (128 pages). Only the loaded portion is shown; load more to continue.',
      history,
      false,
    );
  } catch (cause) {
    if (cause instanceof HistoryTraversalError) throw cause;
    throw new HistoryTraversalError(
      cause instanceof Error
        ? cause.message
        : 'Conversation history unavailable.',
      history,
      cause instanceof HistoryLimitError,
    );
  }
}
/** Retain loaded text during refresh, then reconcile stable IDs at the fresh tail. */
export function reconcileHistory(
  previous: RuntimeHistory | undefined,
  fresh: RuntimeHistory,
): RuntimeHistory {
  const merged = mergeHistoryPage(previous, fresh);
  return {
    ...merged,
    sessionSequence: fresh.sessionSequence,
    runtimeCursor: fresh.runtimeCursor,
  };
}
