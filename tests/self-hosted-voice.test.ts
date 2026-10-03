import { afterEach, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Hono } from 'hono';
import { WorkspaceStore } from '../src/server/workspace.js';
import { CommandService } from '../src/server/runtime/command-service.js';
import {
  ConversationError,
  intentDigest,
} from '../src/server/runtime/conversation-ledger.js';
import {
  RuntimeVoiceService,
  canonicalVoiceIntent,
  type VoiceHost,
} from '../src/server/runtime/voice-service.js';
import { OpenAIRealtimeMedia } from '../src/server/runtime/voice-media.js';
import { runtimeVoiceRoutes } from '../src/server/runtime/voice-routes.js';
import type { ConversationTransport } from '../src/server/runtime/stdio.js';
import type {
  CommandReceipt,
  RuntimeCommandReceiptResult,
} from '../src/shared/runtime/producer/wire.generated.js';
import {
  voiceAdmissionSchema,
  voiceCallSchema,
  computeReceiptSchema,
  canStartRealtime,
} from '../src/shared/runtime/voice.js';
import baseline from './fixtures/runtime/producer-baseline.json';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
const offer = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111';
function fixture(
  options: {
    enabled?: boolean;
    unknownMedia?: boolean;
    unknownHangup?: boolean;
    maxCompute?: number;
    daily?: number;
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'dots-be09-'));
  const path = join(root, 'state.sqlite');
  const workspace = new WorkspaceStore(path, 'voice-owner');
  const dotId = workspace.dots()[0].id;
  workspace.runtimeBindings.bindAgent({
    dotId,
    gatewayId: 'gateway',
    principalId: 'principal',
    profileId: 'profile',
    agentId: 'primary',
    privilegeClass: 'primary',
  });
  workspace.runtimeBindings.bindConversation({
    conversationId: 'conversation',
    dotId,
    spaceId: null,
    durableSessionId: 'conversation',
    liveSessionId: null,
    liveGeneration: 0,
  });
  const receipts = new Map<string, RuntimeCommandReceiptResult>();
  const dispatches: Record<string, unknown>[] = [];
  let loseCommand = false;
  const producer = {
    config: { home: root, identity: {}, providerEnvironment: {} },
    connected: true,
    epoch: 1,
    call: async (method: string, params: Record<string, unknown>) => {
      if (method === 'runtime.conversation.bind')
        return {
          conversation: {
            conversation_id: params.conversation_id,
            agent_id: 'primary',
          },
          session_id: 'live-conversation',
          readiness: 'ready',
        };
      if (method === 'runtime.capabilities')
        return {
          ...baseline.fixtures.unconfiguredCapabilities.response.result,
          provider: { durable_execution: true, execution_owner: 'hermes' },
          operations: [
            { operation: 'submit', accepts_commands: true, executes: true },
          ],
        };
      if (method === 'runtime.snapshot')
        return {
          ...baseline.fixtures.idleSnapshot.response.result,
          session_id: 'conversation',
        };
      if (method === 'runtime.command') {
        dispatches.push(params);
        const receipt: CommandReceipt = {
          schema_version: 1,
          command_id: String(params.command_id),
          status: 'accepted',
          durable_revision: 1,
          run_id: 'canonical-run',
          conflict: null,
        };
        receipts.set(receipt.command_id, {
          schema_version: 1,
          command_id: receipt.command_id,
          found: true,
          receipt,
          status: 'accepted',
          durable_revision: 1,
          accepted_input: { state: 'accepted', message_id: null },
          messages: [],
          messages_has_more: false,
          next_message_cursor: null,
        });
        if (loseCommand) throw new Error('Synthetic lost response');
        return receipt;
      }
      if (method === 'runtime.conversation.command.receipt')
        return (
          receipts.get(String(params.command_id)) ?? {
            schema_version: 1,
            command_id: params.command_id,
            found: false,
            receipt: null,
            status: null,
            durable_revision: 0,
            accepted_input: null,
            messages: [],
            messages_has_more: false,
            next_message_cursor: null,
          }
        );
      throw new Error(`Unexpected RPC: ${method}`);
    },
  };
  const authorize: VoiceHost['authorize'] = async (id, auth, access) => {
    auth();
    return workspace.runtimeBindings.resolveConversation(id, access);
  };
  const commands = new CommandService(
    workspace,
    path,
    producer as unknown as ConversationTransport,
    (id, auth, access = 'read') => authorize(id, auth, access),
    (scope, auth, access) => {
      auth();
      workspace.runtimeBindings.assertCurrent(scope, access);
    },
  );
  const fetcher = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith('/hangup')) {
      if (options.unknownHangup)
        throw new Error('Synthetic lost hangup response');
      return new Response(null, { status: 200 });
    }
    if (options.unknownMedia)
      throw new Error('Synthetic lost admission response');
    return new Response(offer, {
      headers: { location: '/v1/realtime/calls/rtc_fixture' },
    });
  });
  const media = new OpenAIRealtimeMedia(
    {
      enabled: options.enabled ?? true,
      qualified: true,
      apiKey: 'synthetic-fixture-key',
      model: 'synthetic-realtime-model',
      maxCallSeconds: 60,
      maxDailySeconds: options.daily ?? 600,
      maxCompute: options.maxCompute ?? 6,
    },
    fetcher,
  );
  let now = 1_000_000;
  const host: VoiceHost = {
    commands,
    authorize,
    history: async () => 'Prior untrusted context',
    output: async () => 'Canonical committed result',
  };
  let voice = new RuntimeVoiceService(
    'voice-owner',
    path,
    host,
    media,
    () => now,
  );
  const auth = () => {};
  const scope = () =>
    workspace.runtimeBindings.resolveConversation('conversation');
  const gen = () => scope().authorityRevision;
  const beginInput = () => ({
    operationId: randomUUID(),
    threadId: 'conversation',
    sdp: offer,
    expectedGeneration: gen(),
  });
  const controlInput = (
    callId: string,
    action: 'media_connected' | 'end_media' | 'detach_compute',
    payload: Record<string, unknown> = {},
  ) => ({
    operationId: randomUUID(),
    intentDigest: intentDigest(
      canonicalVoiceIntent({
        path: `/runtime/voice/calls/${callId}/control`,
        action,
        payload,
        expectedRevision: 0,
      }),
    ),
    action,
    payload,
    expectedRevision: 0 as const,
    expectedGeneration: gen(),
  });
  const computeInput = (request = 'Research the synthetic subject') => ({
    operationId: randomUUID(),
    toolCallId: 'tool-' + randomUUID(),
    request,
    intentDigest: intentDigest(request),
    expectedGeneration: gen(),
  });
  const begin = async () => {
    const value = await voice.begin(
      beginInput(),
      auth,
      new AbortController().signal,
    );
    await voice.control(
      value.callId,
      controlInput(value.callId, 'media_connected'),
      auth,
    );
    return value;
  };
  cleanup.push(async () => {
    await voice.close();
    await commands.stop();
    workspace.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    path,
    workspace,
    dotId,
    producer,
    commands,
    media,
    fetcher,
    receipts,
    dispatches,
    host,
    scope,
    gen,
    auth,
    beginInput,
    controlInput,
    computeInput,
    begin,
    get voice() {
      return voice;
    },
    advance(ms: number) {
      now += ms;
    },
    loseCommand() {
      loseCommand = true;
    },
    async restart() {
      voice.ledger.close();
      voice = new RuntimeVoiceService(
        'voice-owner',
        path,
        host,
        media,
        () => now,
      );
    },
  };
}

