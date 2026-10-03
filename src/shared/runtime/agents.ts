import { z } from 'zod';
import { contractVersion, scopeSchema } from './contracts.js';

const id = z.string().min(1).max(256);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const name = z.string().trim().min(1).max(200);
const instructions = z.string().max(20000);
const role = z.enum(['primary', 'specialist']);
const backend = z.enum(['personal_harness', 'built_in']);
const spaceIds = z
  .array(id)
  .max(100)
  .refine(
    (values) => new Set(values).size === values.length,
    'Duplicate spaces',
  );
const hasCorrectBackend = (value: {
  role: z.infer<typeof role>;
  memoryBackend: z.infer<typeof backend>;
}) =>
  value.memoryBackend ===
  (value.role === 'primary' ? 'personal_harness' : 'built_in');

/** Role and backend are runtime authority, never inferred from display names. */
export const specialistSchema = z
  .strictObject({
    id,
    dotId: id,
    name,
    instructions,
    revision,
    role,
    memoryBackend: backend,
    memoryEnabled: z.boolean(),
    researchAllowed: z.boolean(),
    spaceIds,
    defaultSpaceId: id.nullable(),
  })
  .refine(hasCorrectBackend, 'Role and memory backend must match')
  .refine(
    (value) =>
      value.defaultSpaceId === null ||
      value.spaceIds.includes(value.defaultSpaceId),
    'Default space must be explicitly allowed',
  );
export type RuntimeSpecialist = z.infer<typeof specialistSchema>;
export const specialistsSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  specialists: z
    .array(specialistSchema)
    .max(100)
    .refine(
      (values) =>
        new Set(values.map((value) => value.id)).size === values.length,
      'Duplicate specialists',
    ),
});
export type RuntimeSpecialists = z.infer<typeof specialistsSchema>;

/** Editable configuration cannot assign authority, identity, or memory backend. */
export const configSchema = z
  .strictObject({
    name,
    instructions,
    researchAllowed: z.boolean(),
    memoryAllowed: z.boolean(),
    spaceIds,
    spaceId: id.nullable(),
  })
  .refine(
    (value) => value.spaceId === null || value.spaceIds.includes(value.spaceId),
    'Default space must be explicitly allowed',
  );
export type RuntimeAgentConfig = z.infer<typeof configSchema>;

export const memorySchema = z
  .strictObject({
    version: z.literal(contractVersion),
    scope: scopeSchema,
    backend,
    role,
    status: z.enum(['ready', 'unavailable']),
    permissions: z.strictObject({
      read: z.boolean(),
      write: z.boolean(),
      delete: z.boolean(),
      export: z.boolean(),
    }),
    entries: z
      .array(z.strictObject({ id, revision, text: z.string().max(20000) }))
      .max(500)
      .refine(
        (values) =>
          new Set(values.map((value) => value.id)).size === values.length,
        'Duplicate memory entries',
      ),
  })
  .refine(
    (value) =>
      hasCorrectBackend({ role: value.role, memoryBackend: value.backend }),
    'Role and memory backend must match',
  );
export type RuntimeMemory = z.infer<typeof memorySchema>;

/** Capability advertisement alone cannot make an unavailable backend writable. */
export function canMutateMemory(
  memory: unknown,
  action: 'write' | 'delete' | 'export' = 'write',
): boolean {
  const parsed = memorySchema.safeParse(memory);
  return (
    parsed.success &&
    parsed.data.status === 'ready' &&
    (action === 'write' || action === 'delete' || action === 'export') &&
    parsed.data.permissions[action]
  );
}

export const workflowActionSchema = z.enum([
  'evaluate',
  'approve',
  'publish',
  'deliver',
  'rollback',
]);
export type WorkflowAction = z.infer<typeof workflowActionSchema>;
export const workflowSchema = z.strictObject({
  id,
  name,
  revision,
  version: id,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  evidence: z.array(z.string().min(1).max(2000)).max(100),
  content: z.string().max(262144),
  evaluation: z.string().trim().min(1).max(20000).nullable(),
  publicationTarget: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .nullable()
    .default(null),
  deliveryTarget: z.string().trim().min(1).max(2000).nullable().default(null),
  stage: z.enum([
    'evidence',
    'draft',
    'evaluated',
    'approved',
    'published',
    'delivered',
    'rolled_back',
  ]),
  status: z.enum(['active', 'frozen']),
  allowedActions: z
    .array(workflowActionSchema)
    .max(5)
    .refine(
      (values) => new Set(values).size === values.length,
      'Duplicate actions',
    ),
  previousVersion: id.nullable(),
});
export type RuntimeWorkflow = z.infer<typeof workflowSchema>;
export const learningSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  workflows: z
    .array(workflowSchema)
    .max(100)
    .refine(
      (values) =>
        new Set(values.map((value) => value.id)).size === values.length,
      'Duplicate workflows',
    ),
});
export type RuntimeLearning = z.infer<typeof learningSchema>;

/** Actions are runtime-advertised; evidence is never interpreted as a live claim. */
export function canApplyWorkflowAction(
  workflow: unknown,
  action: WorkflowAction,
): boolean {
  const parsed = workflowSchema.safeParse(workflow);
  return (
    parsed.success &&
    parsed.data.status === 'active' &&
    parsed.data.allowedActions.includes(action) &&
    (action !== 'approve' ||
      (parsed.data.stage === 'evaluated' && parsed.data.evaluation !== null)) &&
    (action !== 'publish' ||
      (parsed.data.stage === 'approved' &&
        parsed.data.publicationTarget !== null)) &&
    (action !== 'deliver' ||
      (parsed.data.stage === 'published' &&
        parsed.data.deliveryTarget !== null)) &&
    (action !== 'rollback' ||
      (parsed.data.previousVersion !== null &&
        parsed.data.previousVersion !== parsed.data.version))
  );
}
