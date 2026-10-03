import { test, expect } from 'vitest';
import { RuntimeFailure } from '../src/server/runtime/conversation-rpc';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, type ChildProcess } from 'node:child_process';
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
import {
  CommandLedger,
  canonicalCommand,
} from '../src/server/runtime/command-ledger';
import {
  intentDigest,
  ConversationLedger,
} from '../src/server/runtime/conversation-ledger';
import type { CommandIntent } from '../src/shared/runtime/contracts';
const ownerId = 'command-owner',
  origin = 'http://127.0.0.1:3001';
const token = 'isolated-command-owner-token-123456';

test('durable command ingress persists canonical bytes, fences conflicts and survives reopen', () => {
  const root = mkdtempSync(join(tmpdir(), 'dots-command-ledger-')),
    path = join(root, 'commands.sqlite');
  let ledger = new CommandLedger(path, ownerId);
  const intent: CommandIntent = {
    operation: 'submit',
    conversationId: 'conversation',
    text: 'canonical input',
    sourceUrl: null,
  };
  const op = randomUUID(),
    digest = intentDigest(canonicalCommand(intent));
  try {
    expect(ledger.admit(op, digest, intent, 'authority').fresh).toBe(true);
    expect(ledger.get(op)?.state).toBe('pending');
    ledger.close();
    ledger = new CommandLedger(path, ownerId);
    expect(ledger.admit(op, digest, intent, 'authority').fresh).toBe(false);
    expect(() => ledger.admit(op, digest, intent, 'foreign')).toThrow(
      'conflicts',
    );
    const changed = { ...intent, text: 'changed bytes' };
    expect(() =>
      ledger.admit(
        op,
        intentDigest(canonicalCommand(changed)),
        changed,
        'authority',
      ),
    ).toThrow('conflicts');
    expect(ledger.recoverable()).toEqual(['conversation']);
    const conversations = new ConversationLedger(path, ownerId);
    try {
      expect(() =>
        conversations.admit({
          operationId: op,
          dotId: 'dot',
          binding: 'authority',
          kind: 'create',
          intent: '{}',
          producerKey: op,
        }),
      ).toThrow('operation family');
      const createId = randomUUID();
      conversations.admit({
        operationId: createId,
        dotId: 'dot',
        binding: 'authority',
        kind: 'create',
        intent: '{}',
        producerKey: createId,
      });
      expect(() => ledger.admit(createId, digest, intent, 'authority')).toThrow(
        'operation family',
      );
    } finally {
      conversations.close();
    }
  } finally {
    ledger.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test.runIf(
  !!process.env.RYOKO_TEST_PYTHON && !!process.env.RYOKO_TEST_CHECKOUT,
)(
  'real Node BFF → actual pinned Python stdio → isolated loopback SDK provider; duplicates, detach, canonical links and restart',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'dots-command-stdio-')),
      db = join(root, 'dots.sqlite');
    const home = join(root, 'profile'),
      runtimeDirectory = join(root, 'runtime');
    mkdirSync(home);
    mkdirSync(runtimeDirectory);
    const checkout = resolve(process.env.RYOKO_TEST_CHECKOUT!),
      python = process.env.RYOKO_TEST_PYTHON!;
    let executions = 0;
    const requests: string[] = [];
    let release: (() => void) | undefined;
    let hold = false;
    const provider = createServer(async (req, res) => {
      requests.push(`${req.method} ${req.url ?? ''}`);
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404).end();
        return;
      }
      let body = '';
      for await (const bytes of req) body += String(bytes);
      const input = JSON.parse(body);
      executions++;
      if (hold)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      const choice = {
        index: 0,
        message: { role: 'assistant', content: 'Canonical isolated answer' },
        finish_reason: 'stop',
      };
      if (input.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(
          `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'gpt-4.1-mini', choices: [{ index: 0, delta: { role: 'assistant', content: 'Canonical isolated answer' }, finish_reason: null }] })}\n\n`,
        );
        res.write(
          `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'gpt-4.1-mini', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`,
        );
        res.end('data: [DONE]\n\n');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({
            id: 'fixture',
            object: 'chat.completion',
            created: 1,
            model: 'gpt-4.1-mini',
            choices: [choice],
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
        profile_id: 'command-profile',
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
    // Exercise normal YAML, not the earlier JSON-only passive profile restriction.
    const yaml = spawnSync(
      python,
      [
        '-I',
        '-c',
        'import json,sys,yaml; print(yaml.safe_dump(json.load(sys.stdin)))',
      ],
      {
        input: JSON.stringify(profile),
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin', HOME: home, HERMES_HOME: home },
      },
    );
    expect(yaml.status).toBe(0);
    writeFileSync(join(home, 'config.yaml'), yaml.stdout);
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
    const workspace = new WorkspaceStore(db, ownerId),
      store = new Store(db),
      auth = new OwnerAuth(db, { ownerId, ownerToken: token, origin });
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
      db,
      new StdioConversationTransport(config),
    );
    let app = createSelfHostedApp({ auth, platform, store });
    try {
      const login = await app.request(`${origin}/api/auth/login`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ ownerToken: token }),
      });
      const data = await login.json();
      const headers = {
        origin,
        'content-type': 'application/json',
        cookie: login.headers.get('set-cookie')!.split(';')[0],
        'x-csrf-token': data.csrfToken,
      };
      const request = (path: string, body?: unknown, signal?: AbortSignal) =>
        app.request(`${origin}/api/runtime${path}`, {
          headers,
          method: body ? 'POST' : 'GET',
          body: body ? JSON.stringify(body) : undefined,
          signal,
        });
      const created = await request('/conversations', {
        operationId: randomUUID(),
        dotId: config.dotId,
        title: 'Command proof',
      });
      expect(created.status).toBe(201);
      const conversationId = (await created.json()).conversation.id;
      let diagnostics = '';
      (
        platform.transport as unknown as { process: ChildProcess }
      ).process.stdout?.on('data', (bytes) => {
        diagnostics = (diagnostics + String(bytes)).slice(-32000);
      });
      (
        platform.transport as unknown as { process: ChildProcess }
      ).process.stderr?.on('data', (bytes) => {
        diagnostics = (diagnostics + String(bytes)).slice(-32000);
      });
      const connected = await request(
        `/conversations/${conversationId}/connect`,
        {},
      );
      expect(
        connected.status,
        (await connected.clone().text()) + '\n' + diagnostics,
      ).toBe(200);
      const setup = await connected.json();
      expect(setup.features.commands.state).toBe('ready');
      const intent: CommandIntent = {
        operation: 'submit',
        conversationId,
        text: 'One execution only',
        sourceUrl: null,
      };
      const operationId = randomUUID(),
        command = {
          operationId,
          intentDigest: intentDigest(canonicalCommand(intent)),
          intent,
          expectedGeneration: setup.scope.generation,
        };
      const post = await request(
        `/conversations/${conversationId}/commands`,
        command,
      );
      expect(post.status, await post.clone().text()).toBe(200);
      const accepted = await post.json();
      expect(accepted.status).toBe('accepted');
      expect(accepted.runId).toBeTruthy();
      expect(accepted.missionId).toBeNull();
      const duplicate = await request(
        `/conversations/${conversationId}/commands`,
        command,
      );
      expect(duplicate.status).toBe(200);
      const conflict = { ...intent, text: 'Changed' };
      const conflicting = await request(
        `/conversations/${conversationId}/commands`,
        {
          ...command,
          intent: conflict,
          intentDigest: intentDigest(canonicalCommand(conflict)),
        },
      );
      expect(
        conflicting.status,
        (await conflicting.clone().text()) + '\n' + diagnostics,
      ).toBe(409);
      let receipt;
      for (let attempt = 0; attempt < 80; attempt++) {
        receipt = await (await request(`/commands/${operationId}`)).json();
        if (receipt.executionStatus === 'completed') break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(receipt.executionStatus, JSON.stringify(receipt)).toBe(
        'completed',
      );
      expect(executions).toBe(1);
      expect(receipt.messageId).toBeTruthy();
      const history = await (
        await request(`/conversations/${conversationId}/history`)
      ).json();
      expect(history.messages.map((m: { role: string }) => m.role)).toEqual([
        'user',
        'assistant',
      ]);
      expect(history.messages[0].id).toBe(receipt.messageId);
      expect(
        history.messages.every(
          (m: { commandId: string }) => m.commandId === operationId,
        ),
      ).toBe(true);
      expect(history.messages[1].parts[0].text).toBe(
        'Canonical isolated answer',
      );
      // Hold a real provider request across browser detach and BFF reads.
      hold = true;
      const longIntent = { ...intent, text: 'Long isolated turn' },
        longId = randomUUID();
      const abort = new AbortController();
      const longPost = await request(
        `/conversations/${conversationId}/commands`,
        {
          ...command,
          operationId: longId,
          intent: longIntent,
          intentDigest: intentDigest(canonicalCommand(longIntent)),
        },
        abort.signal,
      );
      expect(longPost.status).toBe(200);
      abort.abort();
      for (let n = 0; n < 80 && !release; n++)
        await new Promise((r) => setTimeout(r, 100));
      expect(release).toBeTypeOf('function');
      const running = await (await request(`/commands/${longId}`)).json();
      expect(running.executionStatus).toBe('claimed');
      expect(
        (await request(`/conversations/${conversationId}/history`)).status,
      ).toBe(200);
      if (process.env.RYOKO_TEST_LONG_RUN === '1') {
        await new Promise((resolve) => setTimeout(resolve, 95000));
        expect(
          (await (await request(`/commands/${longId}`)).json()).executionStatus,
        ).toBe('claimed');
      }
      release!();
      hold = false;
      for (let n = 0; n < 80; n++) {
        receipt = await (await request(`/commands/${longId}`)).json();
        if (receipt.executionStatus === 'completed') break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(receipt.executionStatus).toBe('completed');
      expect(executions).toBe(2);
      // Exact run cancellation is a separate durable command, never read detach.
      hold = true;
      release = undefined;
      const cancelTargetId = randomUUID(),
        cancelTargetIntent = {
          ...intent,
          text: 'Explicit cancellation target',
        };
      expect(
        (
          await request(`/conversations/${conversationId}/commands`, {
            ...command,
            operationId: cancelTargetId,
            intent: cancelTargetIntent,
            intentDigest: intentDigest(canonicalCommand(cancelTargetIntent)),
          })
        ).status,
      ).toBe(200);
      for (let n = 0; n < 80 && !release; n++)
        await new Promise((r) => setTimeout(r, 100));
      expect(release).toBeTypeOf('function');
      const queuedId = randomUUID(),
        queuedIntent = {
          ...intent,
          text: 'Queued cancellation must never execute',
        };
      const queued = await request(
        `/conversations/${conversationId}/commands`,
        {
          ...command,
          operationId: queuedId,
          intent: queuedIntent,
          intentDigest: intentDigest(canonicalCommand(queuedIntent)),
        },
      );
      expect(queued.status).toBe(200);
      const queuedReceipt = await (
        await request(`/commands/${queuedId}`)
      ).json();
      expect(queuedReceipt.executionStatus).toBe('accepted');
      const queuedCancel: CommandIntent = {
        operation: 'cancel',
        conversationId,
        runId: queuedReceipt.runId,
        expectedRevision: queuedReceipt.durableRevision,
      };
      const queuedControl = await request(
        `/conversations/${conversationId}/commands`,
        {
          ...command,
          operationId: randomUUID(),
          intent: queuedCancel,
          intentDigest: intentDigest(canonicalCommand(queuedCancel)),
        },
      );
      expect(queuedControl.status, await queuedControl.clone().text()).toBe(
        200,
      );
      expect((await queuedControl.json()).status).toBe('cancel_requested');
      expect(
        (await (await request(`/commands/${queuedId}`)).json()).executionStatus,
      ).toBe('cancelled');
      expect(
        (await (await request(`/commands/${cancelTargetId}`)).json())
          .executionStatus,
      ).toBe('claimed');
      expect(executions).toBe(3);
      const target = await (
        await request(`/commands/${cancelTargetId}`)
      ).json();
      const cancelIntent: CommandIntent = {
        operation: 'cancel',
        conversationId,
        runId: target.runId,
        expectedRevision: target.durableRevision,
      };
      const wrong = { ...cancelIntent, runId: 'wrong-run' };
      const wrongRun = await request(
        `/conversations/${conversationId}/commands`,
        {
          ...command,
          operationId: randomUUID(),
          intent: wrong,
          intentDigest: intentDigest(canonicalCommand(wrong)),
        },
      );
      expect(wrongRun.status).toBe(200);
      expect((await wrongRun.json()).status).toBe('rejected');
      const cancelOperation = randomUUID(),
        cancelBody = {
          ...command,
          operationId: cancelOperation,
          intent: cancelIntent,
          intentDigest: intentDigest(canonicalCommand(cancelIntent)),
        };
      const cancellation = await request(
        `/conversations/${conversationId}/commands`,
        cancelBody,
      );
      expect(cancellation.status, await cancellation.clone().text()).toBe(200);
      expect((await cancellation.json()).status).toBe('cancel_requested');
      release!();
      hold = false;
      expect(
        (await request(`/conversations/${conversationId}/commands`, cancelBody))
          .status,
      ).toBe(200);
      expect(executions).toBe(3);
      // A claimed provider call killed with the process is inspectable, never replayed.
      hold = true;
      release = undefined;
      const crashId = randomUUID(),
        crashIntent = { ...intent, text: 'Claimed crash boundary' };
      expect(
        (
          await request(`/conversations/${conversationId}/commands`, {
            ...command,
            operationId: crashId,
            intent: crashIntent,
            intentDigest: intentDigest(canonicalCommand(crashIntent)),
          })
        ).status,
      ).toBe(200);
      for (let n = 0; n < 100 && !release; n++)
        await new Promise((r) => setTimeout(r, 100));
      expect(release).toBeTypeOf('function');
      expect(
        (await (await request(`/commands/${crashId}`)).json()).executionStatus,
      ).toBe('claimed');
      const child = (platform.transport as unknown as { process: ChildProcess })
        .process;
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
      release!();
      hold = false;
      // Unknown consumer outcome is recovered by read-only receipt after process replacement.
      platform.commands!.ledger.settle(operationId, 'outcome_unknown');
      await platform.stop();
      platform = new SelfHostedPlatform(
        workspace,
        db,
        new StdioConversationTransport(config),
      );
      app = createSelfHostedApp({ auth, platform, store });
      await platform.start();
      for (let n = 0; n < 80; n++) {
        receipt = await (await request(`/commands/${operationId}`)).json();
        if (receipt.executionStatus === 'completed') break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(receipt.executionStatus).toBe('completed');
      expect(
        (await (await request(`/commands/${crashId}`)).json()).executionStatus,
      ).toBe('claimed');
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(executions).toBe(4);
      const allowedRequests = new Set([
        'POST /v1/chat/completions',
        'GET /api/v1/models',
        'GET /api/tags',
        'GET /v1/props',
        'GET /props',
        'GET /version',
        'GET /v1/models',
        'GET /models',
      ]);
      expect(
        requests.every((request) => allowedRequests.has(request)),
        JSON.stringify(requests),
      ).toBe(true);
      expect(
        requests.filter((request) => request.startsWith('POST ')),
      ).toHaveLength(4);
    } finally {
      release?.();
      await platform.stop();
      auth.close();
      workspace.close();
      store.close();
      provider.closeAllConnections();
      await new Promise<void>((resolve) => provider.close(() => resolve()));
      if (process.env.RYOKO_TEST_KEEP === '1')
        process.stderr.write('Isolated test fixture: ' + root + '\n');
      else rmSync(root, { recursive: true, force: true });
    }
  },
  180000,
);

test('stdio server requests fail closed without auto-approval or exposing private notifications', async () => {
  const { PassThrough } = await import('node:stream');
  const { ConversationRpc } =
    await import('../src/server/runtime/conversation-rpc');
  const input = new PassThrough(),
    output = new PassThrough(),
    frames: string[] = [];
  output.on('data', (bytes) => frames.push(String(bytes)));
  const rpc = new ConversationRpc(input, output);
  input.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 'approval-1',
      method: 'approval.request',
      params: { private: 'secret' },
    }) + '\n',
  );
  input.write(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'private.delta',
      params: { text: 'secret' },
    }) + '\n',
  );
  expect(frames).toHaveLength(1);
  expect(JSON.parse(frames[0]).error.code).toBe(-32601);
  expect(frames[0]).not.toContain('secret');
  rpc.close();
});

