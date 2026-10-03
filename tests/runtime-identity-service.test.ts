import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import {
  IdentitySkillService,
  BE06_PRODUCER_COMMIT,
  be06IntentDigest,
  be06Digest,
  type Be06Binding,
  type Be06Transport,
  type OperationInput,
} from '../src/server/runtime/be06-service.js';
import {
  be06Methods,
  validateBe06Wire,
  type Be06Method,
} from '../src/server/runtime/be06-wire.js';
import {
  freezeLegacyEnrollment,
  inventoryLegacyEnrollment,
  legacyPreferenceInjection,
  frozenLegacyMemoryInventory,
} from '../src/server/runtime/be06-migration.js';

const clean: (() => void)[] = [];
afterEach(() =>
  clean
    .splice(0)
    .reverse()
    .forEach((fn) => fn()),
);
const digest = 'a'.repeat(64);
const noop = () => {};
function fixture(specialist = false) {
  const dir = mkdtempSync(join(tmpdir(), 'be06-'));
  clean.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'db.sqlite');
  const binding: Be06Binding = {
    ownerId: 'owner',
    conversationId: 'thread',
    dotId: 'dot',
    principalId: 'principal',
    profileId: 'profile',
    agentId: specialist ? 'researcher' : 'primary',
    primaryAgentId: 'primary',
    role: specialist ? 'specialist' : 'primary',
    memoryBackend: specialist ? 'builtin' : 'personal_mcp',
    namespaceId: specialist ? 'namespace-researcher' : null,
    profileHomeDigest: digest,
    policyDigest: digest,
    configDigest: digest,
    projectId: 'project',
    authorityRevision: 1,
    liveSessionId: 'live',
    durableSessionId: 'durable',
    epoch: 1,
  };
  let active = true;
  const calls: { method: Be06Method; params: Record<string, unknown> }[] = [];
  let answer: (
    method: Be06Method,
    params: Record<string, unknown>,
  ) => unknown | Promise<unknown> = () => {
    throw new Error('Unconfigured fixture');
  };
  const transport: Be06Transport = {
    connected: true,
    epoch: 1,
    be06Qualification: {
      producerCommit: BE06_PRODUCER_COMMIT,
      methods: be06Methods,
      specialistSessions: true,
    },
    call: async (method, params) => {
      calls.push({
        method,
        params: params as unknown as Record<string, unknown>,
      });
      return (await answer(
        method,
        params as unknown as Record<string, unknown>,
      )) as never;
    },
  };
  const factory = () => {
    const service = new IdentitySkillService(
      'owner',
      path,
      transport,
      async (thread, auth) => {
        auth();
        if (thread !== binding.conversationId) throw new Error('Forbidden');
        return binding;
      },
      (b, auth) => {
        auth();
        if (!active || b.authorityRevision !== binding.authorityRevision)
          throw new Error('Revoked');
      },
    );
    clean.push(() => service.close());
    return service;
  };
  const service = factory();
  return {
    binding,
    path,
    calls,
    transport,
    service,
    factory,
    answer: (fn: typeof answer) => {
      answer = fn;
    },
    revoke: () => {
      active = false;
    },
  };
}
function op(
  method: Be06Method,
  payload: unknown,
  operationId = randomUUID(),
): OperationInput {
  return {
    operationId,
    intentDigest: be06IntentDigest(method, payload),
    expectedGeneration: 1,
  };
}
function agent(id = 'researcher', primary = false) {
  return {
    agent_id: id,
    role: primary ? 'primary' : 'specialist',
    memory_backend: primary ? 'personal_mcp' : 'builtin',
    builtin_memory_namespace: primary ? null : `namespace-${id}`,
    config: {
      name: 'Primary',
      instructions: '',
      research_allowed: true,
      memory_allowed: true,
      project_grants: ['project'],
      default_project_id: 'project',
    },
    revision: 1,
    archived: false,
    active_session_revision: null,
    authority_revocation_revision: 0,
    active_session_revision_revoked: false,
    activation: 'next_session',
    personal_memory_mutation_supported: false,
  };
}
function memory(recordId = 'note') {
  return {
    record_id: recordId,
    version: 1,
    revision: 1,
    supersedes_version: null,
    owner_agent_id: 'researcher',
    owner_principal_id: 'principal',
    owner_profile_id: 'profile',
    namespace_id: 'namespace-researcher',
    target: 'memory',
    kind: 'stated_fact',
    content: 'Reviewed fact',
    source_ref: 'manual',
    author: 'owner',
    created_at: 1,
    updated_at: 1,
    valid_from: 1,
    valid_to: null,
    confidence: null,
    validity: 'valid',
    scope: 'individual',
    deletion_state: 'present',
    deleted_at: null,
    superseded_by_version: null,
  };
}
function workflow(version = 1) {
  const definition = JSON.stringify({
    project_id: 'project',
    workflow_id: 'workflow',
    version,
  });
  return {
    workflow_id: 'workflow',
    project_id: 'project',
    version,
    sha256: createHash('sha256').update(definition).digest('hex'),
    definition_json: definition,
    state: 'approved',
    revision: 2,
    evaluation_ref: 'evaluation',
    active_version: version,
    head_revision: 1,
  };
}
const status = {
  capabilities: {
    backend: 'personal_mcp',
    recall: false,
    write: false,
    supersede: false,
    delete: false,
    export: false,
    session_ingest: false,
  },
  health: {
    backend: 'personal_mcp',
    status: 'unconfigured',
    reason_code: 'missing_contract',
    supported_operations: [],
  },
};

