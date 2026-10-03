import { afterEach, expect, test } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkspaceStore } from '../src/server/workspace';
import { PageRuntimeService } from '../src/server/runtime/page-runtime-service';
import {
  nativePageCanonical,
  type NativePagePeer,
} from '../src/server/runtime/page-effect-service';
import type {
  ConversationTransport,
  LaunchConfig,
} from '../src/server/runtime/stdio';
import type { ControlBinding } from '../src/server/runtime/control-service';
import type { NativeHandler } from '../src/server/runtime/wire';
import type {
  DotsDispatchRequest,
  DotsPageProposal,
  DotsApprovalRequest,
  RuntimeApprovalGetResult,
} from '../src/shared/runtime/producer/wire.generated';
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const digest = (value: unknown) => hash(nativePageCanonical(value));
const gate = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dots-page-runtime-')),
    database = join(root, 'workspace.db');
  const workspace = new WorkspaceStore(database, 'owner'),
    dot = workspace.dots()[0],
    spaceId = workspace.spaces()[0].id;
  workspace.runtimeBindings.bindAgent({
    dotId: dot.id,
    gatewayId: 'gateway',
    principalId: 'principal',
    profileId: 'profile',
    agentId: 'agent',
    privilegeClass: 'primary',
  });
  workspace.runtimeBindings.bindConversation({
    conversationId: 'conversation',
    dotId: dot.id,
    spaceId: null,
    durableSessionId: 'conversation',
    liveSessionId: 'live-a',
    liveGeneration: 1,
  });
  let epoch = 1,
    live = 'live-a',
    allowed = true,
    sourceArchived = false;
  let selectedPage: string | null = null;
  let handler: NativeHandler | undefined;
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const replies = new Map<
    string,
    (params: Record<string, unknown>) => unknown | Promise<unknown>
  >();
  const config: LaunchConfig = {
    checkout: '/fixture',
    python: '/python',
    home: '/home',
    runtimeDirectory: '/runtime',
    ownerId: 'owner',
    dotId: dot.id,
    gatewayId: 'gateway',
    identity: {
      principal_id: 'principal',
      profile_id: 'profile',
      agent_id: 'agent',
      policy_digest: 'a'.repeat(64),
      config_digest: 'b'.repeat(64),
    },
    nativePages: {
      adapterId: 'pages',
      projects: [{ spaceId, projectId: 'project' }],
    },
  };
  const auth = () => {
    if (!allowed) throw new Error('owner revoked');
  };
  const bound = (
    _id: string,
    current: () => void,
    access: 'read' | 'write',
  ): ControlBinding => {
    current();
    const scope = workspace.runtimeBindings.resolveConversation(
      'conversation',
      access,
    );
    return {
      scope,
      binding: {
        key: 'conversation',
        liveSessionId: live,
        durableSessionId: 'conversation',
        generation: scope.liveGeneration,
      },
      epoch,
    };
  };
  const transport = {
    config,
    connected: true,
    get epoch() {
      return epoch;
    },
    setNativeHandler(value: NativeHandler) {
      handler = value;
      return () => {
        handler = undefined;
      };
    },
    async call(method: string, input: unknown) {
      const params = input as Record<string, unknown>;
      calls.push({ method, params });
      if (replies.has(method)) return replies.get(method)!(params);
      if (method === 'runtime.project.get')
        return {
          project: {
            id: 'project',
            project_id: 'project',
            archived: false,
            owner_principal_id: 'principal',
            grants: [
              {
                principal_id: 'principal',
                agent_id: 'agent',
                permissions: ['read', 'write'],
              },
            ],
          },
        };
      if (method === 'runtime.dots.register')
        return {
          adapter_id: 'pages',
          kind: 'page',
          revision: params.revision,
          enabled: true,
          agent_id: 'agent',
          registered: true,
        };
      if (method === 'runtime.snapshot')
        return { session_id: 'conversation', last_cursor: 'epoch:0' };
      if (method === 'runtime.events.since')
        return {
          status: 'ok',
          events:
            params.cursor === 'epoch:0'
              ? [
                  {
                    type: 'command.completed',
                    session_id: 'conversation',
                    run_id: 'older',
                    generation: 1,
                  },
                  {
                    type: 'command.claimed',
                    session_id: 'conversation',
                    run_id: 'run',
                    generation: 2,
                  },
                ]
              : [],
          last_cursor: 'epoch:2',
          has_more: false,
          snapshot: null,
        };
      if (method === 'runtime.dots.page.prepare') {
        const proposal = params.proposal as DotsPageProposal;
        return {
          command_id: params.command_id,
          operation_id: params.command_id,
          run_id: 'run',
          action_digest: 'c'.repeat(64),
          input_digest: digest(proposal),
          content_sha256: digest(proposal.document),
          approval_id: 'manual-review',
          approval_digest: 'd'.repeat(64),
          expires_at: Date.now() / 1000 + 60,
        };
      }
      throw new Error('Unexpected fixture RPC ' + method);
    },
  } as unknown as ConversationTransport;
  const service = new PageRuntimeService(
    workspace,
    database,
    transport,
    bound,
    (original, current, access) => {
      current();
      workspace.runtimeBindings.assertCurrent(original.scope, access);
      if (original.epoch !== epoch) throw new Error('old epoch');
    },
    () => !sourceArchived,
    () => (selectedPage ? { spaceId, pageId: selectedPage } : null),
  );
  cleanups.push(() => {
    service.close();
    workspace.close();
    rmSync(root, { recursive: true, force: true });
  });
  await service.connect('conversation', auth);
  const peer = (): NativePagePeer => ({
    sessionId: live,
    principalId: 'principal',
    profileId: 'profile',
    agentId: 'agent',
    runtimeSessionId: 'conversation',
    conversationId: 'conversation',
    policyDigest: 'a'.repeat(64),
    generation: 2,
    grantRevision: 1,
    assertCurrent() {},
    canAccess() {
      return true;
    },
  });
  return {
    service,
    workspace,
    spaceId,
    dotId: dot.id,
    calls,
    replies,
    auth,
    bound,
    peer,
    handler: (
      method: Parameters<NativeHandler>[0],
      params: unknown,
      signal = new AbortController().signal,
    ) => handler!(method, params, signal),
    revoke: () => {
      allowed = false;
    },
    restore: () => {
      allowed = true;
    },
    archiveSource: () => {
      sourceArchived = true;
    },
    selectPage: (pageId: string) => {
      selectedPage = pageId;
    },
    async reconnect() {
      const previous =
        workspace.runtimeBindings.resolveConversation('conversation');
      live = 'live-b';
      epoch++;
      workspace.runtimeBindings.bindConversation(
        {
          conversationId: 'conversation',
          dotId: dot.id,
          spaceId: null,
          durableSessionId: 'conversation',
          liveSessionId: live,
          liveGeneration: previous.liveGeneration + 1,
        },
        previous.revision,
      );
      await service.connect('conversation', auth);
    },
  };
}
function dispatch(
  spaceId: string,
  operationId = randomUUID(),
  pageId = randomUUID(),
): DotsDispatchRequest {
  const proposal: DotsPageProposal = {
    kind: 'page',
    store_id: 'pages',
    project_id: 'project',
    space_id: spaceId,
    page_id: pageId,
    expected_head_version: 0,
    expected_grant_revision: 1,
    document: {
      title: 'Native',
      content: 'Exact source',
      parent_id: null,
      archived: false,
    },
  };
  const { document, ...scope } = proposal,
    content_json = nativePageCanonical(document);
  return {
    session_id: 'live-a',
    proposal,
    content_json,
    deadline_at: Date.now() / 1000 + 60,
    identity: {
      schema_version: 1,
      principal_id: 'principal',
      profile_id: 'profile',
      agent_id: 'agent',
      runtime_session_id: 'conversation',
      run_id: 'run',
      operation_id: operationId,
      effect_id: 'effect-' + operationId,
      approval_id: 'manual-review',
      approval_digest: 'd'.repeat(64),
      action_digest: digest({
        name: 'runtime.dots.page.publish',
        arguments: proposal,
        operation_class: 'dots_page_publish',
        resource_roots: [],
        destination: 'dots:' + digest(scope),
        destination_purpose: 'dots_page',
        contract_digest: digest({ schema_version: 1, kind: 'page', scope }),
      }),
      input_digest: digest(proposal),
      policy_digest: 'a'.repeat(64),
      policy_version: '1',
      generation: 2,
      adapter_id: 'pages',
      adapter_kind: 'page',
      grant_revision: 1,
      scope_json: nativePageCanonical(scope),
      content_sha256: hash(content_json),
      content_size: Buffer.byteLength(content_json),
    },
  };
}
function effectProof(request: DotsDispatchRequest) {
  return {
    effect: {
      effect_id: request.identity.effect_id,
      operation_id: request.identity.operation_id,
      run_id: 'run',
      operation_type: 'dots_page_publish',
      state: 'dispatched',
      generation: 2,
      action_digest: request.identity.action_digest,
      input_digest: request.identity.input_digest,
      approval_id: request.identity.approval_id,
      policy_digest: request.identity.policy_digest,
    },
  };
}
function draft(
  f: Awaited<ReturnType<typeof fixture>>,
  req: DotsDispatchRequest,
) {
  const proposal = req.proposal as DotsPageProposal;
  return {
    operationId: req.identity.operation_id,
    expectedGeneration: f.bound('conversation', f.auth, 'write').scope
      .authorityRevision,
    spaceId: f.spaceId,
    pageId: proposal.page_id,
    expectedRevision: 0,
    title: proposal.document.title,
    content: proposal.document.content,
    parentId: null,
    archived: false,
  };
}
function review(request: DotsApprovalRequest): RuntimeApprovalGetResult {
  return {
    approval: {
      approval_id: request.approval_id,
      run_id: 'run',
      approval_digest: request.approval_digest,
      action_digest: request.action_digest,
      status: 'pending',
      expired: false,
      expires_at: request.expires_at,
    },
    detail: {
      reviewable: true,
      review: { action: { operation_class: 'dots_page_publish' } },
    },
  } as RuntimeApprovalGetResult;
}
function approval(): DotsApprovalRequest {
  return {
    session_id: 'live-a',
    authority: {
      principal_id: 'principal',
      profile_id: 'profile',
      agent_id: 'agent',
      runtime_session_id: 'conversation',
      run_id: 'run',
      policy_digest: 'a'.repeat(64),
      generation: 2,
    },
    approval_id: 'native-review',
    approval_digest: 'd'.repeat(64),
    action_digest: 'c'.repeat(64),
    expires_at: Date.now() / 1000 + 60,
  };
}