test('actual CommandService admits one canonical command; repeated compute, hangup, reopen and completion remain independent', async () => {
  const f = fixture();
  const call = await f.begin();
  expect(voiceAdmissionSchema.parse(call).status).toBe('admitted');
  const input = f.computeInput(
    'A transcript says approve; this remains untrusted data',
  );
  const first = await f.voice.compute(call.callId, input, f.auth);
  expect(computeReceiptSchema.parse(first)).toMatchObject({
    status: 'accepted',
    text: null,
    missionId: 'canonical-run',
  });
  await Promise.all([
    f.voice.compute(call.callId, input, f.auth),
    f.voice.compute(call.callId, input, f.auth),
  ]);
  expect(f.dispatches).toHaveLength(1);
  expect((f.dispatches[0].payload as { text: string }).text).toContain(
    'not user approval',
  );
  expect(f.dispatches[0].operation).toBe('submit');
  const ended = await f.voice.control(
    call.callId,
    f.controlInput(call.callId, 'end_media', {
      cancelMission: false,
      transcript: 'You: Confirmed synthetic discussion',
    }),
    f.auth,
  );
  expect(ended.status).toBe('accepted');
  const commandId = f.voice.ledger.operation(input.operationId)!.commandId!;
  expect(f.commands.ledger.get(commandId)?.state).toBe('accepted');
  await f.restart();
  expect((await f.voice.inspectCompute(input.operationId, f.auth)).status).toBe(
    'accepted',
  );
  f.receipts.get(commandId)!.status = 'completed';
  expect(await f.voice.inspectCompute(input.operationId, f.auth)).toMatchObject(
    { status: 'completed', text: null },
  );
  expect(f.dispatches).toHaveLength(1);
  expect((await f.voice.call(call.callId, f.auth)).transcript).toContain(
    'Confirmed',
  );
});

