import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const auth = vi.hoisted(() => ({ generation: 1 }));
vi.mock('../src/client/api', () => ({
  api: vi.fn(),
  getAuthenticationGeneration: () => auth.generation,
}));
import { api } from '../src/client/api';
import {
  inspectPageEffect,
  PageEffectReceipt,
} from '../src/client/runtime/PageEffectReceipt';
import {
  contractVersion,
  type RuntimeScope,
} from '../src/shared/runtime/contracts';
const scope: RuntimeScope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'ryoko',
  project: null,
  generation: 3,
};
const value = () => ({
  version: contractVersion,
  scope,
  conversationId: 'conversation',
  effect: {
    effect_id: 'effect',
    operation_id: 'operation',
    state: 'confirmed',
    replay_permitted: false,
    receipt: {
      identity: {
        effect_id: 'effect',
        operation_id: 'operation',
        adapter_kind: 'page',
      },
      state: 'committed',
      receipt_id: 'native-receipt',
      content_sha256: 'a'.repeat(64),
      version: 2,
      result_sha256: 'b'.repeat(64),
      reason: 'committed',
    },
  },
});
beforeEach(() => {
  auth.generation = 1;
  vi.mocked(api).mockReset();
});
it('only inspects the exact original native receipt on an explicit action', async () => {
  vi.mocked(api).mockResolvedValue(value());
  expect(
    (await inspectPageEffect(scope, 'conversation', 'effect')).effect.receipt
      ?.version,
  ).toBe(2);
  expect(api).toHaveBeenCalledExactlyOnceWith(
    '/runtime/conversations/conversation/page-effects/effect/inspect',
    'POST',
    {},
    undefined,
  );
});
it('does not advertise verified commit without complete matching immutable receipt evidence', async () => {
  for (const change of [
    { ...value(), scope: { ...scope, agent: 'foreign' } },
    { ...value(), conversationId: 'foreign' },
    {
      ...value(),
      effect: {
        ...value().effect,
        receipt: { ...value().effect.receipt, content_sha256: null },
      },
    },
    {
      ...value(),
      effect: {
        ...value().effect,
        receipt: {
          ...value().effect.receipt,
          identity: {
            ...value().effect.receipt.identity,
            operation_id: 'foreign',
          },
        },
      },
    },
  ]) {
    vi.mocked(api).mockResolvedValue(change);
    await expect(
      inspectPageEffect(scope, 'conversation', 'effect'),
    ).rejects.toThrow();
  }
});
it('fences post-read authentication change and noncanonical URL identifiers', async () => {
  vi.mocked(api).mockImplementation(async () => {
    auth.generation++;
    return value();
  });
  await expect(
    inspectPageEffect(scope, 'conversation', 'effect'),
  ).rejects.toThrow('expired view');
  vi.mocked(api).mockClear();
  await expect(inspectPageEffect(scope, '..', 'effect')).rejects.toThrow();
  expect(api).not.toHaveBeenCalled();
});
it('renders explicit inspect without automatic replay or receipt fetch', () => {
  const html = renderToStaticMarkup(
    <PageEffectReceipt
      scope={scope}
      conversationId="conversation"
      effectId="effect"
    />,
  );
  expect(html).toContain('Inspect native page receipt');
  expect(html).toContain('never saves the page again');
  expect(api).not.toHaveBeenCalled();
});
