import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Store, type LegacyScheduleFreeze } from '../store.js';
import type { Run } from '../../shared/types.js';
import type { WorkspaceStore } from '../workspace.js';
import type { VerifiedConversationScope } from './bindings.js';
import { ConversationError } from './conversation-ledger.js';
import {
  commandScheduleDefinitionSchema,
  legacyScheduleDeclarationSchema,
  type CommandScheduleDefinition,
  type VerifiedLegacySchedule,
} from './schedule-service.js';

const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value;
const serialize = (value: unknown) => JSON.stringify(canonical(value));
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const legacyScheduleId = (sourceId: string) =>
  `import_${hash(JSON.stringify(sourceId)).slice(0, 32)}`;
const sourceIdSchema = z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const reconciliationSchema = z.strictObject({
  outcome: z.enum(['completed', 'failed', 'cancelled', 'skipped']),
  executionStopped: z.literal(true),
  receipt: z.string().trim().min(1).max(4096),
});

/** These fields did not exist in Dots' old scheduler. A trusted operator must
 * explicitly review them; neither browser declarations nor defaults grant authority. */
export interface LegacyMigrationAuthorization {
  timezone: string;
  trigger: CommandScheduleDefinition['trigger'];
  policy: CommandScheduleDefinition['policy'];
  budget: CommandScheduleDefinition['budget'];
  expires_at: number;
  authority_description: string;
  sourceMapping: 'existing_task_thread' | 'verified_unbound_task';
  recurrenceAcknowledgement:
    'fixed_anchor_replaces_completion_relative' | 'one_time';
}
export interface LegacyMigrationOptions {
  /** Optional trusted validator for an operation-local verified project binding.
   * Defaults to the workspace's canonical conversation binding validator. */
  assertCurrent?: (scope: VerifiedConversationScope) => void;
  now?: () => number;
  /** Must verify external outcome AND worker quiescence using real server-owned
   * evidence. Aborting a local promise, lease expiry, and a user/browser claim do
   * not constitute this proof. No default implementation invents that evidence. */
  verifyReconciliation?: (request: {
    sourceId: string;
    occurrence: Run;
    frozenAt: number;
    scope: VerifiedConversationScope;
  }) => Promise<z.infer<typeof reconciliationSchema>>;
}

/** Trusted admin connector only. Constructor installs durable SQL fences, but
 * never freezes, imports, retires, schedules or runs a task. No HTTP entrypoint. */
