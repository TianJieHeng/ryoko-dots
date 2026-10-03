import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canUse,
  type Feature,
  type RuntimeSetup,
} from '../../shared/runtime/contracts';
import { api, ApiError, subscribeAuthentication } from '../api';
import {
  connectConversation,
  connectionState,
  parseSetup,
  RequestGeneration,
  type ConnectionState,
} from './connection';

export function useRuntime(dotId = '') {
  const [value, setValue] = useState<{
    selector: string;
    setup?: RuntimeSetup;
    state: ConnectionState;
    error: string;
  }>({ selector: dotId, state: 'loading', error: '' });
  const [attempt, setAttempt] = useState(0);
  const fence = useRef(new RequestGeneration());
  const selector = useRef(dotId);
  selector.current = dotId;
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(
    () =>
      subscribeAuthentication(() => {
        fence.current.advance();
        setValue({
          selector: dotId,
          state: 'permission_denied',
          error:
            'Authentication changed. Protected runtime state has been cleared.',
        });
        reload();
      }),
    [dotId, reload],
  );
  useEffect(() => {
    const generation = fence.current.advance();
    const controller = new AbortController();
    setValue({ selector: dotId, state: 'loading', error: '' });
    void api<unknown>(
      `/runtime/setup?dotId=${encodeURIComponent(dotId)}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((raw) => {
        const setup = parseSetup(raw);
        if (fence.current.current(generation))
          setValue({
            selector: dotId,
            setup,
            state: connectionState(setup),
            error: '',
          });
      })
      .catch((error) => {
        if (!fence.current.current(generation) || controller.signal.aborted)
          return;
        const status = error instanceof ApiError ? error.status : 0;
        const unsupported =
          status === 404 || status === 501 || error?.name === 'ZodError';
        setValue({
          selector: dotId,
          state:
            status === 401 || status === 403
              ? 'permission_denied'
              : unsupported
                ? 'unsupported'
                : 'disconnected',
          error: unsupported
            ? 'The self-hosted runtime adapter is unavailable or has an incompatible contract. Backend integration is required.'
            : status === 401 || status === 403
              ? 'Runtime access is denied or your session expired.'
              : 'Could not reach the self-hosted runtime. Your accepted work is not cancelled.',
        });
      });
    return () => {
      controller.abort();
      fence.current.advance();
    };
  }, [dotId, attempt]);
  // Do not render the preceding agent's projection even during the effect boundary.
  const current =
    value.selector === dotId
      ? value
      : { selector: dotId, state: 'loading' as const, error: '' };
  return {
    ...current,
    reload,
    connect: async (conversationId: string) => {
      if (!current.setup?.scope)
        throw new Error(
          'Runtime authority is unavailable. Reload access before connecting.',
        );
      const generation = fence.current.advance();
      const setup = await connectConversation(
        conversationId,
        current.setup.scope,
        dotId,
      );
      if (!fence.current.current(generation) || selector.current !== dotId)
        throw new Error('Runtime binding changed while connecting.');
      setValue({
        selector: dotId,
        setup,
        state: connectionState(setup),
        error: '',
      });
      return setup;
    },
    available: (feature: Feature) => canUse(current.setup, feature),
  };
}
export type RuntimeConnection = ReturnType<typeof useRuntime>;
