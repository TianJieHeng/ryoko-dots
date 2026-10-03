import { test, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WorkspaceStore } from '../src/server/workspace';
import { Store } from '../src/server/store';
import { OwnerAuth } from '../src/server/owner-auth';
import { SelfHostedPlatform } from '../src/server/self-hosted-platform';
import { createSelfHostedApp } from '../src/server/self-hosted-app';
import {
  StdioConversationTransport,
  type LaunchConfig,
} from '../src/server/runtime/stdio';
import type {
  ConversationMethod,
  ConversationResults,
} from '../src/server/runtime/wire';
import { RuntimeFailure } from '../src/server/runtime/conversation-rpc';
import { canonicalCommand } from '../src/server/runtime/command-ledger';
import { canonicalControlIntent } from '../src/server/runtime/control-service';
import { intentDigest } from '../src/server/runtime/conversation-ledger';
import type { CommandIntent } from '../src/shared/runtime/contracts';

const origin = 'http://127.0.0.1:3001';
const ownerId = 'delivery-owner';
const token = 'isolated-delivery-owner-token-123456';

test.runIf(
  !!process.env.RYOKO_TEST_PYTHON && !!process.env.RYOKO_TEST_CHECKOUT,
)(
  'real pinned stdio preserves immutable delivery retry and explicit browser receipts without rerunning inference',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'dots-delivery-stdio-'));
    const database = join(root, 'dots.sqlite');
    const home = join(root, 'profile');
    const runtimeDirectory = join(root, 'runtime');
    mkdirSync(home);
    mkdirSync(runtimeDirectory);
    const checkout = resolve(process.env.RYOKO_TEST_CHECKOUT!);
    const python = process.env.RYOKO_TEST_PYTHON!;
    let executions = 0;
    const finalResponse =
      'Immutable café 🥐 ' +
      Array.from({ length: 1200 }, (_, index) =>
        createHash('sha256').update(String(index)).digest('hex'),
      ).join(' ');
    const provider = createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404).end();
        return;
      }
      let bytes = '';
      for await (const chunk of req) bytes += String(chunk);
      const input = JSON.parse(bytes);
      executions++;
      if (input.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(
          `data: ${JSON.stringify({ id: 'control-fixture', object: 'chat.completion.chunk', created: 1, model: 'gpt-4.1-mini', choices: [{ index: 0, delta: { role: 'assistant', content: finalResponse }, finish_reason: null }] })}\n\n`,
        );
        res.write(
          `data: ${JSON.stringify({ id: 'control-fixture', object: 'chat.completion.chunk', created: 1, model: 'gpt-4.1-mini', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`,
        );
        res.end('data: [DONE]\n\n');
      } else
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            id: 'control-fixture',
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
    });
    provider.listen(0, '127.0.0.1');
    await once(provider, 'listening');
    const endpoint = `http://127.0.0.1:${(provider.address() as { port: number }).port}/v1`;
    const profile = {
      agent_identity: {
        schema_version: 1,
        principal_id: ownerId,
        profile_id: 'delivery-profile',
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
        `import json,sys,yaml\nfrom agent.agent_identity import resolve_agent_context\np=sys.argv[1]\nc=yaml.safe_load(open(p+'/config.yaml'))\ni=resolve_agent_context(c,session_id='conversation_ingress',profile_home=p).identity\nprint(json.dumps({k:getattr(i,k) for k in ['principal_id','profile_id','agent_id','policy_digest','config_digest']}))`,
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
    const auth = new OwnerAuth(database, {
      ownerId,
      ownerToken: token,
      origin,
    });
    const config: LaunchConfig = {
      checkout,
      python,
      home,
      runtimeDirectory,
      ownerId,
      dotId: workspace.dots()[0].id,
      gatewayId: 'local',
      identity: JSON.parse(identity.stdout),
      providerEnvironment: { OPENAI_API_KEY: 'no-key-required' },
    };
    let platform = new SelfHostedPlatform(
      workspace,
      database,
      new StdioConversationTransport(config),
    );
    let app = createSelfHostedApp({ auth, platform, store });
    try {
      const login = await app.request(`${origin}/api/auth/login`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ ownerToken: token }),
      });
      expect(login.status).toBe(200);
      const data = await login.json();
      const headers = {
        origin,
        'content-type': 'application/json',
        cookie: login.headers.get('set-cookie')!.split(';')[0],
        'x-csrf-token': data.csrfToken,
      };
      const request = (path: string, body?: unknown) =>
        app.request(`${origin}/api${path}`, {
          headers,
          method: body ? 'POST' : 'GET',
          body: body ? JSON.stringify(body) : undefined,
        });
      const created = await request('/runtime/conversations', {
        operationId: randomUUID(),
        dotId: config.dotId,
        title: 'BE04 immutable delivery proof',
      });
      expect(created.status, await created.clone().text()).toBe(201);
      const conversationId = (await created.json()).conversation.id;
      const base = `/runtime/conversations/${encodeURIComponent(conversationId)}`;
      const connected = await request(`${base}/connect`, {});
      expect(connected.status, await connected.clone().text()).toBe(200);
      const setup = await connected.json();
      const operationId = randomUUID();
      const intent: CommandIntent = {
        operation: 'submit',
        conversationId,
        text: 'Return the immutable fixture result once',
        sourceUrl: null,
      };
      const accepted = await request(`${base}/commands`, {
        operationId,
        intentDigest: intentDigest(canonicalCommand(intent)),
        intent,
        expectedGeneration: setup.scope.generation,
      });
      expect(accepted.status, await accepted.clone().text()).toBe(200);
      expect((await accepted.json()).status).toBe('accepted');
      let completed = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        const receipt = await (
          await request(`/runtime/commands/${operationId}`)
        ).json();
        if (receipt.executionStatus === 'completed') {
          completed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(completed).toBe(true);
      expect(executions).toBe(1);
      const initial = await request(`${base}/results/${operationId}`);
      expect(initial.status, await initial.clone().text()).toBe(200);
      const read = await initial.json();
      expect(read.finalResponse).toBe(finalResponse);
      const bytes = Buffer.from(read.artifact.dataBase64, 'base64');
      expect(bytes.length).toBeGreaterThan(65536);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        read.artifact.sha256,
      );
      expect(JSON.parse(bytes.toString('utf8')).final_response).toBe(
        finalResponse,
      );
      expect(read.publicationState).toBe('committed');
      expect(read.delivery.state).toBe('awaiting_ack');
      expect(read.delivery.acknowledgment_level).toBe('transport_accepted');
      expect(read.delivery.components).toEqual({
        text: 'not_sent',
        artifact: 'not_sent',
      });
      expect(read.browserReceiptId).toMatch(/^[a-f0-9-]{36}$/);
      expect(JSON.stringify(read)).not.toContain('attempt_token');
      const resultAgain = await (
        await request(`${base}/results/${operationId}`)
      ).json();
      expect(resultAgain.browserReceiptId).toBe(read.browserReceiptId);
      expect(resultAgain.delivery.attempt_count).toBe(
        read.delivery.attempt_count,
      );
      expect(
        (await request(`/runtime/conversations/foreign/results/${operationId}`))
          .status,
      ).not.toBe(200);
      expect(executions).toBe(1);

      // An explicit fresh retry repairs only this notification after its persisted
      // backoff. It must retain identical full bytes and never invoke the model.
      const delay = Math.max(
        0,
        read.delivery.next_attempt_at * 1000 - Date.now() + 100,
      );
      expect(delay).toBeLessThan(10000);
      await new Promise((resolve) => setTimeout(resolve, delay));
      const deliveryId = read.delivery.delivery_id;
      const retryPath = `${base}/deliveries/${encodeURIComponent(deliveryId)}/actions`;
      const retryIntent = {
        path: retryPath,
        action: 'retry_delivery' as const,
        payload: {
          artifactId: read.artifact.artifactId,
          version: read.artifact.version,
          sha256: read.artifact.sha256,
        },
        expectedRevision: read.delivery.attempt_count,
      };
      const retry = await request(retryPath, {
        operationId: randomUUID(),
        intentDigest: intentDigest(canonicalControlIntent(retryIntent)),
        action: retryIntent.action,
        payload: retryIntent.payload,
        expectedRevision: retryIntent.expectedRevision,
        expectedGeneration: setup.scope.generation,
      });
      expect(retry.status, await retry.clone().text()).toBe(200);
      expect((await retry.json()).status).toBe('accepted');
      const retried = await (
        await request(`${base}/results/${operationId}`)
      ).json();
      expect(retried.artifact).toEqual(read.artifact);
      expect(retried.delivery.attempt_count).toBe(
        read.delivery.attempt_count + 1,
      );
      expect(retried.delivery.state).toBe('awaiting_ack');
      expect(retried.browserReceiptId).not.toBe(read.browserReceiptId);
      expect(executions).toBe(1);
      const ackPath = `${base}/deliveries/${encodeURIComponent(deliveryId)}/ack`;
      const partial = await request(ackPath, {
        receiptId: retried.browserReceiptId,
        sha256: retried.artifact.sha256,
        textReceived: true,
        artifactReceived: false,
      });
      expect(partial.status, await partial.clone().text()).toBe(200);
      expect((await partial.json()).delivery.state).toBe('partial');
      const readPartial = await (
        await request(`${base}/results/${operationId}`)
      ).json();
      expect(readPartial.delivery.components).toEqual({
        text: 'client_received',
        artifact: 'not_sent',
      });
      const claim = {
        receiptId: readPartial.browserReceiptId,
        sha256: readPartial.artifact.sha256,
        textReceived: false,
        artifactReceived: true,
      };
      // Commit the real ACK, then lose only its transport response. Recovery is
      // status inspection, including after the entire BFF and producer restart.
      const transport = platform.transport!;
      const originalCall = transport.call.bind(transport);
      let acknowledgmentCalls = 0;
      transport.call = async <M extends ConversationMethod>(
        method: M,
        params: unknown,
      ): Promise<ConversationResults[M]> => {
        const result = await originalCall(method, params);
        if (method === 'runtime.delivery.ack') {
          acknowledgmentCalls++;
          throw new RuntimeFailure('unknown');
        }
        return result;
      };
      const ambiguous = await request(ackPath, claim);
      expect(ambiguous.status, await ambiguous.clone().text()).toBe(200);
      expect((await ambiguous.json()).status).toBe('outcome_unknown');
      expect(acknowledgmentCalls).toBe(1);
      await platform.stop();
      platform = new SelfHostedPlatform(
        workspace,
        database,
        new StdioConversationTransport(config),
      );
      app = createSelfHostedApp({ auth, platform, store });
      const reconnect = await request(`${base}/connect`, {});
      expect(reconnect.status, await reconnect.clone().text()).toBe(200);
      const recoveredTransport = platform.transport!;
      const recoveredCall = recoveredTransport.call.bind(recoveredTransport);
      recoveredTransport.call = async <M extends ConversationMethod>(
        method: M,
        params: unknown,
      ): Promise<ConversationResults[M]> => {
        if (method === 'runtime.delivery.ack') acknowledgmentCalls++;
        return recoveredCall(method, params);
      };
      const recovered = await request(ackPath, claim);
      expect(recovered.status, await recovered.clone().text()).toBe(200);
      const outcome = await recovered.json();
      expect(outcome.status).toBe('accepted');
      expect(outcome.delivery.state).toBe('delivered');
      expect(outcome.humanReadConfirmed).toBe(false);
      expect(acknowledgmentCalls).toBe(1);
      const finalRead = await (
        await request(`${base}/results/${operationId}`)
      ).json();
      expect(finalRead.artifact).toEqual(read.artifact);
      expect(finalRead.delivery.state).toBe('delivered');
      expect(finalRead.browserReceiptId).toBeNull();
      expect(executions).toBe(1);
    } finally {
      await platform.stop();
      auth.close();
      workspace.close();
      store.close();
      provider.closeAllConnections();
      await new Promise<void>((resolve) => provider.close(() => resolve()));
      if (process.env.RYOKO_TEST_KEEP === '1')
        process.stderr.write(`BE04 delivery isolated fixture: ${root}\n`);
      else rmSync(root, { recursive: true, force: true });
    }
  },
  60000,
);
