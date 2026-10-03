import { afterEach, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { api } from '../src/client/api.js';
import {
  inspectComputerOperation,
  pendingComputerOperations,
  runComputerOperation,
} from '../src/client/runtime/computers.js';
import {
  ComputerRuntimeService,
  computerIntentCanonical,
  type ComputerOwner,
} from '../src/server/runtime/computer-runtime-service.js';
import {
  NativeComputerHttpEdge,
  type ComputerProtocolTransport,
} from '../src/server/runtime/computer-http-edge.js';
import { computerCanonical } from '../src/server/runtime/computer-effect-service.js';
import type { ControlBinding } from '../src/server/runtime/control-service.js';
import type { ConversationTransport } from '../src/server/runtime/stdio.js';
import type { WorkspaceStore } from '../src/server/workspace.js';
import { browserScope } from '../src/server/self-hosted-platform.js';
import {
  edgeDigest,
  type EdgeChange,
  type EdgeExecute,
  type EdgeReceipt,
  type EdgeState,
} from '../src/shared/computer-edge-protocol.js';
import { computerInputs } from '../src/shared/computer-types.js';
import { contractVersion } from '../src/shared/runtime/contracts.js';

vi.mock('../src/client/api.js', () => ({ api: vi.fn() }));
const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
  vi.unstubAllGlobals();
  vi.mocked(api).mockReset();
});
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const binding = {
  ownerId: 'owner-1',
  dotId: 'dot-1',
  executorId: 'computer-1',
  principalId: 'principal-1',
  profileId: 'profile-1',
  agentId: 'agent-1',
};
const targetIdentity = {
  buildSha256: 'd'.repeat(64),
  configurationSha256: 'e'.repeat(64),
  evidence: 'synthetic' as const,
};
const enabled = { enabled: true, browser: true, files: true, shell: true };

/** Every edge operation is an in-process synthetic response. No provisioner,
 * browser, shell, network listener, container or credential is used here. */