test('concurrent native reads singleflight claimed-generation evidence across an old/new run boundary', async () => {
  const f = await fixture(),
    page = f.workspace.pages.create(f.spaceId, {
      title: 'Read',
      content: 'source',
    }),
    release = gate<unknown>();
  f.replies.set('runtime.events.since', () => release.promise);
  const request = {
    session_id: 'live-a',
    authority: approval().authority,
    scope: {
      store_id: 'pages',
      project_id: 'project',
      space_id: f.spaceId,
      page_id: page.id,
      expected_grant_revision: 1,
      version: null,
    },
    deadline_at: Date.now() / 1000 + 60,
  };
  const first = f.handler('dots.page.read', request),
    second = f.handler('dots.page.read', request);
  release.resolve({
    status: 'ok',
    events: [
      {
        type: 'command.completed',
        session_id: 'conversation',
        run_id: 'older',
        generation: 1,
      },
      {
        type: 'command.claimed',
        session_id: 'conversation',
        run_id: 'run',
        generation: 2,
      },
    ],
    last_cursor: 'epoch:2',
    has_more: false,
    snapshot: null,
  });
  expect(await Promise.all([first, second])).toHaveLength(2);
  expect(
    f.calls.filter((call) => call.method === 'runtime.events.since'),
  ).toHaveLength(1);
});

