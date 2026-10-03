import { BE06_PRODUCER_COMMIT } from './be06-service.js';
import { identityMatches } from './stdio.js';
import type { SelfHostedPlatform } from '../self-hosted-platform.js';
import { canonicalCommand } from './command-ledger.js';
import { intentDigest } from './conversation-ledger.js';
import { commandIntentSchema } from '../../shared/runtime/contracts.js';
import {
  SlackFailure,
  assertReplyAuthority,
  hash,
  identifier,
  type SlackBridge,
  type SlackConfig,
  type EventRecord,
  type ThreadRecord,
  type ImmutableOutput,
} from './slack-types.js';

/** Every surface uses this very same platform.commands instance and producer owner.
 * Never instantiate a second agent, serial queue, gateway Slack loop, or managed Channels client.
 */
export class CommandServiceSlackBridge implements SlackBridge {
  constructor(
    private platform: SelfHostedPlatform,
    private config: SlackConfig,
    /** Host-owned current policy check; called again after every await. */
    private currentPolicy: () => void,
  ) {}
  ready() {
    return (
      !!this.platform.transport?.connected &&
      !!this.platform.commands &&
      !!this.platform.delivery &&
      this.platform.transport?.be06Qualification?.producerCommit ===
        BE06_PRODUCER_COMMIT &&
      ['runtime.agent.get', 'runtime.agent.session.get'].every((method) =>
        this.platform.transport!.be06Qualification!.methods.some(
          (allowed) => allowed === method,
        ),
      ) &&
      !!this.platform.identities
    );
  }
  authorize(conversationId?: string) {
    this.currentPolicy();
    assertReplyAuthority(this.config);
    if (
      this.platform.workspace.ownerId !== this.config.ownerId ||
      this.platform.transport?.config.dotId !== this.config.dotId
    )
      throw new SlackFailure('denied');
    const scope = conversationId
      ? this.platform.workspace.runtimeBindings.resolveConversation(
          conversationId,
          'write',
        )
      : this.platform.workspace.runtimeBindings.resolveDot(this.config.dotId);
    if (
      scope.ownerId !== this.config.ownerId ||
      scope.dotId !== this.config.dotId ||
      scope.privilegeClass !== 'primary' ||
      !this.config.replyAuthority ||
      !this.platform.transport ||
      !identityMatches(
        this.config.replyAuthority.runtimeIdentity,
        this.platform.transport.config.identity,
      ) ||
      scope.principalId !==
        this.config.replyAuthority.runtimeIdentity.principal_id ||
      scope.profileId !==
        this.config.replyAuthority.runtimeIdentity.profile_id ||
      scope.agentId !== this.config.replyAuthority.runtimeIdentity.agent_id
    )
      throw new SlackFailure('denied');
    this.platform.workspace.runtimeBindings.assertCurrent(scope, 'write');
    if (conversationId && this.platform.ledger.metadata(conversationId)?.pageId)
      throw new SlackFailure('denied');
  }
  async verifySource(event: EventRecord) {
    assertReplyAuthority(this.config, event);
    if (!event.conversationId || !this.ready())
      throw new SlackFailure('unavailable');
    const auth = () => {
      assertReplyAuthority(this.config, event);
      this.authorize(event.conversationId!);
    };
    await this.platform.commands!.connect(event.conversationId, auth);
    auth();
    const bound = this.platform.commands!.existingBound(
      event.conversationId,
      auth,
      'write',
    );
    await this.platform.identities!.verifySession(
      bound.scope,
      bound.binding.liveSessionId,
      auth,
    );
    auth();
    const { agent } = await this.platform.transport!.call('runtime.agent.get', {
      schema_version: 1,
      session_id: bound.binding.liveSessionId,
      agent_id: bound.scope.agentId,
    });
    auth();
    const allowed = [...this.config.replyAuthority!.projectIds].sort();
    if (
      agent.agent_id !== bound.scope.agentId ||
      agent.role !== 'primary' ||
      agent.memory_backend !== 'personal_mcp' ||
      agent.archived ||
      agent.active_session_revision_revoked ||
      JSON.stringify([...(agent.config.project_grants ?? [])].sort()) !==
        JSON.stringify(allowed) ||
      (agent.config.default_project_id &&
        !allowed.includes(agent.config.default_project_id))
    )
      throw new SlackFailure('denied');
    for (const projectId of allowed) {
      const { project } = await this.platform.transport!.call(
        'runtime.project.get',
        {
          schema_version: 1,
          session_id: bound.binding.liveSessionId,
          project_id: projectId,
        },
      );
      auth();
      if (
        project.id !== projectId ||
        project.project_id !== projectId ||
        project.archived ||
        project.owner_principal_id !== bound.scope.principalId ||
        !project.grants.some(
          (grant) =>
            grant.principal_id === bound.scope.principalId &&
            grant.agent_id === bound.scope.agentId &&
            grant.permissions.includes('read') &&
            grant.permissions.includes('write'),
        )
      )
        throw new SlackFailure('denied');
    }
    this.platform.commands!.assertBound(bound.scope, auth, 'write');
  }
  async ensureConversation(thread: ThreadRecord) {
    this.authorize();
    const auth = () => this.authorize();
    const prior = this.platform.ledger.operation(thread.createOperationId);
    const result = prior
      ? await this.platform.recover(thread.createOperationId, auth)
      : await this.platform.create(
          thread.createOperationId,
          {
            dotId: this.config.dotId,
            title: 'Slack conversation',
            spaceId: null,
            pageId: null,
          },
          auth,
        );
    this.authorize(result.conversation.id);
    return result.conversation.id;
  }
  async admit(
    event: EventRecord,
  ): Promise<'accepted' | 'rejected' | 'unknown'> {
    if (!event.conversationId || !this.platform.commands)
      throw new SlackFailure('unavailable');
    await this.verifySource(event);
    this.authorize(event.conversationId);
    // Crash/retry recovery uses the shared durable ledger. No new operation ID is generated here.
    if (this.platform.commands.ledger.get(event.operationId))
      return this.inspect(event);
    const intent = commandIntentSchema.parse({
      operation: 'submit',
      conversationId: event.conversationId,
      text: event.text,
      sourceUrl: null,
    });
    const scope = this.platform.workspace.runtimeBindings.resolveConversation(
      event.conversationId,
      'write',
    );
    const receipt = await this.platform.commands.admit(
      event.operationId,
      intentDigest(canonicalCommand(intent)),
      intent,
      scope.authorityRevision,
      () => this.authorize(event.conversationId!),
    );
    this.authorize(event.conversationId);
    return receipt.status === 'rejected'
      ? 'rejected'
      : receipt.status === 'outcome_unknown'
        ? 'unknown'
        : 'accepted';
  }
  async inspect(
    event: EventRecord,
  ): Promise<'accepted' | 'rejected' | 'unknown'> {
    if (!event.conversationId || !this.platform.commands) return 'unknown';
    this.authorize(event.conversationId);
    if (!this.platform.commands.ledger.get(event.operationId)) return 'unknown';
    const receipt = await this.platform.commands.inspect(
      event.operationId,
      () => this.authorize(event.conversationId!),
    );
    this.authorize(event.conversationId);
    return receipt.status === 'rejected'
      ? 'rejected'
      : receipt.status === 'outcome_unknown'
        ? 'unknown'
        : 'accepted';
  }
  async output(event: EventRecord): Promise<ImmutableOutput | null> {
    if (
      !event.conversationId ||
      !this.platform.commands ||
      !this.platform.delivery
    )
      return null;
    await this.verifySource(event);
    this.authorize(event.conversationId);
    const auth = () => this.authorize(event.conversationId!);
    // Restore the same producer binding before reading its private immutable result.
    await this.platform.commands.connect(event.conversationId, auth);
    const receipt = await this.platform.commands.inspect(
      event.operationId,
      auth,
    );
    if (receipt.executionStatus !== 'completed') {
      if (!this.platform.controls || !receipt.runId) return null;
      const reviews = await this.platform.controls.readReviews(
        event.conversationId,
        auth,
      );
      const pending = reviews.approvals.find(
        (row) =>
          row.run_id === receipt.runId &&
          row.status === 'pending' &&
          !row.expired &&
          row.mission_id,
      );
      if (
        !pending ||
        !identifier(pending.mission_id) ||
        !identifier(pending.approval_id)
      )
        return null;
      const exact = await this.platform.controls.readReview(
        event.conversationId,
        pending.approval_id,
        auth,
      );
      auth();
      if (
        !exact.review ||
        exact.detail.approval.run_id !== receipt.runId ||
        exact.detail.approval.mission_id !== pending.mission_id ||
        exact.review.status !== 'pending' ||
        exact.review.expiresAt <= Date.now()
      )
        return null;
      return {
        artifactId: pending.approval_id,
        version: 1,
        sha256: hash(
          JSON.stringify([
            exact.review.approvalDigest,
            exact.review.actionDigest,
          ]),
        ),
        text: 'An action needs your review. Open Dots to inspect and decide on the exact action. Slack replies and reactions do not approve it.',
        reviewPath: `/#/missions/${pending.mission_id}/reviews/${pending.approval_id}`,
      };
    }
    const result = await this.platform.delivery.readResult(
      event.conversationId,
      event.operationId,
      auth,
    );
    auth();
    if (
      result.publicationState !== 'committed' ||
      !result.finalResponse?.trim()
    )
      return null;
    // readResult verifies every chunk, owner/session identity, byte count, SHA-256 and immutable version.
    // It does not acknowledge delivery. Slack receipt remains a separate provider fact.
    return {
      artifactId: result.artifact.artifactId,
      version: result.artifact.version,
      sha256: result.artifact.sha256,
      text: result.finalResponse,
    };
  }
}
