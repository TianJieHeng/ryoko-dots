import { createHash } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { api, getAuthenticationGeneration } from '../src/client/api';
import {
  actIdentity,
  canonicalIdentity,
  exportIdentityMemory,
  identityDigest,
  identityPath,
  inspectIdentityOperation,
  presentIdentityReview,
  readIdentity,
  requireAccepted,
} from '../src/client/runtime/identity-client';
import { contractVersion } from '../src/shared/runtime/contracts';
import {
  agentSessionSchema,
  canUseIdentityMemory,
  identityMethods,
  identityReceiptSchema,
  legacyEnrollmentSchema,
  legacyMemoryInventorySchema,
  memoryStatusSchema,
  type IdentityAction,
} from '../src/shared/runtime/identity';
import {
  draftDefinition,
  parseEvaluationCases,
  parseWorkflowDefinition,
} from '../src/client/runtime/ReviewedLearning';
vi.mock('../src/client/api', () => ({
  api: vi.fn(),
  getAuthenticationGeneration: vi.fn(() => 1),
}));
const scope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'specialist-a',
  project: 'project-a',
  generation: 3,
};
const base = {
  version: contractVersion,
  scope,
  conversationId: 'conversation',
};
const operationId = '12345678-1234-4234-8234-123456789abc';
const record = {
  record_id: 'memory',
  version: 1,
  revision: 3,
  supersedes_version: null,
  owner_agent_id: scope.agent,
  owner_principal_id: 'owner',
  owner_profile_id: 'profile',
  namespace_id: 'namespace-a',
  target: 'memory',
  kind: 'stated_fact',
  content: 'Explicit fact',
  source_ref: 'owner:explicit',
  author: 'owner',
  created_at: 1,
  updated_at: 1,
  valid_from: 1,
  valid_to: null,
  confidence: null,
  validity: 'valid',
  scope: 'project:project-a',
  deletion_state: 'present',
  deleted_at: null,
};
let storage: Map<string, string>;
beforeEach(() => {
  vi.clearAllMocks();
  storage = new Map();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.mocked(getAuthenticationGeneration).mockReturnValue(1);
});
afterEach(() => vi.unstubAllGlobals());
function receipt(body: Record<string, unknown>, status = 'accepted') {
  return {
    ...base,
    operationId: body.operationId,
    intentDigest: body.intentDigest,
    status,
    result: { recorded: true },
    reason: 'Original receipt retained',
  };
}

