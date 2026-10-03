import { z } from 'zod';
import { contractVersion, scopeSchema } from './contracts.js';

/** Finite product routes, never an arbitrary browser-controlled RPC method. */
export const identityMethods = {
  'agents.list': 'runtime.agent.list',
  'agents.get': 'runtime.agent.get',
  'agents.create': 'runtime.agent.create',
  'agents.update': 'runtime.agent.update',
  'agents.archive': 'runtime.agent.archive',
  session: 'runtime.agent.session.get',
  'memory.status': 'runtime.memory.status',
  'memory.list': 'runtime.memory.records.list',
  'memory.get': 'runtime.memory.record.get',
  'memory.write': 'runtime.memory.record.write',
  'memory.delete': 'runtime.memory.record.delete',
  'memory.scope': 'runtime.memory.scope.set',
  'specialists.catalog': 'runtime.specialist.catalog',
  'specialists.preview': 'runtime.specialist.preview',
  'specialists.handoff': 'runtime.specialist.handoff',
  'specialists.status': 'runtime.specialist.status',
  'evidence.create': 'runtime.evidence.create',
  'evidence.get': 'runtime.evidence.get',
  'evidence.list': 'runtime.evidence.list',
  'workflows.create': 'runtime.workflow.create',
  'workflows.get': 'runtime.workflow.get',
  'workflows.list': 'runtime.workflow.list',
  'workflows.template': 'runtime.workflow.template.create',
  'workflows.evaluate': 'runtime.workflow.evaluate',
  'workflows.review': 'runtime.workflow.decision.prepare',
  'workflows.accept': 'runtime.workflow.decision.commit',
  'workflows.decline': 'runtime.artifact.cancel',
  'workflows.feedback': 'runtime.workflow.feedback',
  'workflows.prepare': 'runtime.workflow.run.prepare',
  'workflows.publish': 'runtime.workflow.run.publish',
  'workflows.runs': 'runtime.workflow.runs',
  'workflows.deliver.review': 'runtime.workflow.delivery.prepare',
  'workflows.deliver.commit': 'runtime.workflow.delivery.commit',
  'workflows.deliver.list': 'runtime.workflow.delivery.list',
} as const;
export type IdentityAction = keyof typeof identityMethods;
export const identityReadActions = new Set<IdentityAction>([
  'agents.list',
  'agents.get',
  'session',
  'memory.status',
  'memory.list',
  'memory.get',
  'specialists.catalog',
  'specialists.status',
  'evidence.get',
  'evidence.list',
  'workflows.get',
  'workflows.list',
  'workflows.runs',
  'workflows.deliver.list',
]);

const id = z.string().min(1).max(256);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().max(262144);
const base = {
  version: z.literal(contractVersion),
  scope: scopeSchema,
  conversationId: id,
};
export const identityEnvelopeSchema = <T extends z.ZodType>(result: T) =>
  z.strictObject({ ...base, result });
export const identityReceiptSchema = z.strictObject({
  ...base,
  operationId: z.uuid(),
  intentDigest: digest,
  status: z.enum(['accepted', 'rejected', 'outcome_unknown']),
  result: z.unknown(),
  reason: z.string().max(2000),
});
export type IdentityReceipt = z.infer<typeof identityReceiptSchema>;
export const identityReviewSchema = z.strictObject({
  ...base,
  reviewOperationId: z.uuid(),
  reviewDigest: digest,
  method: z.enum([
    'runtime.workflow.decision.prepare',
    'runtime.workflow.delivery.prepare',
    'runtime.workflow.run.prepare',
    'runtime.specialist.preview',
  ]),
  result: z.record(z.string(), z.unknown()),
});
export type IdentityReview = z.infer<typeof identityReviewSchema>;
export const identityProjectsSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  projects: z.array(z.strictObject({ spaceId: id, projectId: id })).max(100),
});
export const legacyEnrollmentSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  enrollments: z
    .array(
      z.strictObject({
        evidence: z.strictObject({
          kind: z.enum(['dot', 'conversation']),
          id,
          dotId: id,
          legacyContainerId: id.nullable(),
          legacySkillDeliveryEnabled: z.boolean().nullable(),
        }),
        digest,
        migrationState: z.literal('review_required'),
        enrollmentAuthorized: z.literal(false),
      }),
    )
    .max(10000),
});