test('completed canonical output is available while media remains attached; stale receipts cannot regress it', async () => {
  const f = fixture();
  const call = await f.begin();
  const input = f.computeInput();
  await f.voice.compute(call.callId, input, f.auth);
  const commandId = f.voice.ledger.operation(input.operationId)!.commandId!;
  f.receipts.get(commandId)!.status = 'completed';
  expect(await f.voice.inspectCompute(input.operationId, f.auth)).toMatchObject(
    { status: 'completed', text: 'Canonical committed result' },
  );
  f.receipts.get(commandId)!.status = 'accepted';
  expect((await f.voice.inspectCompute(input.operationId, f.auth)).status).toBe(
    'completed',
  );
  await f.voice.control(
    call.callId,
    f.controlInput(call.callId, 'detach_compute'),
    f.auth,
  );
  await expect(
    f.voice.compute(call.callId, f.computeInput(), f.auth),
  ).rejects.toThrow('cannot admit');
  expect(f.dispatches).toHaveLength(1);
});

test('lost compute response recovers by inspecting the existing canonical command, never redispatch', async () => {
  const f = fixture();
  const call = await f.begin();
  const input = f.computeInput();
  f.loseCommand();
  expect((await f.voice.compute(call.callId, input, f.auth)).status).toBe(
    'unknown',
  );
  await f.restart();
  expect((await f.voice.compute(call.callId, input, f.auth)).status).toBe(
    'accepted',
  );
  expect(f.dispatches).toHaveLength(1);
  await expect(
    f.voice.compute(
      call.callId,
      { ...input, operationId: randomUUID() },
      f.auth,
    ),
  ).rejects.toThrow('already belongs');
  await expect(
    f.voice.compute(
      call.callId,
      { ...input, request: 'changed', intentDigest: intentDigest('changed') },
      f.auth,
    ),
  ).rejects.toThrow('immutable');
});

test('unknown media admission survives reopen, blocks another call and cannot be replayed via POST or GET', async () => {
  const f = fixture({ unknownMedia: true });
  const input = f.beginInput();
  const admitted = await f.voice.begin(
    input,
    f.auth,
    new AbortController().signal,
  );
  expect(admitted.status).toBe('unknown');
  await f.restart();
  expect(
    (await f.voice.begin(input, f.auth, new AbortController().signal)).status,
  ).toBe('unknown');
  expect(
    (await f.voice.inspectAdmission(input.operationId, f.auth)).status,
  ).toBe('unknown');
  await expect(
    f.voice.begin(f.beginInput(), f.auth, new AbortController().signal),
  ).rejects.toThrow('reconcile');
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(
    (
      await f.voice.control(
        admitted.callId,
        f.controlInput(admitted.callId, 'end_media', { cancelMission: false }),
        f.auth,
      )
    ).status,
  ).toBe('outcome_unknown');
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});