async function fixture(
  options: { qualified?: boolean; enabled?: boolean } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), 'be08-owner-service-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const database = join(directory, 'runtime.sqlite');
  const db = new DatabaseSync(database);
  cleanups.push(() => db.close());
  db.exec(
    "CREATE TABLE workspace_owner(singleton INTEGER PRIMARY KEY,ownerId TEXT NOT NULL); INSERT INTO workspace_owner VALUES(1,'owner-1');",
  );
  const scope: ControlBinding['scope'] = {
    ...binding,
    gatewayId: 'gateway-1',
    privilegeClass: 'primary',
    agentRevision: 1,
    authorityRevision: 2,
    grantRevision: 1,
    spaceId: null,
    projectId: null,
    projectRevision: null,
    conversationId: 'conversation-1',
    durableSessionId: 'durable-1',
    liveSessionId: 'live-1',
    liveGeneration: 2,
    revision: 1,
    archived: false,
  };
  const bound: ControlBinding = {
    scope,
    binding: {
      key: 'conversation-1',
      liveSessionId: 'live-1',
      durableSessionId: 'durable-1',
      generation: 2,
    },
    epoch: 1,
  };
  const authenticate = vi.fn(() => {});
  const owner: ComputerOwner = {
    ownerId: binding.ownerId,
    authSessionId: 'auth-session-1',
    authRevision: 3,
    assertCurrent: authenticate,
  };
  const assertBinding = vi.fn(() => {});
  const workspace = {
    ownerId: binding.ownerId,
    runtimeBindings: {
      resolveDot: vi.fn(() => ({ ...scope })),
      assertCurrent: assertBinding,
    },
  } as unknown as WorkspaceStore;
  const brokerCall = vi.fn(async () => {
    throw new Error('Owner route must not call the producer broker');
  });
  const transport = {
    config: {
      checkout: '/synthetic/producer',
      python: '/synthetic/python',
      home: '/synthetic/home',
      runtimeDirectory: '/synthetic/runtime',
      ownerId: binding.ownerId,
      dotId: binding.dotId,
      gatewayId: scope.gatewayId,
      nativeComputer: { executorId: binding.executorId },
      identity: {
        principal_id: binding.principalId,
        profile_id: binding.profileId,
        agent_id: binding.agentId,
        policy_digest: 'a'.repeat(64),
        config_digest: 'b'.repeat(64),
      },
    },
    connected: true,
    epoch: 1,
    call: brokerCall,
    start: async () => {
      throw new Error('Synthetic transport cannot start');
    },
    stop: async () => {},
  } as unknown as ConversationTransport;
  let service: ComputerRuntimeService;
  const receipts = new Map<string, EdgeReceipt>();
  const changes = new Map<
    string,
    { operationId: string; requestSha256: string; state: EdgeState }
  >();
  const state = (): EdgeState => ({
    ...service.effects.fence(),
    bootId: 'synthetic-boot',
  });
  let handler: ComputerProtocolTransport['request'] = async (
    path,
    body,
    _role,
    _signal,
    beforeSend,
  ) => {
    if (path === '/edge/status')
      return {
        protocol: 'dots-computer-edge/1',
        dotId: binding.dotId,
        executorId: binding.executorId,
        state: state(),
        identity: targetIdentity,
        actions: Object.keys(computerInputs),
      };
    if (path === '/edge/execute') {
      beforeSend?.();
      const request = body as EdgeExecute;
      const result = { text: 'synthetic result', extra: 'not exposed to FE' };
      const receipt: EdgeReceipt = {
        operationId: request.operationId,
        requestSha256: edgeDigest(request),
        identity: request.identity,
        actor: request.actor,
        state: 'committed',
        reason: 'committed',
        result,
        resultSha256: edgeDigest(result),
        receiptId: 'receipt-' + request.operationId,
      };
      receipts.set(request.operationId, receipt);
      return receipt;
    }
    if (path === '/edge/inspect')
      return {
        receipt:
          receipts.get((body as { operationId: string }).operationId) ?? null,
      };
    if (path === '/edge/observe')
      return {
        snapshotId: 17,
        output: {
          snapshotId: 17,
          tree: 'synthetic button',
          summary: 'Observed synthetic page',
        },
      };
    if (path === '/edge/screen')
      return {
        snapshotId: 18,
        output: {
          snapshotId: 18,
          base64: 'iVBORw0KGgo=',
          width: 800,
          height: 600,
          url: 'about:blank',
          capturedAt: Date.now(),
        },
      };
    if (path === '/edge/change') {
      beforeSend?.();
      const change = body as EdgeChange;
      const acknowledged = { ...state(), transitioning: false };
      changes.set(change.operationId, {
        operationId: change.operationId,
        requestSha256: edgeDigest(change),
        state: acknowledged,
      });
      return acknowledged;
    }
    if (path === '/edge/change-inspect')
      return {
        change:
          changes.get((body as { operationId: string }).operationId) ?? null,
      };
    throw new Error(`Unexpected synthetic edge path: ${path}`);
  };
  const request = vi.fn<ComputerProtocolTransport['request']>((...args) =>
    handler(...args),
  );
  const edge =
    options.qualified === false
      ? null
      : new NativeComputerHttpEdge(
          binding,
          { configured: () => true, request },
          {
            protocol: 'dots-computer-edge/1',
            dotId: binding.dotId,
            executorId: binding.executorId,
            receiptSha256: 'c'.repeat(64),
            ...targetIdentity,
            actions: Object.keys(computerInputs) as Array<
              keyof typeof computerInputs
            >,
          },
        );
  function open() {
    const value = new ComputerRuntimeService(
      workspace,
      database,
      transport,
      (_id, auth) => {
        auth();
        return bound;
      },
      (_bound, auth) => auth(),
      { edge },
    );
    let closed = false;
    const close = () => {
      if (!closed) {
        value.close();
        closed = true;
      }
    };
    cleanups.push(close);
    return { value, close };
  }
  let opened = open();
  service = opened.value;
  if (options.enabled !== false)
    service.effects.permissions(enabled, 0, authenticate);
  await service.status(binding.executorId, owner);
  request.mockClear();
  function action(
    action = 'files_write',
    input: unknown = { path: 'café.txt', contents: 'hello 🦊', append: false },
    operationId = randomUUID(),
  ) {
    const revision = service.effects.fence().revision;
    return {
      operationId,
      intentDigest: hash(
        computerIntentCanonical({
          scope: browserScope(scope),
          executorId: binding.executorId,
          revision,
          action,
          input,
        }),
      ),
      expectedGeneration: scope.authorityRevision,
      expectedRevision: revision,
      action,
      input,
    };
  }
  return {
    db,
    database,
    scope,
    owner,
    edge,
    request,
    receipts,
    changes,
    brokerCall,
    authenticate,
    assertBinding,
    action,
    get service() {
      return service;
    },
    state,
    handler: () => handler,
    handle: (next: typeof handler) => {
      handler = next;
    },
    restart: async () => {
      opened.close();
      opened = open();
      service = opened.value;
      await service.status(binding.executorId, owner);
      request.mockClear();
    },
  };
}

