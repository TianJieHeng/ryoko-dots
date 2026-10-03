import { afterEach, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getRequestListener } from '@hono/node-server';
import { WorkspaceStore } from '../src/server/workspace.js';
import { Store } from '../src/server/store.js';
import { OwnerAuth } from '../src/server/owner-auth.js';
import { createSelfHostedApp } from '../src/server/self-hosted-app.js';
import { SelfHostedPlatform } from '../src/server/self-hosted-platform.js';
import { BE06_PRODUCER_COMMIT } from '../src/server/runtime/be06-service.js';
import { be06Methods } from '../src/server/runtime/be06-wire.js';
import type { ConversationTransport } from '../src/server/runtime/stdio.js';
import { CommandServiceSlackBridge } from '../src/server/runtime/slack-bridge.js';
import { SlackWebApi } from '../src/server/runtime/slack-api.js';
import {
  currentSlackPolicy,
  loadSlackConfig,
} from '../src/server/runtime/slack-config.js';
import {
  createSlackRuntime,
  startSlackRuntime,
} from '../src/server/runtime/slack-runtime.js';
import { SelfHostedSlack } from '../src/server/runtime/slack-service.js';
import {
  configurationDigest,
  hash,
  type SendPayload,
} from '../src/server/runtime/slack-types.js';
import {
  channelStatusSchema,
  deliveriesSchema,
} from '../src/shared/runtime/channels.js';