describe('finite identity client and immutable recovery', () => {
  it('uses lexical canonical SHA of actual producer method and exact payload', async () => {
    const payload = { z: 'Béa', a: { z: 2, A: 3, a: 1 }, A: [1, 'ä'] };
    const canonical = canonicalIdentity({
      method: identityMethods['memory.write'],
      payload,
    });
    expect(canonical).toBe(
      '{"method":"runtime.memory.record.write","payload":{"A":[1,"ä"],"a":{"A":3,"a":1,"z":2},"z":"Béa"}}',
    );
    expect(
      await identityDigest({
        method: identityMethods['memory.write'],
        payload,
      }),
    ).toBe(createHash('sha256').update(canonical).digest('hex'));
  });
  it('rejects arbitrary route aliases and invalid JSON before dispatch', async () => {
    for (const action of [
      'runtime.shell.exec',
      'toString',
      '__proto__',
      '../memory.write',
    ])
      expect(() =>
        identityPath('conversation', action as IdentityAction),
      ).toThrow();
    for (const id of ['', '..', '.'])
      expect(() => identityPath(id, 'memory.write')).toThrow();
    expect(() => canonicalIdentity({ bad: NaN })).toThrow();
    expect(() => canonicalIdentity({ bad: undefined })).toThrow();
    await expect(
      readIdentity(scope, 'conversation', 'memory.write', {}, z.unknown()),
    ).rejects.toThrow('not a read');
    await expect(
      actIdentity(scope, 'conversation', 'memory.get', {}),
    ).rejects.toThrow('Read operations');
    expect(api).not.toHaveBeenCalled();
  });
  it('fences a read by exact owner agent project generation and conversation', async () => {
    vi.mocked(api).mockResolvedValue({ ...base, result: { count: 1 } });
    expect(
      await readIdentity(
        scope,
        'conversation',
        'workflows.list',
        { project_id: scope.project },
        z.strictObject({ count: z.number() }),
      ),
    ).toEqual({ count: 1 });
    expect(api).toHaveBeenLastCalledWith(
      '/runtime/conversations/conversation/identity/workflows.list',
      'POST',
      { payload: { project_id: 'project-a' }, projectId: 'project-a' },
      undefined,
    );
    for (const changed of [
      { ...base, scope: { ...scope, agent: 'specialist-b' } },
      { ...base, scope: { ...scope, project: 'project-b' } },
      { ...base, scope: { ...scope, generation: 4 } },
      { ...base, conversationId: 'other' },
    ]) {
      vi.mocked(api).mockResolvedValue({ ...changed, result: { count: 1 } });
      await expect(
        readIdentity(
          scope,
          'conversation',
          'workflows.list',
          {},
          z.object({ count: z.number() }),
        ),
      ).rejects.toThrow('another conversation');
    }
  });
  it('persists before first dispatch and only inspects the same operation after unknown outcome', async () => {
    let original: Record<string, unknown> = {};
    vi.mocked(api).mockImplementation(async (_path, method, body) => {
      expect(storage.size).toBe(1);
      if (method === 'POST') {
        original = body as Record<string, unknown>;
        return receipt(original, 'outcome_unknown');
      }
      return receipt(original, 'accepted');
    });
    const first = await actIdentity(scope, 'conversation', 'memory.write', {
      record_id: 'memory',
      expected_version: 0,
      content: 'A',
    });
    expect(first.status).toBe('outcome_unknown');
    expect(() => requireAccepted(first)).toThrow(first.operationId);
    const second = await actIdentity(scope, 'conversation', 'memory.write', {
      content: 'A',
      record_id: 'memory',
      expected_version: 0,
    });
    expect(second.operationId).toBe(first.operationId);
    expect(api).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api).mock.calls[1]).toEqual([
      `/runtime/operations/${first.operationId}`,
      'GET',
      undefined,
    ]);
    expect(original).toMatchObject({
      expectedGeneration: 3,
      projectId: 'project-a',
    });
  });
  it('never dispatches a recovery inspection without retained intent or durable storage', async () => {
    await expect(
      actIdentity(scope, 'conversation', 'workflows.accept', {}, true),
    ).rejects.toThrow('No original operation');
    expect(api).not.toHaveBeenCalled();
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('Storage disabled');
      },
    });
    await expect(
      actIdentity(scope, 'conversation', 'memory.write', {}),
    ).rejects.toThrow('Storage disabled');
    expect(api).not.toHaveBeenCalled();
  });
  it('rejects substituted operation receipt identity or digest', async () => {
    vi.mocked(api).mockImplementation(async (_path, _method, body) => ({
      ...receipt(body as Record<string, unknown>),
      intentDigest: '0'.repeat(64),
    }));
    await expect(
      actIdentity(scope, 'conversation', 'memory.delete', {
        record_id: 'memory',
        expected_version: 2,
      }),
    ).rejects.toThrow('original identity operation');
  });
  it('presents unchanged full review bytes with method and scope checks', async () => {
    const result = {
      expires_at: Date.now() / 1000 + 60,
      scope_json: '{"action":"approve"}',
      workflow: { definition_json: '<script>not executable</script>' },
    };
    const prepared = identityReceiptSchema.parse({
      ...base,
      operationId,
      intentDigest: 'a'.repeat(64),
      status: 'accepted',
      result,
      reason: 'Prepared',
    });
    const shown = {
      ...base,
      reviewOperationId: operationId,
      reviewDigest: await identityDigest(result),
      method: 'runtime.workflow.decision.prepare',
      result,
    };
    vi.mocked(api).mockResolvedValue(shown);
    expect(
      (
        await presentIdentityReview(
          scope,
          'conversation',
          prepared,
          'runtime.workflow.decision.prepare',
        )
      ).result,
    ).toEqual(result);
    vi.mocked(api).mockResolvedValue({
      ...shown,
      result: { ...result, scope_json: 'changed' },
    });
    await expect(
      presentIdentityReview(
        scope,
        'conversation',
        prepared,
        'runtime.workflow.decision.prepare',
      ),
    ).rejects.toThrow('differs');
    vi.mocked(api).mockResolvedValue({
      ...shown,
      method: 'runtime.specialist.preview',
    });
    await expect(
      presentIdentityReview(
        scope,
        'conversation',
        prepared,
        'runtime.workflow.decision.prepare',
      ),
    ).rejects.toThrow('differs');
  });
});