it('does not equate generated schema availability with transport qualification', async () => {
  const f = fixture();
  delete (f.transport as { be06Qualification?: unknown }).be06Qualification;
  await expect(
    f.service.read('thread', 'runtime.memory.status', {}, noop),
  ).rejects.toThrow('be06_transport_unqualified');
  expect(f.calls).toHaveLength(0);
});
it('keeps primary harness outage explicit and never falls back to built-in operations', async () => {
  const f = fixture();
  f.answer(() => status);
  expect(
    await f.service.read('thread', 'runtime.memory.status', {}, noop),
  ).toEqual(status);
  await expect(
    f.service.act(
      'thread',
      'runtime.memory.record.write',
      { record_id: 'note', content: 'Private' },
      op('runtime.memory.record.write', {
        record_id: 'note',
        content: 'Private',
      }),
      noop,
    ),
  ).rejects.toThrow('personal_harness_operation_unsupported');
  await expect(f.service.exportMemory('thread', false, noop)).rejects.toThrow(
    'personal_harness_operation_unsupported',
  );
  expect(f.calls).toHaveLength(1);
});
it('rejects personal harness capability claims absent in this pin', async () => {
  const f = fixture();
  f.answer(() => ({
    ...status,
    capabilities: { ...status.capabilities, delete: true },
  }));
  await expect(
    f.service.read('thread', 'runtime.memory.status', {}, noop),
  ).rejects.toThrow('unqualified_personal_harness_capability');
});
it('allows display name Primary on a specialist without changing its privileges', async () => {
  const f = fixture();
  f.answer(() => ({ agent: agent() }));
  expect(
    await f.service.read(
      'thread',
      'runtime.agent.get',
      { agent_id: 'researcher' },
      noop,
    ),
  ).toMatchObject({
    agent: {
      role: 'specialist',
      memory_backend: 'builtin',
      config: { name: 'Primary' },
    },
  });
  const payload = { copy_from_agent_id: 'primary', config: agent().config };
  await expect(
    f.service.act(
      'thread',
      'runtime.agent.create',
      payload,
      op('runtime.agent.create', payload),
      noop,
    ),
  ).rejects.toThrow('primary_copy_forbidden');
  expect(f.calls).toHaveLength(1);
});
it('forbids role/backend/namespace fields and caller-supplied session authority', async () => {
  const f = fixture();
  const payload = { config: { ...agent().config, role: 'primary' } };
  await expect(
    f.service.act(
      'thread',
      'runtime.agent.create',
      payload,
      op('runtime.agent.create', payload),
      noop,
    ),
  ).rejects.toThrow('Invalid BE06 params');
  await expect(
    f.service.read(
      'thread',
      'runtime.agent.get',
      { agent_id: 'researcher', session_id: 'other' },
      noop,
    ),
  ).rejects.toThrow('caller_selected_authority');
  expect(f.calls).toHaveLength(0);
});
it('rejects duplicated namespaces and a renamed specialist claiming primary backend', async () => {
  const f = fixture();
  f.answer(() => ({
    agents: [
      agent(),
      { ...agent('writer'), builtin_memory_namespace: 'namespace-researcher' },
    ],
    activation: 'next_session',
  }));
  await expect(
    f.service.read('thread', 'runtime.agent.list', {}, noop),
  ).rejects.toThrow('agent_namespace_collision');
  f.answer(() => ({ agent: { ...agent(), memory_backend: 'personal_mcp' } }));
  await expect(
    f.service.read(
      'thread',
      'runtime.agent.get',
      { agent_id: 'researcher' },
      noop,
    ),
  ).rejects.toThrow('agent_response_scope_mismatch');
});
it.each([
  'owner_agent_id',
  'owner_principal_id',
  'owner_profile_id',
  'namespace_id',
  'scope',
])('rejects memory crossing %s even when project is shared', async (field) => {
  const f = fixture(true);
  f.answer(() => ({ record: { ...memory(), [field]: 'other' } }));
  await expect(
    f.service.read(
      'thread',
      'runtime.memory.record.get',
      { record_id: 'note' },
      noop,
    ),
  ).rejects.toThrow('memory_response_scope_mismatch');
});
it('requires server-bound project access and rechecks revocation after a read', async () => {
  const f = fixture(true);
  await expect(
    f.service.read(
      'thread',
      'runtime.memory.records.list',
      { project_id: 'other' },
      noop,
    ),
  ).rejects.toThrow('project_scope_mismatch');
  expect(f.calls).toHaveLength(0);
  f.answer(() => {
    f.revoke();
    return { record: memory() };
  });
  await expect(
    f.service.read(
      'thread',
      'runtime.memory.record.get',
      { record_id: 'note' },
      noop,
    ),
  ).rejects.toThrow('Revoked');
});
it('records exact successful write and tombstone receipts; CAS conflicts remain rejected', async () => {
  const f = fixture(true);
  const payload = {
    record_id: 'note',
    content: 'Reviewed fact',
    expected_version: 0,
  };
  f.answer(() => ({
    outcome: {
      success: true,
      record: memory(),
      acknowledged_version: 1,
      revision: 1,
    },
  }));
  const input = op('runtime.memory.record.write', payload);
  expect(
    await f.service.act(
      'thread',
      'runtime.memory.record.write',
      payload,
      input,
      noop,
    ),
  ).toMatchObject({ status: 'accepted' });
  const deleting = { record_id: 'note', expected_version: 1 };
  f.answer(() => ({
    outcome: {
      success: true,
      record: {
        ...memory(),
        version: 2,
        revision: 2,
        content: null,
        deletion_state: 'deleted',
        deleted_at: 2,
      },
      acknowledged_version: 2,
      revision: 2,
    },
  }));
  expect(
    await f.service.act(
      'thread',
      'runtime.memory.record.delete',
      deleting,
      op('runtime.memory.record.delete', deleting),
      noop,
    ),
  ).toMatchObject({ status: 'accepted' });
  f.answer(() => ({
    outcome: {
      success: false,
      code: 'version_conflict',
      conflict_id: 'conflict',
      record_id: 'note',
      expected_version: 1,
      current_version: 2,
    },
  }));
  expect(
    await f.service.act(
      'thread',
      'runtime.memory.record.delete',
      deleting,
      op('runtime.memory.record.delete', deleting),
      noop,
    ),
  ).toMatchObject({
    status: 'rejected',
    result: { outcome: { success: false } },
  });
});
it('freezes input before dispatch and retains unknown outcomes across restart without resend', async () => {
  const f = fixture(true);
  const payload = { record_id: 'note', content: 'original' };
  const input = op('runtime.memory.record.write', payload);
  f.answer(() => {
    payload.content = 'changed after dispatch';
    throw new Error('timeout with secret');
  });
  expect(
    await f.service.act(
      'thread',
      'runtime.memory.record.write',
      payload,
      input,
      noop,
    ),
  ).toMatchObject({ status: 'outcome_unknown', result: null });
  const reopened = f.factory();
  expect(await reopened.inspect(input.operationId, noop)).toMatchObject({
    status: 'outcome_unknown',
  });
  expect(
    await reopened.act(
      'thread',
      'runtime.memory.record.write',
      { record_id: 'note', content: 'original' },
      input,
      noop,
    ),
  ).toMatchObject({ status: 'outcome_unknown' });
  await expect(
    reopened.act(
      'thread',
      'runtime.memory.record.write',
      payload,
      {
        ...input,
        intentDigest: be06IntentDigest('runtime.memory.record.write', payload),
      },
      noop,
    ),
  ).rejects.toThrow('operation_id_conflict');
  expect(f.calls).toHaveLength(1);
});
it('prevents operation IDs crossing families and authority generations', async () => {
  const f = fixture(true);
  const payload = { record_id: 'note', content: 'original' };
  const input = op('runtime.memory.record.write', payload);
  const db = new DatabaseSync(f.path);
  clean.push(() => db.close());
  db.prepare('INSERT INTO runtime_operation_registry VALUES(?,?,?,?,?)').run(
    input.operationId,
    'owner',
    'control',
    input.intentDigest,
    'different',
  );
  await expect(
    f.service.act(
      'thread',
      'runtime.memory.record.write',
      payload,
      input,
      noop,
    ),
  ).rejects.toThrow('operation_id_conflict');
  f.binding.authorityRevision = 2;
  await expect(
    f.service.act(
      'thread',
      'runtime.memory.record.write',
      payload,
      op('runtime.memory.record.write', payload),
      noop,
    ),
  ).rejects.toThrow('authority_generation_changed');
  expect(f.calls).toHaveLength(0);
});
it('persists producer receipt even if authorization is revoked before browser delivery', async () => {
  const f = fixture(true);
  const payload = { record_id: 'note', content: 'Reviewed fact' };
  const input = op('runtime.memory.record.write', payload);
  f.answer(() => {
    f.revoke();
    return {
      outcome: {
        success: true,
        record: memory(),
        acknowledged_version: 1,
        revision: 1,
      },
    };
  });
  await expect(
    f.service.act(
      'thread',
      'runtime.memory.record.write',
      payload,
      input,
      noop,
    ),
  ).rejects.toThrow('Revoked');
  const db = new DatabaseSync(f.path);
  clean.push(() => db.close());
  expect(
    db
      .prepare(
        'SELECT state FROM runtime_identity_skill_ingress WHERE operationId=?',
      )
      .get(input.operationId)?.state,
  ).toBe('accepted');
  expect(f.calls).toHaveLength(1);
});
it('exports only verified revision-bound owner records, never certification of physical erasure', async () => {
  const f = fixture(true);
  const bytes = Buffer.from(
    JSON.stringify({ revision: 1, records: [memory()] }),
  );
  f.answer(() => ({
    revision: 1,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
    format: 'json',
    deletion_semantics: 'tombstones_not_physical_erasure',
    offset: 0,
    next_offset: bytes.length,
    data_base64: bytes.toString('base64'),
    eof: true,
  }));
  expect(await f.service.exportMemory('thread', false, noop)).toMatchObject({
    bytes,
    deletionSemantics: 'tombstones_not_physical_erasure',
  });
  f.answer(() => ({
    revision: 1,
    sha256: digest,
    size: bytes.length,
    format: 'json',
    deletion_semantics: 'tombstones_not_physical_erasure',
    offset: 0,
    next_offset: bytes.length,
    data_base64: bytes.toString('base64'),
    eof: true,
  }));
  await expect(f.service.exportMemory('thread', false, noop)).rejects.toThrow(
    'memory_export_digest_mismatch',
  );
});

