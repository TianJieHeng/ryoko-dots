import { describe, expect, it } from 'vitest';
import {
  canApplyWorkflowAction,
  canMutateMemory,
  configSchema,
  learningSchema,
  memorySchema,
  specialistSchema,
  specialistsSchema,
  workflowSchema,
} from '../src/shared/runtime/agents';
import { contractVersion, sameScope } from '../src/shared/runtime/contracts';

const scope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'agent',
  project: null,
  generation: 1,
};
const specialist = {
  id: 'specialist',
  dotId: 'dot',
  name: 'Research',
  instructions: '',
  revision: 1,
  role: 'specialist',
  memoryBackend: 'built_in',
  memoryEnabled: true,
  researchAllowed: false,
  spaceIds: ['space'],
  defaultSpaceId: 'space',
};
const config = {
  name: 'Research',
  instructions: '',
  researchAllowed: false,
  memoryAllowed: true,
  spaceIds: ['space'],
  spaceId: 'space',
};
const memory = {
  version: contractVersion,
  scope,
  role: 'specialist',
  backend: 'built_in',
  status: 'ready',
  permissions: { read: true, write: true, delete: true, export: false },
  entries: [{ id: 'entry', revision: 1, text: 'Bounded memory' }],
};
const workflow = {
  id: 'workflow',
  name: 'Research',
  revision: 1,
  version: 'v2',
  digest: 'a'.repeat(64),
  evidence: ['Verified result'],
  content: 'Reviewed workflow source',
  evaluation: 'Evaluation passed',
  publicationTarget: 'approved-workflows',
  deliveryTarget: 'private-results',
  stage: 'published',
  status: 'active',
  allowedActions: ['deliver', 'rollback'],
  previousVersion: 'v1',
};

