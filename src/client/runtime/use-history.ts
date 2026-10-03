import { useCallback, useEffect, useRef, useState } from 'react';
import {
  historySchema,
  sameScope,
  type RuntimeHistory,
} from '../../shared/runtime/contracts';
import { api } from '../api';
import { HistoryLimitError, mergeHistoryPage } from './projection';
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
  const busy = useRef(false);
  const load = useCallback(
    async (cursor?: string) => {
      if (!scope || !ready || busy.current) return;
      const previous = currentValue.current;
      if (
        cursor &&
        (previous.key !== key ||
          previous.limitReached ||
          previous.history?.nextCursor !== cursor)
      )
        return;
      const current = generation.current;
      busy.current = true;
      setLoading(true);
      try {
        const parsed = historySchema.parse(
          await api(
            `/runtime/conversations/${encodeURIComponent(conversationId)}/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
          ),
        );
        if (generation.current !== current) return;
        if (
          !sameScope(scope, parsed.scope) ||
          parsed.conversationId !== conversationId
        )
          throw new Error(
            'History belongs to another conversation or binding.',
          );
        if (cursor && parsed.nextCursor === cursor)
          throw new Error('History cursor did not advance.');
        // Validate and merge before setting React state so conflicting pages
        // are caught here and leave the last good history/cursor untouched.
        const history = mergeHistoryPage(
          cursor ? previous.history : undefined,
          parsed,
        );
        const next = { key, history, error: '', limitReached: false };
        currentValue.current = next;
        setValue(next);
      } catch (cause) {
        if (generation.current === current) {
          const next = {
            ...(previous.key === key ? previous : { key }),
            key,
            error:
              cause instanceof Error
                ? cause.message
                : 'Conversation history unavailable.',
            limitReached: cause instanceof HistoryLimitError,
          };
          currentValue.current = next;
          setValue(next);
        }
      } finally {
        if (generation.current === current) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [key, ready, conversationId],
  );
  useEffect(() => {
    generation.current++;
    busy.current = false;
    const next = { key, error: '', limitReached: false };
    currentValue.current = next;
    setValue(next);
    setLoading(false);
    void load();
    return () => {
      generation.current++;
      busy.current = false;
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
    loadMore: () => {
      const cursor = current.history?.nextCursor;
      return cursor && !current.limitReached ? load(cursor) : Promise.resolve();
    },
  };
}