describe('assigned memory and frozen migration boundaries', () => {
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
  const status = memoryStatusSchema.parse({
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
  });
  it('only enables the real specialist backend and supported ready operations', () => {
    expect(canUseIdentityMemory(session, status, 'write')).toBe(true);
    for (const state of ['unconfigured', 'degraded', 'disabled'] as const)
      expect(
        canUseIdentityMemory(
          session,
          { ...status, health: { ...status.health, status: state } },
          'write',
        ),
      ).toBe(false);
    expect(
      canUseIdentityMemory(
        { ...session, role: 'primary', memory_backend: 'personal_mcp' },
        status,
        'delete',
      ),
    ).toBe(false);
    expect(
      canUseIdentityMemory({ ...session, role: 'child' }, status, 'write'),
    ).toBe(false);
    expect(
      canUseIdentityMemory(
        { ...session, authority_current: false },
        status,
        'export',
      ),
    ).toBe(false);
    expect(
      canUseIdentityMemory(
        session,
        { ...status, health: { ...status.health, supported_operations: [] } },
        'write',
      ),
    ).toBe(false);
    expect(
      agentSessionSchema.safeParse({ ...session, role: 'primary' }).success,
    ).toBe(false);
  });
  it('freezes opt-in evidence without inventing enrollment authority or conversation delivery consent', () => {
    const value = {
      version: contractVersion,
      scope,
      enrollments: [
        {
          evidence: {
            kind: 'conversation',
            id: 'old',
            dotId: 'dot',
            legacyContainerId: 'container',
            legacySkillDeliveryEnabled: null,
          },
          digest: 'a'.repeat(64),
          migrationState: 'review_required',
          enrollmentAuthorized: false,
        },
      ],
    };
    expect(
      legacyEnrollmentSchema.parse(value).enrollments[0].evidence
        .legacySkillDeliveryEnabled,
    ).toBeNull();
    expect(
      legacyEnrollmentSchema.safeParse({
        ...value,
        enrollments: [{ ...value.enrollments[0], enrollmentAuthorized: true }],
      }).success,
    ).toBe(false);
    expect(
      legacyMemoryInventorySchema.safeParse({
        version: contractVersion,
        scope,
        records: [],
        offset: 0,
        nextOffset: 0,
        hasMore: false,
        sourceCount: 0,
        inventoryComplete: true,
        personalHarnessDestinationSupported: true,
      }).success,
    ).toBe(false);
  });
  async function mockExport(records: unknown[], overrideDigest?: string) {
    const content = JSON.stringify({ revision: 3, records });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(content, {
            headers: {
              'Content-Type': 'application/json',
              'X-Content-SHA256':
                overrideDigest ??
                createHash('sha256').update(content).digest('hex'),
              'X-Memory-Revision': '3',
            },
          }),
      ),
    );
  }
  it('exposes only fully verified owned export bytes, including same-agent individual context', async () => {
    await mockExport([
      record,
      { ...record, record_id: 'individual', scope: 'individual' },
    ]);
    const result = await exportIdentityMemory(scope, 'conversation');
    expect(result.revision).toBe(3);
    expect(await result.blob.text()).toContain('Explicit fact');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('projectId=project-a'),
      expect.objectContaining({
        redirect: 'error',
        credentials: 'same-origin',
      }),
    );
  });
  it('rejects export with foreign memory, project, wrong digest or changed authentication', async () => {
    for (const row of [
      { ...record, owner_agent_id: 'specialist-b' },
      { ...record, scope: 'project:other' },
    ]) {
      await mockExport([row]);
      await expect(exportIdentityMemory(scope, 'conversation')).rejects.toThrow(
        'another agent',
      );
    }
    await mockExport([record], '0'.repeat(64));
    await expect(exportIdentityMemory(scope, 'conversation')).rejects.toThrow(
      'digest mismatch',
    );
    await mockExport([record]);
    vi.mocked(getAuthenticationGeneration)
      .mockReturnValueOnce(1)
      .mockReturnValue(2);
    await expect(exportIdentityMemory(scope, 'conversation')).rejects.toThrow(
      'authority changed',
    );
  });
});

