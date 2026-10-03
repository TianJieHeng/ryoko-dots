import { afterEach, expect, test, vi } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { getRequestListener } from '@hono/node-server';
import { WorkspaceStore } from '../src/server/workspace.js';
import { Store } from '../src/server/store.js';
import { OwnerAuth } from '../src/server/owner-auth.js';
import { SelfHostedPlatform } from '../src/server/self-hosted-platform.js';
import { createSelfHostedApp } from '../src/server/self-hosted-app.js';
import { OpenAIRealtimeMedia } from '../src/server/runtime/voice-media.js';
import { loadVoiceMedia } from '../src/server/runtime/voice-config.js';
import { canonicalVoiceIntent } from '../src/server/runtime/voice-service.js';
import { canonicalControlIntent } from '../src/server/runtime/control-service.js';
import { intentDigest } from '../src/server/runtime/conversation-ledger.js';
import type {
  ConversationTransport,
  LaunchConfig,
} from '../src/server/runtime/stdio.js';
import type { RuntimeCommandReceiptResult } from '../src/shared/runtime/producer/wire.generated.js';
import baseline from './fixtures/runtime/producer-baseline.json';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
const offer = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
async function fixture({ enabled = true, unknownHangup = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'voice-http-'));
  const database = join(root, 'dots.sqlite');
  const ownerId = 'voice-http-owner';
  const ownerToken = 'isolated-voice-http-owner-token-123456';
  const workspace = new WorkspaceStore(database, ownerId);
  const store = new Store(database);
  const identity = {
    principal_id: ownerId,
    profile_id: 'voice-profile',
    agent_id: 'primary',
    policy_digest: 'a'.repeat(64),
    config_digest: 'b'.repeat(64),
  };
  const config: LaunchConfig = {
    home: root,
    checkout: root,
    python: '/unused',
    runtimeDirectory: root,
    ownerId,
    dotId: workspace.dots()[0].id,
    gatewayId: 'voice-gateway',
    identity,
  };
  const rpc: { method: string; params: Record<string, unknown> }[] = [];
  const receipts = new Map<string, RuntimeCommandReceiptResult>();
  let paused = false,
    revision = 0,
    corrupt = false,
    published = true;
  const operationReceipts = new Map<string, object>();
  const bytes = Buffer.from(
    JSON.stringify({
      final_response: 'Verified canonical result café',
      completed: true,
    }),
  );
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const control = () => ({
    revision,
    paused,
    updated_at: null,
    scope: 'owner_profile',
    admission_blocked: paused,
    scheduled_dispatch_blocked: paused,
    in_flight_dispatch: paused
      ? 'blocked_at_next_boundary'
      : 'allowed_at_checked_boundary',
    accepted_commands: receipts.size,
    claimed_commands: 0,
    accepted_work_retained: true,
    already_dispatched_may_complete: true,
    provider_cancelled: false,
    remote_effects_undone: false,
  });
  const conversation = {
    conversation_id: 'conversation',
    agent_id: identity.agent_id,
    title: 'Voice HTTP fixture',
    created_at: 1,
    revision: 1,
    archived: false,
  };
  let transportConnected = true;
  const transport = {
    config,
    get connected() {
      return transportConnected;
    },
    epoch: 1,
    async start() {
      transportConnected = true;
      return { identity };
    },
    async stop() {
      transportConnected = false;
    },
    async call(method: string, params: Record<string, unknown>) {
      rpc.push({ method, params });
      if (method === 'runtime.conversation.create') return { conversation };
      if (method === 'runtime.conversation.bind')
        return { conversation, session_id: 'live-voice', readiness: 'ready' };
      if (method === 'runtime.capabilities')
        return {
          ...baseline.fixtures.unconfiguredCapabilities.response.result,
          provider: { durable_execution: true, execution_owner: 'hermes' },
          operations: [
            { operation: 'submit', accepts_commands: true, executes: true },
          ],
        };
      if (method === 'runtime.snapshot')
        return {
          ...baseline.fixtures.idleSnapshot.response.result,
          session_id: 'conversation',
        };
      if (method === 'runtime.control.get')
        return {
          control: control(),
          operation: operationReceipts.get(String(params.operation_id)) ?? null,
          dispatch_performed: false,
        };
      if (
        method === 'runtime.control.pause' ||
        method === 'runtime.control.resume'
      ) {
        expect(params.expected_revision).toBe(revision);
        paused = method === 'runtime.control.pause';
        revision++;
        const operation = {
          operation_id: params.operation_id,
          digest: intentDigest(
            canonicalVoiceIntent({
              expected_revision: params.expected_revision,
              operation_id: params.operation_id,
              paused,
            }),
          ),
          revision,
          paused,
          committed_at: 1,
          status: 'committed',
        };
        operationReceipts.set(String(params.operation_id), operation);
        return { control: control(), operation, dispatch_performed: false };
      }
      if (method === 'runtime.command') {
        const receipt = {
          schema_version: 1 as const,
          command_id: String(params.command_id),
          status: 'accepted' as const,
          durable_revision: 1,
          run_id: 'canonical-run',
          conflict: null,
        };
        receipts.set(receipt.command_id, {
          schema_version: 1,
          command_id: receipt.command_id,
          found: true,
          receipt,
          status: 'accepted',
          durable_revision: 1,
          accepted_input: { state: 'accepted', message_id: null },
          messages: [],
          messages_has_more: false,
          next_message_cursor: null,
        });
        return receipt;
      }
      if (method === 'runtime.conversation.command.receipt')
        return (
          receipts.get(String(params.command_id)) ?? {
            schema_version: 1,
            command_id: params.command_id,
            found: false,
            receipt: null,
            status: null,
            durable_revision: 0,
            accepted_input: null,
            messages: [],
            messages_has_more: false,
            next_message_cursor: null,
          }
        );
      if (method === 'runtime.result.get')
        return {
          command_id: params.command_id,
          artifact_id: 'result-artifact',
          version: 1,
          sha256: corrupt ? '0'.repeat(64) : sha256,
          size: bytes.length,
          mime: 'application/json',
          delivery_id: published ? 'result-delivery' : null,
          publication_state: published ? 'committed' : 'published_uncommitted',
          offset: 0,
          data_base64: bytes.toString('base64'),
          next_offset: bytes.length,
          eof: true,
        };
      if (method === 'runtime.delivery.status')
        return {
          delivery_id: 'result-delivery',
          artifact_id: 'result-artifact',
          version: 1,
          sha256,
          destination: {
            kind: 'local_runtime',
            session_id: 'conversation',
            principal_id: ownerId,
            profile_id: identity.profile_id,
            agent_id: identity.agent_id,
          },
          state: 'awaiting_ack',
          acknowledgment_level: 'transport_accepted',
          components: { text: 'not_sent', artifact: 'not_sent' },
          platform_ids: [],
          attempt_count: 1,
          max_attempts: 3,
          next_attempt_at: null,
          deadline_at: 9999999999,
          retention_until: 9999999999,
          last_error: null,
          result_available: true,
        };
      throw new Error(`Unexpected fixture method ${method}`);
    },
  } as unknown as ConversationTransport;
  const mediaFetch = vi.fn<typeof fetch>(async (url, options) => {
    if (String(url).endsWith('/hangup')) {
      if (unknownHangup) throw new Error('Synthetic response loss');
      return new Response(null, { status: 200 });
    }
    // This fetch is synthetic; only the actual Dots HTTP listener uses loopback.
    expect(String(url)).toBe('https://api.openai.com/v1/realtime/calls');
    const payload = JSON.parse(
      String((options!.body as FormData).get('session')),
    );
    expect(payload.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'ask_compute',
    ]);
    expect(payload.instructions).toContain('Delegate ALL tools');
    return new Response(offer, {
      headers: { location: '/v1/realtime/calls/rtc_fixture' },
    });
  });
  const media = new OpenAIRealtimeMedia(
    {
      enabled,
      qualified: true,
      model: 'fixture-realtime',
      apiKey: 'synthetic-key',
      maxCallSeconds: 60,
    },
    mediaFetch,
  );
  let platform = new SelfHostedPlatform(workspace, database, transport, {
    voiceMedia: media,
    locallyPaused: () => store.settings().paused,
  });
  let app: ReturnType<typeof createSelfHostedApp>;
  const server = createServer((request, response) =>
    getRequestListener(app.fetch)(request, response),
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const auth = new OwnerAuth(database, { ownerId, ownerToken, origin });
  app = createSelfHostedApp({ auth, platform, store });
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await platform.stop();
    auth.close();
    store.close();
    workspace.close();
    rmSync(root, { recursive: true, force: true });
  });
  const login = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ ownerToken }),
  });
  expect(login.status).toBe(200);
  const headers = {
    origin,
    'content-type': 'application/json',
    cookie: login.headers.get('set-cookie')!.split(';')[0],
    'x-csrf-token': (await login.json()).csrfToken as string,
  };
  const request = (path: string, body?: unknown, custom = headers) =>
    fetch(`${origin}/api${path}`, {
      headers: custom,
      method: body === undefined ? 'GET' : 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const created = await request('/runtime/conversations', {
    operationId: randomUUID(),
    dotId: config.dotId,
    title: 'Voice HTTP fixture',
  });
  expect(created.status, await created.clone().text()).toBe(201);
  const connect = async () => {
    const res = await request(
      '/runtime/conversations/conversation/connect',
      {},
    );
    expect(res.status, await res.clone().text()).toBe(200);
  };
  const generation = () =>
    workspace.runtimeBindings.resolveConversation('conversation')
      .authorityRevision;
  const beginBody = () => ({
    operationId: randomUUID(),
    threadId: 'conversation',
    sdp: offer,
    expectedGeneration: generation(),
  });
  const controlBody = (
    callId: string,
    action: string,
    payload: Record<string, unknown> = {},
  ) => {
    const intent = {
      path: `/runtime/voice/calls/${callId}/control`,
      action,
      payload,
      expectedRevision: 0,
    };
    return {
      operationId: randomUUID(),
      action,
      payload,
      expectedRevision: 0,
      expectedGeneration: generation(),
      intentDigest: intentDigest(canonicalVoiceIntent(intent)),
    };
  };
  const computeBody = () => {
    const request = 'Compute the authorized bounded fixture task';
    return {
      operationId: randomUUID(),
      toolCallId: randomUUID(),
      request,
      intentDigest: intentDigest(request),
      expectedGeneration: generation(),
    };
  };
  const begin = async () => {
    const res = await request('/runtime/voice/calls', beginBody());
    expect(res.status, await res.clone().text()).toBe(200);
    const result = await res.json();
    expect(result.status).toBe('admitted');
    const connected = await request(
      `/runtime/voice/calls/${result.callId}/control`,
      controlBody(result.callId, 'media_connected'),
    );
    expect((await connected.json()).status).toBe('accepted');
    return result as { callId: string; operationId: string };
  };
  return {
    root,
    request,
    headers,
    origin,
    rpc,
    receipts,
    mediaFetch,
    connect,
    beginBody,
    begin,
    controlBody,
    computeBody,
    generation,
    workspace,
    config,
    get platform() {
      return platform;
    },
    setPaused(value: boolean) {
      paused = value;
      revision++;
    },
    setCorrupt(value: boolean) {
      corrupt = value;
    },
    setPublished(value: boolean) {
      published = value;
    },
    async restart() {
      await platform.stop();
      platform = new SelfHostedPlatform(workspace, database, transport, {
        voiceMedia: media,
      });
      app = createSelfHostedApp({ auth, platform, store });
      await platform.start();
    },
  };
}

test('actual authenticated consumer HTTP wires call controls, one canonical command and verified immutable result without media authority', async () => {
  const f = await fixture();
  expect((await fetch(`${f.origin}/api/runtime/voice`)).status).toBe(401);
  expect(
    (
      await f.request('/runtime/voice/calls', f.beginBody(), {
        ...f.headers,
        'x-csrf-token': 'wrong',
      })
    ).status,
  ).toBe(403);
  expect((await f.request('/runtime/voice/calls', f.beginBody())).status).toBe(
    503,
  );
  expect(f.mediaFetch).not.toHaveBeenCalled();
  await f.connect();
  const setup = await (
    await f.request(`/runtime/setup?dotId=${f.config.dotId}`)
  ).json();
  expect(setup.features.voice.state).toBe('ready');
  expect((await (await f.request('/runtime/voice')).json()).mode).toBe(
    'realtime_webrtc',
  );
  expect(
    (await (await f.request('/runtime/voice/health')).json()).cleanupHealthy,
  ).toBe(true);
  expect((await f.request('/runtime/voice?provider=other')).status).toBe(400);
  const call = await f.begin();
  const input = f.computeBody();
  const compute = () =>
    f.request(`/runtime/voice/calls/${call.callId}/compute`, input);
  expect(await (await compute()).json()).toMatchObject({
    status: 'accepted',
    text: null,
  });
  await compute();
  const dispatches = f.rpc.filter(
    (value) => value.method === 'runtime.command',
  );
  expect(dispatches).toHaveLength(1);
  expect(dispatches[0].params.operation).toBe('submit');
  expect(dispatches[0].params.session_id).toBe('live-voice');
  expect((dispatches[0].params.payload as { text: string }).text).toContain(
    'not user approval',
  );
  const commandId = String(dispatches[0].params.command_id);
  f.receipts.get(commandId)!.status = 'completed';
  f.setCorrupt(true);
  expect(
    (
      await (
        await f.request(
          `/runtime/voice/compute/operations/${input.operationId}`,
        )
      ).json()
    ).text,
  ).toBeNull();
  f.setCorrupt(false);
  f.setPublished(false);
  expect(
    await (
      await f.request(`/runtime/voice/compute/operations/${input.operationId}`)
    ).json(),
  ).toMatchObject({ status: 'completed', text: null });
  f.setPublished(true);
  expect(
    await (
      await f.request(`/runtime/voice/compute/operations/${input.operationId}`)
    ).json(),
  ).toMatchObject({
    status: 'completed',
    text: 'Verified canonical result café',
  });
  const end = f.controlBody(call.callId, 'end_media', {
    cancelMission: false,
    transcript: 'You: A request\nMedia provider: Conversational answer',
  });
  expect(
    (
      await (
        await f.request(`/runtime/voice/calls/${call.callId}/control`, end)
      ).json()
    ).status,
  ).toBe('accepted');
  expect(
    (await (await f.request(`/runtime/operations/${end.operationId}`)).json())
      .status,
  ).toBe('accepted');
  const count = f.mediaFetch.mock.calls.length;
  await f.restart();
  await f.connect();
  expect(
    await (
      await f.request(`/runtime/voice/compute/operations/${input.operationId}`)
    ).json(),
  ).toMatchObject({ status: 'completed', text: null });
  expect(
    (await (await f.request(`/runtime/operations/${end.operationId}`)).json())
      .status,
  ).toBe('accepted');
  expect(
    (
      await (
        await f.request('/runtime/conversations/conversation/calls')
      ).json()
    ).calls[0].transcript,
  ).toContain('Media provider:');
  expect(f.mediaFetch).toHaveBeenCalledTimes(count);
  expect(
    f.rpc.filter((value) => value.method === 'runtime.command'),
  ).toHaveLength(1);
  expect(
    f.rpc.some((value) =>
      ['runtime.delivery.ack', 'runtime.mission.cancel'].includes(value.method),
    ),
  ).toBe(false);
});

test('canonical authenticated pause ends media, retains accepted compute and requires explicit new call after resume', async () => {
  const f = await fixture();
  await f.connect();
  const call = await f.begin();
  const compute = f.computeBody();
  await f.request(`/runtime/voice/calls/${call.callId}/compute`, compute);
  const path = '/runtime/conversations/conversation/control';
  const change = async (
    action: 'pause' | 'resume',
    expectedRevision: number,
  ) => {
    const intent = { path, action, payload: {}, expectedRevision };
    const response = await f.request(path, {
      ...intent,
      path: undefined,
      operationId: randomUUID(),
      expectedGeneration: f.generation(),
      intentDigest: intentDigest(canonicalControlIntent(intent)),
    });
    expect(response.status, await response.clone().text()).toBe(200);
    expect((await response.json()).status).toBe('accepted');
  };
  await change('pause', 0);
  expect(
    (await (await f.request(`/runtime/voice/calls/${call.callId}`)).json())
      .status,
  ).toBe('ended');
  expect(
    (
      await (
        await f.request(
          `/runtime/voice/compute/operations/${compute.operationId}`,
        )
      ).json()
    ).status,
  ).toBe('accepted');
  expect((await f.request('/runtime/voice/calls', f.beginBody())).status).toBe(
    409,
  );
  const count = f.mediaFetch.mock.calls.length;
  await change('resume', 1);
  expect(f.mediaFetch).toHaveBeenCalledTimes(count);
  await f.begin();
  expect(f.mediaFetch).toHaveBeenCalledTimes(count + 1);
  expect(
    f.rpc
      .filter((value) => value.method === 'runtime.command')
      .map((value) => value.params.operation),
  ).toEqual(['submit']);
});

test('lease sweep observes external canonical pause and unknown hangup remains fenced after HTTP restart', async () => {
  const f = await fixture({ unknownHangup: true });
  await f.connect();
  const call = await f.begin();
  f.setPaused(true);
  await f.platform.voice!.sweep();
  expect(
    (await (await f.request(`/runtime/voice/calls/${call.callId}`)).json())
      .status,
  ).toBe('unknown');
  expect(
    f.mediaFetch.mock.calls.filter(([url]) => String(url).endsWith('/hangup')),
  ).toHaveLength(1);
  await f.restart();
  await f.connect();
  f.setPaused(false);
  const end = f.controlBody(call.callId, 'end_media', { cancelMission: false });
  expect(
    (
      await (
        await f.request(`/runtime/voice/calls/${call.callId}/control`, end)
      ).json()
    ).status,
  ).toBe('outcome_unknown');
  expect((await f.request('/runtime/voice/calls', f.beginBody())).status).toBe(
    409,
  );
  expect(
    f.mediaFetch.mock.calls.filter(([url]) => String(url).endsWith('/hangup')),
  ).toHaveLength(1);
});

test('unconfigured optional media is literal and never activates credentials or a local model', async () => {
  const f = await fixture({ enabled: false });
  await f.connect();
  const setup = await (
    await f.request(`/runtime/setup?dotId=${f.config.dotId}`)
  ).json();
  expect(setup.features.voice.state).toBe('unsupported');
  expect(setup.features.voice.reason).toContain('disabled');
  expect((await (await f.request('/runtime/voice')).json()).mode).toBe(
    'unavailable',
  );
  expect(
    (await (await f.request('/runtime/voice/calls', f.beginBody())).json())
      .status,
  ).toBe('rejected');
  expect(f.mediaFetch).not.toHaveBeenCalled();
  expect(loadVoiceMedia(undefined).available).toBe(false);
  const path = join(f.root, 'voice.json');
  writeFileSync(
    path,
    JSON.stringify({ apiKey: 'synthetic-secret', model: 'test' }),
  );
  expect(loadVoiceMedia(path).available).toBe(false);
  writeFileSync(path, JSON.stringify({ unexpected: 'synthetic-secret' }));
  expect(() => loadVoiceMedia(path)).toThrow(
    'Invalid server-owned voice configuration',
  );
  try {
    loadVoiceMedia(path);
  } catch (error) {
    expect(String(error)).not.toContain('synthetic-secret');
  }
});

test('authenticated voice HTTP rejects forged speaker, stale generation and revoked call scope before new compute', async () => {
  const f = await fixture();
  await f.connect();
  expect(
    (
      await f.request('/runtime/voice/calls', {
        ...f.beginBody(),
        speakerId: 'another-speaker',
      })
    ).status,
  ).toBe(400);
  const call = await f.begin();
  expect(
    (
      await f.request(`/runtime/voice/calls/${call.callId}/compute`, {
        ...f.computeBody(),
        expectedGeneration: f.generation() + 1,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await f.request(`/runtime/voice/calls/${call.callId}/compute`, {
        ...f.computeBody(),
        approval: true,
      })
    ).status,
  ).toBe(400);
  expect(
    (await f.request('/runtime/voice/calls/foreign/compute', f.computeBody()))
      .status,
  ).toBe(404);
  const scope = f.workspace.runtimeBindings.resolveConversation('conversation');
  f.workspace.runtimeBindings.revoke(
    'conversation',
    'conversation',
    scope.revision,
  );
  expect((await f.request(`/runtime/voice/calls/${call.callId}`)).status).toBe(
    403,
  );
  await f.platform.voice!.sweep();
  expect(
    f.mediaFetch.mock.calls.filter(([url]) => String(url).endsWith('/hangup')),
  ).toHaveLength(1);
  expect(
    f.rpc.filter((value) => value.method === 'runtime.command'),
  ).toHaveLength(0);
});
