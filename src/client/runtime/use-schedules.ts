import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { api, getAuthenticationGeneration } from '../api';
import { sameScope, type RuntimeScope } from '../../shared/runtime/contracts';
import type { RuntimeConnection } from './use-runtime';
import { schedulePath } from './schedule-actions';

export function checkScheduleBinding(
  value: { scope: RuntimeScope; conversationId: string },
  scope: RuntimeScope,
  conversationId: string,
) {
  // A server-verified default Space project may be resolved after general setup.
  // All other authority fields and the explicit conversation must still match.
  if (
    !value.scope.project ||
    value.conversationId !== conversationId ||
    !sameScope(
      scope.project === null
        ? { ...scope, project: value.scope.project }
        : scope,
      value.scope,
    )
  )
    throw new Error(
      'Schedule evidence belongs to another authenticated conversation or authority.',
    );
}
export function useSchedulesResource<
  T extends { scope: RuntimeScope; conversationId: string },
>(
  conversationId: string,
  suffix: string,
  schema: z.ZodType<T>,
  connection: RuntimeConnection,
) {
  const scope = connection.setup?.scope;
  const key = JSON.stringify([conversationId, suffix, scope]);
  const ready =
    !!conversationId && !!scope && connection.available('schedules');
  const [value, setValue] = useState<{
    key: string;
    data?: T;
    observedAt: number;
    error: string;
  }>({ key, observedAt: 0, error: '' });
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const abort = useRef<AbortController | undefined>(undefined);
  const reload = useCallback(async () => {
    if (!ready || !scope || busy.current) return;
    const current = generation.current;
    const auth = getAuthenticationGeneration();
    busy.current = true;
    setLoading(true);
    const controller = new AbortController();
    abort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const data = schema.parse(
        await api<unknown>(
          `${schedulePath(conversationId)}${suffix}`,
          'GET',
          undefined,
          controller.signal,
        ),
      );
      if (
        generation.current !== current ||
        auth !== getAuthenticationGeneration()
      )
        return;
      checkScheduleBinding(data, scope, conversationId);
      setValue({ key, data, observedAt: Date.now(), error: '' });
    } catch (cause) {
      if (generation.current === current)
        setValue({
          key,
          observedAt: 0,
          error:
            cause instanceof Error
              ? cause.message
              : 'Schedule evidence unavailable.',
        });
    } finally {
      clearTimeout(timeout);
      if (generation.current === current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, [key, ready, conversationId, suffix]);
  useEffect(() => {
    generation.current++;
    busy.current = false;
    setValue({ key, observedAt: 0, error: '' });
    void reload();
    const timer = setInterval(() => {
      if (!document.hidden) void reload();
    }, 5000);
    return () => {
      generation.current++;
      busy.current = false;
      abort.current?.abort();
      clearInterval(timer);
    };
  }, [key, ready, reload]);
  return {
    ...(value.key === key && ready ? value : { key, observedAt: 0, error: '' }),
    loading,
    reload,
  };
}