describe('finite explicit workflow composition', () => {
  it('retains exact manual provenance and no hidden enrollment in the draft', () => {
    const value = draftDefinition('project-a');
    expect(
      JSON.parse(parseWorkflowDefinition(JSON.stringify(value), 'project-a')),
    ).toEqual(value);
    expect(value.provenance).toEqual({
      kind: 'manual',
      source_refs: [],
      private_derived: false,
    });
    expect(() =>
      parseWorkflowDefinition(JSON.stringify(value), 'project-b'),
    ).toThrow();
    expect(() =>
      parseWorkflowDefinition(
        JSON.stringify({ ...value, steps: [{ kind: 'shell', command: 'id' }] }),
        'project-a',
      ),
    ).toThrow();
    expect(() =>
      parseWorkflowDefinition(
        JSON.stringify({ ...value, capability_requirements: ['browser'] }),
        'project-a',
      ),
    ).toThrow();
    expect(() =>
      parseWorkflowDefinition(
        JSON.stringify({
          ...value,
          provenance: {
            kind: 'demonstration',
            source_refs: [],
            private_derived: true,
          },
        }),
        'project-a',
      ),
    ).toThrow('consent_ref');
  });
  it('requires 4–16 varied explicit tuning/holdout cases with real baseline references', () => {
    const cases = Array.from({ length: 4 }, (_, i) => ({
      case_id: `case-${i}`,
      split: i < 2 ? 'tuning' : 'held_out',
      parameters: { topic: `Topic ${i}` },
      expected_sha256: 'a'.repeat(64),
      generalist_ref: {
        artifact_id: `baseline-${i}`,
        version: 1,
        sha256: 'b'.repeat(64),
      },
    }));
    expect(JSON.parse(parseEvaluationCases(JSON.stringify(cases)))).toEqual(
      cases,
    );
    expect(() =>
      parseEvaluationCases(JSON.stringify(cases.slice(0, 3))),
    ).toThrow();
    expect(() =>
      parseEvaluationCases(
        JSON.stringify(cases.map((row) => ({ ...row, split: 'tuning' }))),
      ),
    ).toThrow('held-out');
    expect(() =>
      parseEvaluationCases(
        JSON.stringify(
          cases.map((row) => ({ ...row, parameters: { topic: 'same' } })),
        ),
      ),
    ).toThrow('varied');
    expect(() =>
      parseEvaluationCases(
        JSON.stringify(cases.map(({ generalist_ref: _ref, ...row }) => row)),
      ),
    ).toThrow();
  });
});

it('inspects a durable original ID without re-dispatch and rejects a foreign binding', async () => {
  const original = {
    ...base,
    operationId,
    intentDigest: 'a'.repeat(64),
    status: 'outcome_unknown',
    result: null,
    reason: 'Original outcome unknown',
  };
  vi.mocked(api).mockResolvedValue(original);
  expect(
    (await inspectIdentityOperation(scope, 'conversation', operationId)).status,
  ).toBe('outcome_unknown');
  expect(api).toHaveBeenLastCalledWith(`/runtime/operations/${operationId}`);
  vi.mocked(api).mockResolvedValue({
    ...original,
    scope: { ...scope, agent: 'other' },
  });
  await expect(
    inspectIdentityOperation(scope, 'conversation', operationId),
  ).rejects.toThrow('another conversation');
});

it('a lost mutation response includes its durable original ID for recovery after reload', async () => {
  vi.mocked(api).mockRejectedValue(new Error('Connection lost'));
  await expect(
    actIdentity(scope, 'conversation', 'memory.write', {
      record_id: 'lost',
      content: 'fact',
      expected_version: 0,
    }),
  ).rejects.toThrow('Original operation:');
  expect(storage.size).toBe(1);
});
