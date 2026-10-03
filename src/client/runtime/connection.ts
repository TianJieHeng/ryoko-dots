import { setupSchema, type RuntimeSetup } from '../../shared/runtime/contracts';

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