function browserBridge(f: Awaited<ReturnType<typeof fixture>>) {
  const storage = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  vi.mocked(api).mockImplementation((async (
    path: string,
    method = 'GET',
    body?: unknown,
  ) => {
    calls.push({ path, method, body });
    if (method === 'POST')
      return f.service.ownerAction(binding.executorId, body, f.owner);
    return f.service.inspectOwner(
      decodeURIComponent(path.split('/').at(-1)!),
      f.owner,
    );
  }) as typeof api);
  return { calls, storage };
}

it('keeps the default unqualified computer fail-closed without edge or producer work', async () => {
  const f = await fixture({ qualified: false, enabled: false });
  expect(await f.service.status(binding.executorId, f.owner)).toEqual({
    version: contractVersion,
    scope: browserScope(f.scope),
    executorId: binding.executorId,
    revision: 0,
    refreshedAt: expect.any(Number),
    configured: false,
    state: 'not_configured',
    permissions: { enabled: false, browser: false, files: false, shell: false },
    control: {
      holder: 'bot',
      requested: false,
      transitioning: false,
      resumeSnapshotRequired: true,
    },
    audit: [],
    error: 'Target-host computer capabilities have not been qualified.',
  });
  await expect(
    f.service.screen(binding.executorId, f.owner),
  ).rejects.toMatchObject({ status: 503 });
  expect(f.request).not.toHaveBeenCalled();
  expect(f.brokerCall).not.toHaveBeenCalled();
});

it('accepts the actual FE Unicode digest and returns its exact owner scope, operation and revision', async () => {
  const f = await fixture();
  const bridge = browserBridge(f);
  const status = await f.service.status(binding.executorId, f.owner);
  const input = { path: 'café.txt', contents: 'hello 🦊', append: false };
  const result = await runComputerOperation(status, 'files_write', input);
  const body = bridge.calls[0].body as ReturnType<typeof f.action>;
  expect(body).toMatchObject({
    expectedGeneration: status.scope.generation,
    expectedRevision: status.revision,
    action: 'files_write',
    input,
  });
  expect(body.intentDigest).toBe(
    hash(
      computerIntentCanonical({
        scope: status.scope,
        executorId: status.executorId,
        revision: status.revision,
        action: 'files_write',
        input,
      }),
    ),
  );
  expect(body.intentDigest).not.toBe(
    hash(
      computerCanonical({
        scope: status.scope,
        executorId: status.executorId,
        revision: status.revision,
        action: 'files_write',
        input,
      }),
    ),
  );
  expect(result).toEqual({
    version: contractVersion,
    scope: status.scope,
    executorId: status.executorId,
    revision: status.revision + 1,
    operationId: body.operationId,
    intentDigest: body.intentDigest,
    effectId: null,
    state: 'reconciled',
    output: { text: 'synthetic result' },
  });
  expect(pendingComputerOperations(status)).toEqual([]);
  expect(
    f.request.mock.calls.filter(([path]) => path === '/edge/execute'),
  ).toHaveLength(1);
  expect(f.brokerCall).not.toHaveBeenCalled();
});

it.each(['digest', 'generation', 'revision', 'scope', 'executor'] as const)(
  'rejects an owner intent with changed %s before admission or target work',
  async (field) => {
    const f = await fixture();
    const body = f.action();
    if (field === 'digest') body.intentDigest = '0'.repeat(64);
    if (field === 'generation') body.expectedGeneration++;
    if (field === 'revision') body.expectedRevision++;
    if (field === 'scope' || field === 'executor')
      body.intentDigest = hash(
        computerIntentCanonical({
          scope: {
            ...browserScope(f.scope),
            ...(field === 'scope' ? { gateway: 'other-gateway' } : {}),
          },
          executorId:
            field === 'executor' ? 'other-computer' : binding.executorId,
          revision: body.expectedRevision,
          action: body.action,
          input: body.input,
        }),
      );
    await expect(
      f.service.ownerAction(binding.executorId, body, f.owner),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      f.db
        .prepare('SELECT COUNT(*) AS n FROM runtime_computer_owner_ingress')
        .get()?.n,
    ).toBe(0);
    expect(f.request).not.toHaveBeenCalled();
    expect(f.brokerCall).not.toHaveBeenCalled();
  },
);

