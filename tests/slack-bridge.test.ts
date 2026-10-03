import { test, expect } from 'vitest';
import { BE06_PRODUCER_COMMIT } from '../src/server/runtime/be06-service.js';
import { be06Methods } from '../src/server/runtime/be06-wire.js';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceStore } from '../src/server/workspace.js';
import { SelfHostedPlatform } from '../src/server/self-hosted-platform.js';
import type { ConversationTransport } from '../src/server/runtime/stdio.js';
import { CommandServiceSlackBridge } from '../src/server/runtime/slack-bridge.js';
import { canonicalCommand } from '../src/server/runtime/command-ledger.js';
import { intentDigest } from '../src/server/runtime/conversation-ledger.js';
import type { CommandIntent } from '../src/shared/runtime/contracts.js';
import {
  type SlackConfig,
  type EventRecord,
  type ThreadRecord,
} from '../src/server/runtime/slack-types.js';
const fixture = JSON.parse(
  readFileSync(
    new URL('./fixtures/runtime/producer-baseline.json', import.meta.url),
    'utf8',
  ),
);

test('real SelfHostedPlatform bridge uses canonical creation and the SAME durable CommandService for concurrent web and Slack commands', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'slack-command-bridge-'));
  const database = join(directory, 'workspace.sqlite');
  const workspace = new WorkspaceStore(database, 'owner');
  const dotId = workspace.dots()[0].id;
  const identity = {
    principal_id: 'principal',
    profile_id: 'profile',
    agent_id: 'primary',
    policy_digest: 'a'.repeat(64),
    config_digest: 'b'.repeat(64),
  };
  const config: SlackConfig = {
    enabled: false,
    authority: 'dots_signed_events',
    ownerId: 'owner',
    dotId,
    teamId: 'TTEST',
    appId: 'ATEST',
    botUserId: 'UBOT',
    allowedChannelIds: ['CTEST'],
    allowedHumanUserIds: ['UHUMAN'],
    appOrigin: 'https://dots.example.test',
    replyAuthority: {
      ownerId: 'owner',
      grantId: 'synthetic-owner-reply-grant',
      expiresAt: 4102444800000,
      sourcePairs: [{ channelId: 'CTEST', humanUserId: 'UHUMAN' }],
      dataScope: 'primary_context_original_command_results',
      deliveryScope: 'original_slack_thread',
      runtimeIdentity: {
        principal_id: 'principal',
        profile_id: 'profile',
        agent_id: 'primary',
        policy_digest: 'a'.repeat(64),
        config_digest: 'b'.repeat(64),
      },
      projectIds: [],
    },
    qualification: null,
  };
  const receipts = new Map<string, Record<string, unknown>>();
  const sent: { session: string; operation: string }[] = [];
  let creates = 0;
  const producer = {
    config: {
      ownerId: 'owner',
      dotId,
      gatewayId: 'gateway',
      identity,
      home: directory,
    },
    be06Qualification: {
      producerCommit: BE06_PRODUCER_COMMIT,
      methods: be06Methods,
      specialistSessions: true,
    },
    connected: true,
    epoch: 1,
    start: async () => ({ identity }),
    stop: async () => {},
    call: async (method: string, params: Record<string, unknown>) => {
      if (method === 'runtime.agent.session.get')
        return {
          agent_id: 'primary',
          role: 'primary',
          memory_backend: 'personal_mcp',
          startup_frozen: true,
          activation: 'next_session',
          authority_current: true,
          archived: false,
        };
      if (method === 'runtime.agent.get')
        return {
          agent: {
            agent_id: 'primary',
            role: 'primary',
            memory_backend: 'personal_mcp',
            archived: false,
            active_session_revision_revoked: false,
            config: { project_grants: [] },
          },
        };
      if (method === 'runtime.conversation.create') {
        creates++;
        return {
          conversation: {
            conversation_id: 'canonical',
            agent_id: 'primary',
            title: 'Slack conversation',
            created_at: 100,
            revision: 1,
            archived: false,
          },
        };
      }
      if (method === 'runtime.conversation.bind')
        return {
          conversation: { conversation_id: 'canonical', agent_id: 'primary' },
          session_id: 'live-canonical',
          readiness: 'ready',
        };
      if (method === 'runtime.capabilities')
        return {
          ...fixture.fixtures.unconfiguredCapabilities.response.result,
          provider: { durable_execution: true, execution_owner: 'hermes' },
          operations: [
            { operation: 'submit', accepts_commands: true, executes: true },
          ],
        };
      if (method === 'runtime.snapshot')
        return {
          ...fixture.fixtures.idleSnapshot.response.result,
          session_id: 'canonical',
        };
      if (method === 'runtime.command') {
        sent.push({
          session: String(params.session_id),
          operation: String(params.command_id),
        });
        const receipt = {
          schema_version: 1,
          command_id: params.command_id,
          status: 'accepted',
          durable_revision: sent.length,
          run_id: randomUUID(),
          conflict: null,
        };
        receipts.set(String(params.command_id), receipt);
        return receipt;
      }
      if (method === 'runtime.conversation.command.receipt')
        return {
          schema_version: 1,
          conversation_id: 'canonical',
          command_id: params.command_id,
          found: receipts.has(String(params.command_id)),
          receipt: receipts.get(String(params.command_id)) ?? null,
          status: 'accepted',
          durable_revision: sent.length,
          accepted_input: null,
          messages: [],
          messages_has_more: false,
          next_message_cursor: null,
        };
      throw new Error(`Unsupported synthetic RPC: ${method}`);
    },
  };
  const platform = new SelfHostedPlatform(
    workspace,
    database,
    producer as unknown as ConversationTransport,
  );
  let revoked = false;
  const bridge = new CommandServiceSlackBridge(platform, config, () => {
    if (revoked) throw new Error('Revoked test policy');
  });
  try {
    await platform.start();
    const thread: ThreadRecord = {
      threadKey: 'thread',
      teamId: 'TTEST',
      channelId: 'CTEST',
      threadTs: '1791048000.000001',
      createOperationId: randomUUID(),
      conversationId: null,
    };
    expect(await bridge.ensureConversation(thread)).toBe('canonical');
    expect(creates).toBe(1);
    const event: EventRecord = {
      eventId: 'EvONE',
      teamId: 'TTEST',
      channelId: 'CTEST',
      actorId: 'UHUMAN',
      messageTs: thread.threadTs,
      threadTs: thread.threadTs,
      text: 'from Slack',
      kind: 'app_mention',
      threadKey: 'thread',
      operationId: randomUUID(),
      conversationId: 'canonical',
      sequence: 1,
      state: 'dispatching',
    };
    const web: CommandIntent = {
      operation: 'submit',
      conversationId: 'canonical',
      text: 'from web',
      sourceUrl: null,
    };
    const webId = randomUUID();
    const generation = workspace.runtimeBindings.resolveConversation(
      'canonical',
      'write',
    ).authorityRevision;
    const values = await Promise.all([
      bridge.admit(event),
      platform.commands!.admit(
        webId,
        intentDigest(canonicalCommand(web)),
        web,
        generation,
        () => {},
      ),
    ]);
    expect(values[0]).toBe('accepted');
    expect(sent).toHaveLength(2);
    expect(new Set(sent.map((row) => row.session))).toEqual(
      new Set(['live-canonical']),
    );
    expect(
      platform.commands!.ledger.get(event.operationId)?.conversationId,
    ).toBe('canonical');
    expect(platform.commands!.ledger.get(webId)?.conversationId).toBe(
      'canonical',
    );
    expect(await bridge.admit(event)).toBe('accepted');
    expect(sent).toHaveLength(2);
    expect(await bridge.inspect({ ...event, operationId: randomUUID() })).toBe(
      'unknown',
    );
    expect(sent).toHaveLength(2);
    revoked = true;
    expect(() => bridge.authorize('canonical')).toThrow('Revoked');
  } finally {
    await platform.stop();
    workspace.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
