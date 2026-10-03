import Ajv from 'ajv';
import { producerSchema } from '../../shared/runtime/be06-producer/schema.generated.js';
import type {
  Be06Params,
  Be06Results,
} from '../../shared/runtime/be06-producer/methods.generated.js';
export type Be06Method = keyof Be06Params;
export type { Be06Params, Be06Results };
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
export function validateBe06Wire(
  method: Be06Method,
  side: 'params' | 'result',
  value: unknown,
): void {
  if (!validators.get(method)?.[side](value))
    throw new Error(`Invalid BE06 ${side} schema.`);
}
export const be06Methods = Object.freeze([
  ...validators.keys(),
]) as readonly Be06Method[];