const workflowPin = z.strictObject({
  project_id: id,
  workflow_id: id,
  version: revision,
  sha256: digest,
  delivery_revision: revision,
  workflow_state: z.enum([
    'draft',
    'tested',
    'approved',
    'deprecated',
    'revoked',
    'unavailable',
  ]),
});
export const agentSessionSchema = z
  .strictObject({
    agent_id: id,
    role: z.enum(['primary', 'specialist', 'child']),
    memory_backend: z.enum(['personal_mcp', 'builtin']),
    active_configuration_revision: revision.nullable(),
    desired_configuration_revision: revision.nullable(),
    archived: z.boolean(),
    authority_revocation_revision: revision,
    authority_current: z.boolean(),
    revocation_code: id.nullable(),
    startup_frozen: z.boolean(),
    active_workflows: z.array(workflowPin).max(1000),
    desired_workflows: z.array(workflowPin).max(1000),
    activation: z.literal('next_session'),
    execution_authority: z.literal(false),
  })
  .refine(
    (value) =>
      value.memory_backend ===
      (value.role === 'primary' ? 'personal_mcp' : 'builtin'),
    'Agent role and assigned memory backend differ',
  );
export type AgentSession = z.infer<typeof agentSessionSchema>;
export const memoryStatusSchema = z
  .strictObject({
    capabilities: z.strictObject({
      backend: z.enum(['builtin', 'personal_mcp']),
      recall: z.boolean(),
      write: z.boolean(),
      supersede: z.boolean(),
      delete: z.boolean(),
      export: z.boolean(),
      session_ingest: z.boolean(),
    }),
    health: z.strictObject({
      backend: z.enum(['builtin', 'personal_mcp']),
      status: z.enum(['ready', 'unconfigured', 'degraded', 'disabled']),
      reason_code: id.nullable(),
      supported_operations: z.array(id).max(100),
    }),
  })
  .refine((value) => value.capabilities.backend === value.health.backend);
export type IdentityMemoryStatus = z.infer<typeof memoryStatusSchema>;
export const memoryRecordSchema = z.strictObject({
  record_id: id,
  version: revision,
  revision,
  supersedes_version: revision.nullable(),
  owner_agent_id: id,
  owner_principal_id: id,
  owner_profile_id: id,
  namespace_id: id,
  target: z.enum(['memory', 'user']),
  kind: z.enum([
    'stated_fact',
    'inference',
    'preference',
    'decision',
    'procedure_reference',
  ]),
  content: text.nullable(),
  source_ref: text,
  author: id,
  created_at: z.number().finite(),
  updated_at: z.number().finite(),
  valid_from: z.number().finite(),
  valid_to: z.number().finite().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  validity: z.enum(['valid', 'uncertain', 'invalid', 'superseded']),
  scope: id,
  deletion_state: z.enum(['present', 'deleted']),
  deleted_at: z.number().finite().nullable(),
  superseded_by_version: revision.nullable().optional(),
});
export type IdentityMemoryRecord = z.infer<typeof memoryRecordSchema>;
export const memoryListSchema = z.strictObject({
  revision,
  records: z.array(memoryRecordSchema).max(500),
  offset: revision,
  next_offset: revision,
  total: revision,
  has_more: z.boolean(),
});

/** The pinned personal harness exposes no supported owner mutation/export routes. Never fall back. */
export function canUseIdentityMemory(
  session: AgentSession | undefined,
  status: IdentityMemoryStatus | undefined,
  action: 'recall' | 'write' | 'delete' | 'export',
) {
  return (
    !!session &&
    !!status &&
    session.authority_current &&
    !session.archived &&
    session.role === 'specialist' &&
    session.memory_backend === 'builtin' &&
    status.health.backend === 'builtin' &&
    status.health.status === 'ready' &&
    status.capabilities[action] &&
    status.health.supported_operations.includes(action)
  );
}