it('persists unknown admission across restart and recovers through FE GET only without redispatch', async () => {
  const f = await fixture();
  const original = f.handler();
  f.handle(async (...args) => {
    const result = await original(...args);
    if (args[0] === '/edge/execute')
      throw new Error('Synthetic response lost after commit');
    return result;
  });
  const bridge = browserBridge(f);
  const status = await f.service.status(binding.executorId, f.owner);
  const first = await runComputerOperation(status, 'files_write', {
    path: 'note.txt',
    contents: 'approved',
    append: false,
  });
  expect(first.state).toBe('unknown');
  const [pending] = pendingComputerOperations(status);
  expect(pending).toMatchObject({
    operationId: first.operationId,
    intentDigest: first.intentDigest,
  });
  expect(
    f.db
      .prepare(
        'SELECT state FROM runtime_computer_owner_ingress WHERE operationId=?',
      )
      .get(first.operationId)?.state,
  ).toBe('unknown');
  expect(
    f.request.mock.calls.filter(([path]) => path === '/edge/execute'),
  ).toHaveLength(1);
  await f.restart();
  const recovered = await inspectComputerOperation(status, pending);
  expect(recovered).toMatchObject({
    operationId: first.operationId,
    intentDigest: first.intentDigest,
    state: 'reconciled',
    effectId: null,
    output: { text: 'synthetic result' },
  });
  expect(bridge.calls.map(({ method }) => method)).toEqual(['POST', 'GET']);
  expect(f.request.mock.calls.map(([path]) => path)).toEqual(['/edge/inspect']);
  expect(pendingComputerOperations(status)).toEqual([]);
  expect(
    f.db
      .prepare('SELECT COUNT(*) AS n FROM runtime_computer_reservations')
      .get()?.n,
  ).toBe(0);
  expect(f.brokerCall).not.toHaveBeenCalled();
});

it('keeps missing target proof unknown on repeated inspection without admitting another action', async () => {
  const f = await fixture();
  const original = f.handler();
  f.handle(async (...args) => {
    if (args[0] === '/edge/execute') {
      args[4]?.();
      throw new Error('Synthetic disconnect after final send');
    }
    return original(...args);
  });
  const body = f.action();
  expect(
    (await f.service.ownerAction(binding.executorId, body, f.owner)).state,
  ).toBe('unknown');
  f.request.mockClear();
  for (let n = 0; n < 2; n++)
    expect(
      (await f.service.inspectOwner(body.operationId, f.owner)).state,
    ).toBe('unknown');
  expect(f.request.mock.calls.map(([path]) => path)).toEqual([
    '/edge/inspect',
    '/edge/inspect',
  ]);
  expect(
    f.db
      .prepare('SELECT COUNT(*) AS n FROM runtime_computer_owner_ingress')
      .get()?.n,
  ).toBe(1);
  expect(
    f.db
      .prepare('SELECT COUNT(*) AS n FROM runtime_computer_owner_actions')
      .get()?.n,
  ).toBe(1);
});

it('only inspects an exact repeated unknown owner admission and rejects a changed intent with the same ID', async () => {
  const f = await fixture();
  const original = f.handler();
  f.handle(async (...args) => {
    if (args[0] === '/edge/execute') {
      args[4]?.();
      throw new Error('Synthetic unknown outcome');
    }
    return original(...args);
  });
  const body = f.action();
  await f.service.ownerAction(binding.executorId, body, f.owner);
  f.request.mockClear();
  expect(
    (await f.service.ownerAction(binding.executorId, body, f.owner)).state,
  ).toBe('unknown');
  expect(f.request.mock.calls.map(([path]) => path)).toEqual(['/edge/inspect']);
  const different = f.action(
    'files_write',
    { path: 'different.txt', contents: 'different', append: false },
    body.operationId,
  );
  await expect(
    f.service.ownerAction(binding.executorId, different, f.owner),
  ).rejects.toMatchObject({ status: 409 });
  expect(f.request.mock.calls.map(([path]) => path)).toEqual(['/edge/inspect']);
});

