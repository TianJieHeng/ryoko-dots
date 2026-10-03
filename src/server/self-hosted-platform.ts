import { PageRuntimeService } from './runtime/page-runtime-service.js';
import {
  contractVersion,
  setupSchema,
  historySchema,
  conversationSchema,
  conversationListSchema,
  type RuntimeScope,
  type RuntimeConversation,
  type RuntimeSetup,
} from '../shared/runtime/contracts.js';
import type {
  RuntimeConversation as ProducerConversation,
  RuntimeConversationHistoryResult,
} from '../shared/runtime/producer/wire.generated.js';
import { WorkspaceStore } from './workspace.js';
import { runtimeSetup } from './runtime/setup.js';
import type {
  VerifiedRuntimeScope,
  VerifiedConversationScope,
} from './runtime/bindings.js';
import {
  identityMatches,
  type ConversationTransport,
} from './runtime/stdio.js';
import {
  ConversationError,
  ConversationLedger,
  type Operation,
} from './runtime/conversation-ledger.js';
import { RuntimeDeliveryService } from './runtime/delivery-service.js';
import { RuntimeControlService } from './runtime/control-service.js';
import { CommandService } from './runtime/command-service.js';
import { RuntimeFailure } from './runtime/conversation-rpc.js';
export type Guard = () => void;
interface CreateIntent {
  dotId: string;
  title: string;
  pageId: string | null;
  spaceId: string | null;
}
export const browserScope = (scope: VerifiedRuntimeScope): RuntimeScope => ({
  owner: scope.ownerId,
  gateway: scope.gatewayId,
  agent: scope.agentId,
  project: scope.projectId,
  generation: scope.authorityRevision,
});
/** Self-hosted BFF. Intentionally imports no Intelligence, model loop or scheduler. */
export class SelfHostedPlatform {
  private starting?: Promise<void>;
  readonly ledger: ConversationLedger;
  readonly commands?: CommandService;
  readonly controls?: RuntimeControlService;
  readonly nativePages?: PageRuntimeService;
  readonly delivery?: RuntimeDeliveryService;
  private unsubscribeResults?: () => void;

