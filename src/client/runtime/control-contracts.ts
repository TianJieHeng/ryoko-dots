import { z } from 'zod';
import { contractVersion, scopeSchema } from '../../shared/runtime/contracts';
import { reviewSchema } from '../../shared/runtime/reviews';

const id = z.string().min(1).max(256);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.number().finite().nonnegative();
const envelope = {
  version: z.literal(contractVersion),
  scope: scopeSchema,
  conversationId: id,
};

/** Every BE04 request names an existing conversation; an agent scope alone is insufficient. */
export function conversationRuntimePath(
  conversationId: string,
  suffix: string,
) {
  const safeId = (value: string) => {
    id.parse(value);
    if (value === '.' || value === '..')
      throw new Error('Invalid conversation control target.');
    return value;
  };
  safeId(conversationId);
  const literal = ['control', 'missions', 'effects', 'reviews'].includes(
    suffix,
  );
  const target = suffix.match(
    /^(?:reviews\/([^/]+)(?:\/decision)?|missions\/([^/]+)\/actions|deliveries\/([^/]+)(?:\/actions)?)$/,
  );
  if (!literal && !target)
    throw new Error('Invalid conversation control path.');
  if (target) {
    const encoded = target.slice(1).find(Boolean)!;
    if (encodeURIComponent(safeId(decodeURIComponent(encoded))) !== encoded)
      throw new Error('Invalid conversation control target.');
  }
  return `/runtime/conversations/${encodeURIComponent(conversationId)}/${suffix}`;
}

export function forConversation<T extends { conversationId: string }>(
  schema: z.ZodType<T>,
  conversationId: string,
) {
  return schema.refine((value) => value.conversationId === conversationId, {
    message: 'Response belongs to another conversation.',
  });
}

export const runtimeControlSchema = z.strictObject({
  ...envelope,
  control: z.strictObject({
    revision,
    paused: z.boolean(),
    updated_at: timestamp.nullable(),
    scope: z.literal('owner_profile'),
    admission_blocked: z.boolean(),
    scheduled_dispatch_blocked: z.boolean(),
    in_flight_dispatch: z.enum([
      'blocked_at_next_boundary',
      'allowed_at_checked_boundary',
    ]),
    accepted_commands: revision,
    claimed_commands: revision,
    accepted_work_retained: z.literal(true),
    already_dispatched_may_complete: z.literal(true),
    provider_cancelled: z.literal(false),
    remote_effects_undone: z.literal(false),
  }),
  operation: z
    .strictObject({
      operation_id: id,
      digest,
      revision,
      paused: z.boolean(),
      committed_at: timestamp,
      status: z.literal('committed'),
    })
    .nullable(),
  dispatch_performed: z.literal(false),
});

const artifact = z.object({
  artifact_id: id,
  version: z.number().int().positive(),
  digest,
});
const effectState = z.enum([
  'prepared',
  'dispatched',
  'confirmed',
  'failed',
  'outcome_unknown',
  'reconciliation_required',
]);
// Select safe fields used by this view from the separately schema-validated producer record.
export const runtimeMissionSchema = z.object({
  mission_id: id,
  session_id: id,
  agent_id: id,
  revision,
  outcome: z.string().min(1).max(16384),
  state: z.enum([
    'ready',
    'working',
    'waiting_for_user',
    'waiting_for_source',
    'ready_to_review',
    'completed',
    'partially_completed',
    'paused',
    'cancelled',
    'failed',
  ]),
  execution_status: z.string().max(256),
  acceptance_status: z.string().max(256),
  delivery_status: z.string().max(256),
  next_step: z.string().max(16384),
  blockers: z.array(z.string().max(16384)).max(100),
  artifact_refs: z.array(artifact).max(100),
  effect_refs: z
    .array(z.object({ effect_id: id, state: effectState }))
    .max(100),
  delivery_refs: z
    .array(z.object({ delivery_id: id, state: z.string().max(256) }))
    .max(100),
  effect_refs_truncated: z.boolean(),
  delivery_refs_truncated: z.boolean(),
  verification_current: z.boolean().nullable(),
  last_run_id: id.nullable(),
  paused_reason: z.string().max(16384).nullable(),
  recovery_choices: z.array(z.string().max(256)).max(100),
  deliverables: z
    .array(
      z.object({
        deliverable_id: id,
        description: z.string().max(4096),
        artifact_ref: artifact.nullable(),
        required: z.boolean(),
      }),
    )
    .max(100),
  plan_steps: z
    .array(
      z.object({
        step_id: id,
        description: z.string().max(4096),
        status: z.enum([
          'pending',
          'working',
          'completed',
          'blocked',
          'skipped',
        ]),
        checkpoint: z.boolean(),
      }),
    )
    .max(100),
  archived: z.boolean(),
});
export type RuntimeMission = z.infer<typeof runtimeMissionSchema>;
export const runtimeMissionsSchema = z.strictObject({
  ...envelope,
  missions: z.array(runtimeMissionSchema).max(100),
  limit: z.number().int().min(1).max(100),
  limit_reached: z.boolean(),
  complete: z.literal(false),
});