it.each(['files_write', 'snapshot', 'take'] as const)(
  'rejects a cross-family operation ID for %s before creating an owner row',
  async (action) => {
    const f = await fixture();
    const body = action === 'files_write' ? f.action() : f.action(action, {});
    f.db
      .prepare('INSERT INTO runtime_operation_registry VALUES(?,?,?,?,?)')
      .run(
        body.operationId,
        binding.ownerId,
        'page',
        'd'.repeat(64),
        'another-family',
      );
    await expect(
      f.service.ownerAction(binding.executorId, body, f.owner),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      f.db
        .prepare('SELECT COUNT(*) AS n FROM runtime_computer_owner_ingress')
        .get()?.n,
    ).toBe(0);
    expect(f.request).not.toHaveBeenCalled();
  },
);

it('rejects a different owner, executor and revoked authentication before target work', async () => {
  const f = await fixture();
  const body = f.action();
  const otherOwner = { ...f.owner, ownerId: 'other-owner' };
  await expect(
    f.service.status(binding.executorId, otherOwner),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    f.service.ownerAction(binding.executorId, body, otherOwner),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    f.service.ownerAction('other-computer', body, f.owner),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    f.service.screen('other-computer', f.owner),
  ).rejects.toMatchObject({ status: 403 });
  f.authenticate.mockImplementation(() => {
    throw new Error('Owner session revoked');
  });
  await expect(f.service.status(binding.executorId, f.owner)).rejects.toThrow(
    'revoked',
  );
  await expect(
    f.service.ownerAction(binding.executorId, body, f.owner),
  ).rejects.toThrow('revoked');
  expect(f.request).not.toHaveBeenCalled();
});

it.each(['principalId', 'profileId', 'agentId'] as const)(
  'rejects changed runtime %s authority before target work',
  async (field) => {
    const f = await fixture();
    const body = f.action();
    f.scope[field] = 'changed-authority';
    await expect(
      f.service.status(binding.executorId, f.owner),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.service.ownerAction(binding.executorId, body, f.owner),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.request).not.toHaveBeenCalled();
  },
);

it.each(['ownerId', 'executorId', 'authority'] as const)(
  'does not expose or reconcile a persisted owner operation with wrong %s',
  async (field) => {
    const f = await fixture();
    const original = f.handler();
    f.handle(async (...args) => {
      if (args[0] === '/edge/execute') {
        args[4]?.();
        throw new Error('Synthetic unknown outcome');
      }
      return original(...args);
    });
    const body = f.action();
    await f.service.ownerAction(binding.executorId, body, f.owner);
    f.db
      .prepare(
        `UPDATE runtime_computer_owner_ingress SET ${field}=? WHERE operationId=?`,
      )
      .run('other-authority', body.operationId);
    f.request.mockClear();
    await expect(
      f.service.inspectOwner(body.operationId, f.owner),
    ).rejects.toMatchObject({ status: expect.any(Number) });
    expect(f.request).not.toHaveBeenCalled();
  },
);

it('requires a witnessed snapshot after control release; screen reads leave the resume flag and revision unchanged', async () => {
  const f = await fixture();
  const beforeRelease = f.service.effects.fence().revision;
  const release = await f.service.ownerAction(
    binding.executorId,
    f.action('release', {}),
    f.owner,
  );
  expect(release.state).toBe('reconciled');
  expect(f.service.effects.fence()).toMatchObject({
    holder: 'bot',
    transitioning: false,
    resumeSnapshotRequired: true,
    snapshotId: null,
  });
  expect(f.service.effects.fence().revision).toBeGreaterThan(beforeRelease);
  const beforeScreen = f.service.effects.fence();
  const screen = await f.service.screen(binding.executorId, f.owner);
  expect(screen).toMatchObject({
    executorId: binding.executorId,
    scope: browserScope(f.scope),
    snapshotRevision: beforeScreen.revision,
    base64: 'iVBORw0KGgo=',
  });
  expect(f.service.effects.fence()).toEqual(beforeScreen);
  const snapshot = await f.service.ownerAction(
    binding.executorId,
    f.action('snapshot', {}),
    f.owner,
  );
  expect(snapshot).toMatchObject({
    state: 'reconciled',
    revision: beforeScreen.revision + 1,
    output: { summary: 'Observed synthetic page' },
  });
  expect(f.service.effects.fence()).toMatchObject({
    resumeSnapshotRequired: false,
    snapshotId: 17,
    snapshotSha256: edgeDigest({
      snapshotId: 17,
      tree: 'synthetic button',
      summary: 'Observed synthetic page',
    }),
  });
  expect(f.request.mock.calls.map(([path]) => path)).toEqual([
    '/edge/change',
    '/edge/screen',
    '/edge/observe',
  ]);
  expect(f.brokerCall).not.toHaveBeenCalled();
});

