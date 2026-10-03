import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryLearning } from '../src/client/runtime/MemoryLearning';
import { ScopedMemory } from '../src/client/runtime/ScopedMemory';
import { ReviewedLearning } from '../src/client/runtime/ReviewedLearning';
import { NamedSpecialists } from '../src/client/runtime/NamedSpecialists';
import {
  IdentityReviewCard,
  canCommitIdentityReview,
  identityReviewAction,
} from '../src/client/runtime/IdentityReview';
import { LegacyMemoryInventory } from '../src/client/runtime/LegacyMemoryInventory';
import { WorkspaceDialog } from '../src/client/WorkspaceDialog';
import { useIdentityResource } from '../src/client/runtime/use-identity-resource';
import { useResource } from '../src/client/runtime/use-resource';
import {
  canUse,
  contractVersion,
  featureNames,
  setupSchema,
} from '../src/shared/runtime/contracts';
import {
  agentSessionSchema,
  type IdentityReview,
} from '../src/shared/runtime/identity';
import type { RuntimeReview } from '../src/shared/runtime/reviews';
import type { RuntimeConnection } from '../src/client/runtime/use-runtime';
vi.mock('../src/client/runtime/use-identity-resource', () => ({
  useIdentityResource: vi.fn(),
}));
vi.mock('../src/client/runtime/use-resource', () => ({ useResource: vi.fn() }));
vi.mock('../src/client/runtime/ChannelsPanel', () => ({
  ChannelsPanel: () => null,
}));
vi.mock('../src/client/runtime/MigrationStatus', () => ({
  MigrationStatus: () => null,
}));
const scope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'stable-agent',
  project: 'project-a',
  generation: 3,
};
const ready = { state: 'ready', reason: '' };
const setup = setupSchema.parse({
  version: contractVersion,
  runtimeOwner: 'ryoko',
  scope: { ...scope, project: null },
  qualified: true,
  controlPlane: ready,
  binding: ready,
  compatibility: ready,
  features: Object.fromEntries(featureNames.map((name) => [name, ready])),
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
const session = agentSessionSchema.parse({
  agent_id: scope.agent,
  role: 'specialist',
  memory_backend: 'builtin',
  active_configuration_revision: 1,
  desired_configuration_revision: 2,
  archived: false,
  authority_revocation_revision: 0,
  authority_current: true,
  revocation_code: null,
  startup_frozen: true,
  active_workflows: [],
  desired_workflows: [],
  activation: 'next_session',
  execution_authority: false,
});
const status = {
  capabilities: {
    backend: 'builtin',
    recall: true,
    write: true,
    supersede: true,
    delete: true,
    export: true,
    session_ingest: false,
  },
  health: {
    backend: 'builtin',
    status: 'ready',
    reason_code: null,
    supported_operations: ['recall', 'write', 'delete', 'export'],
  },
};
const run = vi.fn();
const now = Date.now();
const review: IdentityReview = {
  version: contractVersion,
  scope,
  conversationId: 'chat',
  reviewOperationId: '12345678-1234-4234-8234-123456789abc',
  reviewDigest: 'a'.repeat(64),
  method: 'runtime.workflow.decision.prepare',
  result: {
    expires_at: now / 1000 + 60,
    scope_json: '{"action":"approve"}',
    workflow: {
      workflow_id: 'draft',
      version: 2,
      definition_json:
        '<script>external content</script>\n[link](https://untrusted.test)',
    },
  },
};
let responses: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  responses = { 'memory.status': status };
  vi.mocked(useIdentityResource).mockImplementation(
    (_scope, _id, action, _payload, _schema, enabled) => ({
      key: 'test',
      data: enabled ? responses[action] : undefined,
      error: '',
      loading: false,
      reload: vi.fn(async () => {}),
    }),
  );
  vi.mocked(useResource).mockReturnValue({
    key: 'test',
    data: undefined,
    error: '',
    loading: false,
    reload: vi.fn(async () => {}),
  });
});

