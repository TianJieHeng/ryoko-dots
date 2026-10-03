import Ajv from 'ajv';
import { producerSchema } from '../../shared/runtime/producer/schema.generated.js';
import type {
  RuntimeCapabilities,
  MissionSnapshot,
  RuntimeEventsSinceResult,
} from '../../shared/runtime/producer/wire.generated.js';
export interface ReadResults {
  'runtime.capabilities': RuntimeCapabilities;
  'runtime.snapshot': MissionSnapshot;
  'runtime.events.since': RuntimeEventsSinceResult;
}
export type ReadMethod = keyof ReadResults;
const ajv = new Ajv({
  allErrors: false,
  removeAdditional: false,
  useDefaults: false,
  coerceTypes: false,
});
const validators = new Map(
  producerSchema.methods.map((method) => [
    method.name,
    {
      params: ajv.compile({
        ...producerSchema,
        $ref: method.params[0].schema.$ref,
      }),
      result: ajv.compile({
        ...producerSchema,
        $ref: method.result.schema.$ref,
      }),
    },
  ]),
);
export function validateWire(
  method: ReadMethod,
  side: 'params' | 'result',
  value: unknown,
): void {
  if (!validators.get(method)?.[side](value))
    throw new Error(`Invalid ${method} ${side} schema`);
}
