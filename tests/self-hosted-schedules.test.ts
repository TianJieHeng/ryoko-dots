import { test, expect } from 'vitest';
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

import { canonicalScheduleIntent } from '../src/server/runtime/schedule-service';
import { be06IntentDigest } from '../src/server/runtime/be06-service';

import { intentDigest } from '../src/server/runtime/conversation-ledger';
import type { CommandScheduleRecord } from '../src/shared/runtime/schedule-evidence';

const origin = 'http://127.0.0.1:3001';
const ownerId = 'control-owner';
const token = 'isolated-control-owner-token-123456';

test.runIf(
  !!process.env.RYOKO_TEST_PYTHON && !!process.env.RYOKO_TEST_CHECKOUT,
)(
  'real Node→Python periodic scheduler executes recurring occurrences with retained receipts and no Dots timer',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'dots-schedules-stdio-'));
    const database = join(root, 'dots.sqlite');
    const home = join(root, 'profile');
    const runtimeDirectory = join(root, 'runtime');
    mkdirSync(home);
    mkdirSync(runtimeDirectory);
    const checkout = resolve(process.env.RYOKO_TEST_CHECKOUT!);
    const python = process.env.RYOKO_TEST_PYTHON!;
    let executions = 0;

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
    const createdProject = spawnSync(
      python,
      [
        '-c',
        `import sys\nfrom pathlib import Path\nfrom hermes_cli import projects_db\nwith projects_db.connect_closing(Path(sys.argv[1])/'projects.db') as db:\n print(projects_db.create_project(db,name='Schedule fixture project',owner_principal_id='${ownerId}',grants=[{'principal_id':'${ownerId}','agent_id':'ryoko','permissions':['read','write','share']}]))`,
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
      cron: { stdio_scheduler: { enabled: true, interval_seconds: 1 } },
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
        `import json,sys\nimport hermes_yaml as yaml\nfrom agent.agent_identity import resolve_agent_context\np=sys.argv[1]\nc=yaml.safe_load(open(p+'/config.yaml'))\ni=resolve_agent_context(c,session_id='conversation_ingress',profile_home=p).identity\nprint(json.dumps({k:getattr(i,k) for k in ['principal_id','profile_id','agent_id','policy_digest','config_digest']}))`,
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
      identityProjects: [{ spaceId: workspace.spaces()[0].id, projectId }],
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
        title: 'BE07 recurring scheduler proof',
      });
      expect(created.status, await created.clone().text()).toBe(201);
      const conversationId = (await created.json()).conversation.id;
      const base = `/runtime/conversations/${encodeURIComponent(conversationId)}`;
      // GET never starts an execution binding.
      expect((await request(`${base}/schedules`)).status).toBe(503);
      const connected = await request(`${base}/connect`, {});
      expect(connected.status, await connected.clone().text()).toBe(200);
      const setup = await connected.json();
      expect(setup.features.commands.state).toBe('ready');
      expect(executions).toBe(0);
      // A display Space is not schedule authority. Only a reviewed producer
      // default project and its current explicit grant may fill this scope.
      expect((await request(`${base}/schedules`)).status).toBe(409);
      const agentResult = await request(`${base}/identity/agents.get`, {
        payload: { agent_id: 'ryoko' },
      });
      const agent = (await agentResult.json()).result.agent;
      const payload = {
        agent_id: 'ryoko',
        expected_revision: agent.revision,
        config: { ...agent.config, default_project_id: projectId },
      };
      const selected = await request(`${base}/identity/agents.update`, {
        payload,
        operationId: randomUUID(),
        intentDigest: be06IntentDigest('runtime.agent.update', payload),
        expectedGeneration:
          workspace.runtimeBindings.resolveConversation(conversationId)
            .authorityRevision,
      });
      expect(selected.status, await selected.clone().text()).toBe(200);
      expect((await selected.json()).status).toBe('accepted');
      const readScheduler = async () => {
        const r = await request(`${base}/schedules/scheduler`);
        expect(r.status, await r.clone().text()).toBe(200);
        return await r.json();
      };
      let status = await readScheduler();
      for (
        const deadline = Date.now() + 20000;
        !status.scheduler.recurring_admission_ready && Date.now() < deadline;
      ) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        status = await readScheduler();
      }
      expect(status.scheduler.recurring_admission_ready).toBe(true);
      expect(status.scheduler.maintenance_live).toBe(true);
      expect(status.scheduler.last_tick_succeeded_at).not.toBeNull();
      expect(status.scope.project).toBe(projectId);
      const generation = status.scope.generation;
      const action = async (
        path: string,
        action: string,
        payload: Record<string, unknown>,
        expectedRevision: number,
        operationId = randomUUID(),
      ) => {
        const intent = { path, action, payload, expectedRevision };
        const body = {
          ...intent,
          operationId,
          intentDigest: intentDigest(
            canonicalScheduleIntent(
              intent as Parameters<typeof canonicalScheduleIntent>[0],
            ),
          ),
          expectedGeneration: generation,
        };
        const { path: _, ...requestBody } = body;
        void _;
        const r = await request(path, requestBody);
        expect(r.status, await r.clone().text()).toBe(202);
        expect((await r.json()).status).toBe('accepted');
        return { operationId, requestBody };
      };
      const path = `${base}/schedules`;
      const operationId = randomUUID();
      const scheduleId = `dots_${operationId}`;
      const configPayload = {
        prompt: 'Return a short synthetic schedule result',
        threadId: conversationId,
        trigger: {
          kind: 'interval',
          anchor: Date.now() / 1000 + 3,
          seconds: 60,
        },
        timeZone: 'Etc/UTC',
        missedRunPolicy: 'run_once',
        overlapPolicy: 'skip',
        authorityDescription: 'Two isolated loopback fixture occurrences only',
        authorityExpiresAt: Date.now() + 180000,
        maxOccurrences: 2,
      };
      const submitted = await action(
        path,
        'create',
        configPayload,
        0,
        operationId,
      );
      const read = async (): Promise<CommandScheduleRecord> => {
        const r = await request(`${path}/${scheduleId}`);
        expect(r.status, await r.clone().text()).toBe(200);
        return (await r.json()).schedule;
      };
      let record = await read();
      expect(record.state).toBe('paused');
      expect(executions).toBe(0);
      const duplicate = await request(path, submitted.requestBody);
      expect(duplicate.status).toBe(202);
      expect((await read()).revision).toBe(record.revision);
      const imported = await request(path, {
        ...submitted.requestBody,
        operationId: randomUUID(),
        action: 'import',
      });
      expect(imported.status).toBe(400);
      const mutationPath = `${path}/${scheduleId}/actions`;
      await action(mutationPath, 'resume', {}, record.revision);
      const awaitOccurrences = async (count: number) => {
        const deadline = Date.now() + 85000;
        while (Date.now() < deadline) {
          const row = await read();
          if (
            row.occurrences.filter((o) => o.state === 'completed').length ===
            count
          )
            return row;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        throw new Error(
          `Periodic completion missing: ${JSON.stringify(await read())}`,
        );
      };
      record = await awaitOccurrences(1);
      expect(executions).toBe(1);
      expect(record.remaining_checks).toBe(1);
      expect(record.occurrences[0].command_id).not.toBeNull();
      const firstCommandId = record.occurrences[0].command_id!;
      const firstOutputResponse = await request(
        `${base}/results/${firstCommandId}`,
      );
      expect(
        firstOutputResponse.status,
        await firstOutputResponse.clone().text(),
      ).toBe(200);
      const firstOutput = await firstOutputResponse.json();
      expect(firstOutput.finalResponse).toBe('Resumed owned work');
      expect(firstOutput.publicationState).toBe('committed');
      expect(
        createHash('sha256')
          .update(Buffer.from(firstOutput.artifact.dataBase64, 'base64'))
          .digest('hex'),
      ).toBe(firstOutput.artifact.sha256);

      // Restart the real transport before the next due instant; only the producer
      // missed-run policy owns any recovery, and explicit reconnect owns binding.
      await platform.stop();
      platform = new SelfHostedPlatform(
        workspace,
        database,
        new StdioConversationTransport(config),
      );
      app = createSelfHostedApp({ auth, platform, store });
      await platform.start();
      const reconnect = await request(`${base}/connect`, {});
      expect(reconnect.status, await reconnect.clone().text()).toBe(200);
      record = await awaitOccurrences(2);
      expect(executions).toBe(2);
      expect(record.remaining_checks).toBe(0);
      expect(new Set(record.occurrences.map((o) => o.occurrence_id)).size).toBe(
        2,
      );
      expect(record.occurrences_total).toBe(2);
      expect(record.history_truncated).toBe(false);
      const retainedResponse = await request(
        `${base}/results/${firstCommandId}`,
      );
      expect(retainedResponse.status).toBe(200);
      const retained = await retainedResponse.json();
      expect(retained.artifact.sha256).toBe(firstOutput.artifact.sha256);
      expect(retained.finalResponse).toBe(firstOutput.finalResponse);
      expect(executions).toBe(2);

      const list = await request(path);
      expect(list.status).toBe(200);
      const listed = await list.json();
      expect(listed.complete).toBe(false);
      expect(listed.limit).toBe(100);
      expect(listed.schedules).toHaveLength(1);
      const recovered = await request(`/runtime/operations/${operationId}`);
      expect(recovered.status).toBe(200);
      expect((await recovered.json()).status).toBe('accepted');
      const otherResponse = await request('/runtime/conversations', {
        operationId: randomUUID(),
        dotId: config.dotId,
        title: 'Other schedule scope',
      });
      expect(otherResponse.status).toBe(201);
      const other = (await otherResponse.json()).conversation.id;
      expect(
        (await request(`/runtime/conversations/${other}/connect`, {})).status,
      ).toBe(200);
      const foreign = await request(
        `/runtime/conversations/${other}/schedules/${scheduleId}`,
      );
      expect(foreign.status).toBe(403);
      const otherList = await request(
        `/runtime/conversations/${other}/schedules`,
      );
      expect(otherList.status).toBe(200);
      expect((await otherList.json()).schedules).toHaveLength(0);
      const unauth = await app.request(`${origin}/api${path}`);
      expect(unauth.status).toBe(401);
      expect((await readScheduler()).scheduler.recurring_admission_ready).toBe(
        true,
      );
    } finally {
      await platform.stop();
      auth.close();
      store.close();
      workspace.close();
      provider.closeAllConnections();
      provider.close();
      await once(provider, 'close');
      rmSync(root, { recursive: true, force: true });
    }
  },
  150000,
);