export const runtimeApprovalSchema = z.object({
  approval_id: id,
  run_id: id,
  approval_digest: digest,
  action_digest: digest,
  mission_id: id.nullable(),
  mission_revision: revision.nullable(),
  status: z.enum(['pending', 'approved', 'denied', 'consumed', 'invalidated']),
  expires_at: timestamp,
  expired: z.boolean(),
});
export const runtimeReviewsSchema = z.strictObject({
  ...envelope,
  approvals: z.array(runtimeApprovalSchema).max(100),
  limit: z.number().int().min(1).max(100),
  truncated: z.boolean(),
  complete: z.literal(false),
});
export const runtimeExactReviewSchema = z
  .strictObject({
    ...envelope,
    review: reviewSchema.nullable(),
    decisionUnavailableReason: z
      .string()
      .min(1)
      .max(1000)
      .nullable()
      .optional(),
    detail: z.object({
      approval: runtimeApprovalSchema,
      detail: z.object({
        reviewable: z.boolean(),
        unavailable_reason: z
          .enum([
            'review_not_retained',
            'opaque_content',
            'sensitive_content',
            'content_not_retained',
            'review_size_limit',
          ])
          .nullable(),
        review_digest: digest.nullable(),
      }),
      input_revision: z.string().nullable(),
      artifact_revision: z.string().nullable(),
      dispatch_performed: z.literal(false),
    }),
  })
  .refine(
    (value) =>
      !value.review ||
      (value.detail.detail.reviewable &&
        value.review.id === value.detail.approval.approval_id &&
        value.review.approvalDigest === value.detail.approval.approval_digest &&
        value.review.actionDigest === value.detail.approval.action_digest),
    { message: 'Exact review identity does not match its receipt.' },
  );

export const runtimeEffectsSchema = z.strictObject({
  ...envelope,
  effects: z
    .array(
      z.object({
        effect_id: id,
        run_id: id,
        operation_id: id,
        operation_type: z.enum([
          'artifact_publish',
          'project_artifact_publish',
          'mission_test_execution',
          'dots_page_publish',
          'dots_computer_action',
          'unsupported',
        ]),
        state: effectState,
        action_digest: digest,
        target_digest: digest,
        approval_id: id.nullable(),
        exactly_once_external: z.literal(false),
        replay_permitted: z.literal(false),
      }),
    )
    .max(100),
  limit: z.number().int().min(1).max(100),
  truncated: z.boolean(),
  complete: z.literal(false),
});

export const runtimeDeliverySchema = z.strictObject({
  ...envelope,
  delivery: z.strictObject({
    delivery_id: id,
    artifact_id: id,
    version: z.number().int().positive(),
    sha256: digest,
    destination: z.strictObject({
      kind: z.literal('local_runtime'),
      session_id: id,
      principal_id: id,
      profile_id: id,
      agent_id: id,
    }),
    state: z.enum([
      'pending',
      'attempting',
      'awaiting_ack',
      'partial',
      'delivered',
      'failed',
      'outcome_unknown',
      'dead_letter',
    ]),
    acknowledgment_level: z.enum([
      'none',
      'transport_accepted',
      'client_received',
    ]),
    components: z.strictObject({
      text: z.enum(['not_sent', 'client_received']),
      artifact: z.enum(['not_sent', 'client_received']),
    }),
    platform_ids: z.array(id).max(100),
    attempt_count: revision,
    max_attempts: revision,
    next_attempt_at: timestamp.nullable(),
    deadline_at: timestamp,
    retention_until: timestamp,
    last_error: z.string().max(16384).nullable(),
    result_available: z.boolean(),
  }),
});
