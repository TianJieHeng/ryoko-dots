import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  RuntimeControlService,
  canonicalControlIntent,
  type ControlAction,
  type ControlBinding,
  type ControlResults,
  type ControlTransport,
} from '../src/server/runtime/control-service.js';
import {
  ConversationLedger,
  intentDigest,
} from '../src/server/runtime/conversation-ledger.js';
import type {
  MissionRecord,
  RuntimeApprovalGetResult,
  RuntimeControlResult,
  RuntimeDeliveryReceipt,
} from '../src/shared/runtime/producer/wire.generated.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
});
const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
function approval(): RuntimeApprovalGetResult {
  return {
    approval: {
      approval_id: 'approval-1',
      run_id: 'run-1',
      approval_digest: 'a'.repeat(64),
      action_digest: 'b'.repeat(64),
      input_digest: 'c'.repeat(64),
      target_digest: 'd'.repeat(64),
      input_revision_digest: 'e'.repeat(64),
      artifact_revision_digest: 'f'.repeat(64),
      policy_version: '1',
      policy_digest: '0'.repeat(64),
      status: 'pending',
      expires_at: Date.now() / 1000 + 300,
      expired: false,
      created_at: Date.now() / 1000,
      resolved_at: null,
      consumed_at: null,
    },
    detail: {
      reviewable: true,
      unavailable_reason: null,
      review_digest: '1'.repeat(64),
      review: {
        action: {
          name: 'publish',
          arguments: {
            descriptor: {
              artifact_id: 'artifact-1',
              version: 1,
              sha256: digest('Exact café 🥐'),
              mime: 'text/plain',
              size: Buffer.byteLength('Exact café 🥐'),
            },
          },
          operation_class: 'project_artifact_publish',
          resource_roots: ['space-1'],
          destination: 'artifact:artifact-1:1',
          destination_purpose: 'publish exact version',
          contract_digest: '2'.repeat(64),
        },
        content: {
          encoding: 'base64',
          data: Buffer.from('Exact café 🥐').toString('base64'),
          sha256: digest('Exact café 🥐'),
          mime: 'text/plain',
        },
      },
    },
    decision: { choice: null, resolved_at: null, consumed_at: null },
    input_revision: 'input-v1',
    artifact_revision: 'artifact-v1',
    dispatch_performed: false,
  };
}
function control(): RuntimeControlResult {
  return {
    control: {
      revision: 0,
      paused: false,
      updated_at: null,
      scope: 'owner_profile',
      admission_blocked: false,
      scheduled_dispatch_blocked: false,
      in_flight_dispatch: 'allowed_at_checked_boundary',
      accepted_commands: 1,
      claimed_commands: 1,
      accepted_work_retained: true,
      already_dispatched_may_complete: true,
      provider_cancelled: false,
      remote_effects_undone: false,
    },
    operation: null,
    dispatch_performed: false,
  };
}
function delivery(): RuntimeDeliveryReceipt {
  return {
    delivery_id: 'delivery-1',
    artifact_id: 'artifact-1',
    version: 1,
    sha256: 'a'.repeat(64),
    destination: {
      kind: 'local_runtime',
      session_id: 'conversation-1',
      principal_id: 'principal-1',
      profile_id: 'profile-1',
      agent_id: 'agent-1',
    },
    state: 'failed',
    acknowledgment_level: 'none',
    components: { text: 'not_sent', artifact: 'not_sent' },
    platform_ids: [],
    attempt_count: 1,
    max_attempts: 3,
    next_attempt_at: null,
    deadline_at: Date.now() / 1000 + 300,
    retention_until: Date.now() / 1000 + 600,
    last_error: null,
    result_available: true,
  };
}
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'runtime-control-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const database = join(directory, 'state.sqlite');
  const bound: ControlBinding = {
    scope: {
      ownerId: 'owner-1',
      dotId: 'dot-1',
      gatewayId: 'gateway-1',
      principalId: 'principal-1',
      profileId: 'profile-1',
      agentId: 'agent-1',
      privilegeClass: 'primary',
      agentRevision: 1,
      authorityRevision: 1,
      grantRevision: 1,
      spaceId: null,
      projectId: null,
      projectRevision: null,
      conversationId: 'conversation-1',
      durableSessionId: 'conversation-1',
      liveSessionId: 'live-1',
      liveGeneration: 1,
      revision: 1,
      archived: false,
    },
    binding: {
      key: 'conversation-1',
      liveSessionId: 'live-1',
      durableSessionId: 'conversation-1',
      generation: 1,
    },
    epoch: 1,
  };
  let currentApproval = approval();
  let currentControl = control();
  let currentDelivery = delivery();
  let revoked = false;
  const requests: {
    method: keyof ControlResults;
    params: Record<string, unknown>;
  }[] = [];
  const hooks = new Map<
    keyof ControlResults,
    (params: Record<string, unknown>) => Promise<unknown>
  >();
  const transport: ControlTransport = {
    config: {
      checkout: '/source',
      python: '/python',
      home: '/profile',
      runtimeDirectory: '/runtime',
      ownerId: 'owner-1',
      dotId: 'dot-1',
      gatewayId: 'gateway-1',
      identity: {
        principal_id: 'principal-1',
        profile_id: 'profile-1',
        agent_id: 'agent-1',
        policy_digest: 'a'.repeat(64),
        config_digest: 'b'.repeat(64),
      },
    },
    connected: true,
    epoch: 1,
    async call<M extends keyof ControlResults>(
      method: M,
      raw: unknown,
    ): Promise<ControlResults[M]> {
      const params = raw as Record<string, unknown>;
      requests.push({ method, params });
      const hook = hooks.get(method);
      if (hook) return (await hook(params)) as ControlResults[M];
      if (method === 'runtime.approval.get')
        return structuredClone(currentApproval) as ControlResults[M];
      if (method === 'runtime.approval.resolve') {
        currentApproval = {
          ...currentApproval,
          approval: {
            ...currentApproval.approval,
            status: params.choice === 'once' ? 'approved' : 'denied',
            resolved_at: Date.now() / 1000,
          },
          decision: {
            choice: params.choice as 'once' | 'deny',
            resolved_at: Date.now() / 1000,
            consumed_at: null,
          },
        };
        return {
          approval: structuredClone(currentApproval.approval),
          dispatch_performed: false,
        } as ControlResults[M];
      }
      if (method === 'runtime.control.get')
        return structuredClone(currentControl) as ControlResults[M];
      if (
        method === 'runtime.control.pause' ||
        method === 'runtime.control.resume'
      ) {
        const paused = method === 'runtime.control.pause';
        const expected = params.expected_revision as number;
        currentControl = {
          ...currentControl,
          control: {
            ...currentControl.control,
            revision: expected + 1,
            paused,
            admission_blocked: paused,
            scheduled_dispatch_blocked: paused,
            in_flight_dispatch: paused
              ? 'blocked_at_next_boundary'
              : 'allowed_at_checked_boundary',
          },
          operation: {
            operation_id: String(params.operation_id),
            digest: digest(
              JSON.stringify({
                expected_revision: expected,
                operation_id: params.operation_id,
                paused,
              }),
            ),
            revision: expected + 1,
            paused,
            committed_at: Date.now() / 1000,
            status: 'committed',
          },
        };
        return structuredClone(currentControl) as ControlResults[M];
      }
      if (method === 'runtime.delivery.status')
        return structuredClone(currentDelivery) as ControlResults[M];
      if (method === 'runtime.delivery.retry') {
        currentDelivery = {
          ...currentDelivery,
          attempt_count: 2,
          state: 'awaiting_ack',
          acknowledgment_level: 'transport_accepted',
        };
        return structuredClone(currentDelivery) as ControlResults[M];
      }
      throw new Error(`Unexpected call ${method}`);
    },
  };
  const guard = () => {
    if (revoked) throw new Error('Access revoked');
  };
  const boundSession = vi.fn(async (conversationId: string) => {
    guard();
    if (conversationId !== bound.scope.conversationId)
      throw new Error('Wrong conversation');
    return structuredClone(bound);
  });
  const assertCurrent = (scope: ControlBinding['scope']) => {
    guard();
    if (
      scope.liveSessionId !== bound.scope.liveSessionId ||
      scope.liveGeneration !== bound.scope.liveGeneration ||
      scope.authorityRevision !== bound.scope.authorityRevision
    )
      throw new Error('Stale binding');
  };
  let service = new RuntimeControlService(
    'owner-1',
    database,
    transport,
    boundSession,
    assertCurrent,
  );
  cleanups.push(() => service.close());
  const action = (
    path: string,
    action: ControlAction['action'],
    payload: Record<string, unknown> = {},
    expectedRevision = 0,
  ) => {
    const intent = { path, action, payload, expectedRevision };
    return {
      action,
      payload,
      expectedRevision,
      operationId: randomUUID(),
      intentDigest: intentDigest(canonicalControlIntent(intent)),
      expectedGeneration: 1,
    };
  };
  return {
    get service() {
      return service;
    },
    database,
    bound,
    transport,
    hooks,
    requests,
    action,
    guard,
    boundSession,
    get approval() {
      return currentApproval;
    },
    get control() {
      return currentControl;
    },
    get delivery() {
      return currentDelivery;
    },
    revoke() {
      revoked = true;
    },
    reopen() {
      service.close();
      service = new RuntimeControlService(
        'owner-1',
        database,
        transport,
        boundSession,
        assertCurrent,
      );
    },
  };
}
const reviewPath =
  '/runtime/conversations/conversation-1/reviews/approval-1/decision';
