import { useCallback, useEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import type { RuntimeScope } from '../../shared/runtime/contracts';
import type { IdentityAction } from '../../shared/runtime/identity';
import { readIdentity } from './identity-client';

/** Keyed owner/conversation/project reads; switching selection clears prior private state immediately. */
export function useIdentityResource<T>(
  scope: RuntimeScope | undefined,
  conversationId: string,
  action: IdentityAction,
  payload: Record<string, unknown>,
  schema: z.ZodType<T>,
  enabled: boolean,
) {
  const key = JSON.stringify([scope, conversationId, action, payload, enabled]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const abort = useRef<AbortController | undefined>(undefined);
  const [state, setState] = useState<{
    key: string;
    data?: T;
    error: string;
    loading: boolean;
  }>({ key, error: '', loading: false });
  const reload = useCallback(async () => {
    if (!enabled || !scope || !conversationId) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState((previous) => ({ ...previous, key, loading: true, error: '' }));
    try {
      const data = await readIdentity(
        scope,
        conversationId,
        action,
        payload,
        schema,
        controller.signal,
      );
      if (currentKey.current === key && !controller.signal.aborted)
        setState({ key, data, error: '', loading: false });
    } catch (cause) {
      if (currentKey.current === key && !controller.signal.aborted)
        setState({
          key,
          error:
            cause instanceof Error
              ? cause.message
              : 'Identity read unavailable.',
          loading: false,
        });
    }
  }, [key]);
  useEffect(() => {
    setState({ key, error: '', loading: false });
    void reload();
    return () => abort.current?.abort();
  }, [key, reload]);
  return {
    ...(state.key === key && enabled
      ? state
      : { key, error: '', loading: false }),
    reload,
  };
}
