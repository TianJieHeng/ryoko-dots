import { expect, test, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { WorkspaceStore } from '../src/server/workspace';
import { Store } from '../src/server/store';
import { OwnerAuth } from '../src/server/owner-auth';
import { SelfHostedPlatform } from '../src/server/self-hosted-platform';
import { createSelfHostedApp } from '../src/server/self-hosted-app';
import {
  StdioConversationTransport,
  type LaunchConfig,
} from '../src/server/runtime/stdio';
import { ComputerEdgeStore } from '../src/computer/edge-store';
import {
  ComputerEdgeService,
  type ComputerTargetDriver,
} from '../src/computer/edge-service';
import {
  NativeComputerHttpEdge,
  type ComputerProtocolTransport,
} from '../src/server/runtime/computer-http-edge';
import { signEdge } from '../src/shared/computer-edge-protocol';
const origin = 'http://127.0.0.1:3001',
  ownerId = 'computer-owner',
  token = 'isolated-owner-computer-token-123456';
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : v;
const digest = (v: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(v)))
    .digest('hex');
test.runIf(
  !!process.env.RYOKO_TEST_PYTHON && !!process.env.RYOKO_TEST_CHECKOUT,
)(
  'real Python broker and signed loopback target retain computer effects after response loss without redispatch',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'dots-computer-stdio-')),
      home = join(root, 'profile'),
      runtimeDirectory = join(root, 'runtime'),
      database = join(root, 'dots.sqlite');
    mkdirSync(home);
    mkdirSync(runtimeDirectory);
    const checkout = resolve(process.env.RYOKO_TEST_CHECKOUT!),
      python = process.env.RYOKO_TEST_PYTHON!;
    const workspace = new WorkspaceStore(database, ownerId),
      store = new Store(database),
      dotId = workspace.dots()[0].id,
      spaceId = workspace.spaces()[0].id,
      executorId = 'native-computer';
    const env = { PATH: '/usr/bin:/bin', HOME: home, HERMES_HOME: home };
    const project = spawnSync(
      python,
      [
        '-c',
        `import sys\nfrom pathlib import Path\nfrom hermes_cli import projects_db\nwith projects_db.connect_closing(Path(sys.argv[1])/'projects.db') as db:\n print(projects_db.create_project(db,name='Computer fixture',owner_principal_id='${ownerId}',grants=[{'principal_id':'${ownerId}','agent_id':'ryoko','permissions':['read','write','share']}]))`,
        home,
      ],
      { cwd: checkout, env, encoding: 'utf8' },
    );
    expect(project.status, project.stderr).toBe(0);
    const projectId = project.stdout.trim();
    let modelCalls = 0;
    const provider = createServer((req, res) => {
      if (req.method === 'POST') modelCalls++;
      res.writeHead(404).end();
    });
    provider.listen(0, '127.0.0.1');
    await once(provider, 'listening');
    const providerEndpoint = `http://127.0.0.1:${(provider.address() as { port: number }).port}/v1`;
    const profile = {
      agent_identity: {
        schema_version: 1,
        principal_id: ownerId,
        profile_id: 'computer-profile',
        primary_agent_id: 'ryoko',
        active_agent_id: 'ryoko',
        agents: {
          ryoko: {
            policy_version: 1,
            role: 'primary',
            memory_backend: 'personal_mcp',
            allowed_tools: [
              'dots_page_read',
              'dots_page_propose',
              'dots_computer_observe',
              'dots_computer_propose',
              'dots_computer_snapshot',
              'dots_computer_files_write',
              'dots_computer_files_read',
            ],
            project_grants: [projectId],
            secret_refs: ['OPENAI_API_KEY'],
            recipient_plan: {
              schema_version: 1,
              envelope: 'local_only',
              grants: [
                {
                  recipient_id: 'local-fixture',
                  purpose: 'main_model',
                  endpoint: providerEndpoint,
                  transport: 'httpx',
                },
              ],
            },
          },
        },
      },
      model: {
        default: 'gpt-4.1-mini',
        provider: 'custom',
        base_url: providerEndpoint,
        api_mode: 'chat_completions',
      },
      mcp_servers: {},
      onboarding: { seen: { profile_build_offered: true } },
    };
    writeFileSync(join(home, 'config.yaml'), JSON.stringify(profile));
    writeFileSync(join(home, '.env'), 'OPENAI_API_KEY="no-key-required"\n', {
      mode: 0o600,
    });
    const identity = spawnSync(
      python,
      [
        '-c',
        `import json,sys\nfrom agent.agent_identity import resolve_agent_context\np=sys.argv[1]\ni=resolve_agent_context(json.load(open(p+'/config.yaml')),session_id='conversation_ingress',profile_home=p).identity\nprint(json.dumps({k:getattr(i,k) for k in ['principal_id','profile_id','agent_id','policy_digest','config_digest']}))`,
        home,
      ],
      { cwd: checkout, env, encoding: 'utf8' },
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
      nativeComputer: { executorId },
    };
    const targetDb = new DatabaseSync(join(root, 'target.sqlite')),
      targetStore = new ComputerEdgeStore(targetDb, dotId, executorId),
      targetToken = 'synthetic-per-dot-target-credential-123456';
    let dispatches = 0,
      loseReply = false,
      inspections = 0;
    const applied = new Map<string, string>();
    const driver: ComputerTargetDriver = {
      actions: ['snapshot', 'files_write', 'files_read'],
      execute: async (action, input, edge) => {
        edge.guard();
        expect(action).toBe('files_write');
        dispatches++;
        const data = input as { path: string; contents: string };
        applied.set(data.path, data.contents);
        return {
          path: data.path,
          bytes: Buffer.byteLength(data.contents),
          appended: false,
        };
      },
      observe: async (action, input, id, edge) => {
        edge.guard();
        if (action === 'snapshot')
          return {
            snapshotId: id,
            tree: 'fixture workspace; no actual browser',
          };
        const path = (input as { path: string }).path;
        return { path, text: applied.get(path) ?? '' };
      },
    };
    const target = new ComputerEdgeService(
      targetStore,
      driver,
      targetToken,
      Date.now,
      {
        buildSha256: 'b'.repeat(64),
        configurationSha256: 'c'.repeat(64),
        evidence: 'synthetic',
      },
    );
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(Buffer.from(c));
      const response = await target.fetch(
        new Request('http://target' + req.url, {
          method: 'POST',
          body: Buffer.concat(chunks),
        }),
      );
      res.writeHead(response.status, { 'content-type': 'application/json' });
      res.end(await response.text());
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const wire: ComputerProtocolTransport = {
      configured: () => true,
      request: async (path, body, role, signal, beforeSend, expectedTarget) => {
        const signed = signEdge(
          path,
          {
            version: 1,
            dotId,
            executorId,
            role,
            expiresAt: Date.now() + 30000,
            expectedTarget,
            body,
          },
          targetToken,
        );
        beforeSend?.();
        const res = await fetch(endpoint + path, {
          method: 'POST',
          body: JSON.stringify(signed),
          signal,
        });
        const result = await res.json();
        trace.push(`target ${path} ${res.status}:` + JSON.stringify(result));
        if (!res.ok)
          throw new Error(
            `Target rejected: ${res.status} ${JSON.stringify(result)}`,
          );
        if (path === '/edge/inspect') inspections++;
        if (path === '/edge/execute' && loseReply) {
          loseReply = false;
          throw new Error('Injected response loss after target commitment');
        }
        return result;
      },
    };
    const binding = {
      ownerId,
      dotId,
      executorId,
      principalId: config.identity.principal_id,
      profileId: config.identity.profile_id,
      agentId: config.identity.agent_id,
    };
    const makeEdge = () =>
      new NativeComputerHttpEdge(binding, wire, {
        protocol: 'dots-computer-edge/1',
        dotId,
        executorId,
        receiptSha256: 'a'.repeat(64),
        buildSha256: 'b'.repeat(64),
        configurationSha256: 'c'.repeat(64),
        evidence: 'synthetic',
        actions: driver.actions,
      });
    let edge = makeEdge();
    let transport = new StdioConversationTransport(config),
      platform = new SelfHostedPlatform(workspace, database, transport, {
        edge,
      });
    const auth = new OwnerAuth(database, {
      ownerId,
      ownerToken: token,
      origin,
    });
    let app = createSelfHostedApp({ auth, platform, store });
    const trace: string[] = [];
    const nativeConnect = platform.nativePages!.connect.bind(
      platform.nativePages!,
    );
    vi.spyOn(platform.nativePages!, 'connect').mockImplementation(
      async (...args) => {
        try {
          return await nativeConnect(...args);
        } catch (e) {
          trace.push(String(e));
          throw e;
        }
      },
    );
    try {
      const login = await app.request(origin + '/api/auth/login', {
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
      const request = (path: string, body?: unknown) =>
        app.request(origin + '/api' + path, {
          headers,
          method: body === undefined ? 'GET' : 'POST',
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      const json = async (r: Response, status = 200) => {
        expect(
          r.status,
          JSON.stringify({ body: await r.clone().text(), trace }),
        ).toBe(status);
        return r.json();
      };
      const created = await json(
          await request('/runtime/conversations', {
            operationId: randomUUID(),
            dotId,
            title: 'Native computer',
          }),
          201,
        ),
        base = '/runtime/conversations/' + created.conversation.id;
      let setup = await json(await request(base + '/connect', {}));
      const statusPath = '/runtime/computers/' + executorId;
      const ownerAction = async (action: string, input: unknown) => {
        const status = await json(await request(statusPath));
        const intent = {
          scope: status.scope,
          executorId: status.executorId,
          revision: status.revision,
          action,
          input,
        };
        return json(
          await request(statusPath + '/actions', {
            operationId: randomUUID(),
            intentDigest: digest(intent),
            expectedGeneration: status.scope.generation,
            expectedRevision: status.revision,
            action,
            input,
          }),
        );
      };
      await ownerAction('permissions', {
        enabled: true,
        browser: true,
        files: true,
        shell: false,
      });
      expect((await ownerAction('snapshot', {})).state).toBe('reconciled');
      setup = await json(await request(base + '/connect', {}));
      const status = await json(await request(statusPath));
      trace.push('status:' + JSON.stringify(status));
      const operationId = randomUUID();
      const prepared = await json(
        await request(base + '/computer-actions', {
          operationId,
          expectedGeneration: setup.scope.generation,
          expectedRevision: status.revision,
          action: 'files_write',
          input: { path: 'café.txt', contents: 'hello 🦊', append: false },
        }),
      );
      expect(prepared.state).toBe('prepared');
      expect(dispatches).toBe(0);
      const exact = await json(
        await request(base + '/reviews/' + prepared.prepared.approval_id),
      );
      expect(JSON.parse(exact.review.content).action.arguments.input).toEqual({
        path: 'café.txt',
        contents: 'hello 🦊',
        append: false,
      });
      loseReply = true;
      const decision = {
        approvalId: prepared.prepared.approval_id,
        approvalDigest: prepared.prepared.approval_digest,
      };
      const uncertain = await json(
        await request(
          base + '/computer-actions/' + operationId + '/execute',
          decision,
        ),
      );
      expect(uncertain.state).toBe('outcome_unknown');
      expect(dispatches).toBe(1);
      expect(applied.get('café.txt')).toBe('hello 🦊');
      await platform.stop();
      transport = new StdioConversationTransport(config);
      edge = makeEdge();
      expect(edge.available()).toBe(false);
      platform = new SelfHostedPlatform(workspace, database, transport, {
        edge,
      });
      app = createSelfHostedApp({ auth, platform, store });
      await json(await request(statusPath));
      await json(await request(base + '/connect', {}));
      // Reconciliation reads the original target proof; it cannot dispatch the write again.
      const recovered = await json(
        await request(base + '/computer-actions/' + operationId),
      );
      expect(recovered.state).toBe('confirmed');
      expect(dispatches).toBe(1);
      expect(inspections).toBeGreaterThan(0);
      expect(
        (
          await json(
            await request(
              base + '/computer-actions/' + operationId + '/execute',
              decision,
            ),
          )
        ).state,
      ).toBe('confirmed');
      expect(dispatches).toBe(1);
      const foreign = await json(
        await request('/runtime/conversations', {
          operationId: randomUUID(),
          dotId,
          title: 'Foreign computer operation scope',
        }),
        201,
      );
      await json(
        await request(
          '/runtime/conversations/' + foreign.conversation.id + '/connect',
          {},
        ),
      );
      expect(
        (
          await request(
            '/runtime/conversations/' +
              foreign.conversation.id +
              '/computer-actions/' +
              operationId,
          )
        ).status,
      ).toBe(404);
      const unauth = await app.request(origin + '/api' + statusPath);
      expect(unauth.status).toBe(401);
      expect(modelCalls).toBe(0);
    } finally {
      await platform.stop();
      auth.close();
      store.close();
      workspace.close();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      provider.closeAllConnections();
      await new Promise<void>((r) => provider.close(() => r()));
      targetDb.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
  90000,
);
