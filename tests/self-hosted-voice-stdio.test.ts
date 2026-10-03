import { expect, test, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WorkspaceStore } from '../src/server/workspace.js';
import { Store } from '../src/server/store.js';
import { OwnerAuth } from '../src/server/owner-auth.js';
import { SelfHostedPlatform } from '../src/server/self-hosted-platform.js';
import { createSelfHostedApp } from '../src/server/self-hosted-app.js';
import { OpenAIRealtimeMedia } from '../src/server/runtime/voice-media.js';
import { canonicalVoiceIntent } from '../src/server/runtime/voice-service.js';
import { canonicalControlIntent } from '../src/server/runtime/control-service.js';
import { intentDigest } from '../src/server/runtime/conversation-ledger.js';
import {
  StdioConversationTransport,
  type LaunchConfig,
} from '../src/server/runtime/stdio.js';
import type {
  ConversationMethod,
  ConversationResults,
} from '../src/server/runtime/wire.js';

const origin = 'http://127.0.0.1:3001';
const ownerId = 'voice-stdio-owner';
const ownerToken = 'isolated-voice-stdio-owner-token-123456';
const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';

test.runIf(
  !!process.env.RYOKO_TEST_PYTHON && !!process.env.RYOKO_TEST_CHECKOUT,
)(
  'actual pinned Python owns one voice compute across duplicate, reload, in-flight pause, hangup and restart with immutable output',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'dots-voice-stdio-'));
    const database = join(root, 'dots.sqlite');
    const home = join(root, 'profile');
    const runtimeDirectory = join(root, 'runtime');
    mkdirSync(home);
    mkdirSync(runtimeDirectory);
    const checkout = resolve(process.env.RYOKO_TEST_CHECKOUT!);
    const python = process.env.RYOKO_TEST_PYTHON!;
    let executions = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const finalResponse = 'One immutable voice-compute result café 🥐';
    const modelInputs: string[] = [];
    const provider = createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404).end();
        return;
      }
      let body = '';
      for await (const chunk of req) body += String(chunk);
      const input = JSON.parse(body);
      modelInputs.push(body);
      executions++;
      await gate;
      if (input.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const envelope = {
          id: 'voice-compute-fixture',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'gpt-4.1-mini',
        };
        res.write(
          `data: ${JSON.stringify({ ...envelope, choices: [{ index: 0, delta: { role: 'assistant', content: finalResponse }, finish_reason: null }] })}\n\n`,
        );
        res.write(
          `data: ${JSON.stringify({ ...envelope, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`,
        );
        res.end('data: [DONE]\n\n');
      } else {
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            id: 'voice-compute-fixture',
            object: 'chat.completion',
            created: 1,
            model: 'gpt-4.1-mini',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: finalResponse },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 1,
              completion_tokens: 1,
              total_tokens: 2,
            },
          }),
        );
      }
    });
    provider.listen(0, '127.0.0.1');
    await once(provider, 'listening');
    const endpoint = `http://127.0.0.1:${(provider.address() as { port: number }).port}/v1`;
    const profile = {
      agent_identity: {
        schema_version: 1,
        principal_id: ownerId,
        profile_id: 'voice-profile',
        primary_agent_id: 'ryoko',
        active_agent_id: 'ryoko',
        agents: {
          ryoko: {
            policy_version: 1,
            role: 'primary',
            memory_backend: 'personal_mcp',
            allowed_tools: [],
            secret_refs: ['OPENAI_API_KEY'],
            recipient_plan: {
              schema_version: 1,
              envelope: 'local_only',
              grants: [
                {
                  recipient_id: 'local-fixture',
                  purpose: 'main_model',
                  endpoint,
                  transport: 'httpx',
                },
              ],
            },
          },
        },
      },
      mcp_servers: {},
      onboarding: { seen: { profile_build_offered: true } },
      model: {
        default: 'gpt-4.1-mini',
        provider: 'custom',
        base_url: endpoint,
        api_mode: 'chat_completions',
      },
    };
    writeFileSync(join(home, 'config.yaml'), JSON.stringify(profile));
    writeFileSync(join(home, '.env'), 'OPENAI_API_KEY="no-key-required"\n', {
      mode: 0o600,
    });
    const identity = spawnSync(
      python,
      [
        '-c',
        `import json,sys; import hermes_yaml as yaml\nfrom agent.agent_identity import resolve_agent_context\np=sys.argv[1]\ni=resolve_agent_context(yaml.safe_load(open(p+'/config.yaml')),session_id='conversation_ingress',profile_home=p).identity\nprint(json.dumps({k:getattr(i,k) for k in ['principal_id','profile_id','agent_id','policy_digest','config_digest']}))`,
        home,
      ],
      {
        cwd: checkout,
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin', HOME: home, HERMES_HOME: home },
      },
    );
    expect(identity.status, identity.stderr).toBe(0);
    const workspace = new WorkspaceStore(database, ownerId);
    const store = new Store(database);
    const auth = new OwnerAuth(database, { ownerId, ownerToken, origin });
    const config: LaunchConfig = {
      checkout,
      python,
      home,
      runtimeDirectory,
      ownerId,
      dotId: workspace.dots()[0].id,
      gatewayId: 'voice-stdio',
      identity: JSON.parse(identity.stdout),
      providerEnvironment: { OPENAI_API_KEY: 'no-key-required' },
    };
    const methods: { method: string; params: unknown }[] = [];
    const makeTransport = () => {
      const transport = new StdioConversationTransport(config);
      const call = transport.call.bind(transport);
      transport.call = async <M extends ConversationMethod>(
        method: M,
        params: unknown,
      ): Promise<ConversationResults[M]> => {
        methods.push({ method, params });
        return call(method, params);
      };
      return transport;
    };
    // No real voice provider, browser media, credentials or model installation.
    const mediaFetch = vi.fn<typeof fetch>(async (url) => {
      if (String(url) === 'https://api.openai.com/v1/realtime/calls')
        return new Response(sdp, {
          headers: { location: '/v1/realtime/calls/rtc_voice_fixture' },
        });
      expect(String(url)).toBe(
        'https://api.openai.com/v1/realtime/calls/rtc_voice_fixture/hangup',
      );
      return new Response(null, { status: 200 });
    });
    const media = new OpenAIRealtimeMedia(
      {
        enabled: true,
        qualified: true,
        apiKey: 'synthetic-media-key',
        model: 'fixture-realtime',
        maxCallSeconds: 120,
      },
      mediaFetch,
    );
    const createPlatform = () =>
      new SelfHostedPlatform(workspace, database, makeTransport(), {
        voiceMedia: media,
      });
    let platform = createPlatform();
    let app = createSelfHostedApp({ auth, platform, store });
    try {
      const login = await app.request(`${origin}/api/auth/login`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ ownerToken }),
      });
      expect(login.status).toBe(200);
      const headers = {
        origin,
        'content-type': 'application/json',
        cookie: login.headers.get('set-cookie')!.split(';')[0],
        'x-csrf-token': (await login.json()).csrfToken,
      };
      const request = (path: string, body?: unknown) =>
        app.request(`${origin}/api${path}`, {
          headers,
          method: body === undefined ? 'GET' : 'POST',
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      const read = async (path: string, body?: unknown) => {
        const response = await request(path, body);
        expect(response.status, await response.clone().text()).toBe(200);
        return response.json();
      };
      const created = await request('/runtime/conversations', {
        operationId: randomUUID(),
        dotId: config.dotId,
        title: 'BE09 real compute proof',
      });
      expect(created.status, await created.clone().text()).toBe(201);
      const conversationId = (await created.json()).conversation.id;
      const base = `/runtime/conversations/${encodeURIComponent(conversationId)}`;
      const setup = await read(`${base}/connect`, {});
      expect(setup.features.commands.state).toBe('ready');
      const generation = () =>
        workspace.runtimeBindings.resolveConversation(conversationId)
          .authorityRevision;
      const begin = {
        operationId: randomUUID(),
        threadId: conversationId,
        sdp,
        expectedGeneration: generation(),
      };
      const admission = await read('/runtime/voice/calls', begin);
      expect(admission.status).toBe('admitted');
      const callPath = `/runtime/voice/calls/${admission.callId}`;
      const mediaControl = (
        action: string,
        payload: Record<string, unknown> = {},
      ) => {
        const intent = {
          path: `${callPath}/control`,
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
      expect(
        (await read(`${callPath}/control`, mediaControl('media_connected')))
          .status,
      ).toBe('accepted');
      const text =
        'Return the bounded synthetic result through canonical Ryoko execution';
      const compute = {
        operationId: randomUUID(),
        toolCallId: 'provider-tool-call-1',
        request: text,
        intentDigest: intentDigest(text),
        expectedGeneration: generation(),
      };
      const first = await read(`${callPath}/compute`, compute);
      expect(first).toMatchObject({ status: 'accepted', text: null });
      // Browser reload/recreated routing does not confer new execution ownership.
      app = createSelfHostedApp({ auth, platform, store });
      expect((await read(`${callPath}/compute`, compute)).status).toBe(
        'accepted',
      );
      expect(
        (await read(`/runtime/voice/compute/operations/${compute.operationId}`))
          .status,
      ).toBe('accepted');
      const commandId = platform.voice!.ledger.operation(
        compute.operationId,
      )!.commandId!;
      expect(commandId).not.toBe(compute.operationId);
      for (let attempt = 0; attempt < 100 && executions === 0; attempt++)
        await new Promise((resolve) => setTimeout(resolve, 50));
      expect(executions).toBe(1);
      expect(modelInputs[0]).toContain('not user approval');
      expect(
        methods.filter((item) => item.method === 'runtime.command'),
      ).toHaveLength(1);
      const changeControl = async (
        action: 'pause' | 'resume',
        expectedRevision: number,
      ) => {
        const intent = {
          path: `${base}/control`,
          action,
          payload: {},
          expectedRevision,
        };
        const result = await read(`${base}/control`, {
          operationId: randomUUID(),
          action,
          payload: {},
          expectedRevision,
          expectedGeneration: generation(),
          intentDigest: intentDigest(canonicalControlIntent(intent)),
        });
        expect(result.status).toBe('accepted');
      };
      const original = await read(`${base}/control`);
      await changeControl('pause', original.control.revision);
      const paused = await read(`${base}/control`);
      expect(paused.control).toMatchObject({
        paused: true,
        accepted_work_retained: true,
        provider_cancelled: false,
      });
      expect((await read(callPath)).status).toBe('ended');
      expect(
        (await read(`/runtime/voice/compute/operations/${compute.operationId}`))
          .status,
      ).toBe('accepted');
      const blocked = await request('/runtime/voice/calls', {
        ...begin,
        operationId: randomUUID(),
      });
      expect(blocked.status).toBe(409);
      const hangup = mediaControl('end_media', {
        cancelMission: false,
        transcript: 'You: Bounded task\nMedia provider: The work was accepted',
      });
      expect((await read(`${callPath}/control`, hangup)).status).toBe(
        'accepted',
      );
      expect(
        (await read(`/runtime/operations/${hangup.operationId}`)).status,
      ).toBe('accepted');
      expect(
        mediaFetch.mock.calls.filter(([url]) =>
          String(url).endsWith('/hangup'),
        ),
      ).toHaveLength(1);
      await changeControl('resume', paused.control.revision);
      expect(mediaFetch).toHaveBeenCalledTimes(2);
      release();
      let completed = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        const receipt = await read(`/runtime/commands/${commandId}`);
        if (receipt.executionStatus === 'completed') {
          completed = true;
          break;
        }
        if (
          ['failed', 'blocked', 'cancelled'].includes(receipt.executionStatus)
        )
          throw new Error(
            `Canonical fixture terminated: ${JSON.stringify(receipt)}`,
          );
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(completed).toBe(true);
      expect(
        await read(`/runtime/voice/compute/operations/${compute.operationId}`),
      ).toMatchObject({ status: 'completed', text: null });
      const result = await read(`${base}/results/${commandId}`);
      expect(result.finalResponse).toBe(finalResponse);
      expect(result.publicationState).toBe('committed');
      const bytes = Buffer.from(result.artifact.dataBase64, 'base64');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        result.artifact.sha256,
      );
      expect(JSON.parse(bytes.toString('utf8')).final_response).toBe(
        finalResponse,
      );
      expect(result.delivery.components).toEqual({
        text: 'not_sent',
        artifact: 'not_sent',
      });
      // Full BFF/Python restart happens only after the durable result commits.
      await platform.stop();
      platform = createPlatform();
      app = createSelfHostedApp({ auth, platform, store });
      await read(`${base}/connect`, {});
      const recovered = await read(`${callPath}/compute`, compute);
      expect(recovered).toMatchObject({ status: 'completed', text: null });
      expect(
        platform.voice!.ledger.operation(compute.operationId)!.commandId,
      ).toBe(commandId);
      const again = await read(`${base}/results/${commandId}`);
      expect(again.artifact).toEqual(result.artifact);
      expect(again.finalResponse).toBe(finalResponse);
      expect((await read(callPath)).transcript).toContain('Media provider:');
      expect(
        methods.filter((item) => item.method === 'runtime.command'),
      ).toHaveLength(1);
      expect(
        methods.some((item) =>
          ['runtime.mission.cancel', 'runtime.delivery.ack'].includes(
            item.method,
          ),
        ),
      ).toBe(false);
      expect(executions).toBe(1);
      expect(mediaFetch).toHaveBeenCalledTimes(2);
    } finally {
      release();
      await platform.stop();
      auth.close();
      workspace.close();
      store.close();
      provider.closeAllConnections();
      await new Promise<void>((resolve) => provider.close(() => resolve()));
      if (process.env.RYOKO_TEST_KEEP === '1')
        process.stderr.write(`BE09 stdio fixture: ${root}\n`);
      else rmSync(root, { recursive: true, force: true });
    }
  },
  60000,
);
