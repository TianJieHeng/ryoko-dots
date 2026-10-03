import { createHash } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({
  generation: 1,
  result: undefined as unknown,
}));
vi.mock('../src/client/api', () => ({
  api: vi.fn(),
  getAuthenticationGeneration: () => hooks.generation,
}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) =>
      actual.useState(
        initial === undefined && hooks.result ? hooks.result : initial,
      ),
  };
});
import { api } from '../src/client/api';
import { ResultDetail } from '../src/client/runtime/CommandResults';
import {
  acknowledgeRuntimeResult,
  canRetryRuntimeResult,
  hasPendingDeliveryRetry,
  readRuntimeResult,
  retryRuntimeResult,
  verifyRuntimeResult,
} from '../src/client/runtime/results';
import { contractVersion } from '../src/shared/runtime/contracts';
import type { RuntimeConnection } from '../src/client/runtime/use-runtime';
const scope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'agent',
  project: null,
  generation: 1,
};
const receiptId = '11111111-1111-4111-8111-111111111111';
function value(text = 'Verified 🙂 <script>text</script>') {
  const bytes = Buffer.from(
    JSON.stringify({ final_response: text, completed: true }),
  );
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return {
    version: contractVersion,
    scope,
    conversationId: 'chat',
    commandId: 'command',
    artifact: {
      artifactId: 'artifact',
      version: 2,
      sha256,
      size: bytes.length,
      mime: 'application/json',
      dataBase64: bytes.toString('base64'),
    },
    finalResponse: text,
    publicationState: 'committed',
    browserReceiptId: receiptId,
    delivery: {
      delivery_id: 'delivery',
      artifact_id: 'artifact',
      version: 2,
      sha256,
      destination: {
        kind: 'local_runtime',
        session_id: 'chat',
        principal_id: 'principal',
        profile_id: 'profile',
        agent_id: 'agent',
      },
      state: 'awaiting_ack',
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
}
const verified = (raw = value()) =>
  verifyRuntimeResult(raw, scope, 'chat', 'command');
function storage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, data: string) => {
      map.set(key, data);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}
beforeEach(() => {
  hooks.generation = 1;
  hooks.result = undefined;
  vi.mocked(api).mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('verified browser result receipt', () => {
  it('receives full multi-chunk UTF-8 output using GET without acknowledging or delivering', async () => {
    const raw = value('🙂'.repeat(20000));
    vi.mocked(api).mockResolvedValue(raw);
    const result = await readRuntimeResult(scope, 'chat', 'command');
    expect(result.artifactBytes.byteLength).toBe(raw.artifact.size);
    expect(result.finalResponse).toBe(raw.finalResponse);
    expect(api).toHaveBeenCalledExactlyOnceWith(
      '/runtime/conversations/chat/results/command',
      'GET',
      undefined,
      undefined,
    );
  });
  it('rejects wrong scope, size, hash, result text, and delivery identity', async () => {
    const raw = value();
    for (const altered of [
      { ...raw, conversationId: 'other' },
      { ...raw, scope: { ...scope, generation: 2 } },
      { ...raw, artifact: { ...raw.artifact, size: raw.artifact.size + 1 } },
      { ...raw, artifact: { ...raw.artifact, sha256: 'f'.repeat(64) } },
      { ...raw, finalResponse: 'injected' },
      { ...raw, delivery: { ...raw.delivery, version: 3 } },
      {
        ...raw,
        delivery: {
          ...raw.delivery,
          destination: { ...raw.delivery.destination, session_id: 'other' },
        },
      },
    ])
      await expect(verified(altered)).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
  });
  it('fences bytes returned after authentication changed', async () => {
    vi.mocked(api).mockImplementation(async () => {
      hooks.generation++;
      return value();
    });
    await expect(readRuntimeResult(scope, 'chat', 'command')).rejects.toThrow(
      'access changed',
    );
  });
  it('renders final response as escaped text and makes no automatic receipt claim', async () => {
    hooks.result = await verified();
    const html = renderToStaticMarkup(
      <ResultDetail
        commandId="command"
        conversationId="chat"
        connection={{ setup: { scope } } as RuntimeConnection}
        run={async () => {}}
      />,
    );
    expect(html).toContain('&lt;script&gt;text&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Record browser receipt');
    expect(html).toContain('does not confirm that a person read');
    expect(api).not.toHaveBeenCalled();
  });
  it('persists an exact explicit receipt claim and recovers it even if a later read issues a new ID', async () => {
    const result = await verified(),
      store = storage();
    vi.mocked(api).mockRejectedValueOnce(new Error('lost acknowledgment'));
    await expect(
      acknowledgeRuntimeResult(result, false, store),
    ).rejects.toThrow('lost');
    expect(api).toHaveBeenCalledWith(
      '/runtime/conversations/chat/deliveries/delivery/ack',
      'POST',
      {
        receiptId,
        sha256: result.artifact.sha256,
        textReceived: true,
        artifactReceived: true,
      },
    );
    const delivery = {
      ...result.delivery!,
      state: 'delivered',
      acknowledgment_level: 'client_received',
      components: { text: 'client_received', artifact: 'client_received' },
    };
    vi.mocked(api).mockResolvedValue({
      version: contractVersion,
      scope,
      conversationId: 'chat',
      deliveryId: 'delivery',
      receiptId,
      status: 'accepted',
      delivery,
      humanReadConfirmed: false,
    });
    const recovered = await acknowledgeRuntimeResult(
      { ...result, browserReceiptId: '22222222-2222-4222-8222-222222222222' },
      true,
      store,
    );
    expect(recovered.status).toBe('accepted');
    expect(vi.mocked(api).mock.calls[1][2]).toMatchObject({ receiptId });
    expect(recovered.humanReadConfirmed).toBe(false);
  });
  it('does not acknowledge without a notification or when durable browser storage fails', async () => {
    const result = await verified();
    await expect(
      acknowledgeRuntimeResult(
        { ...result, browserReceiptId: null },
        false,
        storage(),
      ),
    ).rejects.toThrow('No exact delivery');
    await expect(
      acknowledgeRuntimeResult(result, true, storage()),
    ).rejects.toThrow('No exact delivery');
    await expect(
      acknowledgeRuntimeResult(result, false, {
        getItem: () => null,
        setItem: () => {
          throw new Error('Storage full');
        },
      }),
    ).rejects.toThrow('Storage full');
    expect(api).not.toHaveBeenCalled();
  });
  it('rejects incomplete client component acknowledgment and human-read claims', async () => {
    const result = await verified();
    for (const response of [
      {
        version: contractVersion,
        scope,
        conversationId: 'chat',
        deliveryId: 'delivery',
        receiptId,
        status: 'accepted',
        delivery: result.delivery,
        humanReadConfirmed: false,
      },
      {
        version: contractVersion,
        scope,
        conversationId: 'chat',
        deliveryId: 'delivery',
        receiptId,
        status: 'accepted',
        delivery: result.delivery,
        humanReadConfirmed: true,
      },
    ]) {
      vi.mocked(api).mockResolvedValue(response);
      await expect(
        acknowledgeRuntimeResult(result, false, storage()),
      ).rejects.toThrow();
    }
  });
});

describe('immutable delivery retries', () => {
  it('allows only qualified notification recovery states', async () => {
    const result = await verified();
    for (const state of [
      'pending',
      'failed',
      'awaiting_ack',
      'partial',
      'outcome_unknown',
    ] as const)
      expect(
        canRetryRuntimeResult({
          ...result,
          delivery: { ...result.delivery!, state },
        }),
      ).toBe(true);
    for (const state of ['attempting', 'dead_letter', 'delivered'] as const)
      expect(
        canRetryRuntimeResult({
          ...result,
          delivery: { ...result.delivery!, state },
        }),
      ).toBe(false);
    expect(
      canRetryRuntimeResult({
        ...result,
        delivery: { ...result.delivery!, result_available: false },
      }),
    ).toBe(false);
  });
  it('inspects the original lost retry with its original attempt revision after refresh', async () => {
    const result = await verified(),
      store = storage(),
      dispatch = vi.fn();
    dispatch.mockRejectedValueOnce(new Error('lost retry'));
    await expect(retryRuntimeResult(result, dispatch, store)).rejects.toThrow(
      'lost retry',
    );
    expect(hasPendingDeliveryRetry(result, store)).toBe(true);
    expect(dispatch.mock.calls[0]).toEqual([
      'deliveries/delivery/actions',
      'retry_delivery',
      { artifactId: 'artifact', version: 2, sha256: result.artifact.sha256 },
      1,
      false,
    ]);
    dispatch.mockResolvedValueOnce(undefined);
    await retryRuntimeResult(
      {
        ...result,
        delivery: {
          ...result.delivery!,
          attempt_count: 2,
          state: 'attempting',
        },
      },
      dispatch,
      store,
    );
    expect(dispatch.mock.calls[1]).toEqual([
      'deliveries/delivery/actions',
      'retry_delivery',
      { artifactId: 'artifact', version: 2, sha256: result.artifact.sha256 },
      1,
      true,
    ]);
    expect(hasPendingDeliveryRetry(result, store)).toBe(false);
  });
});
