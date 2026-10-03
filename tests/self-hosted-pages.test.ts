import { expect, test, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
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
import { canonicalCommand } from '../src/server/runtime/command-ledger';
import { canonicalControlIntent } from '../src/server/runtime/control-service';
import { intentDigest } from '../src/server/runtime/conversation-ledger';
import type { CommandIntent } from '../src/shared/runtime/contracts';
import type {
  ConversationMethod,
  ConversationResults,
} from '../src/server/runtime/wire';
import type { DotsPageProposal } from '../src/shared/runtime/producer/wire.generated';
const origin = 'http://127.0.0.1:3001',
  ownerId = 'page-owner',
  token = 'isolated-page-owner-token-123456';
const sha = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

test.runIf(
  !!process.env.RYOKO_TEST_PYTHON && !!process.env.RYOKO_TEST_CHECKOUT,
)(
  'real Node page executor and pinned Python broker retain exact native bytes, human tool approval and lost-receipt recovery',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'dots-pages-stdio-'));
    const home = join(root, 'profile'),
      runtimeDirectory = join(root, 'runtime'),
      database = join(root, 'dots.sqlite');
    mkdirSync(home);
    mkdirSync(runtimeDirectory);
    const checkout = resolve(process.env.RYOKO_TEST_CHECKOUT!),
      python = process.env.RYOKO_TEST_PYTHON!;
    const workspace = new WorkspaceStore(database, ownerId),
      store = new Store(database);
    const spaceId = workspace.spaces()[0].id,
      dotId = workspace.dots()[0].id,
      pageId = randomUUID();
    let modelCalls = 0,
      stage = 0;
    const toolsets: string[][] = [],
      toolResults: unknown[] = [];
    let proposal: DotsPageProposal;
    const provider = createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404).end();
        return;
      }
      let bytes = '';
      for await (const chunk of req) bytes += String(chunk);
      const input = JSON.parse(bytes);
      modelCalls++;
      toolsets.push(
        (input.tools ?? []).map(
          (tool: { function: { name: string } }) => tool.function.name,
        ),
      );
      const result = (input.messages ?? [])
        .filter((message: { role: string }) => message.role === 'tool')
        .at(-1);
      if (result) toolResults.push(result);
      const name =
        stage === 0
          ? 'dots_page_read'
          : stage === 1
            ? 'dots_page_propose'
            : undefined;
      const args =
        stage === 0
          ? {
              store_id: 'native-pages',
              project_id: proposal.project_id,
              space_id: spaceId,
              page_id: pageId,
              expected_grant_revision: 1,
              version: null,
            }
          : { request_id: 'model-page-edit', proposal };
      stage++;
      const tool_calls = name
        ? [
            {
              id: `native-call-${stage}`,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ]
        : undefined;
      const message = {
        role: 'assistant',
        content: name ? null : 'Exact native page save verified.',
        ...(tool_calls ? { tool_calls } : {}),
      };
      if (input.stream) {
        const delta = tool_calls
          ? {
              role: 'assistant',
              tool_calls: tool_calls.map((tool, index) => ({ index, ...tool })),
            }
          : { role: 'assistant', content: message.content };
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(
          `data: ${JSON.stringify({ id: 'page-fixture', object: 'chat.completion.chunk', created: 1, model: 'gpt-4.1-mini', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`,
        );
        res.write(
          `data: ${JSON.stringify({ id: 'page-fixture', object: 'chat.completion.chunk', created: 1, model: 'gpt-4.1-mini', choices: [{ index: 0, delta: {}, finish_reason: name ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`,
        );
        res.end('data: [DONE]\n\n');
      } else
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            id: 'page-fixture',
            object: 'chat.completion',
            created: 1,
            model: 'gpt-4.1-mini',
            choices: [
              {
                index: 0,
                message,
                finish_reason: name ? 'tool_calls' : 'stop',
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
    // Real producer project store API seeds an isolated fixture; runtime.project.get
    // and registration subsequently verify its actual owner, policy and grants.
    const createdProject = spawnSync(
      python,
      [
        '-c',
        `import sys\nfrom pathlib import Path\nfrom hermes_cli import projects_db\nwith projects_db.connect_closing(Path(sys.argv[1])/'projects.db') as db:\n print(projects_db.create_project(db,name='Native fixture project',owner_principal_id='${ownerId}',grants=[{'principal_id':'${ownerId}','agent_id':'ryoko','permissions':['read','write','share']}]))`,
        home,
      ],
      {
        cwd: checkout,
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin', HOME: home, HERMES_HOME: home },
      },
    );
    expect(createdProject.status, createdProject.stderr).toBe(0);
    const projectId = createdProject.stdout.trim();
    const profile = {
      agent_identity: {
        schema_version: 1,
        principal_id: ownerId,
        profile_id: 'page-profile',
        primary_agent_id: 'ryoko',
        active_agent_id: 'ryoko',
        agents: {
          ryoko: {
            policy_version: 1,
            role: 'primary',
            memory_backend: 'personal_mcp',
            allowed_tools: ['dots_page_read', 'dots_page_propose'],
            project_grants: [projectId],
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
    const config: LaunchConfig = {
      checkout,
      python,
      home,
      runtimeDirectory,
      ownerId,
      dotId,
      gatewayId: 'local',
      identity: JSON.parse(identity.stdout),
      providerEnvironment: { OPENAI_API_KEY: 'no-key-required' },
      nativePages: {
        adapterId: 'native-pages',
        projects: [{ spaceId, projectId }],
      },
    };
    let transport = new StdioConversationTransport(config);
    const trace: string[] = [];
    const rawCall = transport.call.bind(transport);
    vi.spyOn(transport, 'call').mockImplementation(
      async <M extends ConversationMethod>(
        method: M,
        params: unknown,
      ): Promise<ConversationResults[M]> => {
        trace.push(method);
        try {
          return await rawCall(method, params);
        } catch (error) {
          trace.push(String(error));
          throw error;
        }
      },
    );
    const setHandler = transport.setNativeHandler.bind(transport);
    let loseNativeReply = false,
      nativeDispatches = 0;
    vi.spyOn(transport, 'setNativeHandler').mockImplementation((handler) =>
      setHandler(async (method, params, signal) => {
        let result;
        try {
          result = await handler(method, params, signal);
        } catch (error) {
          trace.push('callback:' + method + ':' + String(error));
          throw error;
        }
        if (method === 'dots.effect.dispatch') {
          nativeDispatches++;
          if (loseNativeReply) {
            loseNativeReply = false;
            throw new Error('Simulated native response loss after commit');
          }
        }
        return result;
      }),
    );
    let platform = new SelfHostedPlatform(workspace, database, transport);
    const nativeConnect = platform.nativePages!.connect.bind(
      platform.nativePages!,
    );
    vi.spyOn(platform.nativePages!, 'connect').mockImplementation(
      async (...args) => {
        try {
          return await nativeConnect(...args);
        } catch (error) {
          trace.push('connect:' + String(error));
          throw error;
        }
      },
    );
    const auth = new OwnerAuth(database, {
      ownerId,
      ownerToken: token,
      origin,
    });
    let app = createSelfHostedApp({ auth, platform, store });
    try {
      const login = await app.request(`${origin}/api/auth/login`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ ownerToken: token }),
      });
      const loginData = await login.json();
      const headers = {
        origin,
        'content-type': 'application/json',
        cookie: login.headers.get('set-cookie')!.split(';')[0],
        'x-csrf-token': loginData.csrfToken,
      };
      const request = (path: string, body?: unknown, method?: string) =>
        app.request(`${origin}/api${path}`, {
          headers,
          method: method ?? (body ? 'POST' : 'GET'),
          body: body ? JSON.stringify(body) : undefined,
        });
      const expectJson = async (response: Response, status = 200) => {
        expect(
          response.status,
          JSON.stringify({ body: await response.clone().text(), trace }),
        ).toBe(status);
        return response.json();
      };
      const created = await expectJson(
        await request('/runtime/conversations', {
          operationId: randomUUID(),
          dotId,
          title: 'Native pages',
        }),
        201,
      );
      const conversationId = created.conversation.id,
        base = `/runtime/conversations/${encodeURIComponent(conversationId)}`;
      const setup = await expectJson(await request(`${base}/connect`, {}));
      expect(setup.features.artifacts.state).toBe('ready');
      expect(modelCalls).toBe(0);
      const operationId = randomUUID();
      const draft = {
        operationId,
        expectedGeneration: setup.scope.generation,
        spaceId,
        pageId,
        expectedRevision: 0,
        title: 'Native exact page',
        content: '# café 🦊\n\nLiteral untrusted <script>alert(1)</script>',
        parentId: null,
        archived: false,
      };
      const prepared = await expectJson(
        await request(`${base}/page-saves`, draft),
      );
      expect(prepared.state, JSON.stringify(prepared)).toBe('prepared');
      expect(workspace.pages.list(spaceId)).toHaveLength(0);
      expect(modelCalls).toBe(0);
      const exact = await expectJson(
        await request(`${base}/reviews/${prepared.prepared.approval_id}`),
      );
      expect(exact.review.content).toContain('Native exact page');
      loseNativeReply = true;
      const publish = {
        approvalId: prepared.prepared.approval_id,
        approvalDigest: prepared.prepared.approval_digest,
      };
      const unknown = await expectJson(
        await request(`${base}/page-saves/${operationId}/publish`, publish),
      );
      expect(unknown.state, JSON.stringify(unknown)).toBe('outcome_unknown');
      expect(
        workspace.pages.list(spaceId),
        JSON.stringify({ unknown, trace }),
      ).toHaveLength(1);
      expect(workspace.pages.get(spaceId, pageId).revision).toBe(1);
      expect(nativeDispatches).toBe(1);
      workspace.pages.update(spaceId, pageId, {
        expectedRevision: 1,
        content: 'Manual continuation after native commit',
      });
      // A fresh Node service and actual producer process reconnect. Historical
      // effect inspection must not depend on replaying its old claimed event.
      await platform.stop();
      transport = new StdioConversationTransport(config);
      const nextHandler = transport.setNativeHandler.bind(transport);
      let inspections = 0;
      vi.spyOn(transport, 'setNativeHandler').mockImplementation((handler) =>
        nextHandler(async (method, params, signal) => {
          const result = await handler(method, params, signal);
          if (method === 'dots.effect.dispatch') nativeDispatches++;
          if (method === 'dots.effect.inspect') inspections++;
          return result;
        }),
      );
      platform = new SelfHostedPlatform(workspace, database, transport);
      app = createSelfHostedApp({ auth, platform, store });
      await expectJson(await request(`${base}/connect`, {}));
      const inspected = await expectJson(
        await request(
          `${base}/page-effects/${unknown.result.effect_id}/inspect`,
          {},
        ),
      );
      expect(inspected.effect.state, JSON.stringify(inspected)).toBe(
        'confirmed',
      );
      expect(inspected.effect.receipt.identity.generation).toBe(1);
      expect(inspections).toBe(1);
      expect(nativeDispatches).toBe(1);
      expect(modelCalls).toBe(0);
      const recovered = await expectJson(
        await request(`${base}/page-saves/${operationId}`),
      );
      expect(recovered.state, JSON.stringify(recovered)).toBe('confirmed');
      expect(recovered.result.receipt.version).toBe(1);
      expect(workspace.pages.get(spaceId, pageId).revision).toBe(2);
      expect(
        (
          await expectJson(
            await request(`${base}/page-saves/${operationId}/publish`, publish),
          )
        ).state,
      ).toBe('confirmed');
      expect(nativeDispatches).toBe(1);
      expect(
        (
          await request(`${base}/page-saves`, {
            ...draft,
            content: 'Different unapproved bytes',
          })
        ).status,
      ).toBe(409);
      const artifactPath = `/runtime/artifacts/${pageId}/versions/1/content?dotId=${dotId}`;
      const artifact = await request(artifactPath);
      expect(artifact.status).toBe(200);
      const artifactBytes = new Uint8Array(await artifact.arrayBuffer());
      expect(sha(artifactBytes)).toBe(recovered.result.receipt.content_sha256);
      expect(JSON.parse(Buffer.from(artifactBytes).toString()).content).toBe(
        draft.content,
      );
      expect(
        (await request(`/runtime/artifacts/${pageId}/versions/1/content`))
          .status,
      ).toBe(400);
      const index = await expectJson(
        await request(`/runtime/artifacts?dotId=${dotId}`),
      );
      expect(index.artifacts[0].version).toBe('2');
      // Real ordinary model tool discovery/read/proposal/approval path.
      proposal = {
        kind: 'page',
        store_id: 'native-pages',
        project_id: projectId,
        space_id: spaceId,
        page_id: pageId,
        expected_head_version: 2,
        expected_grant_revision: 1,
        document: {
          title: 'Native model result',
          content: '# Human-approved native model edit',
          parent_id: null,
          archived: false,
        },
      };
      const intent: CommandIntent = {
        operation: 'submit',
        conversationId,
        text: 'Read the native page and propose the exact next revision.',
        sourceUrl: null,
      };
      const commandId = randomUUID();
      await expectJson(
        await request(`${base}/commands`, {
          operationId: commandId,
          intentDigest: intentDigest(canonicalCommand(intent)),
          intent,
          expectedGeneration: setup.scope.generation,
        }),
      );
      let approvalId: string | undefined;
      for (let n = 0; n < 300; n++) {
        const reviews = await expectJson(await request(`${base}/reviews`));
        const pending = reviews.approvals.find(
          (approval: { approval_id: string; status: string }) =>
            approval.status === 'pending' &&
            approval.approval_id.startsWith('dots-review-'),
        );
        if (pending) {
          approvalId = pending.approval_id;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(
        approvalId,
        JSON.stringify({ toolsets, toolResults, modelCalls }),
      ).toBeTruthy();
      expect(toolsets[0]).toContain('dots_page_read');
      expect(toolsets[0]).toContain('dots_page_propose');
      expect(JSON.stringify(toolResults)).toContain(
        'Manual continuation after native commit',
      );
      const review = await expectJson(
        await request(`${base}/reviews/${approvalId}`),
      );
      expect(review.review.content).toContain(
        'Human-approved native model edit',
      );
      const decisionIntent = {
        path: `${base}/reviews/${approvalId}/decision`,
        action: 'approval.resolve' as const,
        payload: {
          approvalDigest: review.review.approvalDigest,
          choice: 'once',
        },
        expectedRevision: 0,
      };
      const decision = {
        operationId: randomUUID(),
        intentDigest: intentDigest(canonicalControlIntent(decisionIntent)),
        action: decisionIntent.action,
        payload: decisionIntent.payload,
        expectedRevision: 0,
        expectedGeneration: setup.scope.generation,
      };
      const answered = await expectJson(
        await request(decisionIntent.path, decision),
      );
      expect(answered.status, JSON.stringify(answered)).toBe('accepted');
      for (
        let n = 0;
        n < 300 && workspace.pages.get(spaceId, pageId).revision < 3;
        n++
      )
        await new Promise((resolve) => setTimeout(resolve, 100));
      expect(workspace.pages.get(spaceId, pageId)).toMatchObject({
        revision: 3,
        content: proposal.document.content,
      });
      expect(nativeDispatches).toBe(2);
      for (let n = 0; n < 300; n++) {
        const status = await expectJson(
          await request(`/runtime/commands/${commandId}`),
        );
        if (status.executionStatus === 'completed') break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(modelCalls).toBe(3);
      expect(
        (await expectJson(await request(decisionIntent.path, decision))).status,
      ).toBe('accepted');
      expect(nativeDispatches).toBe(2);
      const archived = await expectJson(
        await request(
          `/spaces/${spaceId}/pages/${pageId}`,
          { expectedRevision: 3, archived: true },
          'PATCH',
        ),
      );
      expect(archived).toMatchObject({ archived: true, revision: 4 });
      expect(
        (await expectJson(await request(`/spaces/${spaceId}/pages`)))[0]
          .archived,
      ).toBe(true);
      expect(
        JSON.parse(
          Buffer.from(
            await (
              await request(
                `/runtime/artifacts/${pageId}/versions/4/content?dotId=${dotId}`,
              )
            ).arrayBuffer(),
          ).toString(),
        ).archived,
      ).toBe(true);
      const pageConversation = await expectJson(
        await request(`/runtime/pages/${pageId}/conversation`, {
          operationId: randomUUID(),
          dotId,
          spaceId,
          title: 'Archived page history',
        }),
        201,
      );
      const pageConversationId = pageConversation.conversation.id;
      const pageBase = `/runtime/conversations/${pageConversationId}`;
      const pageSetup = await expectJson(
        await request(`${pageBase}/connect`, {}),
      );
      const submit: CommandIntent = {
        operation: 'submit',
        conversationId: pageConversationId,
        text: 'New work must remain blocked on this archived source page',
        sourceUrl: null,
      };
      expect(
        (
          await request(`${pageBase}/commands`, {
            operationId: randomUUID(),
            intentDigest: intentDigest(canonicalCommand(submit)),
            intent: submit,
            expectedGeneration: pageSetup.scope.generation,
          })
        ).status,
      ).toBe(403);
      await expectJson(
        await request(`${pageBase}/archive`, {
          operationId: randomUUID(),
          expectedRevision: pageConversation.conversation.revision,
          archived: true,
        }),
      );
      const cancel: CommandIntent = {
        operation: 'cancel',
        conversationId: pageConversationId,
        runId: 'missing-owned-run',
        expectedRevision: 0,
      };
      const cancellation = await expectJson(
        await request(`${pageBase}/commands`, {
          operationId: randomUUID(),
          intentDigest: intentDigest(canonicalCommand(cancel)),
          intent: cancel,
          expectedGeneration: pageSetup.scope.generation,
        }),
      );
      expect(cancellation.status).toBe('rejected'); // Exact missing run, not archive authority denial.
      expect(modelCalls).toBe(3);
    } finally {
      await platform.stop();
      auth.close();
      store.close();
      workspace.close();
      provider.closeAllConnections();
      await new Promise<void>((resolve) => provider.close(() => resolve()));
      rmSync(root, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  },
  120000,
);
