import { test, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
const ownerId = 'control-owner';
const token = 'isolated-control-owner-token-123456';

test.runIf(
  !!process.env.RYOKO_TEST_PYTHON && !!process.env.RYOKO_TEST_CHECKOUT,
)(
  'real pinned stdio preserves owner pause, receipt recovery and scoped BE04 reads without effect replay',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'dots-controls-stdio-'));
    const database = join(root, 'dots.sqlite');
    const home = join(root, 'profile');
    const runtimeDirectory = join(root, 'runtime');
    mkdirSync(home);
    mkdirSync(runtimeDirectory);
    const checkout = resolve(process.env.RYOKO_TEST_CHECKOUT!);
    const python = process.env.RYOKO_TEST_PYTHON!;
    let executions = 0;
    let release: (() => void) | undefined;
    let hold = false;
    const provider = createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404).end();
        return;
      }
      let bytes = '';
      for await (const chunk of req) bytes += String(chunk);
      const input = JSON.parse(bytes);
      executions++;
      if (hold)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (input.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(
          `data: ${JSON.stringify({ id: 'control-fixture', object: 'chat.completion.chunk', created: 1, model: 'gpt-4.1-mini', choices: [{ index: 0, delta: { role: 'assistant', content: 'Resumed owned work' }, finish_reason: null }] })}\n\n`,
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
                message: { role: 'assistant', content: 'Resumed owned work' },
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
        profile_id: 'control-profile',
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
        `import json,sys; import hermes_yaml as yaml\nfrom agent.agent_identity import resolve_agent_context\np=sys.argv[1]\nc=yaml.safe_load(open(p+'/config.yaml'))\ni=resolve_agent_context(c,session_id='conversation_ingress',profile_home=p).identity\nprint(json.dumps({k:getattr(i,k) for k in ['principal_id','profile_id','agent_id','policy_digest','config_digest']}))`,
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
        title: 'BE04 actual control proof',
      });
      expect(created.status, await created.clone().text()).toBe(201);
      const conversationId = (await created.json()).conversation.id;
      const base = `/runtime/conversations/${encodeURIComponent(conversationId)}`;
      // GET never starts an execution binding.
      expect((await request(`${base}/control`)).status).toBe(503);
      const connected = await request(`${base}/connect`, {});
      expect(connected.status, await connected.clone().text()).toBe(200);
      const setup = await connected.json();
      expect(setup.features.commands.state).toBe('ready');
      expect(executions).toBe(0);
      const read = await request(`${base}/control`);
      expect(read.status, await read.clone().text()).toBe(200);
      const original = await read.json();
      expect(original.control.scope).toBe('owner_profile');
      expect(original.control.paused).toBe(false);
      const control = (
        action: 'pause' | 'resume',
        expectedRevision: number,
      ) => {
        const intent = {
          path: `${base}/control`,
          action,
          payload: {},
          expectedRevision,
        };
        return {
          operationId: randomUUID(),
          intentDigest: intentDigest(canonicalControlIntent(intent)),
          action,
          payload: {},
          expectedRevision,
          expectedGeneration: setup.scope.generation,
        };
      };
      const pause = control('pause', original.control.revision);
      const paused = await request(`${base}/control`, pause);
      expect(paused.status, await paused.clone().text()).toBe(200);
      expect((await paused.json()).status).toBe('accepted');
      const state = await (await request(`${base}/control`)).json();
      expect(state.control.paused).toBe(true);
      expect(state.control.admission_blocked).toBe(true);
      expect(state.control.scheduled_dispatch_blocked).toBe(true);
      expect(state.control.in_flight_dispatch).toBe('blocked_at_next_boundary');
      expect(state.control.accepted_work_retained).toBe(true);
      expect(state.control.provider_cancelled).toBe(false);
      expect(state.control.remote_effects_undone).toBe(false);
      const intent: CommandIntent = {
        operation: 'submit',
        conversationId,
        text: 'This must not execute while paused',
        sourceUrl: null,
      };
      const blocked = await request(`${base}/commands`, {
        operationId: randomUUID(),
        intentDigest: intentDigest(canonicalCommand(intent)),
        intent,
        expectedGeneration: setup.scope.generation,
      });
      expect(blocked.status, await blocked.clone().text()).toBe(200);
      expect((await blocked.json()).status).not.toBe('accepted');
      expect(executions).toBe(0);
      for (const [name, key] of [
        ['missions', 'missions'],
        ['reviews', 'approvals'],
        ['effects', 'effects'],
      ] as const) {
        const response = await request(`${base}/${name}`);
        expect(response.status, await response.clone().text()).toBe(200);
        const snapshot = await response.json();
        expect(snapshot.conversationId).toBe(conversationId);
        expect(snapshot.complete).toBe(false);
        expect(snapshot.limit).toBe(100);
        expect(snapshot[key]).toEqual([]);
      }
      // Restart only the BFF/runtime; the owner profile pause must persist and
      // read-only receipt inspection must not undo it or revive blocked input.
      await platform.stop();
      platform = new SelfHostedPlatform(
        workspace,
        database,
        new StdioConversationTransport(config),
      );
      app = createSelfHostedApp({ auth, platform, store });
      const reconnected = await request(`${base}/connect`, {});
      expect(reconnected.status, await reconnected.clone().text()).toBe(200);
      const recovered = await request(
        `/runtime/operations/${pause.operationId}`,
      );
      expect(recovered.status, await recovered.clone().text()).toBe(200);
      expect((await recovered.json()).status).toBe('accepted');
      expect(
        (await (await request(`${base}/control`)).json()).control.paused,
      ).toBe(true);
      expect(executions).toBe(0);
      const stale = await request(`${base}/control`, control('resume', 0));
      expect(stale.status, await stale.clone().text()).toBe(200);
      expect((await stale.json()).status).toBe('outcome_unknown');
      expect(
        (await (await request(`${base}/control`)).json()).control.paused,
      ).toBe(true);
      const resumed = await request(
        `${base}/control`,
        control('resume', state.control.revision),
      );
      expect(resumed.status, await resumed.clone().text()).toBe(200);
      expect((await resumed.json()).status).toBe('accepted');
      expect(
        (await (await request(`${base}/control`)).json()).control.paused,
      ).toBe(false);
      expect((await request(`${base}/reviews/forged-review`)).status).not.toBe(
        200,
      );
      const forgedPath = `${base}/reviews/forged-review/decision`;
      const forgedIntent = {
        path: forgedPath,
        action: 'approval.resolve' as const,
        payload: { approvalDigest: 'a'.repeat(64), choice: 'once' },
        expectedRevision: 0,
      };
      const forged = await request(forgedPath, {
        operationId: randomUUID(),
        intentDigest: intentDigest(canonicalControlIntent(forgedIntent)),
        action: forgedIntent.action,
        payload: forgedIntent.payload,
        expectedRevision: 0,
        expectedGeneration: setup.scope.generation,
      });
      expect(forged.status, await forged.clone().text()).toBe(200);
      expect((await forged.json()).status).toBe('rejected');
      const foreign = await request('/runtime/conversations/foreign/control');
      expect(foreign.status).not.toBe(200);
      expect(executions).toBe(0);
      const resumedIntent = {
        ...intent,
        text: 'Execute once after the explicit resume',
      };
      hold = true;
      const runId = randomUUID();
      const accepted = await request(`${base}/commands`, {
        operationId: runId,
        intentDigest: intentDigest(canonicalCommand(resumedIntent)),
        intent: resumedIntent,
        expectedGeneration: setup.scope.generation,
      });
      expect((await accepted.json()).status).toBe('accepted');
      // Presentation edits cannot hide a durable accepted command by advancing authority.
      const beforeRename =
        workspace.runtimeBindings.resolveConversation(conversationId);
      const configuredDot = workspace.dot(beforeRename.dotId)!;
      workspace.updateDot(configuredDot.id, {
        ...configuredDot,
        name: 'Renamed display only',
      });
      expect(
        workspace.runtimeBindings.resolveConversation(conversationId)
          .authorityRevision,
      ).toBe(beforeRename.authorityRevision);
      const afterRename = await request(`/runtime/commands/${runId}`);
      expect(afterRename.status).toBe(200);
      expect((await afterRename.json()).operationId).toBe(runId);

      for (let attempt = 0; attempt < 100 && !release; attempt++)
        await new Promise((resolve) => setTimeout(resolve, 50));
      expect(release).toBeDefined();
      // The isolated producer API creates a fixture review under the existing
      // real run lease. It does not bypass ownership or grant any tool access.
      const seeded = spawnSync(
        python,
        [
          '-c',
          `import json,sys,time; import hermes_yaml as yaml
from agent.agent_identity import resolve_agent_context
from agent.result_artifacts import artifact_actor
from hermes_state import SessionDB
from hermes_state_effects import effect_digest
home,sid=sys.argv[1:]
context=resolve_agent_context(yaml.safe_load(open(home+'/config.yaml')),session_id=sid,profile_home=home)
with SessionDB() as db:
    lease=db.get_session_turn_lease(sid)
    run_id=db.read_runtime_snapshot(sid)['state']['run_id']
    action={'name':'isolated_review_fixture','arguments':{'text':'Exact café fixture bytes','recipient':'local-owner'},'operation_class':'fixture_preview','resource_roots':[],'destination':'local-owner','destination_purpose':'fixture review only','contract_digest':effect_digest({})}
    target=effect_digest({'destination':action['destination'],'purpose':action['destination_purpose'],'resource_roots':[]})
    approval=db.request_effect_approval(sid,artifact_actor(context),holder=lease['holder'],generation=lease['generation'],run_id=run_id,action_digest=effect_digest(action),input_digest=effect_digest(action['arguments']),target_ref=target,policy_version=str(context.policy.policy_version),policy_digest=context.policy.digest,input_revision='fixture-input-v1',artifact_revision='fixture-artifact-v1',expires_at=time.time()+300,review={'action':action,'content':None})
    print(json.dumps({'approval_id':approval['approval_id'],'approval_digest':approval['approval_digest']}))`,
          home,
          conversationId,
        ],
        {
          cwd: checkout,
          encoding: 'utf8',
          env: { PATH: '/usr/bin:/bin', HOME: home, HERMES_HOME: home },
        },
      );
      expect(seeded.status, seeded.stderr).toBe(0);
      const approval = JSON.parse(seeded.stdout);
      const detail = await request(`${base}/reviews/${approval.approval_id}`);
      expect(detail.status, await detail.clone().text()).toBe(200);
      const exact = await detail.json();
      expect(exact.review.approvalDigest).toBe(approval.approval_digest);
      expect(exact.review.content).toContain('Exact café fixture bytes');
      expect(exact.detail.dispatch_performed).toBe(false);
      expect(exact.review.status).toBe('pending');
      const decisionPath = `${base}/reviews/${approval.approval_id}/decision`;
      const decisionIntent = {
        path: decisionPath,
        action: 'approval.resolve' as const,
        payload: { approvalDigest: approval.approval_digest, choice: 'deny' },
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
      const transport = platform.transport!;
      const originalCall = transport.call.bind(transport);
      let resolveCalls = 0;
      transport.call = async <M extends ConversationMethod>(
        method: M,
        params: unknown,
      ): Promise<ConversationResults[M]> => {
        const result = await originalCall(method, params);
        if (method === 'runtime.approval.resolve') {
          resolveCalls++;
          throw new RuntimeFailure('unknown');
        }
        return result;
      };
      const denied = await request(decisionPath, decision);
      expect(denied.status, await denied.clone().text()).toBe(200);
      expect((await denied.json()).status).toBe('outcome_unknown');
      const inspected = await request(
        `/runtime/operations/${decision.operationId}`,
      );
      expect(inspected.status, await inspected.clone().text()).toBe(200);
      expect((await inspected.json()).status).toBe('accepted');
      const duplicate = await request(decisionPath, decision);
      expect((await duplicate.json()).status).toBe('accepted');
      expect(resolveCalls).toBe(1);
      const decided = await (
        await request(`${base}/reviews/${approval.approval_id}`)
      ).json();
      expect(decided.review.status).toBe('denied');
      expect(decided.detail.decision.choice).toBe('deny');
      expect(decided.detail.dispatch_performed).toBe(false);
      transport.call = originalCall;
      release!();
      hold = false;
      let completed = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const receipt = await (
          await request(`/runtime/commands/${runId}`)
        ).json();
        if (receipt.executionStatus === 'completed') {
          completed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(completed).toBe(true);
      expect(executions).toBe(1);
    } finally {
      release?.();
      await platform.stop();
      auth.close();
      workspace.close();
      store.close();
      provider.closeAllConnections();
      await new Promise<void>((resolve) => provider.close(() => resolve()));
      if (process.env.RYOKO_TEST_KEEP === '1')
        process.stderr.write(`BE04 isolated fixture: ${root}\n`);
      else rmSync(root, { recursive: true, force: true });
    }
  },
  60000,
);