const baseline = JSON.parse(
  readFileSync(
    new URL('./fixtures/runtime/producer-baseline.json', import.meta.url),
    'utf8',
  ),
);
const secret = 'synthetic-signing-secret';
const ownerToken = 'synthetic-owner-token-not-real-123456';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
async function fixture(withProject = false) {
  const directory = mkdtempSync(join(tmpdir(), 'slack-consumer-http-'));
  const handler: { listener?: ReturnType<typeof getRequestListener> } = {};
  const server = createServer((req, res) => handler.listener!(req, res));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const origin = base.replace('http:', 'https:');
  const database = join(directory, 'state.sqlite');
  const workspace = new WorkspaceStore(database, 'owner');
  const store = new Store(database);
  const auth = new OwnerAuth(database, {
    ownerId: 'owner',
    ownerToken,
    origin,
    allowLoopbackTlsProxy: true,
  });
  const dotId = workspace.dots()[0].id;
  const identity = {
    principal_id: 'principal',
    profile_id: 'profile',
    agent_id: 'primary',
    policy_digest: 'a'.repeat(64),
    config_digest: 'b'.repeat(64),
  };
  const config = {
    enabled: true,
    authority: 'dots_signed_events' as const,
    exclusiveIngressConfirmed: true as const,
    ownerId: 'owner',
    dotId,
    teamId: 'TTEST',
    appId: 'ATEST',
    botUserId: 'UBOT',
    allowedChannelIds: ['CTEST', 'COTHER'],
    allowedHumanUserIds: ['UHUMAN', 'UOTHER'],
    appOrigin: origin,
    replyAuthority: {
      ownerId: 'owner',
      grantId: 'explicit-owner-reply',
      expiresAt: Date.now() + 86400000,
      sourcePairs: [{ channelId: 'CTEST', humanUserId: 'UHUMAN' }],
      dataScope: 'primary_context_original_command_results' as const,
      deliveryScope: 'original_slack_thread' as const,
      runtimeIdentity: identity,
      projectIds: withProject ? ['project'] : [],
    },
    qualification: {
      configurationDigest: '',
      evidenceId: 'synthetic-loopback-only',
    },
  };
  config.qualification.configurationDigest = configurationDigest(config);
  const path = join(directory, 'slack.json');
  writeFileSync(path, JSON.stringify(config));
  const frozen = loadSlackConfig(path)!;
  const calls: string[] = [];
  let revoked = false;
  let projectIds: string[] = withProject ? ['project'] : [];
  let revokeOnResult = false;
  let projectWrite = true;
  const receipts = new Map<string, object>();
  const result = Buffer.from(
    JSON.stringify({
      final_response:
        'Canonical immutable answer https://example.test/citation',
    }),
  );
  const artifact = {
    artifact_id: 'immutable-artifact',
    version: 1,
    sha256: hash(result),
    size: result.length,
    mime: 'application/json',
  };
  const conversation = {
    conversation_id: 'canonical',
    agent_id: 'primary',
    title: 'Slack conversation',
    created_at: 100,
    revision: 1,
    archived: false,
  };
  const producer = {
    config: {
      ownerId: 'owner',
      dotId,
      gatewayId: 'gateway',
      identity,
      home: directory,
    },
    be06Qualification: {
      producerCommit: BE06_PRODUCER_COMMIT,
      methods: be06Methods,
      specialistSessions: true,
    },
    connected: true,
    epoch: 1,
    start: async () => ({ identity }),
    stop: async () => {},
    call: async (method: string, params: Record<string, unknown>) => {
      calls.push(method);
      switch (method) {
        case 'runtime.conversation.create':
          return { conversation };
        case 'runtime.conversation.list':
          return {
            conversations: [conversation],
            has_more: false,
            next_cursor: null,
          };
        case 'runtime.conversation.bind':
          return {
            conversation,
            session_id: 'live-canonical',
            readiness: 'ready',
          };
        case 'runtime.agent.session.get':
          return {
            agent_id: 'primary',
            role: 'primary',
            memory_backend: 'personal_mcp',
            startup_frozen: true,
            activation: 'next_session',
            authority_current: !revoked,
            archived: false,
          };
        case 'runtime.agent.get':
          return {
            agent: {
              agent_id: 'primary',
              role: 'primary',
              memory_backend: 'personal_mcp',
              archived: false,
              active_session_revision_revoked: false,
              config: { project_grants: projectIds },
            },
          };
        case 'runtime.capabilities':
          return {
            ...baseline.fixtures.unconfiguredCapabilities.response.result,
            provider: { durable_execution: true, execution_owner: 'hermes' },
            operations: [
              { operation: 'submit', accepts_commands: true, executes: true },
            ],
          };
        case 'runtime.snapshot':
          return {
            ...baseline.fixtures.idleSnapshot.response.result,
            session_id: 'canonical',
          };
        case 'runtime.command': {
          const receipt = {
            schema_version: 1,
            command_id: params.command_id,
            status: 'accepted',
            durable_revision: 1,
            run_id: randomUUID(),
            conflict: null,
          };
          receipts.set(String(params.command_id), receipt);
          return receipt;
        }
        case 'runtime.conversation.command.receipt':
          return {
            schema_version: 1,
            conversation_id: 'canonical',
            command_id: params.command_id,
            found: receipts.has(String(params.command_id)),
            receipt: receipts.get(String(params.command_id)) ?? null,
            status: 'completed',
            durable_revision: 2,
            accepted_input: null,
            messages: [],
            messages_has_more: false,
            next_message_cursor: null,
          };
        case 'runtime.project.get':
          return {
            project: {
              id: params.project_id,
              project_id: params.project_id,
              archived: false,
              owner_principal_id: 'principal',
              grants: [
                {
                  principal_id: 'principal',
                  agent_id: 'primary',
                  permissions: projectWrite ? ['read', 'write'] : ['read'],
                },
              ],
            },
          };
        case 'runtime.result.get':
          if (revokeOnResult) projectWrite = false;
          return {
            ...artifact,
            command_id: params.command_id,
            delivery_id: 'producer-delivery',
            offset: 0,
            data_base64: result.toString('base64'),
            next_offset: result.length,
            eof: true,
            publication_state: 'committed',
          };
        case 'runtime.delivery.status':
          return {
            delivery_id: 'producer-delivery',
            ...artifact,
            destination: {
              kind: 'local_runtime',
              session_id: 'canonical',
              principal_id: 'principal',
              profile_id: 'profile',
              agent_id: 'primary',
            },
            result_available: true,
          };
        default:
          throw new Error(`Unexpected synthetic producer call ${method}`);
      }
    },
  };
  const platform = new SelfHostedPlatform(
    workspace,
    database,
    producer as unknown as ConversationTransport,
  );
  await platform.start();
  let posts = 0;
  let inspections = 0;
  let sent: SendPayload | undefined;
  const slackHttp = createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer synthetic-bot-token') {
      res.writeHead(401).end();
      return;
    }
    if (req.url === '/api/auth.test') {
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
      let raw = '';
      for await (const part of req) raw += String(part);
      sent = JSON.parse(raw);
      posts++;
      res.destroy();
      return;
    }
    if (req.url?.startsWith('/api/conversations.replies')) {
      inspections++;
      res.end(
        JSON.stringify({
          ok: true,
          messages: [
            {
              user: 'UOTHER',
              thread_ts: sent!.thread_ts,
              ts: '1791048001.000000',
              blocks: sent!.blocks,
              text: sent!.text,
            },
            {
              user: 'UBOT',
              thread_ts: sent!.thread_ts,
              ts: '1791048001.000001',
              blocks: sent!.blocks,
              text: sent!.text,
            },
          ],
          response_metadata: { next_cursor: '' },
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });
  slackHttp.listen(0, '127.0.0.1');
  await once(slackHttp, 'listening');
  const slackOrigin = `http://127.0.0.1:${(slackHttp.address() as { port: number }).port}`;
  const bridge = new CommandServiceSlackBridge(
    platform,
    frozen,
    currentSlackPolicy(path, frozen),
  );
  const service = new SelfHostedSlack(
    frozen,
    database,
    () => secret,
    bridge,
    new SlackWebApi(() => 'synthetic-bot-token', {
      loopbackTestOrigin: slackOrigin,
    }),
  );
  platform.conversationOrigin = (id) =>
    service.ledger.origins(id).length ? 'slack' : undefined;
  const app = createSelfHostedApp({ auth, platform, store, slack: service });
  handler.listener = getRequestListener(app.fetch);
  let headers: Record<string, string> = {};
  const request = (
    url: string,
    body?: unknown,
    extra?: Record<string, string>,
    method?: string,
  ) =>
    fetch(base + url, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { ...headers, ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const login = async () => {
    const res = await request(
      '/api/auth/login',
      { ownerToken },
      { origin, 'content-type': 'application/json' },
    );
    expect(res.status, await res.clone().text()).toBe(200);
    const session = await res.json();
    headers = {
      ...headers,
      cookie: res.headers.get('set-cookie')!.split(';')[0],
      origin,
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    };
  };
  const ingress = (
    patch: Record<string, unknown> = {},
    eventId = 'EvFIRST',
  ) => {
    const raw = JSON.stringify({
      type: 'event_callback',
      team_id: 'TTEST',
      api_app_id: 'ATEST',
      event_id: eventId,
      event: {
        type: 'app_mention',
        channel: 'CTEST',
        user: 'UHUMAN',
        ts: '1791048000.000001',
        text: 'Private context request',
        ...patch,
      },
    });
    const time = String(Math.floor(Date.now() / 1000));
    return fetch(base + '/slack/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-slack-request-timestamp': time,
        'x-slack-signature':
          'v0=' +
          createHmac('sha256', secret)
            .update(`v0:${time}:${raw}`)
            .digest('hex'),
      },
      body: raw,
    });
  };
  cleanup.push(async () => {
    await close(server);
    await service.stop();
    await platform.stop();
    await close(slackHttp);
    auth.close();
    store.close();
    workspace.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    service,
    bridge,
    platform,
    config,
    path,
    database,
    auth,
    calls,
    ingress,
    login,
    request,
    posts: () => posts,
    inspections: () => inspections,
    revoke: () => {
      revoked = true;
    },
    revokeAtResult: () => {
      revokeOnResult = true;
    },
    expand: () => {
      projectIds = ['unapproved-project'];
    },
  };
}

test('actual consumer HTTP admits once through canonical CommandService, exposes nullable DTO, and POST inspection reconciles exact bot output without a second send', async () => {
  const f = await fixture();
  expect((await f.request('/api/runtime/channels/slack')).status).toBe(401);
  await f.service.connect();
  expect((await f.ingress()).status).toBe(200);
  expect(f.calls.filter((value) => value === 'runtime.command')).toHaveLength(
    0,
  );
  expect((await f.ingress()).status).toBe(200);
  await f.service.tick();
  expect(f.calls.filter((value) => value === 'runtime.command')).toHaveLength(
    1,
  );
  expect(f.posts()).toBe(1);
  const event = f.service.ledger.event('EvFIRST')!;
  expect(
    f.platform.commands!.ledger.get(event.operationId)?.conversationId,
  ).toBe('canonical');
  const row = f.service.ledger.deliveries()[0];
  expect(row.state).toBe('unknown');
  expect(row.providerReceipt).toBeNull();
  await f.login();
  const setup = await (
    await f.request(`/api/runtime/setup?dotId=${f.config.dotId}`)
  ).json();
  expect(setup.features.slack.state).toBe('ready');
  channelStatusSchema.parse(
    await (await f.request('/api/runtime/channels/slack')).json(),
  );
  const list = deliveriesSchema.parse(
    await (await f.request('/api/runtime/channel-deliveries')).json(),
  );
  expect(list.deliveries[0].missionId).toBeNull();
  expect(list.deliveries[0].allowedActions).toEqual(['inspect']);
  expect(f.inspections()).toBe(0);
  expect(
    (
      await f.request(
        `/api/runtime/channel-deliveries/${row.id}/inspect`,
        {},
        { 'x-csrf-token': '' },
      )
    ).status,
  ).toBe(403);
  expect(
    (await f.request(`/api/runtime/channel-deliveries/${row.id}/inspect`))
      .status,
  ).toBe(501);
  expect(f.inspections()).toBe(0);
  const inspected = await f.request(
    `/api/runtime/channel-deliveries/${row.id}/inspect`,
    {},
  );
  expect(inspected.status, await inspected.clone().text()).toBe(200);
  const data = deliveriesSchema.parse(await inspected.json());
  expect(data.deliveries[0].providerReceipt).toBe('CTEST:1791048001.000001');
  expect(data.deliveries[0].state).toBe('delivered');
  expect(f.posts()).toBe(1);
  expect(f.inspections()).toBe(1);
  expect(f.calls).not.toContain('runtime.delivery.ack');
  await f.service.tick();
  expect(f.posts()).toBe(1);
  const conversations = await (
    await f.request(`/api/runtime/conversations?dotId=${f.config.dotId}`)
  ).json();
  expect(conversations.conversations[0].origin).toBe('slack');
  const unauthorized = await fetch(
    new URL(
      '/api/runtime/conversations/canonical/results/' + event.operationId,
      inspected.url,
    ),
    {},
  );
  expect(unauthorized.status).toBe(401);
});

test('valid signature and union allowlists do not authorize an unapproved actor/channel pair or private producer scope', async () => {
  const f = await fixture();
  await f.service.connect();
  expect((await f.ingress({ user: 'UOTHER' })).status).toBe(403);
  expect((await f.ingress({ channel: 'COTHER' })).status).toBe(403);
  expect(f.calls).not.toContain('runtime.command');
  expect((await f.ingress()).status).toBe(200);
  f.expand();
  await f.service.tick();
  expect(f.calls).not.toContain('runtime.command');
  expect(f.posts()).toBe(0);
  expect(f.service.ledger.event('EvFIRST')!.state).toBe('unknown');
});

test('current producer revocation prevents private result reads, and changed server authority prevents subsequent ingress', async () => {
  const f = await fixture();
  await f.service.connect();
  await f.ingress();
  f.revoke();
  await f.service.tick();
  expect(f.calls).not.toContain('runtime.result.get');
  expect(f.posts()).toBe(0);
  writeFileSync(f.path, JSON.stringify({ ...f.config, enabled: false }));
  expect((await f.ingress({}, 'EvSECOND')).status).toBe(403);
  await f.login();
  const status = await (await f.request('/api/runtime/channels/slack')).json();
  expect(status.state).toBe('permission_denied');
});

test('production host config stays absent/off by default and rejects legacy competing ingress and owner/origin mismatch', async () => {
  const f = await fixture();
  expect(
    createSlackRuntime({
      database: f.database + '.unused',
      auth: f.auth,
      platform: f.platform,
      env: {},
    }),
  ).toBeUndefined();
  await startSlackRuntime(undefined);
  expect(() =>
    createSlackRuntime({
      database: f.database + '.unused',
      auth: f.auth,
      platform: f.platform,
      env: { DOTS_SLACK_CONFIG_PATH: f.path, SLACK_CHANNEL_NAME: 'legacy' },
    }),
  ).toThrow('conflict');
  writeFileSync(
    f.path,
    JSON.stringify({ ...f.config, ownerId: 'other-owner' }),
  );
  expect(() =>
    createSlackRuntime({
      database: f.database + '.unused',
      auth: f.auth,
      platform: f.platform,
      env: { DOTS_SLACK_CONFIG_PATH: f.path },
    }),
  ).toThrow();
  const { enabled: _enabled, ...disabled } = f.config;
  void _enabled;
  writeFileSync(f.path, JSON.stringify(disabled));
  expect(loadSlackConfig(f.path)?.enabled).toBe(false);
});

test('current project grants are verified again between private result read and Slack delivery', async () => {
  const f = await fixture(true);
  await f.service.connect();
  await f.ingress();
  f.revokeAtResult();
  await f.service.tick();
  expect(f.calls.filter((method) => method === 'runtime.command')).toHaveLength(
    1,
  );
  expect(f.calls).toContain('runtime.result.get');
  expect(
    f.calls.filter((method) => method === 'runtime.project.get').length,
  ).toBeGreaterThan(2);
  expect(f.service.ledger.deliveries()[0].state).toBe('held');
  expect(f.posts()).toBe(0);
});

test('production host local pause fences signed Slack authority without probing Slack credentials', async () => {
  const f = await fixture();
  const paused = createSlackRuntime({
    database: f.database + '.paused',
    auth: f.auth,
    platform: f.platform,
    env: { DOTS_SLACK_CONFIG_PATH: f.path },
    locallyPaused: () => true,
  })!;
  try {
    await expect(paused.connect()).rejects.toThrow('denied');
    const setup = await f.platform.setup(f.config.dotId);
    expect(paused.status(setup.scope!).state).toBe('permission_denied');
  } finally {
    await paused.stop();
  }
});