it('retains an unknown snapshot admission and resume fence if target observation fails', async () => {
  const f = await fixture();
  const original = f.handler();
  f.handle(async (...args) => {
    if (args[0] === '/edge/observe') throw new Error('Synthetic snapshot loss');
    return original(...args);
  });
  const before = f.service.effects.fence();
  const body = f.action('snapshot', {});
  expect(
    (await f.service.ownerAction(binding.executorId, body, f.owner)).state,
  ).toBe('unknown');
  f.request.mockClear();
  expect((await f.service.inspectOwner(body.operationId, f.owner)).state).toBe(
    'unknown',
  );
  expect(f.service.effects.fence()).toEqual(before);
  expect(f.request).not.toHaveBeenCalled();
});

it('recovers a lost control acknowledgment by inspection after restart without a second change', async () => {
  const f = await fixture();
  const original = f.handler();
  f.handle(async (...args) => {
    const result = await original(...args);
    if (args[0] === '/edge/change')
      throw new Error('Synthetic lost change acknowledgment');
    return result;
  });
  const body = f.action('take', {});
  expect(
    (await f.service.ownerAction(binding.executorId, body, f.owner)).state,
  ).toBe('unknown');
  expect(f.service.effects.fence()).toMatchObject({
    holder: 'human',
    transitioning: true,
    resumeSnapshotRequired: true,
  });
  expect(f.request.mock.calls.map(([path]) => path)).toEqual(['/edge/change']);
  await f.restart();
  expect((await f.service.inspectOwner(body.operationId, f.owner)).state).toBe(
    'reconciled',
  );
  expect(f.service.effects.fence()).toMatchObject({
    holder: 'human',
    transitioning: false,
    resumeSnapshotRequired: true,
  });
  expect(f.request.mock.calls.map(([path]) => path)).toEqual([
    '/edge/change-inspect',
  ]);
  expect(f.brokerCall).not.toHaveBeenCalled();
});

it('keeps a control transition locked when recovered proof belongs to different change bytes', async () => {
  const f = await fixture();
  const original = f.handler();
  f.handle(async (...args) => {
    const result = await original(...args);
    if (args[0] === '/edge/change')
      throw new Error('Synthetic lost change acknowledgment');
    return result;
  });
  const body = f.action('take', {});
  await f.service.ownerAction(binding.executorId, body, f.owner);
  f.changes.get(body.operationId)!.requestSha256 = '0'.repeat(64);
  f.request.mockClear();
  expect((await f.service.inspectOwner(body.operationId, f.owner)).state).toBe(
    'unknown',
  );
  expect(f.service.effects.fence()).toMatchObject({
    transitioning: true,
    resumeSnapshotRequired: true,
  });
  expect(f.request.mock.calls.map(([path]) => path)).toEqual([
    '/edge/change-inspect',
  ]);
});