test('same-service reconnect replaces obsolete native scope context and can read on the new peer', async () => {
  const f = await fixture(),
    page = f.workspace.pages.create(f.spaceId, { title: 'Read' });
  expect(f.service.context('conversation')).toContain('nativePages');
  await f.reconnect();
  expect(f.service.context('conversation')).toContain('nativePages');
  const result = await f.handler('dots.page.read', {
    session_id: 'live-b',
    authority: approval().authority,
    scope: {
      store_id: 'pages',
      project_id: 'project',
      space_id: f.spaceId,
      page_id: page.id,
      expected_grant_revision: 1,
      version: null,
    },
    deadline_at: Date.now() / 1000 + 60,
  });
  expect(result).toMatchObject({ version: 1 });
  await expect(
    f.handler(
      'dots.page.read',
      { session_id: 'live-a', authority: approval().authority },
      new AbortController().signal,
    ),
  ).rejects.toThrow(/registered session/);
});

test('withdrawal during producer proof prevents native dispatch; archived source fences another target', async () => {
  const f = await fixture(),
    req = dispatch(f.spaceId),
    released = gate<unknown>();
  f.replies.set('runtime.effect.get', () => released.promise);
  const controller = new AbortController(),
    pending = f.handler('dots.effect.dispatch', req, controller.signal);
  for (
    let n = 0;
    n < 20 && !f.calls.some((c) => c.method === 'runtime.effect.get');
    n++
  )
    await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  released.resolve(effectProof(req));
  await expect(pending).rejects.toThrow(/expired/);
  expect(f.workspace.pages.list(f.spaceId)).toHaveLength(0);
  const other = dispatch(f.spaceId),
    heldProof = gate<unknown>();
  f.replies.set('runtime.effect.get', () => heldProof.promise);
  const held = f.handler('dots.effect.dispatch', other);
  for (
    let n = 0;
    n < 20 &&
    f.calls.filter((call) => call.method === 'runtime.effect.get').length < 2;
    n++
  )
    await new Promise((resolve) => setTimeout(resolve, 0));
  f.archiveSource();
  heldProof.resolve(effectProof(other));
  const denied = await held;
  expect(denied).toMatchObject({
    state: 'not_applied',
    reason: 'grant_revoked',
  });
  expect(f.workspace.pages.list(f.spaceId)).toHaveLength(0);
});

