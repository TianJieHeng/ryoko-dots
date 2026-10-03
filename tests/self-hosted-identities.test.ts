import { test, expect } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WorkspaceStore } from '../src/server/workspace.js';
import { Store } from '../src/server/store.js';
import { OwnerAuth } from '../src/server/owner-auth.js';
import { SelfHostedPlatform } from '../src/server/self-hosted-platform.js';
import { createSelfHostedApp } from '../src/server/self-hosted-app.js';
import { StdioConversationTransport } from '../src/server/runtime/stdio.js';
import { be06IntentDigest } from '../src/server/runtime/be06-service.js';
import {
  identityMethods,
  type IdentityAction,
} from '../src/shared/runtime/identity.js';
const origin = 'http://127.0.0.1:3001',
  ownerId = 'owner',
  token = 'isolated-identity-token-1234567890';
test.runIf(
  !!process.env.RYOKO_TEST_PYTHON && !!process.env.RYOKO_TEST_CHECKOUT,
)(
  'real pinned Node→Python identity, memory, reviewed workflow publication and next-session delivery/rollback',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'dots-identities-')),
      seed = join(root, 'seed'),
      runtime = join(root, 'runtime'),
      database = join(root, 'dots.sqlite');
    mkdirSync(seed);
    mkdirSync(runtime);
    const checkout = resolve(process.env.RYOKO_TEST_CHECKOUT!),
      python = process.env.RYOKO_TEST_PYTHON!;
    const generated = spawnSync(
      python,
      [
        '-B',
        '-c',
        `import json,sys\nfrom pathlib import Path\nimport pytest\nfrom tests.tui_gateway.test_artifact_rpc import artifacts,publish\nfrom tests.tui_gateway.test_workflow_delivery_rpc import configured\nfrom tests.tui_gateway.test_workflows_rpc import baselines\nm=pytest.MonkeyPatch()\ng=artifacts.__wrapped__(Path(sys.argv[1]),m)\nr=next(g)\np=configured(r)['id']\nc=baselines(r,p)\nmethods=publish(r,{'project_id':p,'command_id':'specialist-methods','request_id':'methods','content':'Use only explicitly supplied project sources. Return a short factual answer.'})\n(Path(sys.argv[1])/'fixture.json').write_text(json.dumps({'project':p,'cases':c,'methods':methods}))\ntry: next(g)\nexcept StopIteration: pass\nm.undo()`,
        seed,
      ],
      {
        cwd: checkout,
        encoding: 'utf8',
        env: {
          PATH: '/usr/bin:/bin',
          HOME: root,
          HERMES_HOME: root,
          PYTHONDONTWRITEBYTECODE: '1',
        },
        timeout: 60000,
        maxBuffer: 1_000_000,
      },
    );
    expect(generated.status, generated.stderr).toBe(0);
    const fixture = JSON.parse(
      readFileSync(join(seed, 'fixture.json'), 'utf8'),
    );
    const home = join(seed, 'a');
    let providerCalls = 0;
    const providerBodies: string[] = [];
    const provider = createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404).end();
        return;
      }
      let bytes = '';
      for await (const chunk of req) bytes += String(chunk);
      const input = JSON.parse(bytes);
      providerCalls++;
      providerBodies.push(bytes);
      const content = JSON.stringify({ answer: 'Fixture specialist result' });
      if (input.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(
          `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'gpt-4.1-mini', choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\n`,
        );
        res.end(
          `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'gpt-4.1-mini', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } })}\n\ndata: [DONE]\n\n`,
        );
      } else
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            id: 'fixture',
            object: 'chat.completion',
            created: 1,
            model: 'gpt-4.1-mini',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 5,
              completion_tokens: 5,
              total_tokens: 10,
            },
          }),
        );
    });
    provider.listen(0, '127.0.0.1');
    await once(provider, 'listening');
    const endpoint = `http://127.0.0.1:${(provider.address() as { port: number }).port}/v1`;
    const profile = JSON.parse(readFileSync(join(home, 'config.yaml'), 'utf8'));
    for (const [name, policy] of Object.entries(
      profile.agent_identity.agents,
    ) as [string, Record<string, unknown>][]) {
      policy.allowed_tools =
        name === 'ryoko' ? ['memory', 'delegate_task'] : ['memory'];
      policy.secret_refs = ['OPENAI_API_KEY'];
      policy.recipient_plan = {
        schema_version: 1,
        envelope: 'local_only',
        grants: [
          {
            recipient_id: 'loopback-fixture',
            purpose: 'main_model',
            endpoint,
            transport: 'httpx',
          },
          {
            recipient_id: 'loopback-fixture-aux',
            purpose: 'aux_model',
            endpoint,
            transport: 'httpx',
          },
        ],
      };
    }
    profile.model = {
      default: 'gpt-4.1-mini',
      provider: 'custom',
      base_url: endpoint,
      api_mode: 'chat_completions',
    };
    profile.onboarding = { seen: { profile_build_offered: true } };
    profile.mcp_servers = {};
    profile.delegation = {
      durable: {
        enabled: true,
        limits: {
          max_depth: 1,
          max_total_children: 4,
          max_concurrent_children: 1,
        },
      },
      max_iterations: 2,
      max_concurrent_children: 1,
      specialists: {
        researcher: {
          responsibility: 'Read explicit project sources',
          methods_ref: {
            id: fixture.methods.artifact_id,
            version: fixture.methods.version,
            sha256: fixture.methods.sha256,
          },
          limits: {
            max_depth: 1,
            max_total_children: 1,
            max_concurrent_children: 1,
          },
          output_contract: {
            type: 'object',
            required: ['answer'],
            properties: { answer: { type: 'string' } },
          },
        },
      },
    };
    profile.runtime_budget = {
      schema_version: 1,
      mode: 'tokens',
      limits: {
        tokens: 500000,
        attempts: 8,
        cost_micros: null,
        wall_ms: 120000,
        provider_slots: 2,
        executor_slots: 2,
      },
      deadline_seconds: 120,
      request_timeout_ms: 10000,
      routes: [
        {
          model: 'gpt-4.1-mini',
          base_url: endpoint,
          max_input_tokens: 100000,
          max_output_tokens: 64,
          input_overhead_tokens: 128,
          output_token_parameter: 'max_tokens',
          input_cost_micros_per_million: null,
          output_cost_micros_per_million: null,
          bounds_verified: true,
        },
      ],
    };
    writeFileSync(join(home, 'config.yaml'), JSON.stringify(profile));
    writeFileSync(join(home, '.env'), 'OPENAI_API_KEY="no-key-required"\n', {
      mode: 0o600,
    });
    const identity = spawnSync(
      python,
      [
        '-B',
        '-c',
        `import json,sys\nfrom agent.agent_identity import resolve_agent_context\np=sys.argv[1]\ni=resolve_agent_context(json.load(open(p+'/config.yaml')),session_id='conversation_ingress',profile_home=p).identity\nprint(json.dumps({k:getattr(i,k) for k in ['principal_id','profile_id','agent_id','policy_digest','config_digest']}))`,
        home,
      ],
      {
        cwd: checkout,
        encoding: 'utf8',
        env: {
          PATH: '/usr/bin:/bin',
          HOME: home,
          HERMES_HOME: home,
          PYTHONDONTWRITEBYTECODE: '1',
        },
      },
    );
    expect(identity.status, identity.stderr).toBe(0);
    const workspace = new WorkspaceStore(database, ownerId),
      store = new Store(database),
      dotId = workspace.dots()[0].id,
      spaceId = workspace.spaces()[0].id;
    store.saveMemory(
      'Legacy owner-only preference, never automatically enrolled',
      'legacy-fixture',
    );
    const transport = new StdioConversationTransport({
      checkout,
      python,
      home,
      runtimeDirectory: runtime,
      ownerId,
      dotId,
      gatewayId: 'identity-fixture',
      identity: JSON.parse(identity.stdout),
      providerEnvironment: { OPENAI_API_KEY: 'no-key-required' },
      identityProjects: [{ spaceId, projectId: fixture.project }],
    });
    let authNow = Date.now();
    const platform = new SelfHostedPlatform(workspace, database, transport),
      auth = new OwnerAuth(database, {
        ownerId,
        ownerToken: token,
        origin,
        now: () => authNow,
      }),
      app = createSelfHostedApp({ auth, platform, store });
    try {
      const login = await app.request(origin + '/api/auth/login', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ ownerToken: token }),
      });
      const logged = await login.json();
      const headers = {
        origin,
        'content-type': 'application/json',
        cookie: login.headers.get('set-cookie')!.split(';')[0],
        'x-csrf-token': logged.csrfToken,
      };
      const request = async (path: string, body?: unknown) => {
        // Synthetic auth clock spaces this long lifecycle below the production per-minute limit.
        // Producer command, expiry and budget clocks remain real.
        authNow += 2000;
        const r = await app.request(origin + '/api' + path, {
          method: body === undefined ? 'GET' : 'POST',
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const value = await r.json();
        expect(r.status, JSON.stringify({ path, value })).toBeLessThan(300);
        return value;
      };
      const create = async (dot: string) => {
        const row = await request('/runtime/conversations', {
          operationId: randomUUID(),
          dotId: dot,
          title: 'Identity fixture',
        });
        await request(
          `/runtime/conversations/${row.conversation.id}/connect`,
          {},
        );
        return row.conversation.id as string;
      };
      await platform.start();
      const primary = await create(dotId);
      const rows = (await request(`/runtime/specialists?dotId=${dotId}`))
        .specialists;
      const researcher = rows.find(
          (a: { id: string }) => a.id === 'researcher',
        ),
        writer = rows.find((a: { id: string }) => a.id === 'writer');
      expect(researcher.memoryBackend).toBe('built_in');
      expect(writer.dotId).not.toBe(researcher.dotId);
      const researchThread = await create(researcher.dotId),
        writerThread = await create(writer.dotId);
      const read = async (
        thread: string,
        action: IdentityAction,
        payload: Record<string, unknown> = {},
        projectId?: string,
      ) =>
        request(`/runtime/conversations/${thread}/identity/${action}`, {
          payload,
          ...(projectId ? { projectId } : {}),
        });
      const act = async (
        thread: string,
        action: IdentityAction,
        payload: Record<string, unknown>,
      ) => {
        const scope = workspace.runtimeBindings.resolveConversation(thread);
        return request(`/runtime/conversations/${thread}/identity/${action}`, {
          payload,
          operationId: randomUUID(),
          intentDigest: be06IntentDigest(identityMethods[action], payload),
          expectedGeneration: scope.authorityRevision,
        });
      };
      const status = await read(primary, 'memory.status');
      expect(status.result.capabilities.backend).toBe('personal_mcp');
      expect(status.result.capabilities.write).toBe(false);
      const write = await act(researchThread, 'memory.write', {
        record_id: 'private-note',
        content: 'Only researcher knows this',
        expected_version: 0,
      });
      expect(write.status).toBe('accepted');
      expect(
        (
          await read(researchThread, 'memory.list', {
            project_id: fixture.project,
          })
        ).result.records,
      ).toHaveLength(1);
      expect(
        (
          await read(writerThread, 'memory.list', {
            project_id: fixture.project,
          })
        ).result.records,
      ).toHaveLength(0);
      await act(writerThread, 'memory.write', {
        record_id: 'writer-note',
        content: 'Only writer knows this distinct note',
        expected_version: 0,
      });
      const researchRecords = (
        await read(researchThread, 'memory.list', {
          project_id: fixture.project,
        })
      ).result.records;
      const writerRecords = (
        await read(writerThread, 'memory.list', { project_id: fixture.project })
      ).result.records;
      expect(
        researchRecords.map(
          (record: { record_id: string }) => record.record_id,
        ),
      ).toEqual(['private-note']);
      expect(
        writerRecords.map((record: { record_id: string }) => record.record_id),
      ).toEqual(['writer-note']);
      const session = await read(researchThread, 'session');
      expect(session.result.role).toBe('specialist');
      expect(session.result.active_workflows).toEqual([]);
      const config = (
        await read(primary, 'agents.get', { agent_id: 'researcher' })
      ).result.agent;
      const before =
        workspace.runtimeBindings.resolveConversation(
          researchThread,
        ).authorityRevision;
      await act(primary, 'agents.update', {
        agent_id: 'researcher',
        expected_revision: config.revision,
        config: { ...config.config, name: 'primary' },
      });
      expect(
        workspace.runtimeBindings.resolveConversation(researchThread)
          .authorityRevision,
      ).toBe(before);
      expect((await read(researchThread, 'session')).result.role).toBe(
        'specialist',
      );
      const specialistPreview = await act(primary, 'specialists.preview', {
        project_id: fixture.project,
        specialist_id: 'researcher',
        objective: 'Return one short factual fixture answer',
        artifacts: [],
        evidence: [],
        constraints: ['Use only supplied project context'],
      });
      expect(specialistPreview.status).toBe('accepted');
      const specialistReview = await request(
        `/runtime/identity/operations/${specialistPreview.operationId}/review`,
      );
      const handoff = await act(primary, 'specialists.handoff', {
        reviewOperationId: specialistReview.reviewOperationId,
        reviewDigest: specialistReview.reviewDigest,
      });
      expect(handoff.status).toBe('accepted');
      let handoffStatus;
      for (let attempt = 0; attempt < 100; attempt++) {
        handoffStatus = await read(
          primary,
          'specialists.status',
          { command_id: handoff.operationId },
          fixture.project,
        );
        if (
          ['completed', 'failed', 'blocked', 'cancelled'].includes(
            handoffStatus.result.status,
          )
        )
          break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(handoffStatus.result.status, JSON.stringify(handoffStatus)).toBe(
        'completed',
      );
      expect(handoffStatus.result.completion.parent_review_required).toBe(true);
      const providerCallsAfterHandoff = providerCalls;
      expect(providerCallsAfterHandoff).toBeGreaterThan(0);
      expect(providerBodies.join('\n')).not.toContain(
        'Only writer knows this distinct note',
      );
      expect(providerBodies.join('\n')).not.toContain(
        'Legacy owner-only preference',
      );
      await request(`/runtime/operations/${handoff.operationId}`);
      expect(providerCalls).toBe(providerCallsAfterHandoff);
      const copied = await act(primary, 'agents.create', {
        copy_from_agent_id: 'researcher',
        config: config.config,
      });
      expect(copied.status).toBe('accepted');
      expect(copied.result.agent.role).toBe('specialist');
      expect(copied.result.agent.builtin_memory_namespace).not.toBe(
        config.builtin_memory_namespace,
      );
      const copiedProjection = (
        await request(`/runtime/specialists?dotId=${dotId}`)
      ).specialists.find(
        (a: { id: string }) => a.id === copied.result.agent.agent_id,
      );
      expect(copiedProjection.spaceIds).toEqual([]);
      const copiedThread = await create(copiedProjection.dotId);
      expect(
        (await read(copiedThread, 'memory.list', {})).result.records,
      ).toEqual([]);
      const deniedProject = await app.request(
        origin +
          `/api/runtime/conversations/${copiedThread}/identity/memory.list`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ payload: { project_id: fixture.project } }),
        },
      );
      expect(deniedProject.status).toBe(403);
      const oldMemory = await request(
        `/runtime/identity/legacy-memory?dotId=${dotId}`,
      );
      expect(oldMemory.records[0].content).toContain('owner-only');
      expect(oldMemory.records[0].enrollmentAuthorized).toBe(false);
      expect(
        (
          await app.request(
            origin +
              `/api/runtime/identity/legacy-memory?dotId=${researcher.dotId}`,
            { headers },
          )
        ).status,
      ).toBe(403);
      const definition = (version: number, predecessor: unknown = null) => ({
        workflow_id: 'greeting',
        version,
        project_id: fixture.project,
        input_schema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
          additionalProperties: false,
        },
        steps: [
          {
            step_id: 'greet',
            kind: 'render_markdown',
            depends_on: [],
            parameters: { template: '# Greeting\nHello ${input.name}\n' },
          },
        ],
        output_schema: { required_sections: ['Greeting'], min_bytes: 1 },
        capability_requirements: ['artifact_read', 'artifact_write'],
        environment_manifest: { adapter: 'local_deterministic_v1' },
        provenance: { kind: 'manual', source_refs: [], private_derived: false },
        predecessor,
        template_ref: null,
      });
      const prepareReview = async (receipt: { operationId: string }) => {
        const review = await request(
          `/runtime/identity/operations/${receipt.operationId}/review`,
        );
        return {
          reviewOperationId: review.reviewOperationId,
          reviewDigest: review.reviewDigest,
        };
      };
      const approved = async (
        version: number,
        prior?: Record<string, unknown>,
      ) => {
        const draft = await act(primary, 'workflows.create', {
          definition_json: JSON.stringify(definition(version, prior ?? null)),
        });
        expect(draft.status).toBe('accepted');
        let w = draft.result.workflow;
        const evaluation = await act(primary, 'workflows.evaluate', {
          project_id: fixture.project,
          workflow_id: 'greeting',
          version,
          expected_revision: w.revision,
          cases_json: JSON.stringify(fixture.cases),
        });
        expect(evaluation.status).toBe('accepted');
        w = evaluation.result.workflow;
        if (version === 1) {
          const declining = await act(primary, 'workflows.review', {
            project_id: fixture.project,
            workflow_id: 'greeting',
            version,
            sha256: w.sha256,
            expected_revision: w.revision,
            expected_head_revision: w.head_revision,
            action: 'approve',
          });
          const declined = await act(
            primary,
            'workflows.decline',
            await prepareReview(declining),
          );
          expect(declined.status, JSON.stringify(declined)).toBe('accepted');
          expect(declined.result.status).toBe('cancelled');
          expect(declined.result.owner_live).toBe(false);
        }
        const prepared = await act(primary, 'workflows.review', {
          project_id: fixture.project,
          workflow_id: 'greeting',
          version,
          sha256: w.sha256,
          expected_revision: w.revision,
          expected_head_revision: w.head_revision,
          action: 'approve',
        });
        const committed = await act(
          primary,
          'workflows.accept',
          await prepareReview(prepared),
        );
        expect(committed.status).toBe('accepted');
        return committed.result.workflow;
      };
      const first = await approved(1);
      const deliver = async (
        w: Record<string, unknown>,
        revision: number,
        action = 'deliver',
      ) => {
        const p = await act(primary, 'workflows.deliver.review', {
          project_id: fixture.project,
          workflow_id: 'greeting',
          version: w.version,
          sha256: w.sha256,
          specialist_id: 'researcher',
          expected_delivery_revision: revision,
          action,
        });
        expect(p.status).toBe('accepted');
        const sent = await act(
          primary,
          'workflows.deliver.commit',
          await prepareReview(p),
        );
        expect(sent.status).toBe('accepted');
        return sent.result.delivery;
      };
      await deliver(first, 0);
      expect(
        (await read(researchThread, 'session')).result.active_workflows,
      ).toEqual([]);
      expect(
        (await read(researchThread, 'session')).result.desired_workflows[0]
          .version,
      ).toBe(1);
      const newResearch = await create(researcher.dotId);
      expect(
        (await read(newResearch, 'session')).result.active_workflows[0].version,
      ).toBe(1);
      const second = await approved(2, {
        workflow_id: 'greeting',
        version: 1,
        sha256: first.sha256,
      });
      await deliver(second, 1);
      await deliver(first, 2, 'rollback');
      expect(
        (await read(researchThread, 'session')).result.active_workflows,
      ).toEqual([]);
      const bound = platform.commands!.existingBound(primary, () => {});
      const mission = await transport.call('runtime.mission.create', {
        schema_version: 1,
        session_id: bound.binding.liveSessionId,
        mission_id: 'workflow-mission',
        contract: {
          outcome: 'Create greeting',
          project_id: fixture.project,
          risk: 'low',
          uncertainty: 'low',
          acceptance: [{ criterion_id: 'review', kind: 'user_acceptance' }],
        },
      });
      const run = await act(primary, 'workflows.prepare', {
        project_id: fixture.project,
        workflow_id: 'greeting',
        version: first.version,
        sha256: first.sha256,
        mission_id: mission.mission.mission_id,
        mission_revision: mission.mission.revision,
        parameters_json: JSON.stringify({ name: 'Erin' }),
      });
      expect(run.status).toBe('accepted');
      const runReview = await prepareReview(run);
      for (const proposal of run.result.proposals) {
        const displayed = await request(
          `/runtime/conversations/${primary}/reviews/${proposal.approval_id}?projectId=${encodeURIComponent(fixture.project)}`,
        );
        expect(displayed.review, JSON.stringify(displayed)).not.toBeNull();
        expect(displayed.scope.project).toBe(fixture.project);
        expect(displayed.review.scope.project).toBe(fixture.project);
        expect(displayed.review.content).toContain(proposal.sha256);
      }
      const published = await act(primary, 'workflows.publish', runReview);
      expect(published.status).toBe('accepted');
      expect(published.result.mission_completed).toBe(false);
      expect(published.result.publication_atomic).toBe(false);
      const output = published.result.outputs[0];
      const bytes = await transport.call('runtime.artifact.get', {
        schema_version: 1,
        session_id: bound.binding.liveSessionId,
        project_id: fixture.project,
        artifact_id: output.artifact_id,
        version: output.version,
      });
      expect(Buffer.from(bytes.data_base64, 'base64').toString()).toBe(
        '# Greeting\nHello Erin\n',
      );
      const currentMission = await transport.call('runtime.mission.get', {
        schema_version: 1,
        session_id: bound.binding.liveSessionId,
        mission_id: mission.mission.mission_id,
      });
      expect(currentMission.mission).not.toBeNull();
      const cancellable = await act(primary, 'workflows.prepare', {
        project_id: fixture.project,
        workflow_id: 'greeting',
        version: first.version,
        sha256: first.sha256,
        mission_id: mission.mission.mission_id,
        mission_revision: currentMission.mission!.revision,
        parameters_json: JSON.stringify({ name: 'Finn' }),
      });
      expect(cancellable.status).toBe('accepted');
      const cancelledReview = await prepareReview(cancellable);
      for (const proposal of cancellable.result.proposals)
        await request(
          `/runtime/conversations/${primary}/reviews/${proposal.approval_id}?projectId=${encodeURIComponent(fixture.project)}`,
        );
      const cancelled = await act(
        primary,
        'workflows.decline',
        cancelledReview,
      );
      expect(cancelled.status).toBe('accepted');
      expect(cancelled.result.status).toBe('cancelled');
      const forbiddenPublish = await act(
        primary,
        'workflows.publish',
        cancelledReview,
      );
      expect(forbiddenPublish.status).not.toBe('accepted');
      const cancelledState = await transport.call('runtime.artifact.status', {
        schema_version: 1,
        session_id: bound.binding.liveSessionId,
        command_id: cancellable.operationId,
      });
      expect(cancelledState.status).toBe('cancelled');
      const history = await read(primary, 'workflows.runs', {
        project_id: fixture.project,
        workflow_id: 'greeting',
        version: first.version,
      });
      const cancelledRun = JSON.parse(history.result.runs_json).find(
        (run: { workflow_run_id: string }) =>
          run.workflow_run_id === cancellable.result.workflow_run_id,
      );
      expect(cancelledRun.state).toBe('cancelled');
      expect(cancelledRun.artifact_refs).toEqual([]);
      const memoryExport = await app.request(
        origin +
          `/api/runtime/conversations/${researchThread}/identity/memory/export`,
        { headers },
      );
      expect(memoryExport.status).toBe(200);
      expect(memoryExport.headers.get('x-content-sha256')).toMatch(
        /^[a-f0-9]{64}$/,
      );
      expect((await memoryExport.json()).records[0].owner_agent_id).toBe(
        'researcher',
      );
      const correction = await act(researchThread, 'memory.write', {
        record_id: 'private-note',
        content: 'Corrected owned fact',
        expected_version: 1,
      });
      expect(correction.result.outcome.acknowledged_version).toBe(2);
      const deletion = await act(researchThread, 'memory.delete', {
        record_id: 'private-note',
        expected_version: 2,
      });
      expect(deletion.result.outcome.record.content).toBeNull();
      expect(
        (
          await read(researchThread, 'memory.get', {
            record_id: 'private-note',
            version: 1,
          })
        ).result.record.content,
      ).toBeNull();
      const liveProject = await transport.call('runtime.project.get', {
        schema_version: 1,
        session_id: bound.binding.liveSessionId,
        project_id: fixture.project,
      });
      await transport.call('runtime.project.grants.set', {
        schema_version: 1,
        session_id: bound.binding.liveSessionId,
        project_id: fixture.project,
        expected_revision: liveProject.project.revision,
        grants: liveProject.project.grants.filter(
          (grant) => grant.agent_id !== 'researcher',
        ),
      });
      const revokedRead = await app.request(
        origin +
          `/api/runtime/conversations/${researchThread}/identity/memory.list`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ payload: { project_id: fixture.project } }),
        },
      );
      expect(revokedRead.status).toBe(403);
      expect(workspace.canAccessSpace(researcher.dotId, spaceId)).toBe(false);
      expect(
        (
          await read(writerThread, 'memory.list', {
            project_id: fixture.project,
          })
        ).result.records,
      ).toHaveLength(1);
      expect(providerCalls).toBe(providerCallsAfterHandoff);
    } finally {
      await platform.stop();
      auth.close();
      workspace.close();
      store.close();
      provider.closeAllConnections();
      await new Promise<void>((r) => provider.close(() => r()));
      rmSync(root, { recursive: true, force: true });
    }
  },
  180000,
);