  constructor(
    readonly workspace: WorkspaceStore,
    database: string,
    readonly transport?: ConversationTransport,
  ) {
    this.ledger = new ConversationLedger(database, workspace.ownerId);
    if (transport)
      this.commands = new CommandService(
        workspace,
        database,
        transport,
        (id, auth, access) => this.conversation(id, auth, access),
        (scope, auth, access) => this.guard(scope, auth, access),
        (id) => {
          const meta = this.ledger.metadata(id);
          const nativeContext = this.nativePages?.context(id) ?? '';
          if (!meta?.pageId) return nativeContext;
          const page = workspace.pages.get(meta.spaceId!, meta.pageId);
          return (
            nativeContext +
            '\n' +
            JSON.stringify({
              id: page.id,
              title: page.title.slice(0, 500),
              revision: page.revision,
              content: page.content.slice(0, 12000),
            })
          );
        },
        (intent) => {
          if (intent.operation === 'cancel') return;
          const meta = this.ledger.metadata(intent.conversationId);
          if (
            meta?.pageId &&
            meta.spaceId &&
            workspace.pages.get(meta.spaceId, meta.pageId).archived
          )
            throw new ConversationError(
              'Restore this archived page before starting agent work.',
              403,
            );
        },
      );
    if (transport && this.commands)
      this.nativePages = new PageRuntimeService(
        workspace,
        database,
        transport,
        (id, auth, access) => this.commands!.existingBound(id, auth, access),
        (bound, auth, access) =>
          this.commands!.assertBound(bound.scope, auth, access),
        (id) => {
          const meta = this.ledger.metadata(id);
          return (
            !meta?.pageId ||
            !meta.spaceId ||
            !workspace.pages.get(meta.spaceId, meta.pageId).archived
          );
        },
        (id) => {
          const meta = this.ledger.metadata(id);
          return meta?.pageId && meta.spaceId
            ? { pageId: meta.pageId, spaceId: meta.spaceId }
            : null;
        },
      );
    if (transport && this.commands)
      this.controls = new RuntimeControlService(
        workspace.ownerId,
        database,
        transport,
        async (id, auth, access) =>
          this.commands!.existingBound(id, auth, access),
        (scope, auth, access) =>
          this.commands!.assertBound(scope, auth, access),
        (bound, params, auth, markDispatched) =>
          this.nativePages!.decideNative(bound, params, auth, markDispatched),
        (id, review) => this.nativePages!.decisionUnavailableReason(id, review),
      );
    if (transport && this.commands) {
      this.delivery = new RuntimeDeliveryService(
        workspace.ownerId,
        database,
        transport,
        async (id, auth, access) =>
          this.commands!.existingBound(id, auth, access),
        (scope, auth, access) =>
          this.commands!.assertBound(scope, auth, access),
      );
      this.unsubscribeResults = transport.subscribeResultAvailable?.(
        (notice, epoch) => {
          this.delivery!.observeResultAvailable(notice, epoch);
        },
      );
    }
  }
  async start() {
    if (!this.transport) return;
    return (this.starting ??= (async () => {
      const config = this.transport!.config;
      if (
        config.ownerId !== this.workspace.ownerId ||
        !this.workspace.dot(config.dotId)
      )
        throw new ConversationError(
          'Configured runtime owner or Dot does not match this workspace.',
          403,
        );
      const proof = await this.transport!.start();
      if (!identityMatches(config.identity, proof.identity))
        throw new ConversationError(
          'Configured runtime identity mismatch.',
          403,
        );
      const binding = {
        dotId: config.dotId,
        gatewayId: config.gatewayId,
        principalId: proof.identity.principal_id,
        profileId: proof.identity.profile_id,
        agentId: proof.identity.agent_id,
        privilegeClass: 'primary' as const,
      };
      if (!this.workspace.runtimeBindings.hasAgent(config.dotId))
        this.workspace.runtimeBindings.bindAgent(binding);
      const current = this.workspace.runtimeBindings.resolveDot(config.dotId);
      for (const key of Object.keys(binding) as (keyof typeof binding)[])
        if (current[key] !== binding[key])
          throw new ConversationError(
            'Stored runtime identity does not match the verified producer.',
            403,
          );
      this.commands?.startRecovery();
    })().catch((error) => {
      this.starting = undefined;
      throw error;
    }));
  }
  async stop() {
    this.unsubscribeResults?.();
    this.delivery?.close();
    this.controls?.close();
    await this.commands?.stop();
    this.nativePages?.close();
    await this.transport?.stop();
    this.ledger.close();
  }
  async setup(dotId: string): Promise<RuntimeSetup> {
    if (!this.transport) return runtimeSetup();
    try {
      const verified = await this.scope(dotId);
      const ready = {
        state: 'ready' as const,
        reason: 'Verified single-owner canonical conversation stdio adapter.',
      };
      const base = runtimeSetup();
      return setupSchema.parse({
        ...base,
        scope: browserScope(verified),
        controlPlane: ready,
        binding: ready,
        compatibility: ready,
        qualified: true,
        features: {
          ...base.features,
          conversations: ready,
          artifacts: this.nativePages
            ? {
                state: 'ready',
                reason:
                  'Immutable owner-authorized native page versions with digest-verified downloads.',
              }
            : base.features.artifacts,
          missions: this.controls
            ? {
                state: 'ready',
                reason:
                  'Exact conversation-bound mission and owner/profile admission controls; connect before use.',
              }
            : base.features.missions,
          reviews: this.controls
            ? {
                state: 'ready',
                reason:
                  'Exact durable review detail and digest-bound resolve through an explicitly connected conversation.',
              }
            : base.features.reviews,
          commands: this.commands?.ready()
            ? {
                state: 'ready',
                reason:
                  'Bound agent has an executable durable provider adapter. Live model/service qualification remains separate.',
              }
            : {
                state: 'unconfigured',
                reason:
                  'Connect a conversation to verify its configured provider adapter before sending.',
              },
        },
      });
    } catch {
      return {
        ...runtimeSetup(),
        controlPlane: {
          state: 'disconnected',
          reason:
            'The configured producer is unavailable or its owner mapping did not verify.',
        },
      };
    }
  }
  async scope(dotId: string): Promise<VerifiedRuntimeScope> {
    await this.start();
    if (this.transport?.connected) await this.transport.start();
    if (
      !this.transport ||
      !this.transport.connected ||
      this.transport.config.dotId !== dotId
    )
      throw new ConversationError(
        'No verified runtime is configured for this Dot.',
        503,
      );
    return this.workspace.runtimeBindings.resolveDot(dotId);
  }
  private guard(
    scope: VerifiedRuntimeScope | VerifiedConversationScope,
    auth: Guard,
    access: 'read' | 'write' | 'download' = 'read',
  ) {
    auth();
    this.workspace.runtimeBindings.assertCurrent(scope, access);
    if ('conversationId' in scope) {
      const meta = this.ledger.metadata(scope.conversationId);
      if (
        meta?.spaceId &&
        (!this.workspace.canAccessSpace(scope.dotId, meta.spaceId) ||
          !this.workspace.pages.get(meta.spaceId, meta.pageId!))
      )
        throw new ConversationError('Page access was revoked.', 403);
    }
  }
  private map(
    raw: ProducerConversation,
    scope: VerifiedRuntimeScope,
    origin: 'web' | 'page' = 'web',
    spaceId: string | null = null,
    pageId: string | null = null,
  ): RuntimeConversation {
    if (raw.agent_id !== scope.agentId)
      throw new ConversationError(
        'Canonical conversation agent does not match this Dot.',
        403,
      );
    const prior = this.ledger.metadata(raw.conversation_id);
    if (prior && prior.dotId !== scope.dotId)
      throw new ConversationError('Conversation is bound to another Dot.', 403);
    const row = conversationSchema.parse({
      id: raw.conversation_id,
      dotId: scope.dotId,
      title: raw.title,
      createdAt: Math.floor(raw.created_at * 1000),
      lineageId: raw.conversation_id,
      revision: raw.revision,
      archived: raw.archived,
      origin: prior?.pageId ? 'page' : origin,
    });
    if (!this.workspace.runtimeBindings.hasConversation(row.id))
      this.workspace.runtimeBindings.bindConversation({
        conversationId: row.id,
        dotId: row.dotId,
        spaceId: null,
        durableSessionId: row.id,
        liveSessionId: null,
        liveGeneration: 0,
      });
    const mapped = this.workspace.runtimeBindings.resolveConversation(row.id);
    if (mapped.dotId !== scope.dotId || mapped.durableSessionId !== row.id)
      throw new ConversationError(
        'Canonical conversation mapping mismatch.',
        403,
      );
    // Old idempotency receipts never revert a later metadata revision.
    if (!prior || prior.conversation.revision <= row.revision) {
      if (mapped.archived !== row.archived)
        this.workspace.runtimeBindings.archiveConversation(
          row.id,
          row.archived,
          mapped.revision,
        );
    }
    const associated =
      prior && prior.conversation.revision > row.revision
        ? {
            ...prior.conversation,
            origin: pageId ? ('page' as const) : prior.conversation.origin,
          }
        : row;
    this.ledger.remember(
      associated,
      prior?.spaceId ?? spaceId,
      prior?.pageId ?? pageId,
    );

    return row;
  }
  private binding(scope: VerifiedRuntimeScope) {
    return JSON.stringify({
      scope,
      home: this.transport!.config.home,
      identity: this.transport!.config.identity,
    });
  }
  async create(operationId: string, input: CreateIntent, auth: Guard) {
    const scope = await this.scope(input.dotId);
    this.guard(scope, auth);
    if (
      input.pageId &&
      (!input.spaceId ||
        !this.workspace.canAccessSpace(input.dotId, input.spaceId))
    )
      throw new ConversationError(
        'This Dot cannot access the selected page.',
        403,
      );
    if (input.pageId) this.workspace.pages.get(input.spaceId!, input.pageId);
    const admitted = this.ledger.admit(
      {
        operationId,
        dotId: input.dotId,
        binding: this.binding(scope),
        kind: 'create',
        intent: JSON.stringify(input),
        producerKey: operationId,
      },
      input.pageId ?? undefined,
    );
    if (!admitted.fresh) return this.recover(operationId, auth);
    const effective = JSON.parse(
      this.ledger.pageKeyIntent(admitted.operation.producerKey) ??
        admitted.operation.intent,
    ) as CreateIntent;
    return this.mutate(
      admitted.operation,
      scope,
      auth,
      async () =>
        (
          await this.transport!.call('runtime.conversation.create', {
            schema_version: 1,
            idempotency_key: admitted.operation.producerKey,
            title: effective.title,
          })
        ).conversation,
      effective,
    );
  }
  private async mutate(
    operation: Operation,
    scope: VerifiedRuntimeScope,
    auth: Guard,
    send: () => Promise<ProducerConversation>,
    input?: CreateIntent,
  ) {
    try {
      this.guard(scope, auth);
      const raw = await send();
      this.guard(scope, auth);
      const row = this.map(
        raw,
        scope,
        input?.pageId ? 'page' : 'web',
        input?.spaceId ?? null,
        input?.pageId ?? null,
      );
      this.ledger.settle(operation.operationId, 'accepted', row);
      return {
        version: contractVersion,
        scope: browserScope(scope),
        conversation: row,
      };
    } catch (error) {
      this.ledger.settle(
        operation.operationId,
        error instanceof RuntimeFailure && error.kind === 'rejected'
          ? 'rejected'
          : 'outcome_unknown',
      );
      if (error instanceof RuntimeFailure && error.kind === 'rejected')
        throw new ConversationError(
          'Runtime rejected the mutation; its expected revision or intent may conflict.',
          409,
        );
      throw new ConversationError(
        'The result is unknown. Recover this operation ID before submitting another mutation.',
        503,
      );
    }
  }
  async recover(operationId: string, auth: Guard) {
    const operation = this.ledger.operation(operationId);
    if (!operation)
      throw new ConversationError(
        'Operation was not admitted. Recovery never creates a conversation.',
        404,
      );
    const scope = await this.scope(operation.dotId);
    this.guard(scope, auth);
    if (operation.binding !== this.binding(scope))
      throw new ConversationError('Operation authority changed.', 403);
    // Always inspect the producer receipt; never GET -> replay a mutation.
    const receipt = await this.transport!.call(
      'runtime.conversation.operation.get',
      { schema_version: 1, idempotency_key: operation.producerKey },
    );
    this.guard(scope, auth);
    if (!receipt.found || !receipt.conversation)
      throw new ConversationError(
        'No producer receipt was found. The original operation remains unresolved; no work was replayed.',
        409,
      );
    if (
      receipt.idempotency_key !== operation.producerKey ||
      receipt.operation !== operation.kind
    )
      throw new ConversationError(
        'Producer receipt does not match the original operation.',
        403,
      );
    const input = JSON.parse(operation.intent) as CreateIntent & {
      conversationId?: string;
    };
    if (
      input.conversationId &&
      input.conversationId !== receipt.conversation.conversation_id
    )
      throw new ConversationError(
        'Producer receipt conversation mismatch.',
        403,
      );
    if (
      input.pageId &&
      (!input.spaceId ||
        !this.workspace.canAccessSpace(scope.dotId, input.spaceId))
    )
      throw new ConversationError('Page access was revoked.', 403);
    const row = this.map(
      receipt.conversation,
      scope,
      input.pageId ? 'page' : 'web',
      input.spaceId ?? null,
      input.pageId ?? null,
    );
    this.ledger.settle(operationId, 'accepted', row);
    return {
      version: contractVersion,
      scope: browserScope(scope),
      conversation: row,
    };
  }
  async list(
    dotId: string,
    cursor: string | undefined,
    query: string,
    archived: boolean,
    auth: Guard,
  ) {
    const scope = await this.scope(dotId);
    this.guard(scope, auth);
    const result = await this.transport!.call('runtime.conversation.list', {
      schema_version: 1,
      limit: 50,
      cursor: cursor ?? null,
      query,
      archived,
    });
    this.guard(scope, auth);
    if (
      result.conversations.length > 50 ||
      result.has_more !== !!result.next_cursor ||
      (result.next_cursor && result.next_cursor.length > 2048)
    )
      throw new ConversationError(
        'Canonical conversation list exceeds negotiated bounds.',
        503,
      );
    return conversationListSchema.parse({
      version: contractVersion,
      scope: browserScope(scope),
      conversations: result.conversations.map((row) => this.map(row, scope)),
      nextCursor: result.next_cursor,
    });
  }
  private async conversation(
    id: string,
    auth: Guard,
    access: 'read' | 'write' | 'download' = 'read',
  ) {
    let bound: VerifiedConversationScope;
    try {
      bound = this.workspace.runtimeBindings.resolveConversation(id, access);
    } catch {
      throw new ConversationError('Runtime conversation access denied.', 403);
    }
    await this.scope(bound.dotId);
    this.guard(bound, auth, access);
    return bound;
  }
  async authorizeDownload(id: string, auth: Guard) {
    await this.conversation(id, auth, 'download');
  }
  async change(
    operationId: string,
    conversationId: string,
    expectedRevision: number,
    change: { title: string } | { archived: boolean },
    auth: Guard,
  ) {
    const bound = await this.conversation(conversationId, auth);
    const scope = await this.scope(bound.dotId);
    const kind = 'title' in change ? 'rename' : 'archive';
    const { operation, fresh } = this.ledger.admit({
      operationId,
      dotId: scope.dotId,
      binding: this.binding(scope),
      kind,
      intent: JSON.stringify({ conversationId, expectedRevision, ...change }),
      producerKey: operationId,
    });
    if (!fresh) return this.recover(operationId, auth);
    return this.mutate(
      operation,
      scope,
      () => this.guard(bound, auth),
      async () => {
        const params = {
          schema_version: 1,
          conversation_id: conversationId,
          idempotency_key: operationId,
          expected_revision: expectedRevision,
        };
        return (
          'title' in change
            ? await this.transport!.call('runtime.conversation.rename', {
                ...params,
                title: change.title,
              })
            : await this.transport!.call('runtime.conversation.archive', {
                ...params,
                archived: change.archived,
              })
        ).conversation;
      },
    );
  }
  private validatePage(raw: RuntimeConversationHistoryResult, id: string) {
    if (
      raw.conversation_id !== id ||
      raw.lineage[0] !== id ||
      new Set(raw.lineage).size !== raw.lineage.length ||
      raw.lineage.length > 1000 ||
      raw.lineage.some((part) => !part || part.length > 256) ||
      !Number.isSafeInteger(raw.snapshot_max_row_id) ||
      raw.snapshot_max_row_id < 0 ||
      (raw.next_cursor !== null &&
        (!raw.next_cursor || raw.next_cursor.length > 2048)) ||
      raw.messages.length > 100 ||
      raw.messages.some(
        (message) =>
          !message.message_id ||
          message.message_id.length > 256 ||
          !Number.isSafeInteger(message.text_offset) ||
          message.text_offset < 0 ||
          !Number.isSafeInteger(message.next_text_offset) ||
          message.next_text_offset < message.text_offset ||
          !raw.lineage.includes(message.physical_session_id) ||
          Buffer.byteLength(message.text, 'utf8') > 16384,
      ) ||
      raw.messages.reduce(
        (bytes, message) => bytes + Buffer.byteLength(message.text, 'utf8'),
        0,
      ) > 262144 ||
      raw.has_more !== !!raw.next_cursor
    )
      throw new ConversationError(
        'Canonical transcript scope or bounds mismatch.',
        403,
      );
  }
  async history(id: string, cursor: string | undefined, auth: Guard) {
    const bound = await this.conversation(id, auth);
    // Watermark precedes transcript read: commits during the read trigger another refresh.
    const state = await this.commands?.state(id, auth);
    this.guard(bound, auth);
    const raw = await this.transport!.call('runtime.conversation.history', {
      schema_version: 1,
      conversation_id: id,
      limit: 100,
      cursor: cursor ?? null,
    });
    this.guard(bound, auth);
    this.validatePage(raw, id);
    const meta = this.ledger.metadata(id);
    const page = meta?.pageId
      ? this.workspace.pages.get(meta.spaceId!, meta.pageId)
      : undefined;
    return historySchema.parse({
      version: contractVersion,
      scope: browserScope(bound),
      conversationId: id,
      lineageId: id,
      messages: raw.messages.map((message) => ({
        id: message.message_id,
        revision: 0,
        commandId: message.command_id,
        role: message.role,
        parts: [{ kind: 'text', text: message.text }],
        internal: false,
        committed: true,
        chunk: {
          offset: message.text_offset,
          nextOffset: message.next_text_offset,
          complete: message.text_complete,
          sanitized: message.text_sanitized,
          nonTextOmitted: message.non_text_omitted,
          physicalSessionId: message.physical_session_id,
        },
      })),
      pageContext: page
        ? {
            id: page.id,
            spaceId: page.spaceId,
            title: page.title,
            revision: page.revision,
          }
        : null,
      nextCursor: raw.next_cursor,
      sessionSequence: state?.sequence ?? 0,
      runtimeCursor: state?.cursor ?? null,
      truncated: false,
      interruption:
        'Safe committed text only. Private tool details and uncommitted provider output are omitted; accepted input appears only after canonical commit.',
    });
  }
  async *export(id: string, auth: Guard, signal: AbortSignal) {
    const bound = await this.conversation(id, auth, 'download');
    let cursor: string | null = null;
    const seen = new Set<string>();
    let pages = 0;
    yield JSON.stringify({
      format: 'safe_transcript_v1',
      conversationId: id,
      privateRuntimeBackup: false,
    }) + '\n';
    do {
      if (signal.aborted) return;
      this.guard(bound, auth, 'download');
      const raw: RuntimeConversationHistoryResult = await this.transport!.call(
        'runtime.conversation.export',
        { schema_version: 1, conversation_id: id, limit: 100, cursor },
      );
      this.guard(bound, auth, 'download');
      this.validatePage(raw, id);
      // Each page bounded by generated wire contract and producer UTF8 budget. No private payload.
      yield JSON.stringify({
        format: raw.format,
        conversationId: id,
        lineage: raw.lineage,
        snapshotMaxRowId: raw.snapshot_max_row_id,
        messages: raw.messages.map((message) => ({
          id: message.message_id,
          physicalSessionId: message.physical_session_id,
          commandId: message.command_id,
          role: message.role,
          text: message.text,
          offset: message.text_offset,
          nextOffset: message.next_text_offset,
          complete: message.text_complete,
          sanitized: message.text_sanitized,
          nonTextOmitted: message.non_text_omitted,
        })),
        exportPage: ++pages,
      }) + '\n';
      cursor = raw.next_cursor;
      if (cursor && seen.has(cursor))
        throw new ConversationError('Export cursor failed to advance.', 503);
      if (cursor) seen.add(cursor);
      if (pages >= 10000 && cursor)
        throw new ConversationError(
          'Export exceeded the page bound. No complete receipt was emitted.',
          503,
        );
    } while (cursor);
    this.guard(bound, auth, 'download');
    yield JSON.stringify({ complete: true, pages }) + '\n';
  }
}