test.each(['owner', 'project'])(
  'prepare retains producer receipt but never returns it after %s authority is revoked',
  async (kind) => {
    const f = await fixture(),
      req = dispatch(f.spaceId),
      released = gate<unknown>();
    f.replies.set('runtime.dots.page.prepare', () => released.promise);
    const pending = f.service.prepare('conversation', draft(f, req), f.auth);
    for (
      let n = 0;
      n < 20 && !f.calls.some((c) => c.method === 'runtime.dots.page.prepare');
      n++
    )
      await new Promise((resolve) => setTimeout(resolve, 0));
    if (kind === 'owner') f.revoke();
    else f.workspace.runtimeBindings.revoke('project', f.spaceId, 1);
    released.resolve({
      command_id: req.identity.operation_id,
      operation_id: req.identity.operation_id,
      run_id: 'run',
      action_digest: req.identity.action_digest,
      input_digest: req.identity.input_digest,
      content_sha256: req.identity.content_sha256,
      approval_id: 'manual-review',
      approval_digest: 'd'.repeat(64),
      expires_at: Date.now() / 1000 + 60,
    });
    await expect(pending).rejects.toThrow(/revoked|authority changed/);
    f.restore();
    expect(f.service.list('conversation', f.auth).saves[0].state).toBe(
      'prepared',
    );
  },
);

test('lost publication recovery scopes its scan by actual run despite over 200 older effects', async () => {
  const f = await fixture(),
    req = dispatch(f.spaceId),
    proposal = req.proposal as DotsPageProposal;
  await f.service.prepare('conversation', draft(f, req), f.auth);
  f.replies.set('runtime.dots.page.publish', () => {
    throw new Error('response lost before BFF receipt');
  });
  await f.service.publish(
    'conversation',
    req.identity.operation_id,
    { approvalId: 'manual-review', approvalDigest: 'd'.repeat(64) },
    f.auth,
  );
  const receipt = f.service.effects.dispatch(req, f.peer());
  const result = {
    effect_id: req.identity.effect_id,
    operation_id: req.identity.operation_id,
    state: 'confirmed',
    receipt,
    replay_permitted: false,
  };
  f.replies.set('runtime.effect.get', () => effectProof(req));
  f.replies.set('runtime.dots.effect.reconcile', () => result);
  f.replies.set('runtime.effects.list', (params) => ({
    effects:
      params.run_id === 'run'
        ? [effectProof(req).effect]
        : Array.from({ length: 200 }, (_, index) => ({
            ...effectProof(req).effect,
            operation_id: `older-${index}`,
            run_id: `old-run-${index}`,
          })),
    truncated: params.run_id !== 'run',
  }));
  // Remove neither committed native bytes nor receipts: direct native mapping is
  // authoritative and avoids the unrelated-effect prefix completely.
  const recovered = await f.service.inspect(
    'conversation',
    req.identity.operation_id,
    f.auth,
  );
  expect(recovered.state).toBe('confirmed');
  expect(f.workspace.pages.get(f.spaceId, proposal.page_id).revision).toBe(1);
  expect(
    f.calls.filter((call) => call.method === 'runtime.effects.list'),
  ).toHaveLength(0);
  expect(
    f.calls.filter((call) => call.method === 'runtime.effect.get'),
  ).toHaveLength(1);
});

