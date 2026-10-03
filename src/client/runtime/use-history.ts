import { useCallback, useEffect, useRef, useState } from 'react';
import type { RuntimeHistory } from '../../shared/runtime/contracts';
import { api } from '../api';
import { HistoryLimitError } from './projection';
import {
  HistoryTraversalError,
  readHistoryTail,
  reconcileHistory,
} from './history-loader';
import type { RuntimeConnection } from './use-runtime';

type HistoryState = {
  key: string;
  history?: RuntimeHistory;
  error: string;
  limitReached: boolean;
};
export function useHistory(
  conversationId: string,
  connection: RuntimeConnection,
) {
  const scope = connection.setup?.scope;
  const key = JSON.stringify([conversationId, scope]);
  const ready = connection.available('conversations');
  const [value, setValue] = useState<HistoryState>({
    key,
    error: '',
    limitReached: false,
  });
  const currentValue = useRef(value);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef<Promise<void> | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  const load = useCallback(
    (more = false): Promise<void> => {
      if (!scope || !ready) return Promise.resolve();
      if (inFlight.current) return inFlight.current;
      const previous =
        currentValue.current.key === key
          ? currentValue.current
          : { key, error: '', limitReached: false };
      if (more && !previous.history?.nextCursor) return Promise.resolve();
      const current = generation.current;
      const abort = new AbortController();
      controller.current = abort;
      setLoading(true);
      const task = (async () => {
        try {
          const fresh = await readHistoryTail(
            scope,
            conversationId,
            (cursor) =>
              api(
                `/runtime/conversations/${encodeURIComponent(conversationId)}/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
                'GET',
                undefined,
                abort.signal,
              ),
            more ? previous.history : undefined,
          );
          if (generation.current !== current) return;
          const next = {
            key,
            history: reconcileHistory(previous.history, fresh),
            error: '',
            limitReached: false,
          };
          currentValue.current = next;
          setValue(next);
        } catch (cause) {
          if (generation.current !== current || abort.signal.aborted) return;
          // Keep the old loaded transcript intact on refresh failure. On initial
          // traversal expose only validated contiguous pages, with a visible error.
          const partial =
            cause instanceof HistoryTraversalError ? cause.partial : undefined;
          const next = {
            ...previous,
            history: more && partial ? partial : (previous.history ?? partial),
            error:
              cause instanceof Error
                ? cause.message
                : 'Conversation history unavailable.',
            limitReached:
              cause instanceof HistoryLimitError ||
              (cause instanceof HistoryTraversalError && cause.limitReached),
          };
          currentValue.current = next;
          setValue(next);
        } finally {
          if (generation.current === current) {
            inFlight.current = undefined;
            setLoading(false);
          }
        }
      })();
      inFlight.current = task;
      return task;
    },
    [key, ready, conversationId],
  );
  useEffect(() => {
    generation.current++;
    controller.current?.abort();
    inFlight.current = undefined;
    const next = { key, error: '', limitReached: false };
    currentValue.current = next;
    setValue(next);
    setLoading(false);
    void load();
    return () => {
      generation.current++;
      controller.current?.abort();
      inFlight.current = undefined;
    };
  }, [key, ready, load]);
  const current =
    value.key === key && ready
      ? value
      : { key, error: '', limitReached: false };
  return {
    ...current,
    loading,
    reload: () => load(),
    loadMore: () => load(true),
  };
}