describe('scoped agent contracts', () => {
  it('accepts bounded specialist and primary roles with their own backends', () => {
    expect(specialistSchema.safeParse(specialist).success).toBe(true);
    expect(
      specialistSchema.safeParse({
        ...specialist,
        role: 'primary',
        memoryBackend: 'personal_harness',
      }).success,
    ).toBe(true);
    expect(
      specialistsSchema.safeParse({
        version: contractVersion,
        scope,
        specialists: [specialist],
      }).success,
    ).toBe(true);
  });

  it('does not give renamed or copied specialists primary memory authority', () => {
    expect(
      specialistSchema.parse({ ...specialist, name: 'Primary' }).role,
    ).toBe('specialist');
    expect(
      specialistSchema.safeParse({
        ...specialist,
        name: 'Primary',
        memoryBackend: 'personal_harness',
      }).success,
    ).toBe(false);
    expect(
      specialistSchema.safeParse({ ...specialist, role: 'primary' }).success,
    ).toBe(false);
    for (const field of ['role', 'memoryBackend', 'id', 'dotId', 'revision']) {
      expect(
        configSchema.safeParse({ ...config, [field]: 'primary' }).success,
      ).toBe(false);
    }
  });

  it('requires unique explicit space grants for the default space', () => {
    expect(configSchema.safeParse(config).success).toBe(true);
    expect(
      configSchema.safeParse({ ...config, spaceId: 'private' }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({ ...config, spaceIds: ['space', 'space'] })
        .success,
    ).toBe(false);
    expect(
      specialistSchema.safeParse({ ...specialist, defaultSpaceId: 'private' })
        .success,
    ).toBe(false);
    expect(
      configSchema.safeParse({ ...config, spaceIds: [], spaceId: null })
        .success,
    ).toBe(true);
  });

  it('rejects runtime leakage and missing or malformed generation fields', () => {
    for (const schemaAndValue of [
      [
        specialistsSchema,
        { version: contractVersion, scope, specialists: [specialist] },
      ],
      [memorySchema, memory],
      [
        learningSchema,
        { version: contractVersion, scope, workflows: [workflow] },
      ],
    ] as const) {
      const [schema, value] = schemaAndValue;
      expect(
        schema.safeParse({ ...value, credentials: 'secret' }).success,
      ).toBe(false);
      expect(
        schema.safeParse({ ...value, scope: { ...scope, token: 'secret' } })
          .success,
      ).toBe(false);
      for (const generation of [undefined, -1, 1.5, '1']) {
        expect(
          schema.safeParse({ ...value, scope: { ...scope, generation } })
            .success,
        ).toBe(false);
      }
    }
    expect(sameScope(scope, { ...scope, generation: 2 })).toBe(false);
    expect(sameScope(scope, { ...scope, owner: 'other' })).toBe(false);
    expect(
      memorySchema.safeParse({
        ...memory,
        permissions: { ...memory.permissions, admin: true },
      }).success,
    ).toBe(false);
    expect(
      memorySchema.safeParse({
        ...memory,
        entries: [{ ...memory.entries[0], raw: 'secret' }],
      }).success,
    ).toBe(false);
  });

  it('bounds collections and text and rejects duplicate identities', () => {
    expect(
      specialistSchema.safeParse({
        ...specialist,
        instructions: 'x'.repeat(20001),
      }).success,
    ).toBe(false);
    expect(
      specialistsSchema.safeParse({
        version: contractVersion,
        scope,
        specialists: Array.from({ length: 101 }, (_, i) => ({
          ...specialist,
          id: `${i}`,
        })),
      }).success,
    ).toBe(false);
    expect(
      specialistsSchema.safeParse({
        version: contractVersion,
        scope,
        specialists: [specialist, specialist],
      }).success,
    ).toBe(false);
    expect(
      memorySchema.safeParse({
        ...memory,
        entries: Array.from({ length: 501 }, (_, i) => ({
          id: `${i}`,
          revision: 0,
          text: '',
        })),
      }).success,
    ).toBe(false);
    expect(
      learningSchema.safeParse({
        version: contractVersion,
        scope,
        workflows: Array.from({ length: 101 }, (_, i) => ({
          ...workflow,
          id: `${i}`,
        })),
      }).success,
    ).toBe(false);
  });
});

describe('memory mutation guard', () => {
  it('requires a ready backend and the specific permission', () => {
    expect(canMutateMemory(memory)).toBe(true);
    expect(canMutateMemory(memory, 'delete')).toBe(true);
    expect(canMutateMemory(memory, 'export')).toBe(false);
    expect(
      canMutateMemory(
        { ...memory, permissions: { ...memory.permissions, export: true } },
        'export',
      ),
    ).toBe(true);
    expect(
      canMutateMemory(
        {
          ...memory,
          status: 'unavailable',
          permissions: { ...memory.permissions, export: true },
        },
        'export',
      ),
    ).toBe(false);
    expect(canMutateMemory({ ...memory, status: 'unavailable' })).toBe(false);
    expect(
      canMutateMemory({
        ...memory,
        permissions: { ...memory.permissions, write: false },
      }),
    ).toBe(false);
    expect(
      canMutateMemory(
        { ...memory, permissions: { ...memory.permissions, delete: false } },
        'delete',
      ),
    ).toBe(false);
    expect(canMutateMemory({ ...memory, backend: 'personal_harness' })).toBe(
      false,
    );
    expect(canMutateMemory(null)).toBe(false);
  });
});

describe('learning workflow guard', () => {
  it('requires explicit actions and unfrozen state', () => {
    expect(canApplyWorkflowAction(workflow, 'deliver')).toBe(true);
    expect(canApplyWorkflowAction(workflow, 'approve')).toBe(false);
    expect(
      canApplyWorkflowAction({ ...workflow, status: 'frozen' }, 'deliver'),
    ).toBe(false);
    expect(canApplyWorkflowAction(null, 'publish')).toBe(false);
  });

  it('gates approval and destination-bound publication and delivery by stage', () => {
    const all = {
      ...workflow,
      allowedActions: ['approve', 'publish', 'deliver'],
    };
    expect(
      canApplyWorkflowAction({ ...all, stage: 'evaluated' }, 'approve'),
    ).toBe(true);
    expect(
      canApplyWorkflowAction(
        { ...all, stage: 'evaluated', evaluation: null },
        'approve',
      ),
    ).toBe(false);
    expect(canApplyWorkflowAction(all, 'approve')).toBe(false);
    expect(
      canApplyWorkflowAction({ ...all, stage: 'approved' }, 'publish'),
    ).toBe(true);
    expect(
      canApplyWorkflowAction(
        { ...all, stage: 'approved', publicationTarget: null },
        'publish',
      ),
    ).toBe(false);
    expect(canApplyWorkflowAction(all, 'publish')).toBe(false);
    expect(
      canApplyWorkflowAction({ ...all, deliveryTarget: null }, 'deliver'),
    ).toBe(false);
    expect(
      canApplyWorkflowAction({ ...all, stage: 'approved' }, 'deliver'),
    ).toBe(false);
  });

  it('requires a distinct previous version for rollback', () => {
    expect(canApplyWorkflowAction(workflow, 'rollback')).toBe(true);
    expect(
      canApplyWorkflowAction(
        { ...workflow, previousVersion: null },
        'rollback',
      ),
    ).toBe(false);
    expect(
      canApplyWorkflowAction(
        { ...workflow, previousVersion: 'v2' },
        'rollback',
      ),
    ).toBe(false);
    expect(
      canApplyWorkflowAction({ ...workflow, allowedActions: [] }, 'rollback'),
    ).toBe(false);
  });

  it('rejects speculative live claims, raw state, and malformed digests', () => {
    for (const field of ['live', 'deployed', 'rawState', 'generation']) {
      expect(
        workflowSchema.safeParse({ ...workflow, [field]: true }).success,
      ).toBe(false);
    }
    expect(
      workflowSchema.safeParse({ ...workflow, stage: 'live' }).success,
    ).toBe(false);
    expect(
      workflowSchema.safeParse({ ...workflow, digest: 'unverified' }).success,
    ).toBe(false);
    expect(
      workflowSchema.safeParse({
        ...workflow,
        allowedActions: ['publish', 'publish'],
      }).success,
    ).toBe(false);
  });
});
