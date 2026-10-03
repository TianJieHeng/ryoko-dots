import { expect, test } from 'vitest';
import { createHmac } from 'node:crypto';
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
import { CommandServiceSlackBridge } from '../src/server/runtime/slack-bridge.js';
import { SelfHostedSlack } from '../src/server/runtime/slack-service.js';
import { SlackWebApi } from '../src/server/runtime/slack-api.js';
import {
  currentSlackPolicy,
  loadSlackConfig,
} from '../src/server/runtime/slack-config.js';
import {
  configurationDigest,
  type SendPayload,
  type SlackConfig,
} from '../src/server/runtime/slack-types.js';
import { deliveriesSchema } from '../src/shared/runtime/channels.js';
import {
  StdioConversationTransport,
  type LaunchConfig,
} from '../src/server/runtime/stdio.js';
import type {
  ConversationMethod,
  ConversationResults,
} from '../src/server/runtime/wire.js';
const origin = 'https://slack-stdio.example.test';
const ownerId = 'slack-stdio-owner';
const ownerToken = 'isolated-slack-stdio-owner-token-123456';
const signingSecret = 'synthetic-slack-signing-only';
test.runIf(
  !!process.env.RYOKO_TEST_PYTHON && !!process.env.RYOKO_TEST_CHECKOUT,
)(
  'actual Node→Python command returns one immutable result, reconciles Slack response loss after restart and deduplicates signed ingress without a second model call or send',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'dots-slack-stdio-'));
    const database = join(root, 'dots.sqlite');
    const home = join(root, 'profile');
    const runtimeDirectory = join(root, 'runtime');
    mkdirSync(home);
    mkdirSync(runtimeDirectory);
    const checkout = resolve(process.env.RYOKO_TEST_CHECKOUT!);
    const python = process.env.RYOKO_TEST_PYTHON!;
    let executions = 0;
    const finalResponse = 'One immutable slack-compute result café 🥐';
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
      if (input.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const envelope = {
          id: 'slack-compute-fixture',
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
            id: 'slack-compute-fixture',
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
        profile_id: 'slack-profile',
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
      gatewayId: 'slack-stdio',
      identity: JSON.parse(identity.stdout),
      providerEnvironment: { OPENAI_API_KEY: 'no-key-required' },
    };
    const methods: string[] = [];
    const makeTransport = () => {
      const transport = new StdioConversationTransport(config);
      const call = transport.call.bind(transport);
      transport.call = async <M extends ConversationMethod>(
        method: M,
        params: unknown,
      ): Promise<ConversationResults[M]> => {
        methods.push(method);
        return call(method, params);
      };
      return transport;
    };
    const policy: SlackConfig = {
      enabled: true,
      authority: 'dots_signed_events',
      ownerId,
      dotId: config.dotId,
      teamId: 'TTEST',
      appId: 'ATEST',
      botUserId: 'UBOT',
      allowedChannelIds: ['CTEST', 'COTHER'],
      allowedHumanUserIds: ['UHUMAN', 'UOTHER'],
      appOrigin: origin,
      replyAuthority: {
        ownerId,
        grantId: 'synthetic-explicit-primary-context-reply',
        expiresAt: Date.now() + 86400000,
        sourcePairs: [{ channelId: 'CTEST', humanUserId: 'UHUMAN' }],
        dataScope: 'primary_context_original_command_results',
        deliveryScope: 'original_slack_thread',
        runtimeIdentity: config.identity,
        projectIds: [],
      },
      qualification: null,
    };
    policy.qualification = {
      configurationDigest: configurationDigest(policy),
      evidenceId: 'synthetic-local-producer-and-slack-only',
    };
    const policyPath = join(root, 'slack.json');
    writeFileSync(
      policyPath,
      JSON.stringify({ ...policy, exclusiveIngressConfirmed: true }),
    );
    const loadedPolicy = loadSlackConfig(policyPath)!;
    let sent: SendPayload | undefined;
    let sends = 0;
    let inspections = 0;
    const slackHttp = createServer(async (req, res) => {
      if (req.headers.authorization !== 'Bearer synthetic-loopback-slack') {
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
        sends++;
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
                text: sent!.text,
                thread_ts: sent!.thread_ts,
                ts: '1791048001.000000',
                blocks: sent!.blocks,
              },
              {
                user: 'UBOT',
                text: sent!.text,
                thread_ts: sent!.thread_ts,
                ts: '1791048001.000001',
                blocks: sent!.blocks,
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
    let platform = new SelfHostedPlatform(workspace, database, makeTransport());
    const makeSlack = () =>
      new SelfHostedSlack(
        loadedPolicy,
        database,
        () => signingSecret,
        new CommandServiceSlackBridge(
          platform,
          loadedPolicy,
          currentSlackPolicy(policyPath, loadedPolicy),
        ),
        new SlackWebApi(() => 'synthetic-loopback-slack', {
          loopbackTestOrigin: slackOrigin,
        }),
      );
    let slack = makeSlack();
    let app = createSelfHostedApp({ auth, platform, store, slack });
    const ingress = (
      patch: Record<string, unknown> = {},
      eventId = 'EvREALPYTHON',
    ) => {
      const body = JSON.stringify({
        type: 'event_callback',
        team_id: 'TTEST',
        api_app_id: 'ATEST',
        event_id: eventId,
        event: {
          type: 'app_mention',
          user: 'UHUMAN',
          channel: 'CTEST',
          ts: '1791048000.000001',
          text: 'Return the immutable local Slack fixture result once.',
          ...patch,
        },
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      return app.request(origin + '/slack/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature':
            'v0=' +
            createHmac('sha256', signingSecret)
              .update(`v0:${timestamp}:${body}`)
              .digest('hex'),
        },
        body,
      });
    };
    try {
      await platform.start();
      await slack.connect();
      expect((await ingress({ user: 'UOTHER' }, 'EvDENIEDACTOR')).status).toBe(
        403,
      );
      expect(
        (await ingress({ channel: 'COTHER' }, 'EvDENIEDCHANNEL')).status,
      ).toBe(403);
      expect(methods).not.toContain('runtime.command');
      expect(executions).toBe(0);
      const accepted = await ingress();
      expect(accepted.status, await accepted.clone().text()).toBe(200);
      expect(executions).toBe(0);
      const duplicate = await ingress();
      expect((await duplicate.json()).duplicate).toBe(true);
      for (let i = 0; i < 100; i++) {
        await slack.tick();
        if (slack.ledger.deliveries()[0]?.state === 'unknown') break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      const event = slack.ledger.event('EvREALPYTHON')!;
      const original = slack.ledger.deliveries()[0];
      expect(
        original,
        'immutable producer output must be staged before Slack delivery',
      ).toBeDefined();
      expect(original.state).toBe('unknown');
      expect(original.providerReceipt).toBeNull();
      expect(sent!.text).toBe(finalResponse);
      expect(original.conversationId).toBe(event.conversationId);
      expect(sent!.channel).toBe('CTEST');
      expect(sent!.thread_ts).toBe(event.threadTs);
      expect(
        methods.filter((method) => method === 'runtime.command'),
      ).toHaveLength(1);
      expect(methods).toContain('runtime.agent.get');
      expect(methods).toContain('runtime.agent.session.get');
      expect(executions).toBe(1);
      expect(sends).toBe(1);
      expect(inspections).toBe(0);
      expect(modelInputs[0]).toContain(
        'Return the immutable local Slack fixture result once.',
      );
      const result = await platform.delivery!.readResult(
        event.conversationId!,
        event.operationId,
        () => {},
      );
      expect(result.finalResponse).toBe(finalResponse);
      expect(result.artifact.sha256).toBe(original.sha256);
      expect(result.publicationState).toBe('committed');
      expect(result.delivery?.state).not.toBe('delivered');
      await slack.stop();
      await platform.stop();
      platform = new SelfHostedPlatform(workspace, database, makeTransport());
      slack = makeSlack();
      app = createSelfHostedApp({ auth, platform, store, slack });
      await platform.start();
      await slack.connect();
      expect((await (await ingress()).json()).duplicate).toBe(true);
      await slack.tick();
      expect(slack.ledger.event('EvREALPYTHON')!.operationId).toBe(
        event.operationId,
      );
      expect(slack.ledger.deliveries()[0].id).toBe(original.id);
      expect(slack.ledger.deliveries()[0].state).toBe('unknown');
      expect(executions).toBe(1);
      expect(sends).toBe(1);
      const login = await app.request(origin + '/api/auth/login', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ ownerToken }),
      });
      expect(login.status).toBe(200);
      const session = await login.json();
      const headers = {
        origin,
        'content-type': 'application/json',
        cookie: login.headers.get('set-cookie')!.split(';')[0],
        'x-csrf-token': session.csrfToken,
      };
      const inspected = await app.request(
        origin + `/api/runtime/channel-deliveries/${original.id}/inspect`,
        { method: 'POST', headers, body: '{}' },
      );
      expect(inspected.status, await inspected.clone().text()).toBe(200);
      const recovered = deliveriesSchema.parse(await inspected.json())
        .deliveries[0];
      expect(recovered.id).toBe(original.id);
      expect(recovered.missionId).toBeNull();
      expect(recovered.state).toBe('delivered');
      expect(recovered.providerReceipt).toBe('CTEST:1791048001.000001');
      await slack.tick();
      expect(inspections).toBe(1);
      expect(sends).toBe(1);
      expect(executions).toBe(1);
      expect(
        methods.filter((method) => method === 'runtime.command'),
      ).toHaveLength(1);
      expect(methods).not.toContain('runtime.delivery.ack');
    } finally {
      await slack.stop();
      await platform.stop();
      auth.close();
      workspace.close();
      store.close();
      slackHttp.closeAllConnections();
      await new Promise<void>((resolve) => slackHttp.close(() => resolve()));
      provider.closeAllConnections();
      await new Promise<void>((resolve) => provider.close(() => resolve()));
      if (process.env.RYOKO_TEST_KEEP === '1')
        process.stderr.write(`BE10 isolated fixture: ${root}\n`);
      else rmSync(root, { recursive: true, force: true });
    }
  },
  60000,
);
