import { api, getAuthenticationGeneration } from '../api';
import {
  sameScope,
  setupSchema,
  type RuntimeScope,
  type RuntimeSetup,
} from '../../shared/runtime/contracts';

/** Local request fences do not grant authority; the gateway still validates scope. */
export class RequestGeneration {
  private value = 0;
  advance() {
    return ++this.value;
  }
  current(value: number) {
    return value === this.value;
  }
}
export type ConnectionState =
  | 'loading'
  | 'ready'
  | 'disconnected'
  | 'degraded'
  | 'unsupported'
  | 'permission_denied';
export function parseSetup(value: unknown): RuntimeSetup {
  return setupSchema.parse(value);
}
export function connectionState(setup: RuntimeSetup): ConnectionState {
  if (!setup.qualified || !setup.scope) return 'unsupported';
  const states = [
    setup.controlPlane.state,
    setup.binding.state,
    setup.compatibility.state,
  ];
  if (states.includes('permission_denied')) return 'permission_denied';
  if (states.includes('unsupported') || states.includes('unconfigured'))
    return 'unsupported';
  if (states.includes('disconnected')) return 'disconnected';
  if (states.includes('degraded')) return 'degraded';
  return 'ready';
}

/** Explicit user action only. Reading setup/history never initializes execution. */
export async function connectConversation(
  conversationId: string,
  scope: RuntimeScope,
  dotId?: string,
) {
  const authentication = getAuthenticationGeneration();
  const setup = parseSetup(
    await api<unknown>(
      `/runtime/conversations/${encodeURIComponent(conversationId)}/connect`,
      'POST',
      {},
    ),
  );
  const assertAuthentication = () => {
    if (authentication !== getAuthenticationGeneration())
      throw new Error('Authentication changed while connecting.');
  };
  assertAuthentication();
  if (sameScope(scope, setup.scope)) return setup;
  // First explicit native registration can establish a reviewed Space/project
  // mapping and advance only its authority revision. Never trust the POST alone:
  // independently read the selected Dot and require the exact same new scope.
  if (
    dotId &&
    setup.scope &&
    setup.scope.generation > scope.generation &&
    sameScope({ ...scope, generation: setup.scope.generation }, setup.scope)
  ) {
    const refreshed = parseSetup(
      await api<unknown>(`/runtime/setup?dotId=${encodeURIComponent(dotId)}`),
    );
    assertAuthentication();
    if (sameScope(setup.scope, refreshed.scope)) return refreshed;
  }
  throw new Error(
    'Connected runtime belongs to another binding. Refresh current access before reconnecting.',
  );
}
