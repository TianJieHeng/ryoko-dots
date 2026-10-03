import { z } from 'zod';
import { contractVersion, scopeSchema } from './contracts.js';

export const migrationCategories = [
  'conversations',
  'page_links',
  'reviews',
  'call_receipts',
  'specialists',
  'memory',
  'learning',
  'schedules',
  'artifacts',
  'effects',
] as const;

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const migrationInventorySchema = z
  .strictObject({
    category: z.enum(migrationCategories),
    total: count,
    migrated: count,
    readOnly: count,
    blocked: count,
    disposition: z.enum(['migrated', 'read_only', 'blocked', 'unavailable']),
  })
  .refine(
    (value) =>
      value.blocked <= value.total &&
      value.migrated <= value.total - value.readOnly - value.blocked,
    'Inventory counts must not exceed the total',
  );

/** Read-only status: migration and rollback require separate runtime authority. */
export const migrationSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  revision: count,
  runtimeOwner: z.enum(['ryoko', 'legacy', 'mixed_readonly']),
  stickyOwner: z.literal(true),
  state: z.enum([
    'awaiting_reconciliation',
    'in_progress',
    'paused',
    'completed',
    'rollback',
  ]),
  admissions: z.enum(['open', 'blocked', 'rollback']),
  acceptedRyokoWorkPreserved: z.boolean(),
  legacyApprovalsGrantNewPermission: z.literal(false),
  uncertainScheduleBackfill: z.literal(false),
  inventory: z
    .array(migrationInventorySchema)
    .max(migrationCategories.length)
    .refine(
      (values) =>
        new Set(values.map((value) => value.category)).size === values.length,
      'Duplicate migration inventory categories',
    ),
  warnings: z.array(z.string().max(2000)).max(100),
  qualified: z.boolean(),
});
export type RuntimeMigration = z.infer<typeof migrationSchema>;

/** Eligibility to request cutover is not permission to mutate migration state. */
export function canRequestCutover(value: unknown): boolean {
  const parsed = migrationSchema.safeParse(value);
  if (!parsed.success) return false;
  const migration = parsed.data;
  return (
    migration.runtimeOwner === 'ryoko' &&
    migration.state === 'completed' &&
    migration.admissions === 'open' &&
    migration.qualified &&
    migration.stickyOwner &&
    migration.acceptedRyokoWorkPreserved &&
    migrationCategories.every((category) =>
      migration.inventory.some((entry) => entry.category === category),
    ) &&
    migration.inventory.every(
      (entry) =>
        entry.blocked === 0 &&
        entry.disposition !== 'blocked' &&
        entry.disposition !== 'unavailable' &&
        entry.migrated === entry.total - entry.readOnly,
    )
  );
}