describe('visible scoped capabilities and truthful unavailable states', () => {
  it('keeps the entire feature discoverable when configuration is absent', () => {
    const html = renderToStaticMarkup(
      <MemoryLearning
        connection={{
          ...connection,
          setup: undefined,
          state: 'unsupported',
          available: () => false,
        }}
      />,
    );
    for (const label of [
      'Assigned memory',
      'Reviewed Learning',
      'Named specialist handoff',
      'No personal-memory fallback',
      'Frozen legacy enrollment evidence',
    ])
      expect(html).toContain(label);
    expect(html).not.toContain('Automatically enroll');
    expect(run).not.toHaveBeenCalled();
  });
  it('never shows primary mutation/export controls even if capability flags are permissive', () => {
    responses['memory.status'] = {
      ...status,
      capabilities: { ...status.capabilities, backend: 'personal_mcp' },
      health: {
        ...status.health,
        backend: 'personal_mcp',
        status: 'unconfigured',
        reason_code: 'personal_harness_unconfigured',
      },
    };
    const html = renderToStaticMarkup(
      <ScopedMemory
        scope={scope}
        conversationId="chat"
        session={{
          ...session,
          role: 'primary',
          memory_backend: 'personal_mcp',
        }}
        ready
        busy={false}
        run={run}
      />,
    );
    expect(html).toContain('personal_harness_unconfigured');
    expect(html).toContain('no supported owner record mutation');
    for (const label of [
      'Save to this specialist',
      'Delete exact version',
      'Download verified scoped export',
    ])
      expect(html).not.toContain(label);
    expect(html).toContain('never redirect');
  });
  it('shows real specialist CAS controls with isolated backend context', () => {
    responses['memory.list'] = {
      revision: 2,
      records: [],
      offset: 0,
      next_offset: 0,
      total: 0,
      has_more: false,
    };
    const html = renderToStaticMarkup(
      <ScopedMemory
        scope={scope}
        conversationId="chat"
        session={session}
        ready
        busy={false}
        run={run}
      />,
    );
    for (const text of [
      'stable-agent',
      'project-a',
      'Record ID',
      'Save to this specialist',
      'Download verified scoped export',
      'Snapshot revision',
    ])
      expect(html).toContain(text);
  });
  it('keeps finite draft/evidence controls visible but disabled before a qualified connection', () => {
    const html = renderToStaticMarkup(
      <ReviewedLearning
        scope={scope}
        conversationId="chat"
        ready={false}
        busy={false}
        run={run}
      />,
    );
    for (const text of [
      'Explicit evidence anchors',
      'Record this explicit source',
      'Finite workflow definition JSON',
      'Create this draft version',
      'Create template version',
      'private transcripts are never enrolled automatically',
    ])
      expect(html).toContain(text);
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(4);
    expect(run).not.toHaveBeenCalled();
  });
  it('named handoff shows explicit bounded context and never claims completed work from admission', () => {
    const html = renderToStaticMarkup(
      <NamedSpecialists
        scope={scope}
        conversationId="chat"
        ready={false}
        busy={false}
        run={run}
      />,
    );
    for (const text of [
      'Explicit objective',
      'Artifact references JSON',
      'Evidence references JSON',
      'Prepare named handoff review',
      'Original handoff command ID',
      'Broader teams',
    ])
      expect(html).toContain(text);
    expect(html).not.toContain('Task completed');
    expect(html).not.toContain('Share personal memory');
  });
  it('renders legacy original content escaped and read-only with no migration action', () => {
    vi.mocked(useResource).mockReturnValue({
      key: 'legacy',
      loading: false,
      error: '',
      reload: vi.fn(),
      data: {
        version: contractVersion,
        scope,
        records: [
          {
            id: 'old',
            sourceRef: 'legacy-memory:old',
            contentDigest: 'a'.repeat(64),
            byteCount: 20,
            createdAt: 1,
            content: '<script>secret</script>',
            unavailableReason: null,
            migrationState: 'review_required',
            enrollmentAuthorized: false,
          },
        ],
        offset: 0,
        nextOffset: 1,
        hasMore: false,
        sourceCount: 1,
        inventoryComplete: true,
        personalHarnessDestinationSupported: false,
      },
    } as never);
    const html = renderToStaticMarkup(
      <LegacyMemoryInventory connection={connection} dotId="dot" />,
    );
    expect(html).toContain('&lt;script&gt;secret&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('read-only migration evidence');
    expect(html).toContain('not a supported migration destination');
  });
});

describe('exact immutable reviews and independent publication', () => {
  it('renders complete review data as escaped text and requires affirmative content review', () => {
    const html = renderToStaticMarkup(
      <IdentityReviewCard
        review={review}
        scope={scope}
        busy={false}
        run={run}
        onComplete={() => {}}
      />,
    );
    expect(html).toContain('&lt;script&gt;external content&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a ');
    for (const text of [
      review.reviewDigest,
      'Original operation',
      'Accept exact workflow decision',
      'Decline and cancel this preparation',
      'I reviewed the exact target',
    ])
      expect(html).toContain(text);
    expect(html.match(/<button disabled=""/g)).toHaveLength(2);
  });
  it('rejects expired, foreign agent, revoked-generation and wrong-project reviews', () => {
    expect(canCommitIdentityReview(review, scope, [], now)).toBe(true);
    expect(
      canCommitIdentityReview(
        { ...review, result: { expires_at: now / 1000 } },
        scope,
        [],
        now,
      ),
    ).toBe(false);
    for (const changed of [
      { ...scope, agent: 'other' },
      { ...scope, project: 'other' },
      { ...scope, generation: 4 },
    ])
      expect(canCommitIdentityReview(review, changed, [], now)).toBe(false);
    expect(canCommitIdentityReview(review, scope, [], NaN)).toBe(false);
  });
  it('maps acceptance, denial preparation, pinned delivery and named handoff to real methods', () => {
    expect(identityReviewAction(review)).toBe('workflows.accept');
    expect(
      identityReviewAction({
        ...review,
        method: 'runtime.workflow.delivery.prepare',
      }),
    ).toBe('workflows.deliver.commit');
    expect(
      identityReviewAction({ ...review, method: 'runtime.specialist.preview' }),
    ).toBe('specialists.handoff');
    expect(
      identityReviewAction({
        ...review,
        method: 'runtime.workflow.run.prepare',
      }),
    ).toBe('workflows.publish');
  });
  it('requires every full proposal review, never metadata or hashes alone', () => {
    const proposal = {
      artifact_id: 'a',
      version: 1,
      sha256: 'b'.repeat(64),
      size: 12,
      mime: 'text/plain',
      approval_id: 'approval',
      approval_digest: 'c'.repeat(64),
      expires_at: now / 1000 + 60,
    };
    const prepared: IdentityReview = {
      ...review,
      method: 'runtime.workflow.run.prepare',
      result: {
        workflow_run_id: 'run',
        pin_json: '{}',
        proposals: [proposal],
        publication_atomic: false,
      },
    };
    const exact: RuntimeReview = {
      id: 'approval',
      scope,
      revision: 1,
      approvalDigest: proposal.approval_digest,
      actionDigest: 'd'.repeat(64),
      target: 'project-a/a/v1',
      action: 'Publish exact output',
      content: 'Full exact text',
      expiresAt: now + 60000,
      status: 'pending',
    };
    expect(canCommitIdentityReview(prepared, scope, [], now)).toBe(false);
    expect(canCommitIdentityReview(prepared, scope, [exact], now)).toBe(true);
    expect(
      canCommitIdentityReview(
        prepared,
        scope,
        [{ ...exact, approvalDigest: '0'.repeat(64) }],
        now,
      ),
    ).toBe(false);
    expect(
      canCommitIdentityReview(
        prepared,
        scope,
        [{ ...exact, status: 'denied' }],
        now,
      ),
    ).toBe(false);
    expect(
      canCommitIdentityReview(
        {
          ...prepared,
          result: {
            ...prepared.result,
            proposals: [proposal, { ...proposal, approval_id: 'manifest' }],
          },
        },
        scope,
        [exact],
        now,
      ),
    ).toBe(false);
    const html = renderToStaticMarkup(
      <IdentityReviewCard
        review={prepared}
        scope={scope}
        busy={false}
        run={run}
        onComplete={() => {}}
      />,
    );
    expect(html).toContain('full prepared bytes');
    expect(html).toContain('non-atomic');
    expect(html).toContain('does not complete the mission');
    expect(html).toContain('missing full output bytes');
    expect(html).toContain('disabled=""');
  });
  it('delivery clearly describes next-session pins and no memory or execution sharing', () => {
    const html = renderToStaticMarkup(
      <IdentityReviewCard
        review={{ ...review, method: 'runtime.workflow.delivery.prepare' }}
        scope={scope}
        busy={false}
        run={run}
        onComplete={() => {}}
      />,
    );
    expect(html).toContain('next session');
    expect(html).toContain('no execution authority');
    expect(html).toContain('shares no personal memory');
    expect(html).toContain('earlier previously delivered approved version');
  });
});

it('Dot settings keep stable authority read-only and copy only verified specialists', () => {
  const dot = {
    id: 'dot',
    spaceId: 'space',
    spaceIds: ['space'],
    name: 'Primary-looking display name',
    instructions: 'Instructions',
    researchAllowed: true,
    memoryAllowed: true,
    createdAt: 1,
  };
  const state = {
    settings: {
      name: 'dot',
      paused: false,
      researchAllowed: true,
      memoryAllowed: true,
    },
    tasks: [],
    memories: [],
    mode: 'live' as const,
    configured: true,
  };
  const workspace = {
    spaces: [{ id: 'space', name: 'Space', description: '', createdAt: 1 }],
    dots: [dot],
    conversations: [],
    setup: {
      intelligence: false,
      model: true,
      browser: false,
      voice: false,
      slack: '',
      missing: [],
    },
    calls: [],
  };
  const specialist = {
    id: 'stable-agent',
    dotId: 'dot',
    name: dot.name,
    instructions: dot.instructions,
    revision: 2,
    role: 'specialist' as const,
    memoryBackend: 'built_in' as const,
    memoryEnabled: true,
    researchAllowed: true,
    spaceIds: ['space'],
    defaultSpaceId: 'space',
  };
  const html = renderToStaticMarkup(
    <WorkspaceDialog
      dialog={{ type: 'dot', dot, spaceId: 'space' }}
      state={state}
      workspace={workspace}
      onClose={() => {}}
      mutate={async () => true}
      runtime={connection}
      specialist={specialist}
    />,
  );
  expect(html).toContain('stable-agent');
  expect(html).toContain('isolated memory namespace');
  expect(html).toContain('no memories are copied');
  expect(html).not.toContain('name="role"');
  expect(html).not.toContain('name="backend"');
  const primary = renderToStaticMarkup(
    <WorkspaceDialog
      dialog={{ type: 'dot', dot, spaceId: 'space' }}
      state={state}
      workspace={workspace}
      onClose={() => {}}
      mutate={async () => true}
      runtime={connection}
      specialist={{
        ...specialist,
        role: 'primary',
        memoryBackend: 'personal_harness',
      }}
    />,
  );
  expect(primary).not.toContain('Create a distinct specialist copy');
});