export class LegacyScheduleMigration {
  private readonly store: Store;
  private readonly now: () => number;
  constructor(
    private readonly workspace: WorkspaceStore,
    database: string,
    private readonly options: LegacyMigrationOptions = {},
  ) {
    this.store = new Store(database);
    this.now = options.now ?? Date.now;
  }
  close() {
    this.store.close();
  }
  private identity(scope: VerifiedConversationScope) {
    return {
      ownerId: scope.ownerId,
      dotId: scope.dotId,
      conversationId: scope.conversationId,
      durableSessionId: scope.durableSessionId,
      gatewayId: scope.gatewayId,
      principalId: scope.principalId,
      profileId: scope.profileId,
      agentId: scope.agentId,
      privilegeClass: scope.privilegeClass,
      spaceId: scope.spaceId,
      projectId: scope.projectId,
      agentRevision: scope.agentRevision,
      authorityRevision: scope.authorityRevision,
      grantRevision: scope.grantRevision,
      projectRevision: scope.projectRevision,
    };
  }
  private assertScope(scope: VerifiedConversationScope) {
    if (this.store.legacyWorkspaceOwner() !== this.workspace.ownerId)
      throw new ConversationError(
        'Legacy source database owner is not verified.',
        403,
      );
    if (
      scope.ownerId !== this.workspace.ownerId ||
      !scope.projectId ||
      !scope.spaceId ||
      scope.archived
    )
      throw new ConversationError(
        'Verified legacy migration project scope required.',
        403,
      );
    if (this.options.assertCurrent) this.options.assertCurrent(scope);
    else this.workspace.runtimeBindings.assertCurrent(scope, 'write');
    this.workspace.requireThread(scope.conversationId, scope.dotId);
  }
  private frozen(sourceId: string, scope: VerifiedConversationScope) {
    sourceIdSchema.parse(sourceId);
    this.assertScope(scope);
    const frozen = this.store.legacyFreeze(sourceId);
    if (!frozen || frozen.ownerId !== scope.ownerId)
      throw new ConversationError(
        'Legacy source has no trusted admission freeze.',
        409,
      );
    const binding = JSON.parse(frozen.binding) as {
      scope: ReturnType<LegacyScheduleMigration['identity']>;
      sourceMapping: LegacyMigrationAuthorization['sourceMapping'];
    };
    if (serialize(binding.scope) !== serialize(this.identity(scope)))
      throw new ConversationError('Legacy migration scope changed.', 403);
    const sourceThread = this.workspace.taskThread(sourceId);
    if (
      sourceThread !== undefined
        ? sourceThread !== scope.conversationId
        : binding.sourceMapping !== 'verified_unbound_task'
    )
      throw new ConversationError(
        'Legacy source conversation does not match.',
        403,
      );
    return frozen;
  }
  /** Explicit trusted preparation, never called by resolve or startup. An active
   * claim remains admitted and may finish; new/recovered claims are fenced now. */
  prepare(
    sourceId: string,
    scope: VerifiedConversationScope,
    authorization: LegacyMigrationAuthorization,
  ) {
    sourceIdSchema.parse(sourceId);
    this.assertScope(scope);
    const detail = this.store.detail(sourceId);
    if (!detail) throw new ConversationError('Legacy task not found.', 404);
    const sourceThread = this.workspace.taskThread(sourceId);
    if (
      sourceThread !== undefined
        ? sourceThread !== scope.conversationId ||
          authorization.sourceMapping !== 'existing_task_thread'
        : authorization.sourceMapping !== 'verified_unbound_task'
    )
      throw new ConversationError(
        'Explicit verified legacy source mapping required.',
        403,
      );
    if (detail.runs.length > 100)
      throw new ConversationError(
        'Legacy history exceeds the producer import limit; no history was truncated.',
        409,
      );
    const recurring = detail.task.intervalSeconds !== null;
    if (
      recurring
        ? authorization.recurrenceAcknowledgement !==
            'fixed_anchor_replaces_completion_relative' ||
          authorization.trigger.kind !== 'interval' ||
          authorization.trigger.seconds !== detail.task.intervalSeconds
        : authorization.recurrenceAcknowledgement !== 'one_time' ||
          authorization.trigger.kind !== 'at'
    )
      throw new ConversationError(
        'Explicit matching legacy recurrence review required.',
        409,
      );
    const definition = commandScheduleDefinitionSchema.parse({
      schema_version: 1,
      schedule_id: legacyScheduleId(sourceId),
      version: 1,
      project_id: scope.projectId,
      timezone: authorization.timezone,
      trigger: authorization.trigger,
      policy: authorization.policy,
      budget: authorization.budget,
      expires_at: authorization.expires_at,
      kind: 'command',
      specification: {
        prompt: detail.task.prompt,
        session_id: scope.durableSessionId,
        authority_description: authorization.authority_description,
      },
    });
    if (definition.expires_at * 1000 <= this.now())
      throw new ConversationError(
        'Migration standing authority has expired.',
        409,
      );
    const binding = serialize({
      scope: this.identity(scope),
      sourceMapping: authorization.sourceMapping,
      recurrenceAcknowledgement: authorization.recurrenceAcknowledgement,
      occurrenceTimeBasis: 'legacy_admission_started_at',
    });
    return this.store.freezeLegacyTask(
      sourceId,
      scope.ownerId,
      binding,
      serialize(definition),
      this.now(),
      JSON.stringify(detail.task),
    );
  }
  /** Original task, run UUIDs/results/events and a separate reconciliation ledger
   * remain inspectable. Times are admission timestamps, not invented due times. */
  inspect(sourceId: string, scope: VerifiedConversationScope) {
    const freeze = this.frozen(sourceId, scope);
    return {
      freeze,
      ...this.store.legacyHistory(sourceId),
      unresolvedOccurrences: this.store.legacyUnresolved(sourceId),
      occurrenceTimeBasis: 'legacy_admission_started_at' as const,
      historyTruncated: false as const,
    };
  }
  async reconcile(
    sourceId: string,
    occurrenceId: string,
    scope: VerifiedConversationScope,
  ) {
    const frozen = this.frozen(sourceId, scope);
    const existing = this.store
      .legacyReconciliations(sourceId)
      .find((row) => row.occurrenceId === occurrenceId);
    if (existing) return existing;
    if (frozen.retiredAt !== null)
      throw new ConversationError('Legacy source is already retired.', 409);
    const occurrence = this.store
      .detail(sourceId)
      ?.runs.find((row) => row.id === occurrenceId);
    if (!occurrence)
      throw new ConversationError('Legacy occurrence not found.', 404);
    if (!this.options.verifyReconciliation)
      throw new ConversationError(
        'Independent legacy outcome and worker-quiescence verification is required.',
        503,
      );
    const originalRun = JSON.stringify(occurrence);
    const evidence = reconciliationSchema.parse(
      await this.options.verifyReconciliation({
        sourceId,
        occurrence: structuredClone(occurrence),
        frozenAt: frozen.frozenAt,
        scope: structuredClone(scope),
      }),
    );
    this.frozen(sourceId, scope);
    return this.store.reconcileLegacyOccurrence(
      {
        sourceId,
        occurrenceId,
        originalRun,
        outcome: evidence.outcome,
        receipt: serialize(evidence),
      },
      this.now(),
    );
  }
  retire(sourceId: string, scope: VerifiedConversationScope) {
    const frozen = this.frozen(sourceId, scope);
    if (frozen.retirementReceipt) {
      this.assertRetired(sourceId, scope, frozen.retirementReceipt);
      return frozen;
    }
    this.declaration(sourceId, frozen);
    const history = JSON.stringify(this.store.legacyHistory(sourceId));
    const receipt = `dots-retirement-v1:${hash(
      serialize({
        sourceId,
        ownerId: frozen.ownerId,
        binding: frozen.binding,
        definition: frozen.definition,
        snapshot: frozen.snapshot,
        frozenAt: frozen.frozenAt,
        history,
      }),
    )}`;
    return this.store.retireLegacyTask(sourceId, history, receipt, this.now());
  }
  private declaration(sourceId: string, frozen: LegacyScheduleFreeze) {
    const { detail, reconciliations } = this.store.legacyHistory(sourceId);
    if (this.store.legacyUnresolved(sourceId).length)
      throw new ConversationError(
        'Legacy occurrences still require reconciliation.',
        409,
      );
    if (detail.runs.length > 100)
      throw new ConversationError(
        'Legacy history exceeds the producer import limit; no history was truncated.',
        409,
      );
    return legacyScheduleDeclarationSchema.parse({
      authority: 'dots_runner',
      source_id: sourceId,
      source_state: frozen.retiredAt === null ? 'paused' : 'retired',
      unresolved_occurrences: [],
      occurrences: detail.runs.map((run) => ({
        source_occurrence_id: run.id,
        due_at: run.startedAt / 1000,
        state:
          reconciliations.find((row) => row.occurrenceId === run.id)?.outcome ??
          run.status,
      })),
    });
  }
  private assertRetired(
    sourceId: string,
    scope: VerifiedConversationScope,
    receipt: string | null,
  ) {
    const frozen = this.frozen(sourceId, scope);
    if (
      !receipt ||
      frozen.retirementReceipt !== receipt ||
      frozen.retiredAt === null ||
      frozen.retiredHistory !==
        JSON.stringify(this.store.legacyHistory(sourceId))
    )
      throw new ConversationError(
        'Immutable legacy retirement receipt required.',
        409,
      );
    this.declaration(sourceId, frozen);
  }
  async resolveLegacy(
    sourceId: string,
    scope: VerifiedConversationScope,
  ): Promise<VerifiedLegacySchedule> {
    const frozen = this.frozen(sourceId, scope);
    const declaration = this.declaration(sourceId, frozen);
    const definition = commandScheduleDefinitionSchema.parse(
      JSON.parse(frozen.definition),
    );
    const expected = serialize({ definition, declaration });
    return {
      definition,
      declaration,
      retirementReceipt: frozen.retirementReceipt,
      assertFrozen: () => {
        const current = this.frozen(sourceId, scope);
        if (
          serialize({ definition, declaration }) !== expected ||
          serialize({
            definition: JSON.parse(current.definition),
            declaration: this.declaration(sourceId, current),
          }) !== expected
        )
          throw new ConversationError('Legacy source evidence changed.', 409);
      },
      assertRetired: () =>
        this.assertRetired(sourceId, scope, frozen.retirementReceipt),
    };
  }
}
