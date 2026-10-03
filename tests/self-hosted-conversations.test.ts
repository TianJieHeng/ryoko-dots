import { describe, test, expect } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { WorkspaceStore } from '../src/server/workspace';
import { Store } from '../src/server/store';
import { OwnerAuth } from '../src/server/owner-auth';
import { createSelfHostedApp } from '../src/server/self-hosted-app';
import { SelfHostedPlatform } from '../src/server/self-hosted-platform';
import {
  childEnvironment,
  StdioConversationTransport,
  type LaunchConfig,
  type ConversationTransport,
} from '../src/server/runtime/stdio';
import type { RuntimeConversationCapabilities } from '../src/shared/runtime/producer/wire.generated';
import { ConversationRpc } from '../src/server/runtime/conversation-rpc';
import { PassThrough } from 'node:stream';
import { ReadOnlyRpc } from '../src/server/runtime/rpc';
const ownerId = 'stdio-owner';
const token = 'a-long-owner-token-at-least-24-characters';
const origin = 'http://127.0.0.1:3001';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dots-be02-'));
  const db = join(root, 'dots.sqlite');
  const workspace = new WorkspaceStore(db, ownerId);
  const store = new Store(db);
  const auth = new OwnerAuth(db, { ownerId, ownerToken: token, origin });
  return {
    root,
    db,
    workspace,
    store,
    auth,
    cleanup() {
      auth.close();
      store.close();
      workspace.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
async function login(app: ReturnType<typeof createSelfHostedApp>) {
  const res = await app.request(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ ownerToken: token }),
  });
  expect(res.status).toBe(200);
  const data = await res.json();
  return {
    cookie: res.headers.get('set-cookie')!.split(';')[0],
    'x-csrf-token': data.csrfToken,
    origin,
    'content-type': 'application/json',
  };
}
function configFor(f: ReturnType<typeof fixture>): LaunchConfig {
  const home = join(f.root, 'profile');
  const runtimeDirectory = join(f.root, 'runtime');
  mkdirSync(home);
  mkdirSync(runtimeDirectory);
  writeFileSync(
    join(home, 'config.yaml'),
    JSON.stringify({
      agent_identity: {
        schema_version: 1,
        principal_id: ownerId,
        profile_id: 'stdio-profile',
        primary_agent_id: 'ryoko',
        active_agent_id: 'ryoko',
        agents: {
          ryoko: {
            policy_version: 1,
            role: 'primary',
            memory_backend: 'personal_mcp',
          },
        },
      },
      mcp_servers: {},
      model: { default: 'fixture-unconfigured', provider: 'openai' },
    }),
  );
  const checkout = resolve(process.env.RYOKO_TEST_CHECKOUT ?? '../ryoko-agent');
  const python =
    process.env.RYOKO_TEST_PYTHON ?? '/tmp/dots-backend-python/bin/python';
  const result = spawnSync(
    python,
    [
      '-c',
      `import json,sys\nfrom agent.agent_identity import resolve_agent_context\np=sys.argv[1]\nc=json.load(open(p+'/config.yaml'))\ni=resolve_agent_context(c,session_id='conversation_ingress',profile_home=p).identity\nprint(json.dumps({k:getattr(i,k) for k in ['principal_id','profile_id','agent_id','policy_digest','config_digest']}))`,
      home,
    ],
    {
      cwd: checkout,
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin', HOME: home, HERMES_HOME: home },
    },
  );
  if (result.status !== 0)
    throw new Error(`Isolated identity fixture failed: ${result.stderr}`);
  return {
    checkout,
    python,
    home,
    runtimeDirectory,
    ownerId,
    dotId: f.workspace.dots()[0].id,
    gatewayId: 'local-stdio',
    identity: JSON.parse(result.stdout),
  };
}
describe('self-hosted canonical conversation BFF', () => {
  test('unconfigured startup serves protected native reads without legacy readiness or execution', async () => {
    const f = fixture();
    const platform = new SelfHostedPlatform(f.workspace, f.db);
    const app = createSelfHostedApp({ ...f, platform });
    try {
      expect((await app.request(`${origin}/api/workspace`)).status).toBe(401);
      const headers = await login(app);
      const setup = await (
        await app.request(
          `${origin}/api/runtime/setup?dotId=${f.workspace.dots()[0].id}`,
          { headers },
        )
      ).json();
      expect(setup.qualified).toBe(false);
      expect(setup.controlPlane.state).toBe('unconfigured');
      expect(
        (await app.request(`${origin}/api/workspace`, { headers })).status,
      ).toBe(200);
      expect(
        (await app.request(`${origin}/api/copilotkit/threads`, { headers }))
          .status,
      ).toBe(501);
      const source = readFileSync('src/server/index.ts', 'utf8');
      expect(source).not.toMatch(
        /INTELLIGENCE_API|OPENAI_API|new Runner|from '\.\/platform\.js'|from '\.\/app\.js'/,
      );
    } finally {
      await platform.stop();
      f.cleanup();
    }
  });
  test.runIf(
    !!process.env.RYOKO_TEST_PYTHON && !!process.env.RYOKO_TEST_CHECKOUT,
  )(
    'actual Node stdio create/read/list/CAS/page reservation/restart and receipt-only recovery without bind or inference',
    async () => {
      const f = fixture();
      const config = configFor(f);
      let transport = new StdioConversationTransport(config);
      let platform = new SelfHostedPlatform(f.workspace, f.db, transport);
      let app = createSelfHostedApp({ ...f, platform });
      try {
        await platform.start();
        const headers = await login(app);
        const request = (path: string, method = 'GET', body?: unknown) =>
          app.request(`${origin}/api${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
          });
        expect(Object.keys(childEnvironment(config))).not.toContain(
          'INTELLIGENCE_API_KEY',
        );
        const setup = await (
          await request(`/runtime/setup?dotId=${config.dotId}`)
        ).json();
        expect(setup.features.conversations.state).toBe('ready');
        expect(setup.features.commands.state).toBe('unconfigured');
        const operationId = randomUUID();
        const create = {
          operationId,
          dotId: config.dotId,
          title: 'Durable Node conversation',
        };
        const response = await request(
          '/runtime/conversations',
          'POST',
          create,
        );
        expect(response.status).toBe(201);
        const created = await response.json();
        const id = created.conversation.id;
        expect(
          f.workspace.runtimeBindings.resolveConversation(id).liveSessionId,
        ).toBeNull();
        expect(
          (
            await request('/runtime/conversations', 'POST', {
              ...create,
              title: 'Conflicting bytes',
            })
          ).status,
        ).toBe(409);
        expect(
          (
            await request('/runtime/conversations', 'POST', {
              ...create,
              principal_id: 'forged',
            })
          ).status,
        ).toBe(400);
        expect(
          (
            await request(
              `/runtime/conversations?dotId=${config.dotId}&profile=forged`,
            )
          ).status,
        ).toBe(400);
        expect(
          (await request(`/runtime/operations/${randomUUID()}`)).status,
        ).toBe(404);
        const history = await (
          await request(`/runtime/conversations/${id}/history`)
        ).json();
        expect(history.messages).toEqual([]);
        expect(history.lineageId).toBe(id);
        const seed = spawnSync(
          config.python,
          [
            '-c',
            `from hermes_state import SessionDB\nfrom pathlib import Path\nimport sys\ndb=SessionDB(Path(sys.argv[1])/'state.db')\ndb.append_messages_batch(sys.argv[2],[{'role':'user','content':'🦊'*100000+'\\x00tail','message_uid':'long-stable'},{'role':'assistant','content':[{'type':'text','text':'Visible answer'},{'type':'image_url','image_url':{'url':'private-image'}}],'message_uid':'answer-stable'},{'role':'system','content':'private system'},{'role':'tool','content':'private tool'},{'role':'assistant','content':'private hidden','display_kind':'hidden'}])\ndb.close()`,
            config.home,
            id,
          ],
          {
            cwd: config.checkout,
            env: childEnvironment(config),
            encoding: 'utf8',
          },
        );
        expect(seed.status, seed.stderr).toBe(0);
        const firstPage = await (
          await request(`/runtime/conversations/${id}/history`)
        ).json();
        expect(firstPage.nextCursor).toBeTruthy();
        const secondPage = await (
          await request(
            `/runtime/conversations/${id}/history?cursor=${encodeURIComponent(firstPage.nextCursor)}`,
          )
        ).json();
        const allChunks = [...firstPage.messages, ...secondPage.messages];
        expect(
          allChunks
            .filter((message: { id: string }) => message.id === 'long-stable')
            .map(
              (message: { parts: { text: string }[] }) => message.parts[0].text,
            )
            .join(''),
        ).toBe('🦊'.repeat(100000) + 'tail');
        expect(JSON.stringify(allChunks)).not.toContain('private');
        expect(allChunks.at(-1).chunk.nonTextOmitted).toBe(true);
        expect(secondPage.nextCursor).toBeNull();
        const rename = await request(
          `/runtime/conversations/${id}/rename`,
          'POST',
          {
            operationId: randomUUID(),
            expectedRevision: created.conversation.revision,
            title: 'Renamed',
          },
        );
        expect(rename.status).toBe(200);
        expect(
          (
            await request(`/runtime/conversations/${id}/rename`, 'POST', {
              operationId: randomUUID(),
              expectedRevision: created.conversation.revision,
              title: 'Stale',
            })
          ).status,
        ).toBe(409);
        expect(
          (
            await (
              await request(
                `/runtime/conversations?dotId=${config.dotId}&query=Renamed`,
              )
            ).json()
          ).conversations,
        ).toHaveLength(1);
        const renamed = await rename.json();
        const archived = await request(
          `/runtime/conversations/${id}/archive`,
          'POST',
          {
            operationId: randomUUID(),
            expectedRevision: renamed.conversation.revision,
            archived: true,
          },
        );
        expect(archived.status).toBe(200);
        const archivedRow = await archived.json();
        expect(
          (await request(`/runtime/conversations/${id}/export`)).status,
        ).toBe(403);
        expect(
          (await request(`/runtime/conversations/${id}/history`)).status,
        ).toBe(200);
        const restored = await request(
          `/runtime/conversations/${id}/archive`,
          'POST',
          {
            operationId: randomUUID(),
            expectedRevision: archivedRow.conversation.revision,
            archived: false,
          },
        );
        expect(restored.status).toBe(200);
        const page = f.workspace.pages.create(f.workspace.spaces()[0].id, {
          title: 'Native page',
          content: '',
          parentId: null,
        });
        const pageInput = {
          dotId: config.dotId,
          title: 'Page conversation',
          spaceId: page.spaceId,
        };
        const pages = await Promise.all([
          request(`/runtime/pages/${page.id}/conversation`, 'POST', {
            ...pageInput,
            operationId: randomUUID(),
          }),
          request(`/runtime/pages/${page.id}/conversation`, 'POST', {
            ...pageInput,
            title: 'Another click',
            operationId: randomUUID(),
          }),
        ]);
        expect(pages.map((r) => r.status)).toEqual([201, 201]);
        const receipts = await Promise.all(pages.map((r) => r.json()));
        expect(receipts[0].conversation.id).toBe(receipts[1].conversation.id);
        // Emulate loss of the Dots response record. The producer remains canonical.
        platform.ledger.settle(operationId, 'outcome_unknown');
        const child = (transport as unknown as { process: ChildProcess })
          .process;
        const dead = once(child, 'exit');
        child.kill('SIGKILL');
        await dead;
        await platform.stop();
        transport = new StdioConversationTransport(config);
        platform = new SelfHostedPlatform(f.workspace, f.db, transport);
        app = createSelfHostedApp({ ...f, platform });
        const recovered = await request(`/runtime/operations/${operationId}`);
        expect(recovered.status).toBe(200);
        expect((await recovered.json()).conversation.id).toBe(id);
        expect(
          (
            await (
              await request(`/runtime/conversations?dotId=${config.dotId}`)
            ).json()
          ).conversations,
        ).toHaveLength(2);
        const exported = await request(`/runtime/conversations/${id}/export`);
        expect(exported.status).toBe(200);
        expect(await exported.text()).toContain('"complete":true');
        await expect(
          transport.call('runtime.conversation.history', {
            schema_version: 2,
            conversation_id: id,
          }),
        ).rejects.toThrow('schema');
        f.workspace.runtimeBindings.revoke(
          'agent',
          config.dotId,
          f.workspace.runtimeBindings.resolveDot(config.dotId).agentRevision,
        );
        expect(
          (await request(`/runtime/conversations/${id}/history`)).status,
        ).toBe(403);
      } finally {
        await platform.stop();
        f.cleanup();
      }
    },
    60000,
  );
  test.runIf(
    !!process.env.RYOKO_TEST_PYTHON && !!process.env.RYOKO_TEST_CHECKOUT,
  )(
    'actual repeated display titles and compressed-lineage rename',
    async () => {
      const f = fixture();
      const config = configFor(f);
      const platform = new SelfHostedPlatform(
        f.workspace,
        f.db,
        new StdioConversationTransport(config),
      );
      const app = createSelfHostedApp({ ...f, platform });
      try {
        const headers = await login(app);
        const request = (path: string, body: unknown) =>
          app.request(`${origin}/api${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          });
        const first = await request('/runtime/conversations', {
          operationId: randomUUID(),
          dotId: config.dotId,
          title: 'A new thought',
        });
        const original = await first.json();
        expect(first.status).toBe(201);
        const duplicate = await request('/runtime/conversations', {
          operationId: randomUUID(),
          dotId: config.dotId,
          title: 'A new thought',
        });
        const compressed = spawnSync(
          config.python,
          [
            '-c',
            `from hermes_state import SessionDB\nfrom pathlib import Path\nimport sys\ndb=SessionDB(Path(sys.argv[1])/'state.db')\nsid=sys.argv[2]\nbinding=db.get_session_model_config_value(sid,'agent_identity')\ndb.publish_compression_child(parent_session_id=sid,child_session_id='compressed-tip',source='web',messages=[{'role':'user','content':'Retained display text','message_uid':'compressed-human'}],model_config={'agent_identity':binding},require_compression_lease=False)\ndb.close()`,
            config.home,
            original.conversation.id,
          ],
          {
            cwd: config.checkout,
            env: childEnvironment(config),
            encoding: 'utf8',
          },
        );
        expect(compressed.status, compressed.stderr).toBe(0);
        const rename = await request(
          `/runtime/conversations/${original.conversation.id}/rename`,
          {
            operationId: randomUUID(),
            expectedRevision: original.conversation.revision,
            title: 'Renamed compressed conversation',
          },
        );
        expect([duplicate.status, rename.status]).toEqual([201, 200]);
      } finally {
        await platform.stop();
        f.cleanup();
      }
    },
    60000,
  );
  test('wrong configured owner fails before launch; RPC runtime allowlists cannot be widened by casts', async () => {
    const f = fixture();
    let started = false;
    const transport = {
      config: { ownerId: 'foreign', dotId: f.workspace.dots()[0].id },
      start: async () => {
        started = true;
        return {} as RuntimeConversationCapabilities;
      },
      stop: async () => {},
    } as unknown as ConversationTransport;
    const platform = new SelfHostedPlatform(f.workspace, f.db, transport);
    try {
      await expect(platform.start()).rejects.toThrow('owner');
      expect(started).toBe(false);
    } finally {
      await platform.stop();
      f.cleanup();
    }
    const input = new PassThrough();
    const output = new PassThrough();
    const rpc = new ConversationRpc(input, output);
    await expect(rpc.call('runtime.command' as never, {})).rejects.toThrow();
    rpc.close();
    const read = new ReadOnlyRpc(input, output);
    await expect(
      read.read('runtime.conversation.create' as never, {}),
    ).rejects.toThrow('method');
    read.close();
  });
});
