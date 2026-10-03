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
  blocked = false,
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
  const ready = connection.available('conversations') && !blocked;
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    let failures = 0;
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
          if (active) {
            failures = 0;
            setError('');
          }
        }
      } catch {
        failures++;
        if (active && !controller.signal.aborted)
          setError(
            failures >= 3
              ? 'Live updates paused after repeated failures. Refresh saved state to try again; accepted work is not cancelled.'
              : 'Live connection interrupted. Accepted work continues; saved-state reads never resend it.',
          );
      } finally {
        if (active && failures < 3)
          timer = setTimeout(
            () => void poll(),
            Math.min(2500 * 2 ** failures, 10000),
          );
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, ready, conversationId, connection.setup]);
  return error;
}
