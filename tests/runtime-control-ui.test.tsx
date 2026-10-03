import { createHash } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MissionsPanel } from '../src/client/runtime/MissionsPanel';
import {
  MissionDetail,
  DeliveryDetail,
  ReviewDetail,
} from '../src/client/runtime/MissionDetails';
import { useResource } from '../src/client/runtime/use-resource';
import { runtimeAction } from '../src/client/runtime/actions';
import { api } from '../src/client/api';
import {
  conversationRuntimePath,
  forConversation,
  runtimeControlSchema,
  runtimeMissionsSchema,
  runtimeMissionSchema,
  runtimeExactReviewSchema,
  runtimeDeliverySchema,
} from '../src/client/runtime/control-contracts';
import {
  contractVersion,
  featureNames,
  setupSchema,
  canUse,
} from '../src/shared/runtime/contracts';
import type { RuntimeConnection } from '../src/client/runtime/use-runtime';

vi.mock('../src/client/api', () => ({ api: vi.fn() }));
vi.mock('../src/client/runtime/use-resource', () => ({ useResource: vi.fn() }));
vi.mock('../src/client/runtime/SchedulesPanel', () => ({
  SchedulesPanel: () => null,
}));
const scope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'agent',
  project: null,
  generation: 1,
};
const ready = { state: 'ready', reason: '' };
const setup = setupSchema.parse({
  version: contractVersion,
  runtimeOwner: 'ryoko',
  scope,
  qualified: true,
  controlPlane: ready,
  binding: ready,
  compatibility: ready,
  features: Object.fromEntries(
    featureNames.map((name) => [
      name,
      name === 'slack'
        ? { state: 'unsupported', reason: 'No Slack adapter' }
        : ready,
    ]),
  ),
});
const connection: RuntimeConnection = {
  selector: 'dot',
  setup,
  state: 'ready',
  error: '',
  reload: vi.fn(),
  connect: vi.fn(async () => setup),
  available: (feature) => canUse(setup, feature),
};
const base = { version: contractVersion, scope, conversationId: 'chat' };
const control = {
  ...base,
  control: {
    revision: 2,
    paused: true,
    updated_at: 1,
    scope: 'owner_profile',
    admission_blocked: true,
    scheduled_dispatch_blocked: true,
    in_flight_dispatch: 'blocked_at_next_boundary',
    accepted_commands: 2,
    claimed_commands: 1,
    accepted_work_retained: true,
    already_dispatched_may_complete: true,
    provider_cancelled: false,
    remote_effects_undone: false,
  },
  operation: null,
  dispatch_performed: false,
};
const mission = runtimeMissionSchema.parse({
  mission_id: 'mission',
  session_id: 'chat',
  agent_id: 'agent',
  revision: 4,
  outcome: 'Finish exact report',
  state: 'working',
  execution_status: 'running',
  acceptance_status: 'unverified',
  delivery_status: 'pending',
  next_step: 'Review sources',
  blockers: ['Missing source'],
  artifact_refs: [
    { artifact_id: 'artifact', version: 3, digest: 'a'.repeat(64) },
  ],
  effect_refs: [{ effect_id: 'effect', state: 'outcome_unknown' }],
  delivery_refs: [{ delivery_id: 'delivery', state: 'partial' }],
  effect_refs_truncated: false,
  delivery_refs_truncated: false,
  verification_current: false,
  last_run_id: 'run',
  paused_reason: null,
  recovery_choices: [],
  deliverables: [
    {
      deliverable_id: 'required',
      description: 'Final report',
      artifact_ref: null,
      required: true,
    },
  ],
  plan_steps: [
    {
      step_id: 'check',
      description: 'Check facts',
      status: 'pending',
      checkpoint: true,
    },
  ],
  archived: false,
});
const approval = {
  approval_id: 'review',
  run_id: 'run',
  approval_digest: 'a'.repeat(64),
  action_digest: 'b'.repeat(64),
  mission_id: null,
  mission_revision: null,
  status: 'pending',
  expires_at: (Date.now() + 60000) / 1000,
  expired: false,
};
const exact = {
  ...base,
  review: {
    id: 'review',
    revision: 0,
    approvalDigest: approval.approval_digest,
    actionDigest: approval.action_digest,
    scope,
    target: 'Exact target',
    action: 'Publish',
    content: '<script>untrusted</script>',
    expiresAt: approval.expires_at * 1000,
    status: 'pending',
  },
  detail: {
    approval,
    detail: {
      reviewable: true,
      unavailable_reason: null,
      review_digest: 'c'.repeat(64),
    },
    input_revision: 'input',
    artifact_revision: 'artifact',
    dispatch_performed: false,
  },
};
const delivery = {
  ...base,
  delivery: {
    delivery_id: 'delivery',
    artifact_id: 'artifact',
    version: 3,
    sha256: 'a'.repeat(64),
    destination: {
      kind: 'local_runtime',
      session_id: 'chat',
      principal_id: 'principal',
      profile_id: 'profile',
      agent_id: 'agent',
    },
    state: 'outcome_unknown',
    acknowledgment_level: 'transport_accepted',
    components: { text: 'not_sent', artifact: 'not_sent' },
    platform_ids: [],
    attempt_count: 1,
    max_attempts: 3,
    next_attempt_at: null,
    deadline_at: 1000,
    retention_until: 2000,
    last_error: null,
    result_available: true,
  },
};
const resource = (data?: unknown) => ({
  key: 'test',
  data,
  error: '',
  loading: false,
  reload: vi.fn(async () => {}),
});
beforeEach(() => {
  vi.mocked(useResource).mockReset();
  vi.mocked(useResource).mockReturnValue(
    resource() as ReturnType<typeof useResource>,
  );
  vi.mocked(api).mockReset();
  vi.mocked(connection.connect).mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('conversation-scoped runtime control UI', () => {
  it('requires explicit selected connection even when another conversation qualified the feature', () => {
    const html = renderToStaticMarkup(
      <MissionsPanel
        connection={connection}
        conversationId="chat"
        conversations={[{ id: 'chat', title: 'Selected chat' }]}
        onConversationChange={() => {}}
      />,
    );
    expect(html).toContain('Connect selected conversation');
    expect(connection.connect).not.toHaveBeenCalled();
    expect(vi.mocked(useResource).mock.calls).toHaveLength(4);
    for (const args of vi.mocked(useResource).mock.calls) {
      expect(args[0]).toMatch(/^\/runtime\/conversations\/chat\//);
      expect(args[4]).toBe(false);
    }
    expect(html).not.toContain('Pause acknowledged');
  });
  it('does not read an absent or foreign selected conversation', () => {
    const html = renderToStaticMarkup(
      <MissionsPanel
        connection={connection}
        conversationId="foreign"
        conversations={[{ id: 'chat', title: 'Selected chat' }]}
        onConversationChange={() => {}}
      />,
    );
    expect(html).toContain('Choose an existing conversation');
    expect(useResource).not.toHaveBeenCalled();
  });
  it('accepts native control/mission states without inventing output verification', () => {
    expect(runtimeControlSchema.parse(control).control.provider_cancelled).toBe(
      false,
    );
    const parsed = runtimeMissionsSchema.parse({
      ...base,
      missions: [mission],
      limit: 100,
      limit_reached: false,
      complete: false,
    });
    const html = renderToStaticMarkup(
      <MissionDetail
        mission={parsed.missions[0]}
        busy={false}
        run={async () => {}}
        inspectDelivery={() => {}}
      />,
    );
    for (const value of [
      'unverified',
      'Verification evidence:',
      'not current',
      'Missing source',
      'Final report',
      'Check facts',
      'outcome unknown',
      'Inspect delivery',
    ])
      expect(html).toContain(value);
    expect(html).not.toContain('Start a new run');
    expect(html).not.toContain('Retry delivery only');
    expect(html).toContain('Request mission cancellation');
    const archived = renderToStaticMarkup(
      <MissionDetail
        mission={{ ...mission, archived: true }}
        busy={false}
        run={async () => {}}
        inspectDelivery={() => {}}
      />,
    );
    expect(archived).not.toContain('Request mission cancellation');
  });
  it('shows only exact review GET material, escaped, and suppresses unavailable approvals', () => {
    vi.mocked(useResource).mockReturnValue(
      resource(runtimeExactReviewSchema.parse(exact)) as ReturnType<
        typeof useResource
      >,
    );
    let html = renderToStaticMarkup(
      <ReviewDetail
        conversationId="chat"
        reviewId="review"
        connection={connection}
        busy={false}
        run={async () => {}}
      />,
    );
    expect(vi.mocked(useResource).mock.calls[0][0]).toBe(
      '/runtime/conversations/chat/reviews/review',
    );
    expect(html).toContain('Approve once');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    vi.mocked(useResource).mockReturnValue(
      resource({
        ...exact,
        review: null,
        detail: {
          ...exact.detail,
          detail: {
            reviewable: false,
            unavailable_reason: 'opaque_content',
            review_digest: null,
          },
        },
      }) as ReturnType<typeof useResource>,
    );
    html = renderToStaticMarkup(
      <ReviewDetail
        conversationId="chat"
        reviewId="review"
        connection={connection}
        busy={false}
        run={async () => {}}
      />,
    );
    expect(html).toContain('opaque content');
    expect(html).not.toContain('Approve once');
  });
  it('inspects local delivery independently of Slack without offering unqualified retry', () => {
    vi.mocked(useResource).mockReturnValue(
      resource(runtimeDeliverySchema.parse(delivery)) as ReturnType<
        typeof useResource
      >,
    );
    const html = renderToStaticMarkup(
      <DeliveryDetail
        conversationId="chat"
        deliveryId="delivery"
        connection={connection}
      />,
    );
    expect(vi.mocked(useResource).mock.calls[0][0]).toBe(
      '/runtime/conversations/chat/deliveries/delivery',
    );
    expect(vi.mocked(useResource).mock.calls[0][3]).toBe('missions');
    expect(html).toContain('outcome unknown');
    expect(html).toContain('transport accepted');
    expect(html).toContain('Text:');
    expect(html).toContain('not sent');
    expect(html).toContain('Open its command under Immutable command results');
    expect(html).not.toContain('Retry delivery of this output');
  });
});

describe('scoped control protocol validation', () => {
  it('binds envelopes and target paths to the selected conversation', () => {
    expect(
      forConversation(runtimeControlSchema, 'chat').parse(control),
    ).toBeDefined();
    expect(() =>
      forConversation(runtimeControlSchema, 'other').parse(control),
    ).toThrow('another conversation');
    expect(
      conversationRuntimePath('chat / one', 'reviews/review%20one/decision'),
    ).toBe(
      '/runtime/conversations/chat%20%2F%20one/reviews/review%20one/decision',
    );
    for (const suffix of [
      'control/anything',
      'reviews/../decision',
      'reviews/%2e%2e/decision',
      'reviews/r?evil/decision',
      'missions/m/decision',
    ])
      expect(() => conversationRuntimePath('chat', suffix)).toThrow();
    expect(() => conversationRuntimePath('..', 'control')).toThrow();
    expect(() =>
      runtimeExactReviewSchema.parse({
        ...exact,
        review: { ...exact.review, id: 'different' },
      }),
    ).toThrow('identity');
  });
  it('hashes full conversation paths and recovers unknown operations only by their original GET', async () => {
    const saved = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    });
    vi.mocked(api).mockRejectedValue(new Error('lost receipt'));
    const path = conversationRuntimePath('chat', 'reviews/review/decision');
    const payload = { approvalDigest: 'a'.repeat(64), choice: 'once' };
    await expect(
      runtimeAction(scope, path, 'approval.resolve', payload, 0),
    ).rejects.toThrow('lost receipt');
    const [sentPath, method, body] = vi.mocked(api).mock.calls[0];
    expect(sentPath).toBe(path);
    expect(method).toBe('POST');
    const canonical = {
      action: 'approval.resolve',
      expectedRevision: 0,
      path,
      payload,
    };
    const expectedDigest = createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex');
    expect(body).toMatchObject({
      intentDigest: expectedDigest,
      expectedGeneration: 1,
    });
    await expect(
      runtimeAction(scope, path, 'approval.resolve', payload, 0, true),
    ).rejects.toThrow();
    expect(vi.mocked(api).mock.calls[1][0]).toMatch(/^\/runtime\/operations\//);
    expect(vi.mocked(api).mock.calls[1][1]).toBe('GET');
    await expect(
      runtimeAction(
        scope,
        conversationRuntimePath('other', 'reviews/review/decision'),
        'approval.resolve',
        payload,
        0,
      ),
    ).rejects.toThrow();
    expect(vi.mocked(api).mock.calls[2][1]).toBe('POST');
    expect(vi.mocked(api).mock.calls[2][2]).not.toMatchObject({
      intentDigest: expectedDigest,
    });
  });
});
