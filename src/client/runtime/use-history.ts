import { useCallback, useEffect, useRef, useState } from 'react';
import {
  historySchema,
  sameScope,
  type RuntimeHistory,
} from '../../shared/runtime/contracts';
import { api } from '../api';
import { mergeMessages } from './projection';
import type { RuntimeConnection } from './use-runtime';
export function useHistory(
  conversationId: string,
  connection: RuntimeConnection,
) {
  const scope = connection.setup?.scope;
  const key = JSON.stringify([conversationId, scope]);
  const ready = connection.available('conversations');
  const [value, setValue] = useState<{
    key: string;
    history?: RuntimeHistory;
    error: string;
  }>({ key, error: '' });
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const load = useCallback(
    async (cursor?: string) => {
      if (!scope || !ready || busy.current) return;
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
        setValue((previous) => ({
          key,
          history:
            cursor && previous.key === key && previous.history
              ? {
                  ...parsed,
                  messages: mergeMessages(
                    parsed.messages,
                    previous.history.messages,
                  ),
                }
              : parsed,
          error: '',
        }));
      } catch (cause) {
        if (generation.current === current)
          setValue((previous) => ({
            ...previous,
            key,
            error:
              cause instanceof Error
                ? cause.message
                : 'Conversation history unavailable.',
          }));
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
    setValue({ key, error: '' });
    void load();
    return () => {
      generation.current++;
      busy.current = false;
    };
  }, [key, ready, load]);
  const current = value.key === key && ready ? value : { key, error: '' };
  return {
    ...current,
    loading,
    reload: () => load(),
    loadOlder: () => load(current.history?.nextCursor ?? undefined),
  };
}