it.each(['operationId', 'requestSha256', 'actor', 'resultSha256'] as const)(
  'does not accept recovered target proof with a different %s',
  async (field) => {
    const f = await fixture();
    const original = f.handler();
    f.handle(async (...args) => {
      const result = await original(...args);
      if (args[0] === '/edge/execute')
        throw new Error('Synthetic lost target reply');
      return result;
    });
    const body = f.action();
    await f.service.ownerAction(binding.executorId, body, f.owner);
    const receipt = f.receipts.get(body.operationId)!;
    if (field === 'operationId') receipt.operationId = 'another-operation';
    if (field === 'requestSha256') receipt.requestSha256 = '0'.repeat(64);
    if (field === 'resultSha256') receipt.resultSha256 = '0'.repeat(64);
    if (field === 'actor')
      receipt.actor = {
        kind: 'owner',
        ownerId: 'another-owner',
        authSessionId: f.owner.authSessionId,
        authRevision: f.owner.authRevision,
      };
    f.request.mockClear();
    expect(
      (await f.service.inspectOwner(body.operationId, f.owner)).state,
    ).toBe('unknown');
    expect(f.request.mock.calls.map(([path]) => path)).toEqual([
      '/edge/inspect',
    ]);
    expect(
      f.db
        .prepare('SELECT COUNT(*) AS n FROM runtime_computer_reservations')
        .get()?.n,
    ).toBe(1);
  },
);

it('rejects tampered persisted owner output instead of presenting it as reconciled proof', async () => {
  const f = await fixture();
  const body = f.action();
  expect(
    (await f.service.ownerAction(binding.executorId, body, f.owner)).state,
  ).toBe('reconciled');
  f.db
    .prepare(
      'UPDATE runtime_computer_owner_ingress SET result=? WHERE operationId=?',
    )
    .run('{"text":"unverified replacement"}', body.operationId);
  f.request.mockClear();
  await expect(
    f.service.inspectOwner(body.operationId, f.owner),
  ).rejects.toMatchObject({ status: 503 });
  expect(f.request).not.toHaveBeenCalled();
});

it('rejects a stored FE scope from another authority even when its executor is unchanged', async () => {
  const f = await fixture();
  const body = f.action();
  await f.service.ownerAction(binding.executorId, body, f.owner);
  f.db
    .prepare(
      'UPDATE runtime_computer_owner_ingress SET scope=? WHERE operationId=?',
    )
    .run(
      JSON.stringify({ ...browserScope(f.scope), gateway: 'another-gateway' }),
      body.operationId,
    );
  f.request.mockClear();
  await expect(
    f.service.inspectOwner(body.operationId, f.owner),
  ).rejects.toMatchObject({ status: 403 });
  expect(f.request).not.toHaveBeenCalled();
});

it('does not create, inspect or redispatch target work for an absent operation ID', async () => {
  const f = await fixture();
  await expect(
    f.service.inspectOwner(randomUUID(), f.owner),
  ).rejects.toMatchObject({ status: 404 });
  expect(
    f.db
      .prepare('SELECT COUNT(*) AS n FROM runtime_computer_owner_ingress')
      .get()?.n,
  ).toBe(0);
  expect(f.request).not.toHaveBeenCalled();
});

it('keeps an unresolved BFF-only admission fenced after restart while allowing safety take', async () => {
  const f = await fixture();
  const body = f.action();
  const admit = vi
    .spyOn(f.service.effects, 'ownerAction')
    .mockRejectedValueOnce(new Error('Synthetic crash before core admission'));
  expect(
    (await f.service.ownerAction(binding.executorId, body, f.owner)).state,
  ).toBe('unknown');
  admit.mockRestore();
  expect(
    f.db
      .prepare('SELECT COUNT(*) AS n FROM runtime_computer_owner_actions')
      .get()?.n,
  ).toBe(0);
  expect(
    f.db
      .prepare('SELECT COUNT(*) AS n FROM runtime_computer_reservations')
      .get()?.n,
  ).toBe(0);
  await f.restart();
  expect((await f.service.inspectOwner(body.operationId, f.owner)).state).toBe(
    'unknown',
  );
  await expect(
    f.service.ownerAction(binding.executorId, f.action(), f.owner),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    f.db
      .prepare('SELECT COUNT(*) AS n FROM runtime_computer_owner_ingress')
      .get()?.n,
  ).toBe(1);
  expect(f.request).not.toHaveBeenCalled();
  const takeover = await f.service.ownerAction(
    binding.executorId,
    f.action('take', {}),
    f.owner,
  );
  expect(takeover.state).toBe('reconciled');
  expect(f.service.effects.fence()).toMatchObject({
    holder: 'human',
    transitioning: false,
    resumeSnapshotRequired: true,
  });
  expect(f.request.mock.calls.map(([path]) => path)).toEqual(['/edge/change']);
});