test('unknown remote hangup remains no-replay across new control IDs, expiry and restart; no command cancel is dispatched', async () => {
  const f = fixture({ unknownHangup: true });
  const call = await f.begin();
  const input = f.computeInput();
  await f.voice.compute(call.callId, input, f.auth);
  const control = f.controlInput(call.callId, 'end_media', {
    cancelMission: false,
  });
  expect((await f.voice.control(call.callId, control, f.auth)).status).toBe(
    'outcome_unknown',
  );
  await f.restart();
  await f.voice.control(call.callId, control, f.auth);
  await f.voice.control(
    call.callId,
    f.controlInput(call.callId, 'end_media', { cancelMission: false }),
    f.auth,
  );
  f.advance(120000);
  await f.voice.sweep();
  expect(
    f.fetcher.mock.calls.filter(([url]) => String(url).endsWith('/hangup')),
  ).toHaveLength(1);
  expect(f.dispatches.map((item) => item.operation)).toEqual(['submit']);
});

test('late/out-of-order transcript event receipts are immutable, sorted and deduplicated without another model turn', async () => {
  const f = fixture();
  const call = await f.begin();
  await f.voice.control(
    call.callId,
    f.controlInput(call.callId, 'end_media', { cancelMission: false }),
    f.auth,
  );
  const endedAt = (await f.voice.call(call.callId, f.auth)).endedAt;
  const second = {
    eventId: 'provider-event-2',
    sequence: 2,
    speaker: 'assistant',
    text: 'Second',
  };
  await f.voice.transcript(
    call.callId,
    { expectedGeneration: f.gen(), segments: [second] },
    f.auth,
  );
  const row = await f.voice.transcript(
    call.callId,
    {
      expectedGeneration: f.gen(),
      segments: [
        {
          eventId: 'provider-event-1',
          sequence: 1,
          speaker: 'owner',
          text: 'First',
        },
        second,
      ],
    },
    f.auth,
  );
  expect(row.transcript).toBe('You: First\nMedia provider: Second');
  expect(row.endedAt).toBe(endedAt);
  await expect(
    f.voice.transcript(
      call.callId,
      {
        expectedGeneration: f.gen(),
        segments: [{ ...second, text: 'Changed' }],
      },
      f.auth,
    ),
  ).rejects.toThrow('immutable');
  await expect(
    f.voice.transcript(
      call.callId,
      {
        expectedGeneration: f.gen(),
        segments: [{ ...second, eventId: 'other-id' }],
      },
      f.auth,
    ),
  ).rejects.toThrow('sequence');
  expect(f.dispatches).toHaveLength(0);
});

test('duration, compute, unavailable-provider and paused/foreign-owner gates fail honestly before new effects', async () => {
  const missing = fixture({ enabled: false });
  expect(
    canStartRealtime(
      missing.voice.profile(missing.scope()),
      missing.voice.profile(missing.scope()).scope,
    ),
  ).toBe(false);
  expect(
    (
      await missing.voice.begin(
        missing.beginInput(),
        missing.auth,
        new AbortController().signal,
      )
    ).status,
  ).toBe('rejected');
  expect(missing.fetcher).not.toHaveBeenCalled();
  const f = fixture({ maxCompute: 1, daily: 60 });
  const call = await f.begin();
  await f.voice.compute(call.callId, f.computeInput(), f.auth);
  await expect(
    f.voice.compute(call.callId, f.computeInput(), f.auth),
  ).rejects.toThrow('budget');
  await expect(
    f.voice.compute(call.callId, f.computeInput(), () => {
      throw new ConversationError('Owner session expired.', 403);
    }),
  ).rejects.toThrow('expired');
  await expect(
    f.voice.control(
      call.callId,
      f.controlInput(call.callId, 'end_media', { cancelMission: true }),
      f.auth,
    ),
  ).rejects.toThrow();
  f.advance(60001);
  await f.voice.sweep();
  expect((await f.voice.call(call.callId, f.auth)).status).toBe('ended');
  await expect(
    f.voice.begin(f.beginInput(), f.auth, new AbortController().signal),
  ).rejects.toThrow('budget');
  expect(f.dispatches).toHaveLength(1);
});

