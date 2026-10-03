import { useCallback, useEffect, useRef, useState } from 'react';
import {
  conversationListSchema,
  sameScope,
  type RuntimeConversation,
} from '../../shared/runtime/contracts';
import { api } from '../api';
import { mergeConversations } from './projection';
import { legacyConversation } from './conversations';
import type { RuntimeConnection } from './use-runtime';
export function useConversations(dotId: string, connection: RuntimeConnection) {
  const scope = connection.setup?.scope;
  const key = JSON.stringify([dotId, scope]);
  const ready = connection.available('conversations');
  const [value, setValue] = useState<{
    key: string;
    rows: RuntimeConversation[];
    cursor: string | null;
    error: string;
  }>({ key, rows: [], cursor: null, error: '' });
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  const cursors = useRef(new Set<string>());
  const load = useCallback(
    async (cursor?: string) => {
      if (!ready || !scope || pending.current) return;
      const current = generation.current;
      pending.current = true;
      setBusy(true);
      try {
        const next = conversationListSchema.parse(
          await api<unknown>(
            `/runtime/conversations?dotId=${encodeURIComponent(dotId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
          ),
        );
        if (generation.current !== current) return;
        if (
          !sameScope(scope, next.scope) ||
          next.conversations.some((row) => row.dotId !== dotId)
        )
          throw new Error(
            'Conversation list does not match the selected binding.',
          );
        if (
          next.nextCursor &&
          (next.nextCursor === cursor || cursors.current.has(next.nextCursor))
        )
          throw new Error('Conversation pagination did not advance.');
        if (cursor) cursors.current.add(cursor);
        else cursors.current.clear();
        setValue((previous) => ({
          key,
          rows:
            cursor && previous.key === key
              ? mergeConversations(previous.rows, next.conversations)
              : next.conversations,
          cursor: next.nextCursor,
          error: '',
        }));
      } catch (cause) {
        if (generation.current === current)
          setValue((previous) => ({
            ...previous,
            key,
            error:
              cause instanceof Error ? cause.message : 'History unavailable.',
          }));
      } finally {
        if (generation.current === current) {
          pending.current = false;
          setBusy(false);
        }
      }
    },
    [key, ready, dotId],
  );
  useEffect(() => {
    generation.current++;
    pending.current = false;
    cursors.current.clear();
    setValue({ key, rows: [], cursor: null, error: '' });
    void load();
    return () => {
      generation.current++;
      pending.current = false;
    };
  }, [key, ready, load]);
  const current =
    value.key === key && ready
      ? value
      : { key, rows: [], cursor: null, error: '' };
  return {
    rows: current.rows,
    conversations: scope
      ? current.rows.map((row) => legacyConversation(row, scope))
      : [],
    error: current.error,
    busy,
    hasMore: !!current.cursor,
    loadMore: () => void load(current.cursor ?? undefined),
    reload: () => load(),
  };
}
