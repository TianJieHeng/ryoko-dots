import { expect, test, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { api } from '../src/client/api';
import { inspectChannelDelivery } from '../src/client/runtime/channel-delivery';
import { ChannelsPanel } from '../src/client/runtime/ChannelsPanel';
import { useResource } from '../src/client/runtime/use-resource';
import {
  contractVersion,
  featureNames,
  setupSchema,
} from '../src/shared/runtime/contracts';
import type { RuntimeConnection } from '../src/client/runtime/use-runtime';
vi.mock('../src/client/api', () => ({ api: vi.fn() }));
vi.mock('../src/client/runtime/use-resource', () => ({ useResource: vi.fn() }));
const scope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'primary',
  project: null,
  generation: 1,
};
const response = {
  version: contractVersion,
  scope,
  deliveries: [
    {
      id: 'delivery',
      revision: 1,
      conversationId: 'canonical',
      missionId: null,
      outputVersion: 'artifact:1',
      destination: 'TTEST/CTEST/1791048000.000001',
      state: 'unknown',
      providerReceipt: null,
      reviewPath: null,
      allowedActions: ['inspect'],
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
});
test('inspect performs one authenticated POST to original delivery and checks scoped DTO without inventing a mission', async () => {
  vi.mocked(api).mockResolvedValue(response);
  const value = await inspectChannelDelivery(scope, 'delivery');
  expect(api).toHaveBeenCalledExactlyOnceWith(
    '/runtime/channel-deliveries/delivery/inspect',
    'POST',
    {},
  );
  expect(value.deliveries[0].missionId).toBeNull();
  vi.mocked(api).mockResolvedValue({
    ...response,
    scope: { ...scope, owner: 'other' },
  });
  await expect(inspectChannelDelivery(scope, 'delivery')).rejects.toThrow(
    'does not match',
  );
  vi.mocked(api).mockResolvedValue({ ...response, deliveries: [] });
  await expect(inspectChannelDelivery(scope, 'delivery')).rejects.toThrow(
    'does not match',
  );
  await expect(inspectChannelDelivery(scope, '../escape')).rejects.toThrow(
    'Invalid',
  );
});
test('render shows command output and unknown provider receipt with inspect-only controls', () => {
  const ready = { state: 'ready', reason: '' };
  const setup = setupSchema.parse({
    version: contractVersion,
    runtimeOwner: 'ryoko',
    scope,
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
    available: () => true,
  };
  vi.mocked(useResource).mockImplementation(
    (path) =>
      ({
        data: path.includes('channel-deliveries') ? response : null,
        error: '',
        loading: false,
        reload: vi.fn(),
      }) as never,
  );
  const html = renderToStaticMarkup(<ChannelsPanel connection={connection} />);
  expect(html).toContain('command output');
  expect(html).toContain('not confirmed');
  expect(html).toContain('Inspect delivery state');
  expect(html).not.toContain('mission null');
  expect(html).not.toContain('Retry delivery of this output');
  expect(api).not.toHaveBeenCalled();
});