const sourceRef = z.union([
  z.strictObject({ artifact_id: id, version: revision }),
  z.strictObject({ capture_id: id }),
  z.strictObject({ approval_id: id }),
]);
export const evidenceRecordSchema = z.strictObject({
  anchor_id: id,
  project_id: id,
  kind: z.enum([
    'source_span',
    'source_id',
    'decision',
    'constraint',
    'approval',
    'artifact_version',
  ]),
  source_ref: sourceRef,
  source_version: id,
  range_ref: z
    .union([
      z.strictObject({
        unit: z.enum(['line', 'byte']),
        start: revision,
        end: revision,
      }),
      z.strictObject({ unit: z.literal('section'), start: id, end: id }),
    ])
    .nullable(),
  captured_at: z.number().finite(),
  authority: z.enum(['observed', 'source_claim', 'user_approved', 'inferred']),
  validity: z.enum(['current', 'stale', 'revoked', 'unverified']),
  effective_validity: z.enum(['current', 'stale', 'revoked', 'unverified']),
  fresh_until: z.number().finite().nullable(),
  annotation: text,
  grants_execution: z.literal(false),
});
export const evidenceListSchema = z.strictObject({
  evidence: z.array(evidenceRecordSchema).max(500),
  limit: revision,
  limit_reached: z.boolean(),
  complete: z.literal(false),
});
export const identityWorkflowSchema = z.strictObject({
  workflow_id: id,
  version: revision,
  project_id: id,
  sha256: digest,
  definition_json: text,
  state: z.enum(['draft', 'tested', 'approved', 'deprecated', 'revoked']),
  revision,
  evaluation_ref: id.nullable(),
  active_version: revision.nullable(),
  head_revision: revision,
});
export type IdentityWorkflow = z.infer<typeof identityWorkflowSchema>;
export const identityWorkflowsSchema = z.strictObject({
  workflows: z.array(identityWorkflowSchema).max(1000),
  complete: z.literal(false),
});
export const identityDeliverySchema = z.strictObject({
  delivery_id: id,
  project_id: id,
  workflow_id: id,
  version: revision,
  sha256: digest,
  specialist_id: id,
  delivery_revision: revision,
  action: z.enum(['deliver', 'rollback']),
  approval_id: id,
  approval_digest: digest,
  previous_delivery_id: id.nullable(),
  activation: z.literal('next_session'),
  execution_authority: z.literal(false),
  personal_memory_shared: z.literal(false),
  recorded_at: z.number().finite(),
});
export const identityDeliveriesSchema = z.strictObject({
  deliveries: z.array(identityDeliverySchema).max(1000),
  complete: z.literal(true),
});
const specialistReference = z.strictObject({
  id,
  version: revision,
  sha256: digest,
});
export const specialistCatalogSchema = z.strictObject({
  specialists: z
    .array(
      z.strictObject({
        agent_id: id,
        responsibility: text,
        manifest_sha256: digest,
        methods_ref: specialistReference,
        limits: z.strictObject({
          max_depth: revision,
          max_total_children: revision,
          max_concurrent_children: revision,
        }),
        grants: z.strictObject({
          allowed_tools: z.array(id),
          project_grants: z.array(id),
          mcp_grants: z.record(id, z.array(id)),
          memory_backend: z.literal('builtin'),
          personal_memory_access: z.literal(false).optional(),
        }),
        builtin_memory_namespace: id,
        output_contract_json: text,
      }),
    )
    .max(100),
  unavailable: z.array(z.strictObject({ agent_id: id, code: id })).max(100),
  teams_enabled: z.literal(false).optional(),
  execution: z.literal('local_single_child').optional(),
});
export const specialistStatusSchema = z.strictObject({
  command_id: id,
  run_id: id,
  specialist_id: id,
  manifest_sha256: digest,
  project_id: id,
  status: z.enum([
    'accepted',
    'claimed',
    'completed',
    'failed',
    'blocked',
    'cancelled',
  ]),
  outcome: z.enum([
    'pending',
    'running',
    'completed',
    'failed',
    'blocked',
    'cancelled',
    'unknown',
  ]),
  completion: z
    .strictObject({
      specialist_id: id,
      manifest_sha256: digest,
      project_id: id,
      child_id: id.nullable(),
      handoff_sha256: digest.nullable(),
      state: z.enum(['completed', 'failed', 'blocked', 'cancelled', 'unknown']),
      summary: text,
      summary_truncated: z.boolean(),
      schema_valid: z.boolean().nullable(),
      parent_review_required: z.literal(true).optional(),
      execution_resumed: z.literal(false).optional(),
    })
    .nullable(),
  execution_resumed: z.literal(false).optional(),
});

export const legacyMemoryInventorySchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  records: z
    .array(
      z.strictObject({
        id,
        sourceRef: id,
        contentDigest: digest,
        byteCount: revision,
        createdAt: z.number().finite(),
        content: z.string().max(32768).nullable(),
        unavailableReason: z
          .enum(['source_changed_or_removed', 'content_exceeds_review_bound'])
          .nullable(),
        migrationState: z.literal('review_required'),
        enrollmentAuthorized: z.literal(false),
      }),
    )
    .max(20),
  offset: revision,
  nextOffset: revision.nullable(),
  hasMore: z.boolean(),
  sourceCount: revision,
  inventoryComplete: z.boolean(),
  personalHarnessDestinationSupported: z.literal(false),
});