test('authenticated single command ingress: duplicates never dispatch, lost response inspection is read-only, grant/source conflicts fail closed', async () => {
  const { default: fixture } =
    await import('./fixtures/runtime/producer-baseline.json');
  const root = mkdtempSync(join(tmpdir(), 'dots-command-boundary-')),
    db = join(root, 'dots.sqlite');
  const workspace = new WorkspaceStore(db, ownerId),
    store = new Store(db),
    auth = new OwnerAuth(db, { ownerId, ownerToken: token, origin });
  const dotId = workspace.dots()[0].id,
    conversationId = 'canonical-command-conversation';
  const identity = {
    principal_id: ownerId,
    profile_id: 'profile',
    agent_id: 'ryoko',
    policy_digest: 'a'.repeat(64),
    config_digest: 'b'.repeat(64),
  };
  const config = {
    ownerId,
    dotId,
    gatewayId: 'gateway',
    home: root,
    identity,
  } as LaunchConfig;
  const raw = {
    conversation_id: conversationId,
    agent_id: 'ryoko',
    title: 'Fixture',
    revision: 1,
    archived: false,
    created_at: 1,
    updated_at: 1,
    source: 'web',
  };
  let executions = 0,
    lose = true,
    binds = 0;
  const capabilities = {
    ...fixture.fixtures.unconfiguredCapabilities.response.result,
    provider: { durable_execution: true, execution_owner: 'hermes' },
    operations: [
      { operation: 'submit', accepts_commands: true, executes: true },
    ],
  };
  const commandRecords = new Map<string, object>();
  const transport = {
    config,
    connected: true,
    epoch: 1,
    start: async () => ({ identity }),
    stop: async () => {},
    call: async (method: string, params: Record<string, unknown>) => {
      if (method === 'runtime.conversation.create')
        return { conversation: raw, created: true, schema_version: 1 };
      if (method === 'runtime.conversation.bind') {
        binds++;
        return {
          conversation: raw,
          session_id: 'live-id',
          readiness: 'ready',
          failure_code: null,
        };
      }
      if (method === 'runtime.capabilities') return capabilities;
      if (method === 'runtime.snapshot')
        return {
          ...fixture.fixtures.idleSnapshot.response.result,
          session_id: conversationId,
        };
      if (method === 'runtime.command') {
        executions++;
        const receipt = {
          schema_version: 1,
          command_id: params.command_id,
          status: 'accepted',
          durable_revision: 1,
          run_id: 'actual-run',
          conflict: null,
        };
        commandRecords.set(String(params.command_id), receipt);
        if (lose) {
          lose = false;
          throw new RuntimeFailure('rejected', -32603);
        }
        return receipt;
      }
      if (method === 'runtime.conversation.command.receipt')
        return {
          schema_version: 1,
          command_id: params.command_id,
          found: commandRecords.has(String(params.command_id)),
          receipt: commandRecords.get(String(params.command_id)) ?? null,
          status: 'claimed',
          durable_revision: 2,
          accepted_input: { state: 'committed', message_id: 'stable-user' },
          messages: [],
          messages_has_more: false,
          next_message_cursor: null,
        };
      throw new Error('Unexpected method ' + method);
    },
  } as unknown as import('../src/server/runtime/stdio').ConversationTransport;
  const platform = new SelfHostedPlatform(workspace, db, transport),
    app = createSelfHostedApp({ auth, platform, store });
  try {
    expect(
      (
        await app.request(
          `${origin}/api/runtime/conversations/${conversationId}/commands`,
          {
            method: 'POST',
            headers: { origin, 'content-type': 'application/json' },
            body: '{}',
          },
        )
      ).status,
    ).toBe(401);
    const login = await app.request(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ ownerToken: token }),
    });
    const loginBody = await login.json();
    const headers = {
      origin,
      'content-type': 'application/json',
      cookie: login.headers.get('set-cookie')!.split(';')[0],
      'x-csrf-token': loginBody.csrfToken,
    };
    const request = (path: string, body?: unknown) =>
      app.request(`${origin}/api/runtime${path}`, {
        method: body ? 'POST' : 'GET',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    await platform.create(
      randomUUID(),
      { dotId, title: 'Fixture', pageId: null, spaceId: null },
      () => {},
    );
    const generation =
      workspace.runtimeBindings.resolveDot(dotId).authorityRevision;
    const intent: CommandIntent = {
      operation: 'submit',
      conversationId,
      text: 'one command',
      sourceUrl: 'https://example.invalid/untrusted',
    };
    const operationId = randomUUID(),
      body = {
        operationId,
        intent,
        intentDigest: intentDigest(canonicalCommand(intent)),
        expectedGeneration: generation,
      };
    const first = await request(
      `/conversations/${conversationId}/commands`,
      body,
    );
    expect(first.status).toBe(200);
    expect((await first.json()).status).toBe('outcome_unknown');
    expect(executions).toBe(1);
    const recovered = await request(`/commands/${operationId}`);
    const receipt = await recovered.json();
    expect(receipt.runId).toBe('actual-run');
    expect(receipt.missionId).toBeNull();
    expect(receipt.messageId).toBe('stable-user');
    expect(executions).toBe(1);
    expect(binds).toBe(1);
    const duplicate = await request(
      `/conversations/${conversationId}/commands`,
      body,
    );
    expect((await duplicate.json()).runId).toBe('actual-run');
    expect(executions).toBe(1);
    const recoveryList = await (
      await request(`/conversations/${conversationId}/commands`)
    ).json();
    expect(recoveryList.commands).toHaveLength(1);
    expect(recoveryList.commands[0].operationId).toBe(operationId);
    expect(recoveryList.commands[0].intent).toEqual(intent);
    expect(recoveryList.nextCursor).toBeNull();
    expect(
      (await request(`/conversations/${conversationId}/commands?cursor=forged`))
        .status,
    ).toBe(400);
    const changed = { ...intent, sourceUrl: 'https://another.invalid' };
    expect(
      (
        await request(`/conversations/${conversationId}/commands`, {
          ...body,
          intent: changed,
          intentDigest: intentDigest(canonicalCommand(changed)),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(`/conversations/${conversationId}/commands`, {
          ...body,
          principal_id: 'forged',
        })
      ).status,
    ).toBe(400);
    expect((await request(`/commands/${randomUUID()}`)).status).toBe(404);
    expect(executions).toBe(1);
    workspace.runtimeBindings.revoke(
      'conversation',
      conversationId,
      workspace.runtimeBindings.resolveConversation(conversationId).revision,
    );
    expect((await request(`/commands/${operationId}`)).status).toBe(403);
    expect(executions).toBe(1);
  } finally {
    await platform.stop();
    auth.close();
    workspace.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