test('a pending native approval cannot fall through generic decision before proof or after withdrawal', async () => {
  const f = await fixture(),
    request = approval(),
    read = review(request),
    controller = new AbortController();
  f.replies.set('runtime.approval.get', () => read);
  expect(f.service.decisionUnavailableReason('conversation', read)).toMatch(
    /callback ended/,
  );
  const pending = f.handler('dots.approval', request, controller.signal);
  for (
    let n = 0;
    n < 30 && f.service.decisionUnavailableReason('conversation', read);
    n++
  )
    await new Promise((resolve) => setTimeout(resolve, 0));
  expect(f.service.decisionUnavailableReason('conversation', read)).toBeNull();
  controller.abort();
  await expect(pending).rejects.toThrow(/callback ended/);
  expect(f.service.decisionUnavailableReason('conversation', read)).toMatch(
    /callback ended/,
  );
  let sent = false;
  await expect(
    f.service.decideNative(
      f.bound('conversation', f.auth, 'write'),
      {
        approval_id: request.approval_id,
        approval_digest: request.approval_digest,
        choice: 'once',
      },
      f.auth,
      () => {
        sent = true;
      },
    ),
  ).rejects.toThrow(/callback ended/);
  expect(sent).toBe(false);
  expect(
    f.calls.some((call) => call.method === 'runtime.approval.resolve'),
  ).toBe(false);
  expect(f.workspace.pages.list(f.spaceId)).toHaveLength(0);
});

test('fallback recovery filters the real run instead of declaring absence after 200 unrelated effects', async () => {
  const f = await fixture(),
    req = dispatch(f.spaceId);
  await f.service.prepare('conversation', draft(f, req), f.auth);
  f.replies.set('runtime.dots.page.publish', () => {
    throw new Error('producer response lost');
  });
  await f.service.publish(
    'conversation',
    req.identity.operation_id,
    { approvalId: 'manual-review', approvalDigest: 'd'.repeat(64) },
    f.auth,
  );
  f.replies.set('runtime.effects.list', (params) => ({
    effects:
      params.run_id === 'run'
        ? [effectProof(req).effect]
        : Array.from({ length: 200 }, (_, index) => ({
            ...effectProof(req).effect,
            operation_id: `older-${index}`,
            run_id: 'earlier',
          })),
    truncated: params.run_id !== 'run',
  }));
  f.replies.set('runtime.dots.effect.reconcile', () => ({
    effect_id: req.identity.effect_id,
    operation_id: req.identity.operation_id,
    state: 'reconciliation_required',
    receipt: null,
    replay_permitted: false,
  }));
  const found = await f.service.inspect(
    'conversation',
    req.identity.operation_id,
    f.auth,
  );
  expect(found.state).toBe('reconciliation_required');
  expect(found.result?.effect_id).toBe(req.identity.effect_id);
  expect(
    f.calls.find((call) => call.method === 'runtime.effects.list')?.params
      .run_id,
  ).toBe('run');
  expect(
    f.calls.filter((call) => call.method === 'runtime.dots.page.publish'),
  ).toHaveLength(1);
  expect(f.workspace.pages.list(f.spaceId)).toHaveLength(0);
});

test('native context is globally byte-bounded and retains the selected page beyond the first thirty', async () => {
  const f = await fixture();
  let selected = '';
  for (let n = 0; n < 150; n++)
    selected = f.workspace.pages.create(f.spaceId, {
      title: `${n} ` + '🦊'.repeat(70),
    }).id;
  f.selectPage(selected);
  const bytes = f.service.context('conversation'),
    context = JSON.parse(bytes);
  expect(Buffer.byteLength(bytes, 'utf8')).toBeLessThanOrEqual(8192);
  expect(context.truncated).toBe(true);
  expect(context.nativePages[0]).toMatchObject({
    space_id: f.spaceId,
    project_id: 'project',
    store_id: 'pages',
  });
  expect(context.nativePages[0].pages[0].page_id).toBe(selected);
});
