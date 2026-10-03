import { useCallback, useEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import {
  sameScope,
  type Feature,
  type RuntimeScope,
} from '../../shared/runtime/contracts';
import { api } from '../api';
import type { RuntimeConnection } from './use-runtime';
export function useResource<T extends { scope: RuntimeScope }>(
  path: string,
  schema: z.ZodType<T>,
  connection: RuntimeConnection,
  feature: Feature,
) {
  const scope = connection.setup?.scope;
  const key = JSON.stringify([path, scope]);
  const ready = connection.available(feature);
  const [value, setValue] = useState<{ key: string; data?: T; error: string }>({
    key,
    error: '',
  });
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const reload = useCallback(async () => {
    if (!ready || !scope || busy.current) return;
    const current = generation.current;
    busy.current = true;
    setLoading(true);
    try {
      const data = schema.parse(await api<unknown>(path));
      if (generation.current !== current) return;
      if (!sameScope(scope, data.scope))
        throw new Error(
          'Response belongs to a different authenticated binding.',
        );
      setValue({ key, data, error: '' });
    } catch (cause) {
      if (generation.current === current)
        setValue((previous) => ({
          ...previous,
          key,
          error:
            cause instanceof Error
              ? cause.message
              : 'Runtime read unavailable.',
        }));
    } finally {
      if (generation.current === current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, [key, ready, path]);
  useEffect(() => {
    generation.current++;
    busy.current = false;
    setValue({ key, error: '' });
    void reload();
    const timer = setInterval(() => {
      if (!document.hidden) void reload();
    }, 5000);
    return () => {
      generation.current++;
      busy.current = false;
      clearInterval(timer);
    };
  }, [key, ready, reload]);
  return {
    ...(value.key === key && ready ? value : { key, error: '' }),
    loading,
    reload,
  };
}