const decision = { approvalDigest: 'a'.repeat(64), choice: 'once' };

describe('BE04 exact runtime control ingress', () => {
  it('records an exact decision once, then recovers after restart without resolve replay', async () => {
    const f = fixture();
    const read = await f.service.readReview(
      'conversation-1',
      'approval-1',
      f.guard,
    );
    expect(read.review?.content).toContain('Exact café 🥐');
    expect(read.review?.content).toContain('input-v1');
    const input = f.action(reviewPath, 'approval.resolve', decision);
    expect(
      (await f.service.admit('conversation-1', reviewPath, input, f.guard))
        .status,
    ).toBe('accepted');
    f.reopen();
    expect(
      (await f.service.admit('conversation-1', reviewPath, input, f.guard))
        .status,
    ).toBe('accepted');
    expect(
      f.requests.filter((r) => r.method === 'runtime.approval.resolve'),
    ).toHaveLength(1);
    expect(f.requests.every((r) => r.params.session_id === 'live-1')).toBe(
      true,
    );
  });

  it('retains response-lost decision and uses exact durable choice for inspection', async () => {
    const f = fixture();
    await f.service.readReview('conversation-1', 'approval-1', f.guard);
    f.hooks.set('runtime.approval.resolve', async () => {
      f.approval.decision.choice = 'once';
      f.approval.decision.resolved_at = Date.now() / 1000;
      f.approval.approval.status = 'consumed';
      throw new Error('Connection lost after commit');
    });
    const input = f.action(reviewPath, 'approval.resolve', decision);
    expect(
      (await f.service.admit('conversation-1', reviewPath, input, f.guard))
        .status,
    ).toBe('outcome_unknown');
    f.reopen();
    expect((await f.service.inspect(input.operationId, f.guard)).status).toBe(
      'accepted',
    );
    expect(
      f.requests.filter((r) => r.method === 'runtime.approval.resolve'),
    ).toHaveLength(1);
  });

  it('refuses decisions never shown, changed exact bytes/target/version, expiry and stale live generation', async () => {
    for (const change of [
      'unseen',
      'bytes',
      'target',
      'version',
      'expiry',
      'generation',
    ] as const) {
      const f = fixture();
      if (change !== 'unseen')
        await f.service.readReview('conversation-1', 'approval-1', f.guard);
      if (change === 'bytes')
        f.approval.detail.review!.content!.data =
          Buffer.from('other bytes').toString('base64');
      if (change === 'target')
        f.approval.detail.review!.action.destination = 'another recipient';
      if (change === 'version') f.approval.artifact_revision = 'artifact-v2';
      if (change === 'expiry') f.approval.approval.expires_at = 1;
      if (change === 'generation') f.bound.scope.liveGeneration++;
      const input = f.action(reviewPath, 'approval.resolve', decision);
      await expect(
        f.service.admit('conversation-1', reviewPath, input, f.guard),
      ).rejects.toThrow();
      expect(
        f.requests.some((r) => r.method === 'runtime.approval.resolve'),
      ).toBe(false);
      expect((await f.service.inspect(input.operationId, f.guard)).status).toBe(
        'rejected',
      );
    }
  });

  it('withholds opaque/incomplete reviews rather than substituting approvable previews', async () => {
    const f = fixture();
    f.approval.detail.reviewable = false;
    f.approval.detail.unavailable_reason = 'sensitive_content';
    f.approval.detail.review = null;
    expect(
      (await f.service.readReview('conversation-1', 'approval-1', f.guard))
        .review,
    ).toBeNull();
    const input = f.action(reviewPath, 'approval.resolve', decision);
    await expect(
      f.service.admit('conversation-1', reviewPath, input, f.guard),
    ).rejects.toThrow();
    expect(
      f.requests.some((r) => r.method === 'runtime.approval.resolve'),
    ).toBe(false);
  });

  it('fences changed grants during awaited detail read and never sends a decision', async () => {
    const f = fixture();
    await f.service.readReview('conversation-1', 'approval-1', f.guard);
    f.hooks.set('runtime.approval.get', async () => {
      f.revoke();
      return structuredClone(f.approval);
    });
    const input = f.action(reviewPath, 'approval.resolve', decision);
    await expect(
      f.service.admit('conversation-1', reviewPath, input, f.guard),
    ).rejects.toThrow('Access revoked');
    expect(
      f.requests.some((r) => r.method === 'runtime.approval.resolve'),
    ).toBe(false);
  });

  it('serializes repeated operation admission across simultaneous tabs without replay', async () => {
    const f = fixture();
    await f.service.readReview('conversation-1', 'approval-1', f.guard);
    let finish!: () => void;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let dispatched!: () => void;
    const entered = new Promise<void>((resolve) => {
      dispatched = resolve;
    });
    f.hooks.set('runtime.approval.resolve', async () => {
      dispatched();
      await held;
      return {
        approval: { ...f.approval.approval, status: 'approved' },
        dispatch_performed: false,
      };
    });
    const input = f.action(reviewPath, 'approval.resolve', decision);
    const first = f.service.admit('conversation-1', reviewPath, input, f.guard);
    await entered;
    expect(
      (await f.service.admit('conversation-1', reviewPath, input, f.guard))
        .status,
    ).toBe('outcome_unknown');
    finish();
    expect((await first).status).toBe('accepted');
    expect(
      f.requests.filter((r) => r.method === 'runtime.approval.resolve'),
    ).toHaveLength(1);
  });

  it('binds pause to its immutable operation receipt and preserves accepted/in-flight semantics', async () => {
    const f = fixture();
    const input = f.action(
      '/runtime/conversations/conversation-1/control',
      'pause',
    );
    expect(
      (
        await f.service.admit(
          'conversation-1',
          '/runtime/conversations/conversation-1/control',
          input,
          f.guard,
        )
      ).status,
    ).toBe('accepted');
    const state = await f.service.readControl('conversation-1', f.guard);
    expect(state.control.admission_blocked).toBe(true);
    expect(state.control.scheduled_dispatch_blocked).toBe(true);
    expect(state.control.in_flight_dispatch).toBe('blocked_at_next_boundary');
    expect(state.control.accepted_work_retained).toBe(true);
    expect(state.control.provider_cancelled).toBe(false);
    expect(state.control.remote_effects_undone).toBe(false);
    expect(state.control.accepted_commands).toBe(1);
    f.reopen();
    expect((await f.service.inspect(input.operationId, f.guard)).status).toBe(
      'accepted',
    );
    expect(
      f.requests.filter((r) => r.method === 'runtime.control.pause'),
    ).toHaveLength(1);
  });

  it('does not infer a lost pause from global state or accept a foreign receipt', async () => {
    const f = fixture();
    f.hooks.set('runtime.control.pause', async () => {
      f.control.control.paused = true;
      throw new Error('Lost response');
    });
    const input = f.action(
      '/runtime/conversations/conversation-1/control',
      'pause',
    );
    expect(
      (
        await f.service.admit(
          'conversation-1',
          '/runtime/conversations/conversation-1/control',
          input,
          f.guard,
        )
      ).status,
    ).toBe('outcome_unknown');
    expect((await f.service.inspect(input.operationId, f.guard)).status).toBe(
      'outcome_unknown',
    );
    f.control.operation = {
      operation_id: randomUUID(),
      digest: 'a'.repeat(64),
      revision: 1,
      paused: true,
      committed_at: 1,
      status: 'committed',
    };
    await expect(f.service.inspect(input.operationId, f.guard)).rejects.toThrow(
      'receipt mismatch',
    );
    expect(
      f.requests.filter((r) => r.method === 'runtime.control.pause'),
    ).toHaveLength(1);
  });

  it('retries only bound immutable failed delivery and retains unknown retry without inference replay', async () => {
    const f = fixture();
    const path =
      '/runtime/conversations/conversation-1/deliveries/delivery-1/actions';
    const input = f.action(
      path,
      'retry_delivery',
      { artifactId: 'artifact-1', version: 1, sha256: 'a'.repeat(64) },
      1,
    );
    f.hooks.set('runtime.delivery.retry', async () => {
      f.delivery.state = 'delivered';
      f.delivery.attempt_count = 2;
      throw new Error('Lost response');
    });
    expect(
      (await f.service.admit('conversation-1', path, input, f.guard)).status,
    ).toBe('outcome_unknown');
    expect((await f.service.inspect(input.operationId, f.guard)).status).toBe(
      'outcome_unknown',
    );
    expect(
      (await f.service.readDelivery('conversation-1', 'delivery-1', f.guard))
        .delivery.state,
    ).toBe('delivered');
    expect(
      f.requests.filter((r) => r.method === 'runtime.delivery.retry'),
    ).toHaveLength(1);
    expect(
      f.requests.every((r) =>
        ['runtime.delivery.status', 'runtime.delivery.retry'].includes(
          r.method,
        ),
      ),
    ).toBe(true);
  });

  it('allows an explicit new delivery-only repair for retryable immutable notice states', async () => {
    for (const state of [
      'pending',
      'failed',
      'awaiting_ack',
      'partial',
      'outcome_unknown',
    ] as const) {
      const f = fixture();
      f.delivery.state = state;
      const path =
        '/runtime/conversations/conversation-1/deliveries/delivery-1/actions';
      const input = f.action(
        path,
        'retry_delivery',
        { artifactId: 'artifact-1', version: 1, sha256: 'a'.repeat(64) },
        1,
      );
      expect(
        (await f.service.admit('conversation-1', path, input, f.guard)).status,
      ).toBe('accepted');
      expect(f.requests.map((request) => request.method)).toEqual([
        'runtime.delivery.status',
        'runtime.delivery.retry',
      ]);
      expect((await f.service.inspect(input.operationId, f.guard)).status).toBe(
        'accepted',
      );
      expect(
        f.requests.filter(
          (request) => request.method === 'runtime.delivery.retry',
        ),
      ).toHaveLength(1);
    }
  });

  it('refuses in-flight delivery, changed output or destination before delivery retry', async () => {
    for (const change of ['attempting', 'bytes', 'destination'] as const) {
      const f = fixture();
      if (change === 'attempting') f.delivery.state = 'attempting';
      if (change === 'bytes') f.delivery.sha256 = 'b'.repeat(64);
      if (change === 'destination')
        f.delivery.destination.agent_id = 'other-agent';
      const path =
        '/runtime/conversations/conversation-1/deliveries/delivery-1/actions';
      const input = f.action(
        path,
        'retry_delivery',
        { artifactId: 'artifact-1', version: 1, sha256: 'a'.repeat(64) },
        1,
      );
      await expect(
        f.service.admit('conversation-1', path, input, f.guard),
      ).rejects.toThrow();
      expect(
        f.requests.some((r) => r.method === 'runtime.delivery.retry'),
      ).toBe(false);
    }
  });

  it('rejects conflicting IDs, intent digests, generations and unsupported generic commands', async () => {
    const f = fixture();
    const input = f.action(
      '/runtime/conversations/conversation-1/control',
      'pause',
    );
    await f.service.admit(
      'conversation-1',
      '/runtime/conversations/conversation-1/control',
      input,
      f.guard,
    );
    const conflicting = {
      ...f.action('/runtime/conversations/conversation-1/control', 'resume'),
      operationId: input.operationId,
    };
    await expect(
      f.service.admit(
        'conversation-1',
        '/runtime/conversations/conversation-1/control',
        conflicting,
        f.guard,
      ),
    ).rejects.toThrow('conflicts');
    await expect(
      f.service.admit(
        'conversation-1',
        '/runtime/conversations/conversation-1/control',
        { ...input, operationId: randomUUID(), intentDigest: '0'.repeat(64) },
        f.guard,
      ),
    ).rejects.toThrow('digest mismatch');
    await expect(
      f.service.admit(
        'conversation-1',
        '/runtime/conversations/conversation-1/control',
        { ...input, expectedGeneration: 0 },
        f.guard,
      ),
    ).rejects.toThrow('generation changed');
    await expect(
      f.service.admit(
        'conversation-1',
        '/runtime/conversations/conversation-1/command',
        input,
        f.guard,
      ),
    ).rejects.toThrow('unsupported');
    expect(
      f.requests.filter((r) => r.method === 'runtime.control.pause'),
    ).toHaveLength(1);
  });

  it('shares the original global operation namespace with conversation admission', async () => {
    const f = fixture();
    const ledger = new ConversationLedger(f.database, 'owner-1');
    cleanups.push(() => ledger.close());
    const input = f.action(
      '/runtime/conversations/conversation-1/control',
      'pause',
    );
    ledger.admit({
      operationId: input.operationId,
      dotId: 'dot-1',
      binding: 'binding',
      kind: 'create',
      intent: '{}',
      producerKey: randomUUID(),
    });
    await expect(
      f.service.admit(
        'conversation-1',
        '/runtime/conversations/conversation-1/control',
        input,
        f.guard,
      ),
    ).rejects.toThrow('conflicts');
    expect(f.requests).toHaveLength(0);
  });

  it('preserves cancelled missions with unresolved effects and never replays lost mission control', async () => {
    const f = fixture();
    const mission: MissionRecord = {
      outcome: 'Deliver an exact result',
      schema_version: 1,
      mission_id: 'mission-1',
      session_id: 'conversation-1',
      agent_id: 'agent-1',
      revision: 1,
      state: 'working',
      execution_status: 'running',
      acceptance_status: 'pending',
      delivery_status: 'held',
      next_step: 'Inspect uncertain publication',
      blockers: ['Unknown artifact write'],
      artifact_refs: [],
      effect_refs: [{ effect_id: 'effect-1', state: 'outcome_unknown' }],
      delivery_refs: [],
      turns_used: 1,
      consecutive_no_progress: 0,
      verification_rounds: 0,
      last_run_id: 'run-1',
      paused_reason: null,
      recovery_choices: ['inspect'],
      missed_steer: [],
      created_at: 1,
      updated_at: 1,
      legacy_imported: false,
      archived: false,
      plan_steps: [
        {
          step_id: 'step-1',
          description: 'Publish once',
          status: 'blocked',
          checkpoint: true,
        },
      ],
      deliverables: [
        {
          deliverable_id: 'output-1',
          description: 'Final artifact',
          artifact_ref: null,
          required: true,
        },
      ],
    };
    f.hooks.set('runtime.mission.get', async () => ({
      mission: structuredClone(mission),
    }));
    f.hooks.set('runtime.mission.history', async () => ({
      missions: [structuredClone(mission)],
      limit: 100,
      limit_reached: false,
      complete: false,
    }));
    f.hooks.set('runtime.mission.cancel', async () => {
      mission.state = 'cancelled';
      mission.revision = 2;
      throw new Error('Response lost');
    });
    const path =
      '/runtime/conversations/conversation-1/missions/mission-1/actions';
    const input = f.action(path, 'cancel', {}, 1);
    expect(
      (await f.service.admit('conversation-1', path, input, f.guard)).status,
    ).toBe('outcome_unknown');
    f.reopen();
    expect((await f.service.inspect(input.operationId, f.guard)).status).toBe(
      'outcome_unknown',
    );
    const read = await f.service.readMissions('conversation-1', f.guard);
    expect(read.missions[0].state).toBe('cancelled');
    expect(read.missions[0].effect_refs[0].state).toBe('outcome_unknown');
    expect(read.missions[0].artifact_refs).toEqual([]);
    expect(read.missions[0].delivery_status).toBe('held');
    expect(read.missions[0].plan_steps![0].checkpoint).toBe(true);
    expect(
      f.requests.filter((r) => r.method === 'runtime.mission.cancel'),
    ).toHaveLength(1);
    mission.session_id = 'foreign-conversation';
    await expect(f.service.inspect(input.operationId, f.guard)).rejects.toThrow(
      'scope mismatch',
    );
  });

  it('recovers a lost pause by its original immutable receipt after another tab resumes', async () => {
    const f = fixture();
    const input = f.action(
      '/runtime/conversations/conversation-1/control',
      'pause',
    );
    f.hooks.set('runtime.control.pause', async () => {
      f.control.operation = {
        operation_id: input.operationId,
        digest: digest(
          JSON.stringify({
            expected_revision: 0,
            operation_id: input.operationId,
            paused: true,
          }),
        ),
        revision: 1,
        paused: true,
        committed_at: 1,
        status: 'committed',
      };
      f.control.control.revision = 2;
      f.control.control.paused = false;
      throw new Error('Response lost');
    });
    expect(
      (
        await f.service.admit(
          'conversation-1',
          '/runtime/conversations/conversation-1/control',
          input,
          f.guard,
        )
      ).status,
    ).toBe('outcome_unknown');
    f.reopen();
    expect((await f.service.inspect(input.operationId, f.guard)).status).toBe(
      'accepted',
    );
    expect(f.control.control.paused).toBe(false);
    expect(
      f.requests.filter((r) => r.method === 'runtime.control.pause'),
    ).toHaveLength(1);
  });

  it('keeps another tab denial distinct from the original unknown approval choice', async () => {
    const f = fixture();
    await f.service.readReview('conversation-1', 'approval-1', f.guard);
    f.hooks.set('runtime.approval.resolve', async () => {
      throw new Error('Transport lost');
    });
    const input = f.action(reviewPath, 'approval.resolve', decision);
    expect(
      (await f.service.admit('conversation-1', reviewPath, input, f.guard))
        .status,
    ).toBe('outcome_unknown');
    f.approval.decision.choice = 'deny';
    f.approval.decision.resolved_at = 1;
    f.approval.approval.status = 'denied';
    expect((await f.service.inspect(input.operationId, f.guard)).status).toBe(
      'rejected',
    );
    expect(
      f.requests.filter((r) => r.method === 'runtime.approval.resolve'),
    ).toHaveLength(1);
  });

  it('fails reads after generation drift and never asks a transport to bind or initialize', async () => {
    const f = fixture();
    f.hooks.set('runtime.control.get', async () => {
      f.bound.scope.liveGeneration++;
      return control();
    });
    await expect(
      f.service.readControl('conversation-1', f.guard),
    ).rejects.toThrow('Stale binding');
    expect(f.requests.map((r) => r.method)).toEqual(['runtime.control.get']);
    expect(f.boundSession).toHaveBeenCalledWith(
      'conversation-1',
      f.guard,
      'read',
    );
  });
});
