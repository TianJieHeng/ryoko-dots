import { z } from 'zod';
import { computerPermissionsSchema } from '../computer-types.js';
import { contractVersion, sameScope, scopeSchema } from './contracts.js';

const id = z.string().min(1).max(256);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.number().int().nonnegative().max(8640000000000000);
export const effectStateSchema = z.enum([
  'prepared',
  'dispatched',
  'unknown',
  'reconciled',
  'failed',
]);
export const computerStatusSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  executorId: id,
  revision,
  refreshedAt: timestamp,
  configured: z.boolean(),
  state: z.enum(['not_configured', 'stopped', 'running', 'unavailable']),
  permissions: computerPermissionsSchema,
  control: z.strictObject({
    holder: z.enum(['bot', 'human']),
    requested: z.boolean(),
    transitioning: z.boolean(),
    resumeSnapshotRequired: z.boolean(),
    request: z.strictObject({ id, status: z.string().max(256) }).optional(),
  }),
  audit: z
    .array(
      z.strictObject({
        id,
        action: z.string().max(256),
        actor: z.enum(['owner', 'agent']),
        outcome: effectStateSchema,
        effectId: id.nullable(),
        createdAt: timestamp,
      }),
    )
    .max(1000),
  error: z.string().max(2000).optional(),
});
export type RuntimeComputerStatus = z.infer<typeof computerStatusSchema>;

export const screenSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  executorId: id,
  base64: z
    .string()
    .min(12)
    .max(16 * 1024 * 1024)
    .regex(/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/)
    .refine((value) => value.length % 4 === 0, 'Invalid PNG encoding'),
  width: z.number().int().positive().max(16000),
  height: z.number().int().positive().max(16000),
  url: z
    .string()
    .max(4096)
    .refine((value) => {
      if (value === '' || value === 'about:blank') return true;
      try {
        const url = new URL(value);
        return (
          ['https:', 'http:'].includes(url.protocol) &&
          !url.username &&
          !url.password
        );
      } catch {
        return false;
      }
    }),
  capturedAt: timestamp,
  snapshotRevision: revision,
});
export type RuntimeComputerScreen = z.infer<typeof screenSchema>;

/** Render only a fresh snapshot of this exact authorized executor revision. */
export function assertFreshScreen(
  value: unknown,
  statusValue: RuntimeComputerStatus,
  now = Date.now(),
): RuntimeComputerScreen {
  const status = computerStatusSchema.parse(statusValue);
  const screen = screenSchema.parse(value);
  if (
    !Number.isFinite(now) ||
    !status.configured ||
    status.state !== 'running' ||
    !status.permissions.enabled ||
    !status.permissions.browser ||
    !sameScope(screen.scope, status.scope) ||
    screen.executorId !== status.executorId ||
    screen.snapshotRevision !== status.revision ||
    now - screen.capturedAt > 15000 ||
    screen.capturedAt - now > 1000
  )
    throw new Error(
      'Computer screen is stale or its executor permission changed.',
    );
  return screen;
}

export const effectSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  executorId: id,
  revision,
  operationId: z.uuid(),
  intentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  effectId: id.nullable(),
  state: effectStateSchema,
  output: z
    .strictObject({
      text: z.string().max(100000).optional(),
      summary: z.string().max(2000).optional(),
      entries: z.array(z.string().max(4096)).max(1000).optional(),
      exitCode: z.number().int().optional(),
    })
    .nullable(),
});
export type RuntimeComputerEffect = z.infer<typeof effectSchema>;