async function preparedDelivery(
  f: ReturnType<typeof fixture>,
  action: 'deliver' | 'rollback' = 'deliver',
) {
  const workflowValue = workflow(action === 'rollback' ? 1 : 2);
  const payload = {
    project_id: 'project',
    workflow_id: 'workflow',
    version: workflowValue.version,
    sha256: workflowValue.sha256,
    specialist_id: 'researcher',
    expected_delivery_revision: action === 'rollback' ? 2 : 0,
    action,
  };
  const input = op('runtime.workflow.delivery.prepare', payload);
  f.answer(() => ({
    approval_id: 'approval',
    approval_digest: digest,
    expires_at: Date.now() / 1000 + 1000,
    scope_json: JSON.stringify(payload),
    workflow: workflowValue,
    current_delivery: null,
  }));
  await f.service.act(
    'thread',
    'runtime.workflow.delivery.prepare',
    payload,
    input,
    noop,
  );
  return {
    payload,
    input,
    review: await f.service.present(input.operationId, noop),
  };
}
it.each(['deliver', 'rollback'] as const)(
  'commits only the presented exact immutable %s and next-session pin',
  async (action) => {
    const f = fixture();
    const prepared = await preparedDelivery(f, action);
    const review = {
      reviewOperationId: prepared.review.reviewOperationId,
      reviewDigest: prepared.review.reviewDigest,
    };
    f.answer((_method, _params) => ({
      delivery: {
        delivery_id: 'approval',
        project_id: 'project',
        workflow_id: 'workflow',
        version: prepared.payload.version,
        sha256: prepared.payload.sha256,
        specialist_id: 'researcher',
        delivery_revision: prepared.payload.expected_delivery_revision + 1,
        action,
        approval_id: 'approval',
        approval_digest: digest,
        previous_delivery_id: null,
        activation: 'next_session',
        execution_authority: false,
        personal_memory_shared: false,
        recorded_at: 1,
      },
    }));
    expect(
      await f.service.act(
        'thread',
        'runtime.workflow.delivery.commit',
        review,
        op('runtime.workflow.delivery.commit', review),
        noop,
      ),
    ).toMatchObject({
      status: 'accepted',
      result: {
        delivery: {
          action,
          activation: 'next_session',
          personal_memory_shared: false,
          execution_authority: false,
        },
      },
    });
    expect(f.calls[1].params.command_id).toBe(prepared.input.operationId);
    expect(f.calls[1].params.version).toBe(prepared.payload.version);
  },
);
it('rejects stale, unpresented, modified, expired and reconnect-rebound reviews', async () => {
  const f = fixture();
  const p = await preparedDelivery(f);
  const review = {
    reviewOperationId: p.review.reviewOperationId,
    reviewDigest: digest,
  };
  await expect(
    f.service.act(
      'thread',
      'runtime.workflow.delivery.commit',
      review,
      op('runtime.workflow.delivery.commit', review),
      noop,
    ),
  ).rejects.toThrow('review_not_presented_or_stale');
  const valid = {
    reviewOperationId: p.review.reviewOperationId,
    reviewDigest: p.review.reviewDigest,
  };
  f.binding.liveSessionId = 'reconnected';
  await expect(
    f.service.act(
      'thread',
      'runtime.workflow.delivery.commit',
      valid,
      op('runtime.workflow.delivery.commit', valid),
      noop,
    ),
  ).rejects.toThrow('review_not_presented_or_stale');
  expect(f.calls).toHaveLength(1);
});
it('keeps malformed or wrong-pin producer responses unknown, never accepted', async () => {
  const f = fixture();
  const p = await preparedDelivery(f);
  const review = {
    reviewOperationId: p.review.reviewOperationId,
    reviewDigest: p.review.reviewDigest,
  };
  f.answer(() => ({ delivery: { wrong: 'bytes' } }));
  expect(
    await f.service.act(
      'thread',
      'runtime.workflow.delivery.commit',
      review,
      op('runtime.workflow.delivery.commit', review),
      noop,
    ),
  ).toMatchObject({ status: 'outcome_unknown', result: null });
});
it('uses actual pinned schemas rather than inventing workflow actions or primary-memory mutation', () => {
  expect(() =>
    validateBe06Wire('runtime.workflow.decision.prepare', 'params', {
      schema_version: 1,
      session_id: 'live',
      command_id: 'command',
      project_id: 'project',
      workflow_id: 'workflow',
      version: 1,
      sha256: digest,
      expected_revision: 1,
      expected_head_revision: 0,
      action: 'accept',
    }),
  ).toThrow();
  expect(() =>
    validateBe06Wire('runtime.workflow.decision.prepare', 'params', {
      schema_version: 1,
      session_id: 'live',
      command_id: 'command',
      project_id: 'project',
      workflow_id: 'workflow',
      version: 1,
      sha256: digest,
      expected_revision: 1,
      expected_head_revision: 0,
      action: 'approve',
    }),
  ).not.toThrow();
});
it('preserves frozen legacy opt-in evidence across Dot changes without new enrollment or global injection', () => {
  const legacy = new DatabaseSync(':memory:'),
    target = new DatabaseSync(':memory:');
  clean.push(
    () => legacy.close(),
    () => target.close(),
  );
  legacy.exec(
    "CREATE TABLE dots(id TEXT,learningContainerId TEXT,skillDeliveryEnabled INTEGER); INSERT INTO dots VALUES('dot','research',1); CREATE TABLE thread_bindings(id TEXT,dotId TEXT,ownerId TEXT,learningContainerId TEXT); INSERT INTO thread_bindings VALUES('off','dot','owner',NULL),('old','dot','owner','research'),('foreign','dot','other','private');",
  );
  const first = freezeLegacyEnrollment(
    target,
    'owner',
    inventoryLegacyEnrollment(legacy, 'owner'),
  );
  legacy.exec(
    "UPDATE dots SET learningContainerId='new'; UPDATE thread_bindings SET learningContainerId='new' WHERE id='old';",
  );
  const second = freezeLegacyEnrollment(
    target,
    'owner',
    inventoryLegacyEnrollment(legacy, 'owner'),
  );
  expect(second).toEqual(first);
  expect(second).toHaveLength(3);
  expect(
    second.every(
      (row) =>
        row.enrollmentAuthorized === false &&
        row.migrationState === 'review_required',
    ),
  ).toBe(true);
  expect(
    second.find((row) => row.evidence.id === 'off')?.evidence.legacyContainerId,
  ).toBeNull();
  expect(
    second.find((row) => row.evidence.id === 'old')?.evidence
      .legacySkillDeliveryEnabled,
  ).toBeNull();
  expect(legacyPreferenceInjection).toThrow(
    'legacy_global_preference_injection_disabled',
  );
});
it('will not make an old review current by merely presenting it after reconnect', async () => {
  const f = fixture();
  const p = await preparedDelivery(f);
  f.binding.liveSessionId = 'another-live';
  await expect(f.service.present(p.input.operationId, noop)).rejects.toThrow(
    'review_origin_rebound',
  );
  expect(await f.service.inspect(p.input.operationId, noop)).toMatchObject({
    status: 'accepted',
  });
  expect(f.calls).toHaveLength(1);
});
it('requires presentation and does not permit an expired prepared decision', async () => {
  const f = fixture();
  const w = workflow();
  const payload = {
    project_id: 'project',
    workflow_id: w.workflow_id,
    version: 1,
    sha256: w.sha256,
    expected_revision: 2,
    expected_head_revision: 1,
    action: 'approve',
  };
  const input = op('runtime.workflow.decision.prepare', payload);
  const prepared = {
    approval_id: 'approval',
    approval_digest: digest,
    expires_at: Date.now() / 1000 - 1,
    scope_json: JSON.stringify(payload),
    workflow: w,
  };
  f.answer(() => prepared);
  await f.service.act(
    'thread',
    'runtime.workflow.decision.prepare',
    payload,
    input,
    noop,
  );
  const review = {
    reviewOperationId: input.operationId,
    reviewDigest: be06Digest(prepared),
  };
  await expect(
    f.service.act(
      'thread',
      'runtime.workflow.decision.commit',
      review,
      op('runtime.workflow.decision.commit', review),
      noop,
    ),
  ).rejects.toThrow('review_not_presented_or_stale');
  await f.service.present(input.operationId, noop);
  await expect(
    f.service.act(
      'thread',
      'runtime.workflow.decision.commit',
      review,
      op('runtime.workflow.decision.commit', review),
      noop,
    ),
  ).rejects.toThrow('review_expired');
  expect(f.calls).toHaveLength(1);
});
it('declines only by cancelling the exact reviewed preparation, without inventing a denied approval', async () => {
  const f = fixture();
  const p = await preparedDelivery(f);
  const review = {
    reviewOperationId: p.review.reviewOperationId,
    reviewDigest: p.review.reviewDigest,
  };
  f.answer((_method, params) => ({
    command_id: params.command_id,
    run_id: 'run',
    status: 'cancelled',
    owner_live: false,
    expires_at: null,
    result: { cancel_requested: true, effects_undone: false },
  }));
  const receipt = await f.service.act(
    'thread',
    'runtime.artifact.cancel',
    review,
    op('runtime.artifact.cancel', review),
    noop,
  );
  expect(receipt).toMatchObject({
    status: 'accepted',
    result: {
      command_id: p.input.operationId,
      status: 'cancelled',
      owner_live: false,
    },
  });
  expect(f.calls[1].method).toBe('runtime.artifact.cancel');
  expect(f.calls[1].params.command_id).toBe(p.input.operationId);
  expect(f.calls).toHaveLength(2);
});
it('does not publish a prepared run until an exact-byte BE05 review bridge exists', async () => {
  const f = fixture();
  const payload = {
    project_id: 'project',
    workflow_id: 'workflow',
    version: 1,
    sha256: workflow().sha256,
    mission_id: 'mission',
    mission_revision: 1,
    parameters_json: '{}',
  };
  const input = op('runtime.workflow.run.prepare', payload);
  f.answer(() => ({
    workflow_run_id: 'workflow-run',
    pin_json: '{}',
    proposals: [],
    publication_atomic: false,
  }));
  await f.service.act(
    'thread',
    'runtime.workflow.run.prepare',
    payload,
    input,
    noop,
  );
  const p = await f.service.present(input.operationId, noop);
  const review = {
    reviewOperationId: p.reviewOperationId,
    reviewDigest: p.reviewDigest,
  };
  await expect(
    f.service.act(
      'thread',
      'runtime.workflow.run.publish',
      review,
      op('runtime.workflow.run.publish', review),
      noop,
    ),
  ).rejects.toThrow('exact_publication_review_unavailable');
  expect(f.calls).toHaveLength(1);
});
it('uses producer preview selection only for named specialist handoff and recovers without relaunch', async () => {
  const f = fixture();
  const payload = {
    project_id: 'project',
    specialist_id: 'researcher',
    objective: 'Read only the supplied project artifact',
    artifacts: [],
    evidence: [],
    constraints: ['No personal memory'],
  };
  const preview = {
    specialist: {
      agent_id: 'researcher',
      responsibility: 'Research',
      manifest_sha256: digest,
      methods_ref: { id: 'methods', version: 1, sha256: digest },
      limits: {
        max_depth: 1,
        max_total_children: 1,
        max_concurrent_children: 1,
      },
      grants: {
        allowed_tools: [],
        project_grants: ['project'],
        mcp_grants: {},
        memory_backend: 'builtin',
        personal_memory_access: false,
      },
      builtin_memory_namespace: 'namespace-researcher',
      output_contract_json: '{}',
    },
    selection: {
      ...payload,
      manifest_sha256: digest,
      config_digest: digest,
      parent_policy_digest: digest,
      mission_id: null,
      mission_revision: null,
      expires_at: Date.now() / 1000 + 1000,
    },
    preview_sha256: digest,
    runtime_revision: 0,
  };
  const input = op('runtime.specialist.preview', payload);
  f.answer(() => preview);
  await f.service.act(
    'thread',
    'runtime.specialist.preview',
    payload,
    input,
    noop,
  );
  const p = await f.service.present(input.operationId, noop),
    review = {
      reviewOperationId: p.reviewOperationId,
      reviewDigest: p.reviewDigest,
    };
  const handoff = op('runtime.specialist.handoff', review);
  f.answer((_method, params) => ({
    schema_version: 1,
    command_id: params.command_id,
    status: 'accepted',
    durable_revision: 1,
    run_id: 'run',
    conflict: null,
  }));
  expect(
    await f.service.act(
      'thread',
      'runtime.specialist.handoff',
      review,
      handoff,
      noop,
    ),
  ).toMatchObject({ status: 'accepted' });
  expect(f.calls[1].params).toMatchObject({
    selection: preview.selection,
    preview_sha256: digest,
    expected_revision: 0,
    command_id: handoff.operationId,
    idempotency_key: handoff.operationId,
  });
  const reopened = f.factory();
  await reopened.inspect(handoff.operationId, noop);
  await reopened.act(
    'thread',
    'runtime.specialist.handoff',
    review,
    handoff,
    noop,
  );
  expect(f.calls).toHaveLength(2);
});

it('freezes legacy global inventory without copying bodies, sharing with specialists or inventing old bytes', () => {
  const db = new DatabaseSync(':memory:');
  clean.push(() => db.close());
  db.exec(
    "CREATE TABLE memories(id TEXT PRIMARY KEY,text TEXT,createdAt INTEGER); INSERT INTO memories VALUES('old','Private owner preference',1)",
  );
  const first = frozenLegacyMemoryInventory(db, 'owner');
  expect(first.records[0]).toMatchObject({
    content: 'Private owner preference',
    migrationState: 'review_required',
    enrollmentAuthorized: false,
  });
  const stored = db
    .prepare('SELECT * FROM runtime_legacy_memory_inventory')
    .get();
  expect(stored).not.toHaveProperty('content');
  db.exec(
    "UPDATE memories SET text='Changed outside inventory'; INSERT INTO memories VALUES('new','Not automatically enrolled',2)",
  );
  const next = frozenLegacyMemoryInventory(db, 'owner');
  expect(next.records).toHaveLength(1);
  expect(next.records[0]).toMatchObject({
    content: null,
    unavailableReason: 'source_changed_or_removed',
    contentDigest: first.records[0].contentDigest,
  });
});