test('global operation namespace collisions and scope changes cannot become media/command authority', async () => {
  const f = fixture();
  const input = f.beginInput();
  const call = await f.voice.begin(input, f.auth, new AbortController().signal);
  await f.voice.control(
    call.callId,
    f.controlInput(call.callId, 'media_connected'),
    f.auth,
  );
  await expect(
    f.voice.compute(
      call.callId,
      { ...f.computeInput(), operationId: input.operationId },
      f.auth,
    ),
  ).rejects.toThrow('immutable');
  f.workspace.runtimeBindings.revoke(
    'conversation',
    'conversation',
    f.scope().revision,
  );
  await expect(f.voice.call(call.callId, f.auth)).rejects.toThrow(
    'access denied',
  );
  expect(f.dispatches).toHaveLength(0);
});

test('scoped HTTP routes match current FE admission/compute/history contracts', async () => {
  const f = fixture();
  const app = new Hono();
  app.route(
    '/api',
    runtimeVoiceRoutes(
      f.voice,
      () => f.auth,
      async () => f.scope(),
    ),
  );
  const profile = await app.request('/api/runtime/voice');
  expect(profile.status).toBe(200);
  const admission = await app.request('/api/runtime/voice/calls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(f.beginInput()),
  });
  const call = voiceAdmissionSchema.parse(await admission.json());
  expect(
    (await app.request(`/api/runtime/voice/operations/${call.operationId}`))
      .status,
  ).toBe(200);
  voiceCallSchema.parse(
    await (await app.request(`/api/runtime/voice/calls/${call.callId}`)).json(),
  );
  expect(
    (
      await (
        await app.request('/api/runtime/conversations/conversation/calls')
      ).json()
    ).calls,
  ).toHaveLength(1);
});

test('crash before canonical admission retains unknown immutable compute without inventing a retry', async () => {
  const f = fixture();
  const call = await f.begin();
  const input = f.computeInput();
  const row = f.voice.ledger.call(call.callId);
  const bytes = canonicalVoiceIntent({
    callId: call.callId,
    toolCallId: input.toolCallId,
    request: input.request,
  });
  f.voice.ledger.compute(
    {
      operationId: input.operationId,
      callId: call.callId,
      family: 'compute',
      digest: intentDigest(bytes),
      authority: row.authority,
      intent: bytes,
      commandId: randomUUID(),
    },
    input.toolCallId,
    6,
  );
  await f.restart();
  expect((await f.voice.compute(call.callId, input, f.auth)).status).toBe(
    'unknown',
  );
  expect((await f.voice.inspectCompute(input.operationId, f.auth)).status).toBe(
    'unknown',
  );
  expect(f.dispatches).toHaveLength(0);
});

test('detach suppresses previously completed speech output without deleting the canonical result or cancelling its mission', async () => {
  const f = fixture();
  const call = await f.begin();
  const input = f.computeInput();
  await f.voice.compute(call.callId, input, f.auth);
  const commandId = f.voice.ledger.operation(input.operationId)!.commandId!;
  f.receipts.get(commandId)!.status = 'completed';
  expect((await f.voice.inspectCompute(input.operationId, f.auth)).text).toBe(
    'Canonical committed result',
  );
  await f.voice.control(
    call.callId,
    f.controlInput(call.callId, 'detach_compute'),
    f.auth,
  );
  expect(await f.voice.inspectCompute(input.operationId, f.auth)).toMatchObject(
    { status: 'completed', text: null },
  );
  expect(f.dispatches.map((item) => item.operation)).toEqual(['submit']);
});

