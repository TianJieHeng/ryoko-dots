import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
  contractVersion,
  eventSchema,
  sameScope,
  scopeSchema,
  type RuntimeHistory,
} from '../../shared/runtime/contracts';
import { api } from '../api';
import {
  applyRuntimeEvent,
  projectionFromHistory,
  type RuntimeProjection,
} from './projection';
import type { RuntimeConnection } from './use-runtime';
const batchSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  conversationId: z.string().min(1),
  events: z.array(eventSchema).max(100),
});
export function useLiveHistory(
  conversationId: string,
  connection: RuntimeConnection,
  history: RuntimeHistory | undefined,
  reload: () => Promise<void>,
) {
  const projection = useRef<RuntimeProjection | undefined>(undefined);
  const refresh = useRef(reload);
  refresh.current = reload;
  const [error, setError] = useState('');
  useEffect(() => {
    projection.current = history ? projectionFromHistory(history) : undefined;
  }, [history]);
  const scope = connection.setup?.scope;
  const key = JSON.stringify([conversationId, scope]);
  const ready = connection.available('commands');
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    setError('');
    const poll = async () => {
      try {
        const current = projection.current;
        if (ready && current && !document.hidden) {
          const batch = batchSchema.parse(
            await api<unknown>(
              `/runtime/conversations/${encodeURIComponent(conversationId)}/events${current.runtimeCursor ? `?cursor=${encodeURIComponent(current.runtimeCursor)}` : ''}`,
              'GET',
              undefined,
              controller.signal,
            ),
          );
          if (!active) return;
          if (
            !sameScope(scope ?? null, batch.scope) ||
            batch.conversationId !== conversationId
          )
            throw new Error('Live events do not match this conversation.');
          let next = current;
          for (const event of batch.events)
            next = applyRuntimeEvent(next, event);
          projection.current = next;
          if (next.needsHistoryRefresh || next.snapshotRequired)
            await refresh.current();
          if (active) setError('');
        }
      } catch {
        if (active && !controller.signal.aborted)
          setError(
            'Live connection interrupted. Accepted work continues; reconnect reads its saved state.',
          );
      } finally {
        if (active) timer = setTimeout(() => void poll(), 2500);
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, ready, conversationId]);
  return error;
}
