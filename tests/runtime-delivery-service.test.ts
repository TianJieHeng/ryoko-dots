import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  RuntimeDeliveryService,
  type DeliveryResults,
  type DeliveryTransport,
  type BrowserDeliveryAcknowledgment,
} from '../src/server/runtime/delivery-service.js';
import type { ControlBinding } from '../src/server/runtime/control-service.js';
import { RuntimeFailure } from '../src/server/runtime/conversation-rpc.js';
import type { RuntimeDeliveryReceipt } from '../src/shared/runtime/producer/wire.generated.js';

const cleanups: (() => void)[] = [];
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup()),
);
function fixture(text = 'Exact café 🥐 result') {
  const directory = mkdtempSync(join(tmpdir(), 'runtime-result-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const database = join(directory, 'state.sqlite');
  const bytes = Buffer.from(
    JSON.stringify({ final_response: text, completed: true }),
  );
  const sha256 = createHash('sha256').update(bytes).digest('hex');
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
      durableSessionId: 'durable-1',
      liveSessionId: 'live-1',
      liveGeneration: 1,
      revision: 1,
      archived: false,
    },
    binding: {
      key: 'conversation-1',
      liveSessionId: 'live-1',
      durableSessionId: 'durable-1',
      generation: 1,
    },
    epoch: 1,
  };
  let delivery: RuntimeDeliveryReceipt = {
    delivery_id: 'delivery-1',
    artifact_id: 'artifact-1',
    version: 1,
    sha256,
    destination: {
      kind: 'local_runtime',
      session_id: 'durable-1',
      principal_id: 'principal-1',
      profile_id: 'profile-1',
      agent_id: 'agent-1',
    },
    state: 'awaiting_ack',
    acknowledgment_level: 'transport_accepted',
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
  let revoked = false;
  const calls: {
    method: keyof DeliveryResults;
    params: Record<string, unknown>;
  }[] = [];
  const hooks = new Map<
    keyof DeliveryResults,
    (params: Record<string, unknown>, value: unknown) => Promise<unknown>
  >();
  const transport = {
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
    async call<M extends keyof DeliveryResults>(
      method: M,
      raw: unknown,
    ): Promise<DeliveryResults[M]> {
      const params = raw as Record<string, unknown>;
      calls.push({ method, params });
      let value: unknown;
      if (method === 'runtime.result.get') {
        const offset = Number(params.offset);
        const data = bytes.subarray(offset, offset + Number(params.limit));
        value = {
          command_id: 'command-1',
          artifact_id: 'artifact-1',
          version: 1,
          sha256,
          size: bytes.length,
          mime: 'application/json',
          offset,
          data_base64: data.toString('base64'),
          next_offset: offset + data.length,
          eof: offset + data.length === bytes.length,
          publication_state: 'committed',
          delivery_id: 'delivery-1',
        };
      } else if (method === 'runtime.delivery.status')
        value = structuredClone(delivery);
      else {
        expect(params.attempt_token).toBe('producer-private-attempt-1');
        expect(params.sha256).toBe(sha256);
        const components = {
          text: params.text_received
            ? ('client_received' as const)
            : delivery.components.text,
          artifact: params.artifact_received
            ? ('client_received' as const)
            : delivery.components.artifact,
        };
        value = {
          ...delivery,
          components,
          acknowledgment_level: 'client_received',
          state: Object.values(components).every(
            (state) => state === 'client_received',
          )
            ? 'delivered'
            : 'partial',
        };
      }
      const hook = hooks.get(method);
      if (hook) value = await hook(params, value);
      if (method === 'runtime.delivery.ack')
        delivery = value as RuntimeDeliveryReceipt;
      return value as DeliveryResults[M];
    },
  } satisfies DeliveryTransport;
  const auth = () => {
    if (revoked) throw new Error('revoked');
  };
  function create() {
    return new RuntimeDeliveryService(
      'owner-1',
      database,
      transport,
      async (conversationId, guard) => {
        guard();
        if (conversationId !== bound.scope.conversationId)
          throw new Error('foreign');
        return structuredClone(bound);
      },
      (scope, guard) => {
        guard();
        if (
          scope.authorityRevision !== bound.scope.authorityRevision ||
          scope.liveGeneration !== bound.scope.liveGeneration
        )
          throw new Error('stale');
      },
    );
  }
  let service = create();
  cleanups.push(() => service.close());
  const event = {
    type: 'runtime.result.available',
    session_id: 'live-1',
    seq: 1,
    payload: {
      command_id: 'command-1',
      delivery_id: 'delivery-1',
      artifact_id: 'artifact-1',
      version: 1,
      sha256,
      size: bytes.length,
      mime: 'application/json',
      attempt_token: 'producer-private-attempt-1',
    },
  };
  return {
    get service() {
      return service;
    },
    database,
    bound,
    transport,
    calls,
    hooks,
    event,
    bytes,
    sha256,
    auth,
    get delivery() {
      return delivery;
    },
    set delivery(value) {
      delivery = value;
    },
    revoke() {
      revoked = true;
    },
    restart() {
      service.close();
      service = create();
    },
    read: () => service.readResult('conversation-1', 'command-1', auth),
    notice: () => service.observeResultAvailable(event, transport.epoch),
    ack: (claim: BrowserDeliveryAcknowledgment) =>
      service.acknowledge('conversation-1', 'delivery-1', claim, auth),
    claim: (
      receiptId: string,
      textReceived = true,
      artifactReceived = true,
    ) => ({ receiptId, sha256, textReceived, artifactReceived }),
  };
}

describe('immutable result/browser receipt bridge', () => {
  it('reconstructs exact multi-chunk UTF-8 bytes, checks digest, and does not acknowledge reads', async () => {
    const f = fixture('🥐'.repeat(24000));
    const withoutNotice = await f.read();
    expect(withoutNotice.browserReceiptId).toBeNull();
    expect(f.notice()).toBe(true);
    const result = await f.read();
    expect(Buffer.from(result.artifact.dataBase64, 'base64')).toEqual(f.bytes);
    expect(result.finalResponse).toBe('🥐'.repeat(24000));
    expect(result.artifact.sha256).toBe(f.sha256);
    expect(result.browserReceiptId).toMatch(/^[a-f0-9-]{36}$/);
    expect(result.delivery?.acknowledgment_level).toBe('transport_accepted');
    expect(JSON.stringify(result)).not.toContain('producer-private-attempt-1');
    expect(
      f.calls.filter(({ method }) => method === 'runtime.result.get'),
    ).toHaveLength(4);
    expect(
      f.calls.every(
        ({ method, params }) =>
          method !== 'runtime.delivery.ack' && params.session_id === 'live-1',
      ),
    ).toBe(true);
    const received = await f.ack(f.claim(result.browserReceiptId!));
    expect(received.status).toBe('accepted');
    expect(received.delivery?.state).toBe('delivered');
    expect(received.humanReadConfirmed).toBe(false);
    await f.ack(f.claim(result.browserReceiptId!));
    expect(
      f.calls.filter(({ method }) => method === 'runtime.delivery.ack'),
    ).toHaveLength(1);
    expect(
      f.calls.every(({ method }) =>
        [
          'runtime.result.get',
          'runtime.delivery.status',
          'runtime.delivery.ack',
        ].includes(method),
      ),
    ).toBe(true);
  });

  it('reuses an unclaimed receipt and bounds durable receipt admission without losing read access', async () => {
    const f = fixture();
    f.notice();
    const first = await f.read();
    expect((await f.read()).browserReceiptId).toBe(first.browserReceiptId);
    const db = new DatabaseSync(f.database);
    try {
      db.exec(`WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value+1 FROM n WHERE value<4095)
        INSERT INTO runtime_browser_delivery_receipts SELECT 'seed-'||n.value,ownerId,conversationId,authority,deliveryId,commandId,artifactId,version,sha256,attemptToken,intent,'outcome_unknown',result FROM runtime_browser_delivery_receipts,n WHERE receiptId='${first.browserReceiptId}';`);
      await f.ack(f.claim(first.browserReceiptId!));
      const atCapacity = await f.read();
      expect(atCapacity.browserReceiptId).toBeNull();
      expect(atCapacity.finalResponse).toBe('Exact café 🥐 result');
      expect(
        db
          .prepare(
            'SELECT COUNT(*) AS total FROM runtime_browser_delivery_receipts',
          )
          .get()?.total,
      ).toBe(4096);
    } finally {
      db.close();
    }
  });

  it('preserves partial component truth; a new exact browser claim is needed for another component', async () => {
    const f = fixture();
    f.notice();
    const first = await f.read();
    expect(
      (await f.ack(f.claim(first.browserReceiptId!, true, false))).delivery
        ?.state,
    ).toBe('partial');
    await expect(
      f.ack(f.claim(first.browserReceiptId!, false, true)),
    ).rejects.toThrow('component claim changed');
    const next = await f.read();
    expect(
      (await f.ack(f.claim(next.browserReceiptId!, false, true))).delivery
        ?.state,
    ).toBe('delivered');
  });

  it('stores ambiguous ACK intent across restart and inspects without redispatch', async () => {
    const f = fixture();
    f.notice();
    const result = await f.read();
    const claim = f.claim(result.browserReceiptId!);
    f.hooks.set('runtime.delivery.ack', async () => {
      throw new RuntimeFailure('unknown');
    });
    expect((await f.ack(claim)).status).toBe('outcome_unknown');
    f.restart();
    expect((await f.ack(claim)).status).toBe('outcome_unknown');
    f.delivery = {
      ...f.delivery,
      state: 'delivered',
      acknowledgment_level: 'client_received',
      components: { text: 'client_received', artifact: 'client_received' },
    };
    expect((await f.ack(claim)).status).toBe('accepted');
    expect(
      f.calls.filter(({ method }) => method === 'runtime.delivery.ack'),
    ).toHaveLength(1);
  });

  it('reconnects to the same durable scope without losing an already issued receipt', async () => {
    const f = fixture();
    f.notice();
    const result = await f.read();
    f.transport.epoch++;
    f.bound.epoch++;
    f.bound.scope.liveSessionId = f.bound.binding.liveSessionId = 'live-2';
    f.bound.scope.liveGeneration++;
    expect((await f.ack(f.claim(result.browserReceiptId!))).status).toBe(
      'accepted',
    );
    expect(f.calls.at(-1)?.params.session_id).toBe('live-2');
  });

  it('preserves uncertainty after a producer error without replaying ACK', async () => {
    const f = fixture();
    f.notice();
    const result = await f.read();
    f.hooks.set('runtime.delivery.ack', async () => {
      throw new RuntimeFailure('rejected', 4090);
    });
    const claim = f.claim(result.browserReceiptId!);
    expect((await f.ack(claim)).status).toBe('outcome_unknown');
    expect((await f.ack(claim)).status).toBe('outcome_unknown');
    expect(
      f.calls.filter(({ method }) => method === 'runtime.delivery.ack'),
    ).toHaveLength(1);
  });

  it('deduplicates concurrent browser acknowledgments before dispatch', async () => {
    const f = fixture();
    f.notice();
    const result = await f.read();
    const responses = await Promise.all([
      f.ack(f.claim(result.browserReceiptId!)),
      f.ack(f.claim(result.browserReceiptId!)),
    ]);
    expect(responses.some((result) => result.status === 'accepted')).toBe(true);
    expect(
      f.calls.filter(({ method }) => method === 'runtime.delivery.ack'),
    ).toHaveLength(1);
  });

  it('keeps published-uncommitted recovery distinct from completion or delivery', async () => {
    const f = fixture();
    f.notice();
    f.hooks.set('runtime.result.get', async (_params, value) => ({
      ...(value as object),
      publication_state: 'published_uncommitted',
      delivery_id: null,
    }));
    const result = await f.read();
    expect(result.publicationState).toBe('published_uncommitted');
    expect(result.finalResponse).toBe('Exact café 🥐 result');
    expect(result.delivery).toBeNull();
    expect(result.browserReceiptId).toBeNull();
    expect(f.calls.map(({ method }) => method)).toEqual(['runtime.result.get']);
  });

  it('never creates a browser receipt from another session, digest, or transport epoch', async () => {
    const f = fixture();
    expect(f.service.observeResultAvailable(f.event, 0)).toBe(false);
    expect(
      f.service.observeResultAvailable(
        { ...f.event, session_id: 'foreign' },
        1,
      ),
    ).toBe(true);
    expect((await f.read()).browserReceiptId).toBeNull();
    expect(
      f.service.observeResultAvailable(
        { ...f.event, payload: { ...f.event.payload, sha256: '0'.repeat(64) } },
        1,
      ),
    ).toBe(true);
    expect((await f.read()).browserReceiptId).toBeNull();
    f.event.seq = 2;
    f.notice();
    expect(
      f.service.observeResultAvailable(
        {
          ...f.event,
          seq: 1,
          payload: { ...f.event.payload, attempt_token: 'stale' },
        },
        1,
      ),
    ).toBe(false);
    const result = await f.read();
    expect((await f.ack(f.claim(result.browserReceiptId!))).status).toBe(
      'accepted',
    );
  });

  it.each([
    { offset: 1 },
    { next_offset: 0 },
    { eof: false },
    { sha256: '0'.repeat(64) },
    { data_base64: '%%%' },
    { size: 8 * 1024 * 1024 + 1 },
    { mime: 'text/html' },
    { command_id: 'foreign' },
    { publication_state: 'published_uncommitted' },
  ])(
    'rejects invalid result metadata/bytes %j without ACK',
    async (mutation) => {
      const f = fixture();
      f.notice();
      f.hooks.set('runtime.result.get', async (_params, value) => ({
        ...(value as object),
        ...mutation,
      }));
      await expect(f.read()).rejects.toThrow('result bytes or scope');
      expect(
        f.calls.some(({ method }) => method === 'runtime.delivery.ack'),
      ).toBe(false);
    },
  );

  it('rejects changing immutable references between chunks and reconnect while reading', async () => {
    const f = fixture('x'.repeat(70000));
    f.notice();
    f.hooks.set('runtime.result.get', async (params, value) =>
      Number(params.offset) > 0
        ? { ...(value as object), artifact_id: 'changed' }
        : value,
    );
    await expect(f.read()).rejects.toThrow('result bytes or scope');
    f.hooks.set('runtime.result.get', async (_params, value) => {
      f.transport.epoch++;
      return value;
    });
    await expect(f.read()).rejects.toThrow('binding changed');
  });

  it('rejects tiny non-final chunks instead of allowing unbounded RPC pagination', async () => {
    const f = fixture('x'.repeat(70000));
    f.hooks.set('runtime.result.get', async (_params, value) => ({
      ...(value as object),
      data_base64: 'ew==',
      next_offset: 1,
    }));
    await expect(f.read()).rejects.toThrow('result bytes or scope');
    expect(f.calls).toHaveLength(1);
  });

  it('fences a revoked scope after an in-flight ACK and retains unknown status', async () => {
    const f = fixture();
    f.notice();
    const result = await f.read();
    f.hooks.set('runtime.delivery.ack', async (_params, value) => {
      f.revoke();
      return value;
    });
    await expect(f.ack(f.claim(result.browserReceiptId!))).rejects.toThrow(
      'revoked',
    );
    const db = new DatabaseSync(f.database);
    try {
      expect(
        db
          .prepare(
            'SELECT state FROM runtime_browser_delivery_receipts WHERE receiptId=?',
          )
          .get(result.browserReceiptId!)?.state,
      ).toBe('outcome_unknown');
    } finally {
      db.close();
    }
  });

  it('rejects a foreign delivery destination before exposing result bytes', async () => {
    const f = fixture();
    f.notice();
    f.delivery = {
      ...f.delivery,
      destination: { ...f.delivery.destination, profile_id: 'foreign' },
    };
    await expect(f.read()).rejects.toThrow('result bytes or scope');
  });

  it('rejects forged digest/receipt, changed grants, and revocation without ACK', async () => {
    const f = fixture();
    f.notice();
    const result = await f.read();
    await expect(
      f.ack({ ...f.claim(result.browserReceiptId!), sha256: 'f'.repeat(64) }),
    ).rejects.toThrow('receipt does not match');
    await expect(
      f.ack({
        ...f.claim(result.browserReceiptId!),
        receiptId: '00000000-0000-4000-8000-000000000000',
      }),
    ).rejects.toThrow('receipt does not match');
    f.bound.scope.grantRevision++;
    await expect(f.ack(f.claim(result.browserReceiptId!))).rejects.toThrow(
      'receipt does not match',
    );
    f.bound.scope.grantRevision--;
    f.revoke();
    await expect(f.ack(f.claim(result.browserReceiptId!))).rejects.toThrow(
      'revoked',
    );
    expect(
      f.calls.some(({ method }) => method === 'runtime.delivery.ack'),
    ).toBe(false);
  });
});