test('revoked or cancelled pre-admission context never contacts the media provider', async () => {
  const f = fixture();
  const input = f.beginInput();
  f.host.history = async () => {
    throw new ConversationError('Revoked context.', 403);
  };
  expect(
    (await f.voice.begin(input, f.auth, new AbortController().signal)).status,
  ).toBe('rejected');
  expect(f.fetcher).not.toHaveBeenCalled();
  const second = fixture();
  const controller = new AbortController();
  controller.abort();
  expect(
    (
      await second.voice.begin(
        second.beginInput(),
        second.auth,
        controller.signal,
      )
    ).status,
  ).toBe('rejected');
  expect(second.fetcher).not.toHaveBeenCalled();
});

test('server-owned pause closes media only, blocks new compute and permits resume without cancelling accepted work', async () => {
  const f = fixture();
  const call = await f.begin();
  const input = f.computeInput();
  await f.voice.compute(call.callId, input, f.auth);
  await f.voice.setPaused(true);
  expect((await f.voice.call(call.callId, f.auth)).status).toBe('ended');
  expect((await f.voice.inspectCompute(input.operationId, f.auth)).status).toBe(
    'accepted',
  );
  await expect(
    f.voice.compute(call.callId, f.computeInput(), f.auth),
  ).rejects.toThrow('cannot admit');
  expect(
    (await f.voice.begin(f.beginInput(), f.auth, new AbortController().signal))
      .status,
  ).toBe('rejected');
  expect(f.dispatches.map((item) => item.operation)).toEqual(['submit']);
  await f.voice.setPaused(false);
  expect(
    (await f.voice.begin(f.beginInput(), f.auth, new AbortController().signal))
      .status,
  ).toBe('admitted');
});

test('hangup while compute authorization is pending prevents fresh canonical admission', async () => {
  const f = fixture();
  const call = await f.begin();
  const authorize = f.host.authorize;
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.host.authorize = async (id, auth, access) => {
    const scope = await authorize(id, auth, access);
    if (access === 'write') {
      entered();
      await gate;
    }
    return scope;
  };
  const compute = f.voice.compute(call.callId, f.computeInput(), f.auth);
  await waiting;
  await f.voice.control(
    call.callId,
    f.controlInput(call.callId, 'end_media', { cancelMission: false }),
    f.auth,
  );
  release();
  await expect(compute).rejects.toThrow('cannot admit');
  expect(f.dispatches).toHaveLength(0);
});

test('expiry suppresses cached completed speech even before the cleanup sweep', async () => {
  const f = fixture();
  const call = await f.begin();
  const input = f.computeInput();
  await f.voice.compute(call.callId, input, f.auth);
  const commandId = f.voice.ledger.operation(input.operationId)!.commandId!;
  f.receipts.get(commandId)!.status = 'completed';
  expect((await f.voice.inspectCompute(input.operationId, f.auth)).text).toBe(
    'Canonical committed result',
  );
  f.advance(60001);
  expect(await f.voice.inspectCompute(input.operationId, f.auth)).toMatchObject(
    { status: 'completed', text: null },
  );
  expect(f.dispatches).toHaveLength(1);
});

test.each(['failed', 'blocked', 'cancelled'] as const)(
  'canonical %s execution is terminal unsuccessful compute, never spoken success',
  async (state) => {
    const f = fixture();
    const call = await f.begin();
    const input = f.computeInput();
    await f.voice.compute(call.callId, input, f.auth);
    const commandId = f.voice.ledger.operation(input.operationId)!.commandId!;
    f.receipts.get(commandId)!.status = state;
    expect(
      await f.voice.inspectCompute(input.operationId, f.auth),
    ).toMatchObject({ status: 'rejected', text: null });
    expect(f.dispatches).toHaveLength(1);
  },
);
