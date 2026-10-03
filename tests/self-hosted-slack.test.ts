import { afterEach, expect, test, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SelfHostedSlack,
  verifySlackSignature,
} from '../src/server/runtime/slack-service.js';
import { SlackWebApi } from '../src/server/runtime/slack-api.js';
import {
  SlackFailure,
  configurationDigest,
  hash,
  type SlackApi,
  type SlackBridge,
  type SlackConfig,
  type SendPayload,
  type ImmutableOutput,
} from '../src/server/runtime/slack-types.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
const secret = 'synthetic-only-secret-do-not-use';
const base: SlackConfig = {
  enabled: true,
  authority: 'dots_signed_events',
  ownerId: 'owner',
  dotId: 'dot',
  teamId: 'TTEST',
  appId: 'ATEST',
  botUserId: 'UBOT',
  allowedChannelIds: ['CTEST', 'DTEST'],
  allowedHumanUserIds: ['UHUMAN'],
  appOrigin: 'https://dots.example.test',
  replyAuthority: {
    ownerId: 'owner',
    grantId: 'synthetic-owner-reply-grant',
    expiresAt: 4102444800000,
    sourcePairs: [
      { channelId: 'CTEST', humanUserId: 'UHUMAN' },
      { channelId: 'DTEST', humanUserId: 'UHUMAN' },
    ],
    dataScope: 'primary_context_original_command_results',
    deliveryScope: 'original_slack_thread',
    runtimeIdentity: {
      principal_id: 'principal',
      profile_id: 'profile',
      agent_id: 'primary',
      policy_digest: 'a'.repeat(64),
      config_digest: 'b'.repeat(64),
    },
    projectIds: [],
  },
  qualification: null,
};
function config(): SlackConfig {
  const value = structuredClone(base);
  value.qualification = {
    configurationDigest: configurationDigest(value),
    evidenceId: 'synthetic-only',
  };
  return value;
}
function envelope(
  event: Record<string, unknown> = {},
  outer: Record<string, unknown> = {},
) {
  return {
    type: 'event_callback',
    team_id: 'TTEST',
    api_app_id: 'ATEST',
    event_id: 'EvFIRST',
    event: {
      type: 'app_mention',
      channel: 'CTEST',
      user: 'UHUMAN',
      ts: '1791048000.000001',
      text: 'Hello <@UBOT>',
      ...event,
    },
    ...outer,
  };
}
function signed(body: unknown, now = 1791048000000, signatureTime = now) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const time = String(Math.floor(signatureTime / 1000));
  const signature =
    'v0=' +
    createHmac('sha256', secret).update(`v0:${time}:${raw}`).digest('hex');
  return new Request('https://dots.example.test/slack/events', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-slack-request-timestamp': time,
      'x-slack-signature': signature,
    },
    body: raw,
  });
}
function fixture(
  overrides: Partial<SlackBridge> = {},
  apiOverrides: Partial<SlackApi> = {},
  cfg = config(),
  database?: string,
) {
  const directory = mkdtempSync(join(tmpdir(), 'slack-test-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  let now = 1791048000000;
  const posted: SendPayload[] = [];
  const bridge: SlackBridge = {
    ready: () => true,
    authorize: () => {},
    verifySource: async () => {},
    ensureConversation: vi.fn(
      async (thread) => `conversation_${thread.threadTs.replace('.', '_')}`,
    ),
    admit: vi.fn(async () => 'accepted' as const),
    inspect: vi.fn(async () => 'accepted' as const),
    output: vi.fn(async () => null),
    ...overrides,
  };
  const api: SlackApi = {
    verifyIdentity: vi.fn(async () => {}),
    post: vi.fn(async (payload) => {
      posted.push(payload);
      return { channel: payload.channel, ts: '1791048001.000001' };
    }),
    inspect: vi.fn(async () => ({ found: null, cursor: null })),
    ...apiOverrides,
  };
  const path = database ?? join(directory, 'slack.sqlite');
  const service = new SelfHostedSlack(
    cfg,
    path,
    () => secret,
    bridge,
    api,
    () => now,
  );
  let closed = false;
  const close = () => {
    if (!closed) {
      service.close();
      closed = true;
    }
  };
  cleanups.push(close);
  return {
    service,
    bridge,
    api,
    posted,
    path,
    close,
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
const output: ImmutableOutput = {
  artifactId: 'artifact',
  version: 1,
  sha256: hash('immutable-producer-bytes'),
  text: 'Answer with citation https://example.test/source',
};
async function accepted(f: ReturnType<typeof fixture>, body = envelope()) {
  await f.service.connect();
  expect((await f.service.handle(signed(body, f.now()))).status).toBe(200);
  await f.service.tick();
  return f.service.ledger.event(String(body.event_id))!;
}

test('HMAC checks exact raw bytes, timestamp skew, malformed/duplicate signature, and replay age', async () => {
  const req = signed('{ "type": "url_verification", "challenge":"abc" }');
  const raw = new Uint8Array(await req.arrayBuffer());
  expect(verifySlackSignature(raw, req.headers, secret, 1791048000000)).toBe(
    true,
  );
  expect(
    verifySlackSignature(
      Buffer.from(JSON.stringify(JSON.parse(Buffer.from(raw).toString()))),
      req.headers,
      secret,
      1791048000000,
    ),
  ).toBe(false);
  expect(verifySlackSignature(raw, req.headers, secret, 1791048301000)).toBe(
    false,
  );
  expect(verifySlackSignature(raw, req.headers, secret, 1791047699000)).toBe(
    false,
  );
  req.headers.append('x-slack-signature', 'v0=' + 'a'.repeat(64));
  expect(verifySlackSignature(raw, req.headers, secret, 1791048000000)).toBe(
    false,
  );
});
test('signed setup challenge needs no activation; unqualified channel cannot admit or connect', async () => {
  const cfg = config();
  cfg.enabled = false;
  cfg.qualification = null;
  const f = fixture({}, {}, cfg);
  expect(
    (
      await f.service.handle(
        signed({ type: 'url_verification', challenge: 'challenge' }),
      )
    ).status,
  ).toBe(200);
  await expect(f.service.connect()).rejects.toMatchObject({
    code: 'unavailable',
  });
  expect((await f.service.handle(signed(envelope()))).status).toBe(503);
  expect(f.bridge.admit).not.toHaveBeenCalled();
});
test.each([
  [{}, { team_id: 'TFOREIGN' }, 403],
  [{}, { api_app_id: 'AFOREIGN' }, 403],
  [{}, { context_team_id: 'TFOREIGN' }, 403],
  [{}, { is_ext_shared_channel: true }, 403],
  [{ user: 'UFOREIGN' }, {}, 403],
  [{ channel: 'CFOREIGN' }, {}, 403],
  [{ user_team: 'TFOREIGN' }, {}, 403],
  [{ bot_id: 'BBOT' }, {}, 200],
  [{ bot_profile: {} }, {}, 200],
  [{ user: 'UBOT' }, {}, 200],
  [{ subtype: 'message_changed' }, {}, 200],
  [{ subtype: 'message_deleted' }, {}, 200],
  [{ type: 'reaction_added' }, {}, 200],
  [{ edited: {} }, {}, 200],
  [{ hidden: true }, {}, 200],
  [{ type: 'message' }, {}, 200],
  [{ thread_ts: 'bad' }, {}, 400],
  [{ text: 'x'.repeat(16001) }, {}, 400],
] as [Record<string, unknown>, Record<string, unknown>, number][])(
  'event family and exact installation allowlists refuse or ignore %#',
  async (event, outer, status) => {
    const f = fixture();
    await f.service.connect();
    expect(
      (await f.service.handle(signed(envelope(event, outer)))).status,
    ).toBe(status);
    await f.service.tick();
    expect(f.bridge.admit).not.toHaveBeenCalled();
  },
);
test('durable acknowledgment precedes admission; duplicate event and alternate message envelope admit once', async () => {
  const f = fixture();
  await f.service.connect();
  const first = await f.service.handle(signed(envelope()));
  expect(await first.json()).toEqual({ accepted: true, duplicate: false });
  expect(f.bridge.admit).not.toHaveBeenCalled();
  expect(await (await f.service.handle(signed(envelope()))).json()).toEqual({
    accepted: true,
    duplicate: true,
  });
  expect(
    await (
      await f.service.handle(
        signed(envelope({ type: 'message' }, { event_id: 'EvALIAS' })),
      )
    ).json(),
  ).toEqual({ accepted: true, duplicate: true });
  await Promise.all([f.service.tick(), f.service.tick()]);
  expect(f.bridge.admit).toHaveBeenCalledTimes(1);
  expect(f.service.ledger.event('EvFIRST')?.operationId).toBe(
    f.service.ledger.event('EvALIAS')?.operationId,
  );
  expect(
    (
      await f.service.handle(
        signed(envelope({ text: 'conflicting' }, { event_id: 'EvALIAS' })),
      )
    ).status,
  ).toBe(409);
});
test('canonical mapping survives restart; threaded replies share conversation and distinct top level mentions do not', async () => {
  const f = fixture();
  const first = await accepted(f);
  f.close();
  const g = fixture({}, {}, config(), f.path);
  await g.service.connect();
  await g.service.handle(
    signed(
      envelope(
        {
          type: 'message',
          ts: '1791048001.000001',
          thread_ts: '1791048000.000001',
        },
        { event_id: 'EvSECOND' },
      ),
    ),
  );
  await g.service.handle(
    signed(envelope({ ts: '1791048002.000001' }, { event_id: 'EvTHIRD' })),
  );
  await g.service.tick();
  expect(g.service.ledger.event('EvSECOND')?.conversationId).toBe(
    first.conversationId,
  );
  expect(g.service.ledger.event('EvTHIRD')?.conversationId).not.toBe(
    first.conversationId,
  );
  expect(g.bridge.ensureConversation).toHaveBeenCalledTimes(1);
});
test('crash after dispatch boundary only inspects; crash during mapping can recover its reserved identity', async () => {
  const f = fixture();
  await f.service.connect();
  await f.service.handle(signed(envelope()));
  const event = f.service.ledger.event('EvFIRST')!;
  f.service.ledger.map(event.threadKey, 'conversation');
  f.service.ledger.settleEvent(event.operationId, 'dispatching');
  f.close();
  const g = fixture(
    { inspect: vi.fn(async () => 'unknown' as const) },
    {},
    config(),
    f.path,
  );
  await g.service.connect();
  await g.service.tick();
  expect(g.bridge.admit).not.toHaveBeenCalled();
  expect(g.bridge.inspect).toHaveBeenCalledOnce();
  expect(g.service.ledger.event('EvFIRST')?.state).toBe('unknown');
});
test('one live authority is permitted per durable installation, and managed ingress coexistence is rejected', () => {
  const f = fixture();
  expect(() => fixture({}, {}, config(), f.path)).toThrow('conflict');
  expect(
    () =>
      new SelfHostedSlack(
        config(),
        f.path,
        () => secret,
        f.bridge,
        f.api,
        Date.now,
        true,
      ),
  ).toThrow('conflict');
});
test('immutable output exact version cannot change bytes or destination; actual provider acknowledgment settles once', async () => {
  const f = fixture({ output: vi.fn(async () => output) });
  const event = await accepted(f);
  expect(f.posted).toHaveLength(1);
  expect(f.posted[0]).toMatchObject({
    channel: 'CTEST',
    thread_ts: '1791048000.000001',
    mrkdwn: false,
    parse: 'none',
    unfurl_links: false,
    reply_broadcast: false,
  });
  const row = f.service.ledger.deliveries()[0];
  expect(row.state).toBe('delivered');
  expect(row.providerReceipt).toBe('CTEST:1791048001.000001');
  expect(f.service.queueOutput(event.eventId, output).id).toBe(row.id);
  expect(() =>
    f.service.queueOutput(event.eventId, { ...output, text: 'changed output' }),
  ).toThrow('conflict');
  await f.service.tick();
  expect(f.posted).toHaveLength(1);
});
test('HTTP 429 backoff is persisted and bounded to five attempts; no timer shortens provider Retry-After', async () => {
  const post = vi.fn(async () => {
    throw new SlackFailure('throttled', 120000);
  });
  const f = fixture({ output: vi.fn(async () => output) }, { post });
  await accepted(f);
  let row = f.service.ledger.deliveries()[0];
  expect(row.state).toBe('queued');
  expect(row.nextAt - f.now()).toBe(120000);
  f.advance(119999);
  await f.service.tick();
  expect(post).toHaveBeenCalledTimes(1);
  f.advance(1);
  await f.service.tick();
  expect(post).toHaveBeenCalledTimes(2);
  for (let i = 0; i < 3; i++) {
    f.advance(120000);
    await f.service.tick();
  }
  row = f.service.ledger.deliveries()[0];
  expect(row.state).toBe('failed');
  expect(row.attempts).toBe(5);
  f.advance(120000);
  await f.service.tick();
  expect(post).toHaveBeenCalledTimes(5);
});
test('acceptance with response loss remains unknown across restart and never resends; exact inspect receipt settles it', async () => {
  const post = vi.fn(async () => {
    throw new SlackFailure('unknown');
  });
  const f = fixture({ output: vi.fn(async () => output) }, { post });
  await accepted(f);
  const id = f.service.ledger.deliveries()[0].id;
  expect(f.service.ledger.outbox(id)?.state).toBe('unknown');
  f.close();
  const inspect = vi.fn(async () => ({
    found: null as string | null,
    cursor: 'next',
  }));
  const g = fixture({}, { inspect }, config(), f.path);
  await g.service.connect();
  await g.service.tick();
  expect(g.api.post).not.toHaveBeenCalled();
  expect((await g.service.inspectDelivery(id)).state).toBe('unknown');
  g.advance(60000);
  inspect.mockResolvedValueOnce({ found: '1791048001.000001', cursor: '' });
  expect((await g.service.inspectDelivery(id)).state).toBe('delivered');
  expect(g.api.post).not.toHaveBeenCalled();
});
test('revoked authority holds unsent output and send-time permission rejection never auto retries', async () => {
  let revoked = false;
  const f = fixture({
    authorize: () => {
      if (revoked) throw new SlackFailure('denied');
    },
  });
  const event = await accepted(f);
  f.service.queueOutput(event.eventId, output);
  revoked = true;
  await expect(f.service.tick()).rejects.toMatchObject({ code: 'denied' });
  expect(f.api.post).not.toHaveBeenCalled();
  const g = fixture(
    { output: vi.fn(async () => output) },
    {
      post: vi.fn(async () => {
        throw new SlackFailure('denied');
      }),
    },
  );
  await accepted(g);
  await expect(g.service.tick()).rejects.toMatchObject({ code: 'unavailable' });
  expect(g.service.ledger.deliveries()[0].state).toBe('failed');
  expect(g.api.post).toHaveBeenCalledTimes(1);
});
test('review links remain exact authenticated app paths; artifacts stay private and markup cannot mention or unfurl', async () => {
  const f = fixture();
  const event = await accepted(f);
  const row = f.service.queueOutput(event.eventId, {
    ...output,
    text: '<@UHUMAN> ' + 'a'.repeat(4000),
    reviewPath: '/#/missions/mission/reviews/review',
  });
  const payload = JSON.parse(row.payload);
  expect(payload.text).toContain(
    'https://dots.example.test/api/runtime/conversations/',
  );
  expect(payload.text).toContain(
    'https://dots.example.test/#/missions/mission/reviews/review',
  );
  expect(
    payload.blocks.every(
      (b: { text: { type: string } }) => b.text.type === 'plain_text',
    ),
  ).toBe(true);
  expect(() =>
    f.service.queueOutput(event.eventId, {
      ...output,
      version: 2,
      reviewPath: 'https://evil.test',
    }),
  ).toThrow('invalid');
  expect(() =>
    f.service.queueOutput(event.eventId, {
      ...output,
      version: 2,
      reviewPath: '/#/missions/m/reviews/../secret',
    }),
  ).toThrow('invalid');
});

test('actual Slack Web API adapter uses loopback auth, JSON send, safe response-loss recovery and no blind retry', async () => {
  let received: SendPayload | undefined;
  let posts = 0;
  let lose = true;
  let inspectCalls = 0;
  const server: Server = createServer(async (req, res) => {
    expect(req.headers.authorization).toBe('Bearer synthetic-test-token');
    if (req.url?.startsWith('/api/auth.test')) {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          ok: true,
          team_id: 'TTEST',
          user_id: 'UBOT',
          bot_id: 'BTEST',
        }),
      );
      return;
    }
    if (req.url === '/api/chat.postMessage') {
      let body = '';
      for await (const chunk of req) body += chunk;
      received = JSON.parse(body);
      posts++;
      if (lose) {
        lose = false;
        res.destroy();
        return;
      }
      res.end(
        JSON.stringify({ ok: true, channel: 'CTEST', ts: '1791048001.000001' }),
      );
      return;
    }
    if (req.url?.startsWith('/api/conversations.replies')) {
      inspectCalls++;
      res.end(
        JSON.stringify({
          ok: true,
          messages: [
            {
              user: 'UFOREIGN',
              thread_ts: received!.thread_ts,
              ts: '1791048001.000000',
              blocks: received!.blocks,
              text: received!.text,
            },
            {
              user: 'UBOT',
              thread_ts: received!.thread_ts,
              ts: '1791048001.000001',
              blocks: received!.blocks,
              text: received!.text,
            },
          ],
          response_metadata: { next_cursor: '' },
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  try {
    const api = new SlackWebApi(() => 'synthetic-test-token', {
      loopbackTestOrigin: `http://127.0.0.1:${address.port}`,
    });
    const f = fixture({ output: vi.fn(async () => output) }, api); // class methods are not enumerable; replace explicit bound methods below.
    const service = new SelfHostedSlack(
      config(),
      f.path + '.http',
      () => secret,
      f.bridge,
      api,
      f.now,
    );
    cleanups.push(() => service.close());
    await service.connect();
    expect((await service.handle(signed(envelope()))).status).toBe(200);
    await service.tick();
    const row = service.ledger.deliveries()[0];
    expect(row.state).toBe('unknown');
    await service.tick();
    expect(posts).toBe(1);
    expect((await service.inspectDelivery(row.id)).state).toBe('delivered');
    expect(posts).toBe(1);
    expect(inspectCalls).toBe(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Hono public route preserves raw signature bytes; owner-only status cannot be opened anonymously', async () => {
  const { createSelfHostedSlackApp } =
    await import('../src/server/runtime/slack-routes.js');
  const { OwnerAuth } = await import('../src/server/owner-auth.js');
  const f = fixture();
  await f.service.connect();
  const auth = new OwnerAuth(':memory:', {
    ownerId: 'owner',
    ownerToken: 'synthetic-owner-token-1234567890',
    origin: base.appOrigin,
  });
  cleanups.push(() => auth.close());
  const platform = {
    workspace: { ownerId: 'owner' },
    scope: async () => ({
      ownerId: 'owner',
      gatewayId: 'gateway',
      agentId: 'primary',
      projectId: null,
      authorityRevision: 1,
    }),
  };
  const app = createSelfHostedSlackApp({
    service: f.service,
    auth,
    platform: platform as never,
  });
  const raw = JSON.stringify(envelope(), null, 2);
  const req = signed(raw);
  const response = await app.request(req);
  expect(response.status).toBe(200);
  expect(f.bridge.admit).not.toHaveBeenCalled();
  expect(
    (await app.request(base.appOrigin + '/api/runtime/channels/slack')).status,
  ).toBe(401);
  const login = await app.request(base.appOrigin + '/api/auth/login', {
    method: 'POST',
    headers: { origin: base.appOrigin, 'content-type': 'application/json' },
    body: JSON.stringify({ ownerToken: 'synthetic-owner-token-1234567890' }),
  });
  expect(login.status).toBe(200);
  const status = await app.request(
    base.appOrigin + '/api/runtime/channels/slack',
    { headers: { cookie: login.headers.get('set-cookie')!.split(';')[0] } },
  );
  expect(status.status).toBe(200);
  const data = await status.json();
  expect(data.version).toBe('ryoko-dots/1');
  expect(data.state).toBe('ready');
  expect(JSON.stringify(data)).not.toContain(secret);
});
test('post crash sending record is unknown at takeover and stale worker cannot commit a late receipt', async () => {
  const f = fixture();
  const event = await accepted(f);
  const row = f.service.queueOutput(event.eventId, output);
  f.service.ledger.claimSend(row.id);
  // A live stale process and a new process share the durable DB. New holder wins after lease expiry.
  const later = 1791048061000;
  const gConfig = config();
  const g = new SelfHostedSlack(
    gConfig,
    f.path,
    () => secret,
    f.bridge,
    f.api,
    () => later,
  );
  cleanups.push(() => g.close());
  await g.connect();
  expect(g.ledger.outbox(row.id)?.state).toBe('unknown');
  expect(() =>
    f.service.ledger.settleSend(row.id, 'delivered', 'CTEST:1791048001.000001'),
  ).toThrow('unavailable');
  await g.tick();
  expect(f.posted).toHaveLength(0);
});
test('retains bounded output and channel pacing across worker ticks', async () => {
  const f = fixture({ output: vi.fn(async () => output) });
  await f.service.connect();
  for (let i = 0; i < 3; i++)
    await f.service.handle(
      signed(envelope({ ts: `179104800${i}.000001` }, { event_id: `Ev${i}` })),
    );
  await f.service.tick();
  expect(f.posted).toHaveLength(1);
  f.advance(1100);
  await f.service.tick();
  expect(f.posted).toHaveLength(2);
  f.advance(1100);
  await f.service.tick();
  expect(f.posted).toHaveLength(3);
});
test('signed oversized, stale and malformed payloads never reach durable admission', async () => {
  const f = fixture();
  await f.service.connect();
  expect((await f.service.handle(signed('x'.repeat(65537)))).status).toBe(413);
  expect(
    (await f.service.handle(signed(envelope(), f.now(), f.now() - 301000)))
      .status,
  ).toBe(401);
  expect((await f.service.handle(signed('{bad json'))).status).toBe(400);
  await f.service.tick();
  expect(f.bridge.admit).not.toHaveBeenCalled();
});

test('an uncertain prior admission fences later thread messages, and accepted polling fairly reaches beyond the first page', async () => {
  const admit = vi.fn(async () => 'unknown' as const);
  const f = fixture({ admit, inspect: vi.fn(async () => 'unknown' as const) });
  await f.service.connect();
  await f.service.handle(signed(envelope()));
  await f.service.tick();
  await f.service.handle(
    signed(
      envelope(
        {
          type: 'message',
          ts: '1791048001.000001',
          thread_ts: '1791048000.000001',
        },
        { event_id: 'EvLATER' },
      ),
    ),
  );
  await f.service.tick();
  expect(admit).toHaveBeenCalledTimes(1);
  expect(f.service.ledger.event('EvLATER')?.state).toBe('queued');
  const read = vi.fn<SlackBridge['output']>(async () => null);
  const g = fixture({ output: read });
  await g.service.connect();
  for (let i = 0; i < 40; i++)
    await g.service.handle(
      signed(
        envelope(
          { ts: `${1791048000 + i}.000001` },
          { event_id: `EvPAGE${i}` },
        ),
      ),
    );
  await g.service.tick();
  await g.service.tick();
  expect(
    new Set(
      read.mock.calls.map(
        (call) => (call[0] as { eventId: string } | undefined)?.eventId,
      ),
    ).size,
  ).toBe(40);
});

test('allowlisted identities still require exact scoped standing authority, and expired or missing authority never activates', async () => {
  for (const replyAuthority of [
    null,
    { ...config().replyAuthority!, expiresAt: 1 },
  ]) {
    const cfg = config();
    cfg.replyAuthority = replyAuthority;
    cfg.qualification!.configurationDigest = configurationDigest(cfg);
    const f = fixture({}, {}, cfg);
    await expect(f.service.connect()).rejects.toThrow();
    expect(f.api.verifyIdentity).not.toHaveBeenCalled();
  }
  const cfg = config();
  cfg.replyAuthority!.sourcePairs = [
    { channelId: 'CTEST', humanUserId: 'UHUMAN' },
  ];
  cfg.qualification!.configurationDigest = configurationDigest(cfg);
  const f = fixture({}, {}, cfg);
  await f.service.connect();
  expect(
    (
      await f.service.handle(
        signed(envelope({ channel: 'DTEST', type: 'message' }), f.now()),
      )
    ).status,
  ).toBe(403);
  expect(f.bridge.ensureConversation).not.toHaveBeenCalled();
});
test('durable inbox policy is frozen: a later narrowed or replaced standing grant cannot reuse private conversation/outbox history', async () => {
  const f = fixture();
  await accepted(f);
  f.close();
  const cfg = config();
  cfg.replyAuthority!.grantId = 'replacement-grant';
  cfg.qualification!.configurationDigest = configurationDigest(cfg);
  expect(
    () =>
      new SelfHostedSlack(cfg, f.path, () => secret, f.bridge, f.api, f.now),
  ).toThrow('conflict');
});
test('a current producer grant failure after result publication holds the original outbox without sending', async () => {
  let allowed = true;
  const f = fixture({
    verifySource: async () => {
      if (!allowed) throw new SlackFailure('denied');
    },
  });
  const event = await accepted(f);
  const row = f.service.queueOutput(event.eventId, output);
  allowed = false;
  await f.service.tick();
  expect(f.service.ledger.outbox(row.id)?.state).toBe('held');
  expect(f.api.post).not.toHaveBeenCalled();
});

test('reconciliation requires exact unedited bot-authored fallback and ordered complete immutable blocks', async () => {
  const f = fixture();
  const event = await accepted(f);
  const row = f.service.queueOutput(event.eventId, output);
  const payload = JSON.parse(row.payload) as SendPayload;
  const original = {
    user: 'UBOT',
    thread_ts: payload.thread_ts,
    ts: '1791048001.000001',
    text: payload.text,
    blocks: payload.blocks,
  };
  let message: unknown = original;
  const api = new SlackWebApi(() => 'synthetic-token', {
    fetch: async () =>
      Response.json({
        ok: true,
        messages: [message],
        response_metadata: { next_cursor: '' },
      }),
  });
  expect((await api.inspect(payload, 'UBOT', null)).found).toBe(original.ts);
  for (const replacement of [
    { ...original, edited: { ts: original.ts } },
    { ...original, text: 'different' },
    { ...original, subtype: 'message_changed' },
    { ...original, user: 'UOTHER' },
    { ...original, blocks: [...payload.blocks, ...payload.blocks] },
    {
      ...original,
      blocks: [{ ...payload.blocks[0], block_id: 'copied-but-not-exact' }],
    },
  ]) {
    message = replacement;
    expect((await api.inspect(payload, 'UBOT', null)).found).toBeNull();
  }
});

test('shutdown waits for in-flight connect/start and never fences a closed ledger or starts a late worker', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = fixture({}, { verifyIdentity: async () => gate });
  const close = vi.spyOn(f.service.ledger, 'close');
  const start = f.service.start();
  const failed = expect(start).rejects.toThrow('unavailable');
  const stop = f.service.stop();
  expect(close).not.toHaveBeenCalled();
  release();
  await failed;
  await stop;
  await f.service.stop();
  expect(close).toHaveBeenCalledTimes(1);
  expect(f.api.post).not.toHaveBeenCalled();
  expect(f.bridge.ensureConversation).not.toHaveBeenCalled();
});

test('shutdown waits for an in-flight read-only delivery inspection before closing its durable receipt ledger', async () => {
  let release!: (value: { found: string; cursor: null }) => void;
  const gate = new Promise<{ found: string; cursor: null }>((resolve) => {
    release = resolve;
  });
  const f = fixture(
    {},
    {
      post: async () => {
        throw new SlackFailure('unknown');
      },
      inspect: async () => gate,
    },
  );
  const event = await accepted(f);
  const row = f.service.queueOutput(event.eventId, output);
  await f.service.tick();
  const close = vi.spyOn(f.service.ledger, 'close');
  const inspect = f.service.inspectDelivery(row.id);
  await Promise.resolve();
  await Promise.resolve();
  expect(f.api.inspect).toBeDefined();
  const stop = f.service.stop();
  expect(close).not.toHaveBeenCalled();
  release({ found: '1791048001.000001', cursor: null });
  expect((await inspect).state).toBe('delivered');
  await stop;
  expect(close).toHaveBeenCalledTimes(1);
});
