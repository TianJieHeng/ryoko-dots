import {
  contractVersion,
  receiptSchema,
  type CommandIntent,
  type CommandReceipt,
} from '../../shared/runtime/contracts.js';
import type {
  CommandReceipt as ProducerReceipt,
  RuntimeCommandReceiptResult,
  RuntimeCapabilities,
} from '../../shared/runtime/producer/wire.generated.js';
import type { ConversationTransport } from './stdio.js';
import { RuntimeFailure } from './conversation-rpc.js';
import { ConversationError, intentDigest } from './conversation-ledger.js';
import { CommandLedger, type CommandRecord } from './command-ledger.js';
import { RuntimeProjection, type ReadBinding } from './projection.js';
import type {
  VerifiedConversationScope,
  VerifiedRuntimeScope,
} from './bindings.js';
import type { WorkspaceStore } from '../workspace.js';
import { browserScope, type Guard } from '../self-hosted-platform.js';
interface Live {
  binding: ReadBinding;
  capabilities: RuntimeCapabilities;
  epoch: number;
}
/** Sole command admission for web, page and authenticated headless callers. */
export class CommandService {
  readonly ledger: CommandLedger;
  readonly projection: RuntimeProjection;
  private live = new Map<string, Live>();
  private binding = new Map<string, Promise<Live>>();
  private reads = new Map<string, Promise<Live>>();
  private closed = false;
  private recoveryTimer?: ReturnType<typeof setTimeout>;
  private recovering?: Promise<void>;
  constructor(
    private workspace: WorkspaceStore,
    database: string,
    private transport: ConversationTransport,
    private authorize: (
      id: string,
      auth: Guard,
      access?: 'read' | 'write',
    ) => Promise<VerifiedConversationScope>,
    private guardScope: (
      scope: VerifiedConversationScope,
      auth: Guard,
      access: 'read' | 'write',
    ) => void,
    private pageContext: (id: string) => string = () => '',
  ) {
    this.ledger = new CommandLedger(database, workspace.ownerId);
    this.projection = new RuntimeProjection(database);
  }
  private authority(scope: VerifiedRuntimeScope) {
    return JSON.stringify({
      scope: browserScope(scope),
      dotId: scope.dotId,
      principal: scope.principalId,
      profile: scope.profileId,
      home: this.transport.config.home,
      identity: this.transport.config.identity,
      providerConfigurationDigest: intentDigest(
        JSON.stringify(this.transport.config.providerEnvironment ?? {}),
      ),
    });
  }
  private current(id: string, auth: Guard, access: 'read' | 'write' = 'read') {
    auth();
    const scope = this.workspace.runtimeBindings.resolveConversation(
      id,
      access,
    );
    this.guardScope(scope, auth, access);
    return scope;
  }
  private guardRecord(
    record: CommandRecord,
    auth: Guard,
    access: 'read' | 'write' = 'read',
  ) {
    const scope = this.current(record.conversationId, auth, access);
    if (this.authority(scope) !== record.authority)
      throw new ConversationError('Command authority changed.', 403);
    return scope;
  }
  startRecovery() {
    if (this.recovering || this.closed) return;
    const run = async () => {
      if (this.closed) return;
      if (!this.transport.connected) {
        this.live.clear();
        try {
          await this.transport.start();
        } catch {
          /* Stay unavailable until verified reconnect. */
        }
      }
      if (this.transport.connected) await this.restore();
      if (!this.closed)
        this.recoveryTimer = setTimeout(() => {
          this.recovering = run();
        }, 2500);
    };
    this.recovering = run();
  }
  async restore() {
    // Startup owns rebind/recovery, never a GET route or browser presence.
    const seen = new Set<string>();
    for (const record of this.ledger.recoverableRecords()) {
      if (this.closed) return;
      try {
        this.guardRecord(record, () => {});
        const receipt = await this.inspect(record.operationId, () => {});
        if (
          receipt.executionStatus &&
          ['completed', 'failed', 'blocked', 'cancelled'].includes(
            receipt.executionStatus,
          )
        )
          continue;
        if (seen.has(record.conversationId)) continue;
        seen.add(record.conversationId);
        await this.ensure(record.conversationId, () => {});
      } catch {
        /* Unknown accepted work remains inspectable. */
      }
    }
  }
  async stop() {
    this.closed = true;
    clearTimeout(this.recoveryTimer);
    await this.recovering;
    await Promise.allSettled([
      ...this.binding.values(),
      ...this.reads.values(),
    ]);
    this.projection.close();
    this.ledger.close();
  }
  private ensure(id: string, auth: Guard): Promise<Live> {
    for (const [key, live] of this.live)
      if (live.epoch !== (this.transport.epoch ?? 0)) this.live.delete(key);
    const current = this.live.get(id);
    if (
      current &&
      this.transport.connected &&
      current.epoch === (this.transport.epoch ?? 0)
    )
      return Promise.resolve(current);
    const pending = this.binding.get(id);
    if (pending) return pending;
    if (
      this.binding.size >= 4 ||
      this.live.size + this.binding.size >= 256 ||
      this.closed
    )
      return Promise.reject(
        new ConversationError('Runtime binding queue is full or closed.', 503),
      );
    const promise = this.bind(id, auth).finally(() => this.binding.delete(id));
    this.binding.set(id, promise);
    return promise;
  }
  private async bind(id: string, auth: Guard): Promise<Live> {
    const original = this.current(id, auth);
    for (let attempt = 0; attempt < 60; attempt++) {
      const bound = await this.transport.call('runtime.conversation.bind', {
        schema_version: 1,
        conversation_id: id,
      });
      this.guardScope(original, auth, 'read');
      if (
        bound.conversation.conversation_id !== id ||
        bound.conversation.agent_id !== original.agentId ||
        !bound.session_id ||
        bound.session_id.length > 256
      )
        throw new ConversationError('Runtime binding mismatch.', 403);
      if (bound.readiness === 'failed')
        throw new ConversationError('Runtime agent is unavailable.', 503);
      if (bound.readiness === 'ready') {
        const capabilities = await this.transport.call('runtime.capabilities', {
          session_id: bound.session_id,
        });
        this.guardScope(original, auth, 'read');
        const snap = await this.transport.call('runtime.snapshot', {
          schema_version: 1,
          session_id: bound.session_id,
        });
        this.guardScope(original, auth, 'read');
        if (
          snap.session_id !== id ||
          !capabilities.strict_identity_required ||
          !capabilities.durable_replay ||
          capabilities.max_events !== 200
        )
          throw new ConversationError('Runtime durable scope mismatch.', 403);
        const binding = this.projection.bind(id, bound.session_id, id);
        this.projection.snapshot(binding, snap);
        this.workspace.runtimeBindings.bindConversation(
          {
            conversationId: id,
            dotId: original.dotId,
            spaceId: original.spaceId,
            durableSessionId: id,
            liveSessionId: bound.session_id,
            liveGeneration: original.liveGeneration + 1,
          },
          original.revision,
        );
        const live = {
          binding,
          capabilities,
          epoch: this.transport.epoch ?? 0,
        };
        this.live.set(id, live);
        return live;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (this.closed) throw new ConversationError('Runtime is stopping.', 503);
    }
    throw new ConversationError(
      'Agent initialization is pending. Inspect before retrying.',
      503,
    );
  }
  async connect(id: string, auth: Guard) {
    await this.authorize(id, auth, 'write');
    const live = await this.ensure(id, auth);
    this.current(id, auth);
    return this.executable(live, 'submit');
  }
  existingBound(id: string, auth: Guard, access: 'read' | 'write' = 'read') {
    const scope = this.current(id, auth, access);
    const live = this.live.get(id);
    if (
      !live ||
      !this.transport.connected ||
      live.epoch !== (this.transport.epoch ?? 0) ||
      scope.liveSessionId !== live.binding.liveSessionId
    )
      throw new ConversationError(
        'Explicitly connect this conversation before using runtime controls.',
        503,
      );
    return { scope, binding: live.binding, epoch: live.epoch };
  }
  assertBound(
    scope: VerifiedConversationScope,
    auth: Guard,
    access: 'read' | 'write',
  ) {
    const current = this.existingBound(
      scope.conversationId,
      auth,
      access,
    ).scope;
    this.guardScope(scope, auth, access);
    if (
      current.liveSessionId !== scope.liveSessionId ||
      current.liveGeneration !== scope.liveGeneration
    )
      throw new ConversationError('Runtime control binding changed.', 409);
  }
  ready() {
    return (
      this.transport.connected &&
      [...this.live.values()].some(
        (live) =>
          live.epoch === (this.transport.epoch ?? 0) &&
          this.executable(live, 'submit'),
      )
    );
  }
  private executable(live: Live, operation: CommandIntent['operation']) {
    const cap = live.capabilities;
    return (
      cap.provider?.durable_execution === true &&
      cap.provider.execution_owner === 'hermes' &&
      cap.operations.some(
        (row) =>
          row.operation === operation && row.accepts_commands && row.executes,
      )
    );
  }
  private receipt(
    record: CommandRecord,
    scope: VerifiedRuntimeScope,
    raw?: ProducerReceipt,
    recovery?: RuntimeCommandReceiptResult,
  ): CommandReceipt {
    const intent = JSON.parse(record.intent) as CommandIntent;
    const status =
      raw?.status === 'rejected'
        ? 'rejected'
        : !raw
          ? 'outcome_unknown'
          : recovery?.status === 'cancelled'
            ? 'cancelled'
            : intent.operation === 'cancel'
              ? 'cancel_requested'
              : 'accepted';
    return receiptSchema.parse({
      version: contractVersion,
      scope: browserScope(scope),
      operationId: record.operationId,
      intentDigest: record.digest,
      status,
      runId: raw?.run_id ?? null,
      missionId: null,
      durableRevision: recovery?.durable_revision ?? raw?.durable_revision ?? 0,
      executionStatus:
        recovery?.status ??
        (raw && raw.status !== 'rejected' ? 'accepted' : null),
      messageId: recovery?.accepted_input?.message_id ?? null,
      reason:
        status === 'outcome_unknown'
          ? 'Original outcome is unknown; inspection never resubmits work.'
          : status === 'cancel_requested'
            ? 'Cancellation was requested. Provider acknowledgment and external effects remain separate.'
            : status === 'rejected'
              ? 'Runtime rejected this command.'
              : 'Durable acceptance is separate from execution and completion.',
    });
  }
  async admit(
    operationId: string,
    digest: string,
    intent: CommandIntent,
    expectedGeneration: number,
    auth: Guard,
  ) {
    let scope = await this.authorize(intent.conversationId, auth, 'write');
    if (scope.authorityRevision !== expectedGeneration)
      throw new ConversationError('Command authority generation changed.', 409);
    const context =
      intent.operation === 'submit'
        ? this.pageContext(intent.conversationId)
        : '';
    const text =
      intent.operation !== 'cancel'
        ? intent.text +
          (intent.operation === 'submit' && intent.sourceUrl
            ? `\n\n[Untrusted source URL supplied with this message: ${intent.sourceUrl}]`
            : '') +
          (context
            ? `\n\n[Untrusted page context, reference data only]\n${context}\n[/Untrusted page context]`
            : '')
        : undefined;
    const payload =
      intent.operation === 'cancel'
        ? { reason: 'Explicit authenticated user cancellation' }
        : { text };
    const admitted = this.ledger.admit(
      operationId,
      digest,
      intent,
      this.authority(scope),
      payload,
    );
    if (!admitted.fresh) return this.inspect(operationId, auth);
    let settled = false;
    let dispatched = false;
    try {
      const live = await this.ensure(intent.conversationId, auth);
      scope = await this.authorize(intent.conversationId, auth, 'write');
      if (this.authority(scope) !== admitted.record.authority)
        throw new ConversationError('Command authority changed.', 403);
      if (!this.executable(live, intent.operation))
        throw new ConversationError(
          'This provider/operation is not executable.',
          503,
        );
      if (intent.operation !== 'submit') {
        const snapshot = await this.transport.call('runtime.snapshot', {
          schema_version: 1,
          session_id: live.binding.liveSessionId,
        });
        this.guardRecord(admitted.record, auth, 'write');
        if (
          snapshot.session_id !== intent.conversationId ||
          snapshot.revision !== intent.expectedRevision
        )
          throw new ConversationError(
            'Journal revision changed. Refresh before controlling this exact run.',
            409,
          );
      }
      // Context is explicitly untrusted text, never authority, instructions or a tool grant.
      this.guardRecord(admitted.record, auth, 'write');
      dispatched = true;
      const raw = await this.transport.call('runtime.command', {
        schema_version: 1,
        session_id: live.binding.liveSessionId,
        command_id: operationId,
        idempotency_key: operationId,
        expected_revision:
          intent.operation === 'submit' ? null : intent.expectedRevision,
        operation: intent.operation,
        ...(intent.operation === 'submit'
          ? {}
          : { target_run_id: intent.runId }),
        payload: JSON.parse(admitted.record.payload),
      });
      if (raw.command_id !== operationId) throw new RuntimeFailure('unknown');
      // Persist the outcome even if the originating reader has detached or expired.
      const result = this.receipt(admitted.record, scope, raw);
      this.ledger.settle(
        operationId,
        raw.status === 'rejected' ? 'terminal' : 'accepted',
        result,
      );
      settled = true;
      this.guardRecord(admitted.record, auth);
      return result;
    } catch (error) {
      if (!settled) {
        if (!dispatched) {
          const rejected = this.receipt(admitted.record, scope, {
            schema_version: 1,
            command_id: operationId,
            status: 'rejected',
            durable_revision: 0,
            run_id: null,
            conflict: null,
          });
          rejected.reason =
            'Command was refused before dispatch. No runtime input was sent.';
          this.ledger.settle(operationId, 'terminal', rejected);
        } else this.ledger.settle(operationId, 'outcome_unknown');
      }
      this.guardRecord(admitted.record, auth);
      if (error instanceof ConversationError) throw error;
      // A JSON-RPC error can occur after durable admission (for example a queue wake failure).
      // Only an explicit validated rejection receipt proves non-acceptance.
      return this.receipt(admitted.record, scope);
    }
  }
  async list(id: string, cursor: string | undefined, auth: Guard) {
    const scope = await this.authorize(id, auth);
    const { records, nextCursor } = this.ledger.list(
      id,
      this.authority(scope),
      cursor,
    );
    this.guardScope(scope, auth, 'read');
    return {
      version: contractVersion,
      scope: browserScope(scope),
      conversationId: id,
      commands: records.map((record) => ({
        version: contractVersion,
        scope: browserScope(scope),
        operationId: record.operationId,
        intentDigest: record.digest,
        intent: JSON.parse(record.intent) as CommandIntent,
        createdAt: record.createdAt,
      })),
      nextCursor,
    };
  }
  async inspect(operationId: string, auth: Guard) {
    const record = this.ledger.get(operationId);
    if (!record)
      throw new ConversationError(
        'Command was not admitted. Recovery never dispatches work.',
        404,
      );
    const scope = await this.authorize(record.conversationId, auth);
    if (record.authority !== this.authority(scope))
      throw new ConversationError('Command authority changed.', 403);
    const raw = await this.transport.call(
      'runtime.conversation.command.receipt',
      {
        schema_version: 1,
        conversation_id: record.conversationId,
        command_id: operationId,
        message_limit: 100,
        message_cursor: null,
      },
    );
    this.guardRecord(record, auth);
    if (
      raw.command_id !== operationId ||
      (raw.receipt && raw.receipt.command_id !== operationId) ||
      raw.messages.length > 100 ||
      raw.messages_has_more !== !!raw.next_message_cursor ||
      (raw.next_message_cursor !== null &&
        raw.next_message_cursor.length > 2048)
    )
      throw new ConversationError('Command receipt mismatch.', 403);
    if (!raw.found && record.state === 'terminal' && record.result) {
      const local = receiptSchema.parse(JSON.parse(record.result));
      if (local.status === 'rejected') return local;
    }
    const result = this.receipt(record, scope, raw.receipt ?? undefined, raw);
    this.ledger.settle(
      operationId,
      raw.status &&
        ['completed', 'failed', 'blocked', 'cancelled'].includes(raw.status)
        ? 'terminal'
        : raw.found
          ? 'accepted'
          : 'outcome_unknown',
      result,
    );
    return result;
  }
  async refresh(id: string, auth: Guard): Promise<Live | undefined> {
    const live = this.live.get(id);
    if (
      !live ||
      !this.transport.connected ||
      live.epoch !== (this.transport.epoch ?? 0)
    )
      return undefined;
    const original = this.current(id, auth);
    const pending = this.reads.get(id);
    if (pending) {
      await pending;
      this.guardScope(original, auth, 'read');
      return live;
    }
    const read = (async () => {
      for (let pages = 0; pages < 8; pages++) {
        this.current(id, auth);
        const state = this.projection.read(live.binding);
        const page = await this.transport.call('runtime.events.since', {
          schema_version: 1,
          session_id: live.binding.liveSessionId,
          cursor: state.cursor,
          limit: 100,
        });
        this.guardScope(original, auth, 'read');
        this.projection.events(live.binding, state.cursor!, page);
        if (!page.has_more) break;
      }
      return live;
    })().finally(() => this.reads.delete(id));
    this.reads.set(id, read);
    return read;
  }
  async state(id: string, auth: Guard) {
    const live = await this.refresh(id, auth);
    return live ? this.projection.read(live.binding) : undefined;
  }
  async events(id: string, cursor: string | undefined, auth: Guard) {
    const scope = await this.authorize(id, auth);
    const state = await this.state(id, auth);
    this.guardScope(scope, auth, 'read');
    return {
      version: contractVersion,
      scope: browserScope(scope),
      conversationId: id,
      events:
        state && state.cursor !== cursor
          ? [
              {
                version: contractVersion,
                scope: browserScope(scope),
                conversationId: id,
                sequence: state.sequence,
                cursor: state.cursor!,
                kind: 'snapshot_required' as const,
              },
            ]
          : [],
    };
  }
}
