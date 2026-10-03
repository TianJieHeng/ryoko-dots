import { describe, expect, it } from 'vitest';
import {
  canUse,
  contractVersion,
  featureNames,
  historySchema,
  sameScope,
  setupSchema,
} from '../src/shared/runtime/contracts';
const scope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'ryoko',
  project: null,
  generation: 1,
};
const ready = { state: 'ready', reason: '' };
const setup = {
  version: contractVersion,
  runtimeOwner: 'ryoko',
  scope,
  controlPlane: ready,
  binding: ready,
  compatibility: ready,
  features: Object.fromEntries(featureNames.map((name) => [name, ready])),
  qualified: false,
};
describe('strict browser-safe consumer candidate', () => {
  it('does not equate configured endpoints with qualification', () => {
    expect(canUse(setupSchema.parse(setup), 'commands')).toBe(false);
    expect(
      canUse(setupSchema.parse({ ...setup, qualified: true }), 'commands'),
    ).toBe(true);
  });
  it('rejects version drift, credentials and absent capabilities', () => {
    expect(setupSchema.safeParse({ ...setup, version: 'future' }).success).toBe(
      false,
    );
    expect(setupSchema.safeParse({ ...setup, token: 'secret' }).success).toBe(
      false,
    );
    expect(setupSchema.safeParse({ ...setup, features: {} }).success).toBe(
      false,
    );
    expect(
      setupSchema.safeParse({
        ...setup,
        scope: { ...scope, serviceCredential: 'secret' },
      }).success,
    ).toBe(false);
  });
  it('scopes each generation, agent, owner, gateway and project independently', () => {
    expect(sameScope(scope, scope)).toBe(true);
    for (const key of ['owner', 'gateway', 'agent', 'project'] as const)
      expect(sameScope(scope, { ...scope, [key]: 'foreign' })).toBe(false);
    expect(sameScope(scope, { ...scope, generation: 2 })).toBe(false);
    expect(sameScope(null, null)).toBe(false);
  });
  it('separates history sequences and runtime cursors; refuses raw fields', () => {
    const history = {
      version: contractVersion,
      scope,
      conversationId: 'conversation',
      lineageId: 'lineage',
      messages: [],
      nextCursor: null,
      sessionSequence: 4,
      runtimeCursor: 'journal:19',
      truncated: true,
      interruption: 'History retention limit',
    };
    expect(historySchema.parse(history).sessionSequence).toBe(4);
    expect(
      historySchema.safeParse({ ...history, memory: 'private' }).success,
    ).toBe(false);
  });
});

it('does not admit generic approvals or client-selected authority', async () => {
  const { commandIntentSchema } =
    await import('../src/shared/runtime/contracts');
  expect(
    commandIntentSchema.safeParse({
      operation: 'approval',
      conversationId: 'c',
      approved: true,
    }).success,
  ).toBe(false);
  expect(
    commandIntentSchema.safeParse({
      operation: 'submit',
      conversationId: 'c',
      text: 'Hello',
      sourceUrl: null,
      owner: 'forged',
    }).success,
  ).toBe(false);
  expect(
    commandIntentSchema.safeParse({
      operation: 'submit',
      conversationId: 'c',
      text: 'Hello',
      sourceUrl: 'https://user:secret@example.com',
    }).success,
  ).toBe(false);
});
it('requires neither Intelligence nor a browser service credential for DTO validation', () => {
  const configuration = setupSchema.parse({ ...setup, qualified: true });
  expect(canUse(configuration, 'conversations')).toBe(true);
  expect(JSON.stringify(configuration)).not.toMatch(
    /intelligence|apiKey|serviceCredential/i,
  );
  const denied = setupSchema.parse({
    ...setup,
    qualified: true,
    features: {
      ...setup.features,
      conversations: { state: 'permission_denied', reason: 'Grant revoked' },
    },
  });
  expect(canUse(denied, 'conversations')).toBe(false);
});
