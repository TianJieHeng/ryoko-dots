import { ReadinessEvidence } from '../operations/readiness-evidence.js';
import {
  commandScheduleDefinitionSchema,
  commandScheduleRecordSchema,
  legacyScheduleDeclarationSchema,
  scheduleMutationConfigSchema as configSchema,
  type CommandScheduleDefinition,
  type CommandScheduleRecord,
  type LegacyScheduleDeclaration,
} from '../../shared/runtime/schedule-evidence.js';
export {
  commandScheduleDefinitionSchema,
  commandScheduleRecordSchema,
  legacyScheduleDeclarationSchema,
  scheduleTriggerSchema,
} from '../../shared/runtime/schedule-evidence.js';
export type {
  CommandScheduleDefinition,
  CommandScheduleRecord,
  LegacyScheduleDeclaration,
} from '../../shared/runtime/schedule-evidence.js';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { contractVersion } from '../../shared/runtime/contracts.js';
import {
  scheduleSchema,
  type RuntimeSchedule,
} from '../../shared/runtime/schedules.js';
import type {
  ScheduleCreateParams,
  ScheduleImportParams,
  ScheduleUpdateParams,
  ScheduleGetParams,
  ScheduleProjectParams,
  ScheduleRunNowParams,
  ScheduleCutoverParams,
  ScheduleRecordResult,
  RuntimeCommandReceiptParams,
  RuntimeCommandReceiptResult,
  RuntimeSessionParams,
  ScheduleSchedulerStatusResult,
} from '../../shared/runtime/producer/wire.generated.js';
import { browserScope, type Guard } from '../self-hosted-platform.js';
import { ConversationError, intentDigest } from './conversation-ledger.js';
import {
  initializeOperationRegistry,
  claimOperation,
} from './operation-registry.js';
import type { ControlBinding } from './control-service.js';
import type { VerifiedConversationScope } from './bindings.js';
import type { LaunchConfig } from './stdio.js';

/** Exact generated transport types. record_json is intentionally opaque in the
 * producer OpenRPC contract; the bounded schemas below validate its pinned implementation. */
export interface ScheduleParams {
  'runtime.schedule.create': ScheduleCreateParams;
  'runtime.schedule.import': ScheduleImportParams;
  'runtime.schedule.update': ScheduleUpdateParams;
  'runtime.schedule.get': ScheduleGetParams;
  'runtime.schedule.list': ScheduleProjectParams;
  'runtime.schedule.run_now': ScheduleRunNowParams;
  'runtime.schedule.cutover': ScheduleCutoverParams;
  'runtime.command.receipt': RuntimeCommandReceiptParams;
  'runtime.schedule.scheduler.status': RuntimeSessionParams;
}
export type ScheduleResults = {
  [M in keyof ScheduleParams]: M extends 'runtime.command.receipt'
    ? RuntimeCommandReceiptResult
    : M extends 'runtime.schedule.scheduler.status'
      ? ScheduleSchedulerStatusResult
      : ScheduleRecordResult;
};
export interface ScheduleTransport {
  readonly config: LaunchConfig;
  readonly connected: boolean;
  readonly epoch?: number;
  call<M extends keyof ScheduleParams>(
    method: M,
    params: ScheduleParams[M],
  ): Promise<ScheduleResults[M]>;
}
const id = z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const scheduleActionSchema = z.strictObject({
  operationId: z.uuid(),
  intentDigest: sha256,
  action: z.enum(['create', 'edit', 'pause', 'resume', 'cancel', 'run_now']),
  payload: z.record(z.string(), z.unknown()),
  expectedRevision: integer,
  expectedGeneration: integer,
});
export type ScheduleAction = z.infer<typeof scheduleActionSchema>;
type Action = ScheduleAction['action'] | 'import' | 'cutover';
type Intent = {
  path: string;
  action: Action;
  payload: Record<string, unknown>;
  expectedRevision: number;
};
type MutationMethod = Exclude<
  keyof ScheduleParams,
  | 'runtime.schedule.get'
  | 'runtime.schedule.list'
  | 'runtime.command.receipt'
  | 'runtime.schedule.scheduler.status'
>;
type WireRequest = {
  [M in MutationMethod]: {
    method: M;
    params: Omit<ScheduleParams[M], 'session_id' | 'schema_version'>;
  };
}[MutationMethod];
interface Ingress {
  operationId: string;
  ownerId: string;
  conversationId: string;
  authority: string;
  digest: string;
  intent: string;
  wire: string | null;
  state: 'pending' | 'accepted' | 'rejected' | 'outcome_unknown';
  evidence: string | null;
}
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, child]) => [key, canonical(child)]),
        )
      : value;
export const canonicalScheduleIntent = (value: Intent) =>
  JSON.stringify(canonical(value));
const digest = (value: unknown) =>
  intentDigest(JSON.stringify(canonical(value)));
const empty = z.strictObject({});

/** Migration authority is supplied ONLY by server-owned legacy runner retirement
 * logic. Do not implement this callback by trusting a browser JSON declaration. */
export interface VerifiedLegacySchedule {
  declaration: LegacyScheduleDeclaration;
  definition: CommandScheduleDefinition;
  retirementReceipt: string | null;
  assertFrozen(): void;
  assertRetired(): void;
}
export interface ScheduleServiceOptions {
  /** Optional additional deployment fence after the typed producer owner proof. Never start a timer here. */
  assertSchedulerOwner?(scope: VerifiedConversationScope): void;
  resolveLegacy?: (
    sourceId: string,
    scope: VerifiedConversationScope,
  ) => Promise<VerifiedLegacySchedule>;
  now?: () => number;
}

/** A durable consumer/control adapter. No ticker, leases, agent execution,
 * provider activation, external publication or implicit authority grant. */
export class RuntimeScheduleService {
  private db: DatabaseSync;
  private operationalEvidence = new ReadinessEvidence();
  operationalState() {
    return this.operationalEvidence.read(
      this.transport.epoch ?? 0,
      this.transport.connected,
    );
  }
  private now: () => number;
  constructor(
    private ownerId: string,
    database: string,
    private transport: ScheduleTransport,
    private boundSession: (
      conversationId: string,
      auth: Guard,
      access: 'read' | 'write',
    ) => Promise<ControlBinding>,
    private assertCurrent: (
      scope: VerifiedConversationScope,
      auth: Guard,
      access: 'read' | 'write',
    ) => void,
    private options: ScheduleServiceOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.db = new DatabaseSync(database);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runtime_schedule_ingress(operationId TEXT PRIMARY KEY,ownerId TEXT NOT NULL,conversationId TEXT NOT NULL,authority TEXT NOT NULL,digest TEXT NOT NULL,intent TEXT NOT NULL,wire TEXT,state TEXT NOT NULL,evidence TEXT);`);
    initializeOperationRegistry(this.db, 'schedule');
  }
  close() {
    this.db.close();
  }
  private record(operationId: string) {
    return this.db
      .prepare(
        'SELECT * FROM runtime_schedule_ingress WHERE operationId=? AND ownerId=?',
      )
      .get(operationId, this.ownerId) as unknown as Ingress | undefined;
  }
  has(operationId: string) {
    return !!this.record(operationId);
  }
  private authority(bound: ControlBinding) {
    return JSON.stringify({
      scope: browserScope(bound.scope),
      conversationId: bound.scope.conversationId,
      principal: bound.scope.principalId,
      profile: bound.scope.profileId,
      home: this.transport.config.home,
      identity: this.transport.config.identity,
      providerConfigurationDigest: digest(
        this.transport.config.providerEnvironment ?? {},
      ),
    });
  }
  private fence(
    bound: ControlBinding,
    auth: Guard,
    access: 'read' | 'write' = 'read',
  ) {
    this.assertCurrent(bound.scope, auth, access);
    if (
      !this.transport.connected ||
      bound.epoch !== (this.transport.epoch ?? 0) ||
      bound.scope.ownerId !== this.ownerId ||
      bound.binding.liveSessionId !== bound.scope.liveSessionId ||
      bound.binding.durableSessionId !== bound.scope.durableSessionId
    )
      throw new ConversationError('Schedule binding changed.', 409);
    if (!bound.scope.projectId)
      throw new ConversationError(
        'Schedules require a verified runtime project binding.',
        409,
      );
    id.parse(bound.scope.projectId);
  }
  private checkRecord(
    bound: ControlBinding,
    value: unknown,
    scheduleId?: string,
  ) {
    const row = commandScheduleRecordSchema.parse(value);
    if (
      row.owner_agent_id !== bound.scope.agentId ||
      row.project_id !== bound.scope.projectId ||
      row.definition.specification.session_id !==
        bound.scope.durableSessionId ||
      (scheduleId && row.schedule_id !== scheduleId)
    )
      throw new ConversationError('Schedule scope mismatch.', 403);
    return row;
  }
  private decode(result: ScheduleRecordResult): unknown {
    if (
      typeof result.record_json !== 'string' ||
      Buffer.byteLength(result.record_json, 'utf8') > 131072
    )
      throw new ConversationError('Schedule response exceeds its bound.', 409);
    return JSON.parse(result.record_json);
  }
  private async get(bound: ControlBinding, scheduleId: string, auth: Guard) {
    this.fence(bound, auth);
    const params: ScheduleGetParams = {
      schema_version: 1,
      session_id: bound.binding.liveSessionId,
      project_id: bound.scope.projectId!,
      schedule_id: id.parse(scheduleId),
    };
    const result = await this.transport.call('runtime.schedule.get', params);
    this.fence(bound, auth);
    return this.checkRecord(bound, this.decode(result), scheduleId);
  }
  private async schedulerProof(bound: ControlBinding, auth: Guard) {
    this.fence(bound, auth);
    const scheduler = await this.transport.call(
      'runtime.schedule.scheduler.status',
      {
        schema_version: 1,
        session_id: bound.binding.liveSessionId,
      },
    );
    this.fence(bound, auth);
    if (
      scheduler.recurring_admission_ready &&
      (!scheduler.enabled ||
        scheduler.surface !== 'stdio' ||
        !scheduler.maintenance_started ||
        !scheduler.maintenance_live ||
        scheduler.last_tick_succeeded_at === null ||
        scheduler.other_gateway_owner_live ||
        !['healthy', 'waiting', 'ticking'].includes(scheduler.state))
    )
      throw new ConversationError('Inconsistent scheduler owner proof.', 409);
    this.operationalEvidence.record(
      scheduler.recurring_admission_ready
        ? 'ready'
        : scheduler.enabled
          ? 'unavailable'
          : 'unconfigured',
      this.transport.epoch ?? 0,
    );
    return scheduler;
  }
  async readSchedulerStatus(conversationId: string, auth: Guard) {
    const bound = await this.boundSession(conversationId, auth, 'read');
    const scheduler = await this.schedulerProof(bound, auth);
    return {
      version: contractVersion,
      scope: browserScope(bound.scope),
      conversationId,
      scheduler,
    };
  }
  async readSchedule(conversationId: string, scheduleId: string, auth: Guard) {
    const bound = await this.boundSession(conversationId, auth, 'read');
    const schedule = await this.get(bound, scheduleId, auth);
    return {
      version: contractVersion,
      scope: browserScope(bound.scope),
      conversationId,
      schedule,
    };
  }
  async readSchedules(conversationId: string, auth: Guard) {
    const bound = await this.boundSession(conversationId, auth, 'read');
    this.fence(bound, auth);
    const result = await this.transport.call('runtime.schedule.list', {
      schema_version: 1,
      session_id: bound.binding.liveSessionId,
      project_id: bound.scope.projectId!,
    });
    this.fence(bound, auth);
    const list = z
      .strictObject({
        schedules: z.array(z.record(z.string(), z.unknown())).max(100),
      })
      .parse(this.decode(result));
    // Producer list spans an owned project, including monitors and other sessions.
    // Return only command schedules bound to this exact canonical conversation.
    const schedules = list.schedules
      .filter((item) => {
        const definition = item.definition as
          Record<string, unknown> | undefined;
        const spec = definition?.specification as
          Record<string, unknown> | undefined;
        return (
          definition?.kind === 'command' &&
          spec?.session_id === bound.scope.durableSessionId
        );
      })
      .map((item) => this.checkRecord(bound, item));
    if (
      new Set(schedules.map((row) => row.schedule_id)).size !== schedules.length
    )
      throw new ConversationError('Duplicate schedule identity.', 409);
    return {
      version: contractVersion,
      scope: browserScope(bound.scope),
      conversationId,
      schedules,
      complete: false as const,
      limit: 100 as const,
    };
  }
  /** Compatibility projection for current interval-only FE. Rich readSchedule(s)
   * retain at/calendar triggers and exact occurrence/delivery states. Never label
   * a one-shot/calendar schedule as an interval or claim capped history complete. */
  projectInterval(
    row: CommandScheduleRecord,
    conversationId: string,
  ): RuntimeSchedule {
    const definition = row.definition;
    if (definition.trigger.kind !== 'interval')
      throw new ConversationError(
        'This schedule requires the recurrence-aware detail view.',
        409,
      );
    const unknown =
      row.occurrences.some((item) => item.state === 'outcome_unknown') ||
      row.last_error === 'occurrence_outcome_unknown';
    const imported = !!row.import_declaration && !row.cutover_attestation;
    const state =
      row.state === 'revoked'
        ? 'cancelled'
        : unknown
          ? 'awaiting_reconciliation'
          : imported
            ? 'imported_paused'
            : row.state;
    const canActivate =
      !unknown &&
      !imported &&
      definition.expires_at * 1000 > this.now() &&
      row.remaining_checks > 0;
    const actions: RuntimeSchedule['allowedActions'] =
      state === 'cancelled' ? [] : ['cancel'];
    if (row.state === 'active') actions.push('pause');
    if (state === 'paused') {
      actions.push('edit');
      if (canActivate) actions.push('resume');
    }
    if (state === 'active' && canActivate) actions.push('run_now');
    return scheduleSchema.parse({
      id: row.schedule_id,
      revision: row.revision,
      state,
      prompt: definition.specification.prompt,
      threadId: conversationId,
      intervalSeconds: definition.trigger.seconds,
      timeZone: definition.timezone,
      missedRunPolicy: definition.policy.missed_run,
      overlapPolicy: definition.policy.overlap,
      authorityDescription: definition.specification.authority_description,
      authorityExpiresAt: Math.round(definition.expires_at * 1000),
      maxOccurrences: definition.budget.max_checks,
      nextOccurrenceAt:
        row.state === 'active' && canActivate && row.next_due !== null
          ? Math.round(row.next_due * 1000)
          : null,
      allowedActions: actions,
      occurrences: row.occurrences.map((item) => ({
        id: item.occurrence_id,
        missionId: item.mission_id,
        status: (
          {
            accepted: 'scheduled',
            claimed: 'running',
            completed: 'completed',
            failed: 'failed',
            blocked: 'held',
            cancelled: 'held',
            skipped: 'held',
            outcome_unknown: 'unknown',
          } as const
        )[item.state],
        // Admission time is not execution start; the producer has no start timestamp.
        startedAt: null,
        delivery:
          item.delivery_state === 'delivered'
            ? 'delivered'
            : item.delivery_state === 'failed' ||
                item.delivery_state === 'expired'
              ? 'failed'
              : item.delivery_state === 'queued' ||
                  item.delivery_state === 'retry_wait'
                ? 'queued'
                : item.delivery_state === 'held' ||
                    item.delivery_state === 'not_requested'
                  ? 'held'
                  : 'unknown',
      })),
    });
  }
  private receipt(record: Ingress, bound: ControlBinding) {
    return {
      version: contractVersion,
      scope: browserScope(bound.scope),
      operationId: record.operationId,
      intentDigest: record.digest,
      status:
        record.state === 'pending'
          ? ('outcome_unknown' as const)
          : record.state,
      reason:
        record.state === 'accepted'
          ? 'The original schedule operation was durably accepted. Execution and delivery remain separate.'
          : record.state === 'rejected'
            ? 'Schedule operation was rejected before dispatch.'
            : 'Original outcome is unknown. Inspection never repeats the operation.',
    };
  }
  private settle(
    record: Ingress,
    state: Exclude<Ingress['state'], 'pending'>,
    evidence?: unknown,
  ) {
    this.db
      .prepare(
        "UPDATE runtime_schedule_ingress SET state=?,evidence=COALESCE(?,evidence) WHERE operationId=? AND ownerId=? AND state IN ('pending','outcome_unknown')",
      )
      .run(
        state,
        evidence === undefined ? null : JSON.stringify(evidence),
        record.operationId,
        this.ownerId,
      );
    return this.record(record.operationId)!;
  }
  private claim(
    operationId: string,
    intent: Intent,
    submittedDigest: string,
    bound: ControlBinding,
  ) {
    const bytes = canonicalScheduleIntent(intent);
    if (intentDigest(bytes) !== submittedDigest)
      throw new ConversationError('Schedule intent digest mismatch.', 400);
    const authority = this.authority(bound);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (
        !claimOperation(
          this.db,
          operationId,
          this.ownerId,
          'schedule',
          submittedDigest,
          authority,
        )
      )
        throw new ConversationError(
          'Operation conflicts with original intent or authority.',
          409,
        );
      const prior = this.record(operationId);
      if (prior) {
        if (
          prior.intent !== bytes ||
          prior.authority !== authority ||
          prior.conversationId !== bound.scope.conversationId
        )
          throw new ConversationError('Schedule intent is immutable.', 409);
        this.db.exec('COMMIT');
        return { record: prior, fresh: false };
      }
      const count = this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM runtime_schedule_ingress WHERE ownerId=? AND state IN ('pending','outcome_unknown')",
        )
        .get(this.ownerId);
      if (Number(count?.n) >= 256)
        throw new ConversationError('Schedule recovery queue is full.', 503);
      this.db
        .prepare(
          'INSERT INTO runtime_schedule_ingress VALUES(?,?,?,?,?,?,NULL,?,NULL)',
        )
        .run(
          operationId,
          this.ownerId,
          bound.scope.conversationId,
          authority,
          submittedDigest,
          bytes,
          'pending',
        );
      this.db.exec('COMMIT');
      return { record: this.record(operationId)!, fresh: true };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  private target(intent: Intent, conversationId: string) {
    const prefix = `/runtime/conversations/${encodeURIComponent(conversationId)}/schedules`;
    if (intent.path === '/runtime/schedules' || intent.path === prefix) {
      if (
        !['create', 'import'].includes(intent.action) ||
        intent.expectedRevision !== 0
      )
        throw new ConversationError('Invalid new schedule intent.', 400);
      return null;
    }
    const expression = new RegExp(
      `^${intent.path.startsWith('/runtime/conversations/') ? prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '/runtime/schedules'}/([^/]+)/actions$`,
    );
    const match = intent.path.match(expression);
    if (
      !match ||
      ['create', 'import'].includes(intent.action) ||
      intent.expectedRevision < 1
    )
      throw new ConversationError('Invalid schedule action path.', 400);
    let value: string;
    try {
      value = decodeURIComponent(match[1]);
    } catch {
      throw new ConversationError('Invalid schedule target.', 400);
    }
    if (encodeURIComponent(value) !== match[1])
      throw new ConversationError('Noncanonical schedule target.', 400);
    return id.parse(value);
  }
  private definition(
    config: z.infer<typeof configSchema>,
    bound: ControlBinding,
    scheduleId: string,
    version: number,
    original?: CommandScheduleRecord,
  ) {
    if (config.threadId !== bound.scope.conversationId)
      throw new ConversationError('Schedule conversation mismatch.', 403);
    const trigger =
      config.trigger ??
      (original?.definition.trigger.kind === 'interval' &&
      original.definition.trigger.seconds === config.intervalSeconds
        ? original.definition.trigger
        : {
            kind: 'interval',
            seconds: config.intervalSeconds!,
            anchor: (this.now() + config.intervalSeconds! * 1000) / 1000,
          });
    return commandScheduleDefinitionSchema.parse({
      schema_version: 1,
      schedule_id: scheduleId,
      version,
      project_id: bound.scope.projectId,
      timezone: config.timeZone,
      trigger,
      policy: {
        missed_run: config.missedRunPolicy,
        overlap: config.overlapPolicy,
        grace_seconds: original?.definition.policy.grace_seconds ?? 120,
      },
      budget: {
        max_checks: config.maxOccurrences,
        max_bytes: original?.definition.budget.max_bytes ?? 65536,
        deadline_seconds: original?.definition.budget.deadline_seconds ?? 300,
      },
      expires_at: config.authorityExpiresAt / 1000,
      kind: 'command',
      specification: {
        prompt: config.prompt,
        session_id: bound.scope.durableSessionId,
        authority_description: config.authorityDescription,
      },
    });
  }
  private async prepare(
    record: Ingress,
    bound: ControlBinding,
    intent: Intent,
    auth: Guard,
    migration?: VerifiedLegacySchedule,
  ): Promise<WireRequest> {
    const scheduleId = this.target(intent, bound.scope.conversationId);
    const command_id = record.operationId;
    if (intent.action === 'create' || intent.action === 'edit') {
      const config = configSchema.parse(intent.payload);
      if (config.authorityExpiresAt <= this.now())
        throw new ConversationError('Schedule authority expired.', 409);
      const previous = scheduleId
        ? await this.get(bound, scheduleId, auth)
        : undefined;
      if (
        previous &&
        (previous.revision !== intent.expectedRevision ||
          previous.state !== 'paused')
      )
        throw new ConversationError(
          'Pause and edit the exact schedule revision.',
          409,
        );
      const definition = this.definition(
        config,
        bound,
        scheduleId ?? `dots_${command_id}`,
        (previous?.version ?? 0) + 1,
        previous,
      );
      return {
        method: 'runtime.schedule.create',
        params: {
          command_id,
          definition_json: JSON.stringify(definition),
          expected_revision: previous?.revision ?? null,
        },
      };
    }
    if (intent.action === 'import') {
      if (!migration)
        throw new ConversationError(
          'Verified migration authority required.',
          403,
        );
      migration.assertFrozen();
      const declaration = legacyScheduleDeclarationSchema.parse(
        migration.declaration,
      );
      const definition = commandScheduleDefinitionSchema.parse(
        migration.definition,
      );
      if (
        JSON.stringify(canonical(intent.payload)) !==
        JSON.stringify(canonical({ declaration, definition }))
      )
        throw new ConversationError('Legacy migration intent changed.', 409);
      if (
        definition.schedule_id !==
          `import_${digest(declaration.source_id).slice(0, 32)}` ||
        definition.project_id !== bound.scope.projectId ||
        definition.specification.session_id !== bound.scope.durableSessionId ||
        definition.version !== 1
      )
        throw new ConversationError('Stable import binding mismatch.', 403);
      return {
        method: 'runtime.schedule.import',
        params: {
          command_id,
          definition_json: JSON.stringify(definition),
          expected_revision: null,
          import_json: JSON.stringify(declaration),
        },
      };
    }
    const previous = await this.get(bound, scheduleId!, auth);
    if (previous.revision !== intent.expectedRevision)
      throw new ConversationError('Schedule revision changed.', 409);
    const params = {
      command_id,
      project_id: bound.scope.projectId!,
      schedule_id: scheduleId!,
      expected_revision: intent.expectedRevision,
    };
    if (intent.action === 'cutover') {
      if (
        !migration ||
        migration.declaration.source_id !==
          previous.import_declaration?.source_id ||
        !migration.retirementReceipt ||
        previous.state !== 'paused'
      )
        throw new ConversationError(
          'Verified legacy retirement required.',
          409,
        );
      migration.assertRetired();
      return {
        method: 'runtime.schedule.cutover',
        params: {
          ...params,
          source_id: migration.declaration.source_id,
          retirement_receipt: migration.retirementReceipt,
          unresolved_occurrences: [],
        },
      };
    }
    empty.parse(intent.payload);
    if (intent.action === 'resume' || intent.action === 'run_now') {
      const scheduler = await this.schedulerProof(bound, auth);
      if (!scheduler.recurring_admission_ready)
        throw new ConversationError(
          'Recurring scheduler owner is not currently qualified.',
          503,
        );
      this.options.assertSchedulerOwner?.(bound.scope);
      if (
        previous.definition.expires_at * 1000 <= this.now() ||
        previous.remaining_checks === 0 ||
        (previous.import_declaration && !previous.cutover_attestation) ||
        previous.occurrences.some((item) => item.state === 'outcome_unknown')
      )
        throw new ConversationError(
          'Schedule authority expired, exhausted or awaiting reconciliation.',
          409,
        );
    }
    if (intent.action === 'run_now') {
      if (previous.state !== 'active')
        throw new ConversationError(
          'Run-now requires an active schedule.',
          409,
        );
      return { method: 'runtime.schedule.run_now', params };
    }
    return {
      method: 'runtime.schedule.update',
      params: {
        ...params,
        state:
          intent.action === 'resume'
            ? 'active'
            : intent.action === 'pause'
              ? 'paused'
              : 'revoked',
      },
    };
  }
  private checkMutation(
    record: Ingress,
    bound: ControlBinding,
    request: WireRequest,
    result: ScheduleRecordResult,
  ) {
    const value = this.decode(result);
    if (request.method === 'runtime.schedule.run_now') {
      const receipt = z
        .strictObject({
          schedule_id: id,
          occurrence_id: id,
          session_id: id,
          command_id: id.nullable(),
          command_receipt: z
            .strictObject({
              schema_version: z.literal(1),
              command_id: id,
              status: z.enum(['accepted', 'duplicate', 'rejected']),
              durable_revision: integer,
              run_id: id.nullable(),
              conflict: z
                .object({ code: z.string(), message: z.string() })
                .nullable()
                .optional(),
            })
            .nullable(),
          state: z.enum([
            'accepted',
            'claimed',
            'completed',
            'failed',
            'blocked',
            'cancelled',
            'skipped',
            'outcome_unknown',
          ]),
          dispatch_performed: z.literal(false),
        })
        .parse(value);
      if (
        receipt.schedule_id !== request.params.schedule_id ||
        receipt.session_id !== bound.scope.durableSessionId ||
        receipt.command_id !== record.operationId ||
        receipt.command_receipt?.command_id !== record.operationId ||
        receipt.command_receipt.status === 'rejected'
      )
        throw new ConversationError('Run-now receipt mismatch.', 409);
      return receipt;
    }
    const row = this.checkRecord(
      bound,
      value,
      'schedule_id' in request.params ? request.params.schedule_id : undefined,
    );
    if (
      request.method === 'runtime.schedule.create' ||
      request.method === 'runtime.schedule.import'
    ) {
      if (
        JSON.stringify(canonical(row.definition)) !==
        JSON.stringify(canonical(JSON.parse(request.params.definition_json)))
      )
        throw new ConversationError(
          'Immutable schedule definition mismatch.',
          409,
        );
      if (
        request.method === 'runtime.schedule.import' &&
        JSON.stringify(canonical(row.import_declaration)) !==
          JSON.stringify(canonical(JSON.parse(request.params.import_json)))
      )
        throw new ConversationError('Legacy import declaration mismatch.', 409);
    } else if (request.method === 'runtime.schedule.update') {
      if (
        row.state !== request.params.state ||
        row.revision !== request.params.expected_revision + 1
      )
        throw new ConversationError('Schedule control receipt mismatch.', 409);
    } else if (request.method === 'runtime.schedule.cutover') {
      if (
        row.cutover_attestation?.retirement_receipt !==
          request.params.retirement_receipt ||
        row.cutover_attestation.source_id !== request.params.source_id ||
        row.revision !== request.params.expected_revision + 1
      )
        throw new ConversationError(
          'Schedule retirement receipt mismatch.',
          409,
        );
    }
    return row;
  }
  async admit(
    conversationId: string,
    path: string,
    raw: ScheduleAction,
    auth: Guard,
  ) {
    const input = scheduleActionSchema.parse(raw);
    const intent: Intent = {
      path,
      action: input.action,
      payload: input.payload,
      expectedRevision: input.expectedRevision,
    };
    this.target(intent, conversationId);
    if (input.action === 'create' || input.action === 'edit')
      configSchema.parse(input.payload);
    else empty.parse(input.payload);
    return this.mutate(
      conversationId,
      input.operationId,
      intent,
      input.intentDigest,
      input.expectedGeneration,
      auth,
    );
  }
  /** Server migration entry point. Operation IDs are stable orchestration IDs;
   * resolveLegacy must read the frozen legacy owner/claims before every attempt. */
  async importLegacy(
    conversationId: string,
    operationId: string,
    sourceId: string,
    expectedGeneration: number,
    auth: Guard,
  ) {
    return this.migrate(
      conversationId,
      operationId,
      sourceId,
      null,
      0,
      expectedGeneration,
      auth,
    );
  }
  async cutoverLegacy(
    conversationId: string,
    operationId: string,
    sourceId: string,
    scheduleId: string,
    expectedRevision: number,
    expectedGeneration: number,
    auth: Guard,
  ) {
    return this.migrate(
      conversationId,
      operationId,
      sourceId,
      scheduleId,
      expectedRevision,
      expectedGeneration,
      auth,
    );
  }
  private async migrate(
    conversationId: string,
    operationId: string,
    sourceId: string,
    scheduleId: string | null,
    expectedRevision: number,
    expectedGeneration: number,
    auth: Guard,
  ) {
    z.uuid().parse(operationId);
    id.parse(sourceId);
    const bound = await this.boundSession(conversationId, auth, 'write');
    this.fence(bound, auth, 'write');
    const migration = await this.options.resolveLegacy?.(sourceId, bound.scope);
    if (!migration)
      throw new ConversationError(
        'Legacy scheduler retirement connector is not configured.',
        503,
      );
    this.fence(bound, auth, 'write');
    migration.assertFrozen();
    const declaration = legacyScheduleDeclarationSchema.parse(
      migration.declaration,
    );
    if (declaration.source_id !== sourceId)
      throw new ConversationError('Legacy source mismatch.', 403);
    const intent: Intent = {
      path: scheduleId
        ? `/runtime/schedules/${encodeURIComponent(id.parse(scheduleId))}/actions`
        : '/runtime/schedules',
      action: scheduleId ? 'cutover' : 'import',
      expectedRevision,
      payload: scheduleId
        ? { sourceId, retirementReceipt: migration.retirementReceipt }
        : {
            declaration,
            definition: commandScheduleDefinitionSchema.parse(
              migration.definition,
            ),
          },
    };
    return this.mutate(
      conversationId,
      operationId,
      intent,
      intentDigest(canonicalScheduleIntent(intent)),
      expectedGeneration,
      auth,
      migration,
    );
  }
  private async mutate(
    conversationId: string,
    operationId: string,
    intent: Intent,
    submittedDigest: string,
    generation: number,
    auth: Guard,
    migration?: VerifiedLegacySchedule,
  ) {
    const bound = await this.boundSession(conversationId, auth, 'write');
    this.fence(bound, auth, 'write');
    if (generation !== bound.scope.authorityRevision)
      throw new ConversationError(
        'Schedule authority generation changed.',
        409,
      );
    const { record, fresh } = this.claim(
      operationId,
      intent,
      submittedDigest,
      bound,
    );
    if (!fresh) return this.inspect(operationId, auth);
    let dispatched = false;
    try {
      const request = await this.prepare(
        record,
        bound,
        intent,
        auth,
        migration,
      );
      this.fence(bound, auth, 'write');
      if (migration) {
        migration.assertFrozen();
        if (intent.action === 'cutover') migration.assertRetired();
      }
      // Persist exact wire intent BEFORE calling the runtime. Recovery never resends.
      this.db
        .prepare(
          'UPDATE runtime_schedule_ingress SET wire=? WHERE operationId=? AND ownerId=? AND wire IS NULL',
        )
        .run(JSON.stringify(request), operationId, this.ownerId);
      dispatched = true;
      const result = await this.transport.call(request.method, {
        ...request.params,
        schema_version: 1,
        session_id: bound.binding.liveSessionId,
      } as ScheduleParams[typeof request.method]);
      const evidence = this.checkMutation(record, bound, request, result);
      const settled = this.settle(record, 'accepted', evidence);
      this.fence(bound, auth);
      return this.receipt(settled, bound);
    } catch (error) {
      this.settle(record, dispatched ? 'outcome_unknown' : 'rejected');
      this.fence(bound, auth);
      if (!dispatched) throw error;
      return this.receipt(this.record(operationId)!, bound);
    }
  }
  async inspect(operationId: string, auth: Guard) {
    z.uuid().parse(operationId);
    const record = this.record(operationId);
    if (!record)
      throw new ConversationError(
        'Schedule operation was not admitted. Inspection never dispatches.',
        404,
      );
    const bound = await this.boundSession(record.conversationId, auth, 'read');
    this.fence(bound, auth);
    if (record.authority !== this.authority(bound))
      throw new ConversationError('Schedule authority changed.', 403);
    if (record.state === 'accepted' || record.state === 'rejected')
      return this.receipt(record, bound);
    if (!record.wire) return this.receipt(record, bound); // pre-dispatch crash, no speculative send
    const evidence = await this.transport.call('runtime.command.receipt', {
      schema_version: 1,
      session_id: bound.binding.liveSessionId,
      command_id: operationId,
      message_limit: 1,
      message_cursor: null,
    });
    this.fence(bound, auth);
    if (
      evidence.command_id !== operationId ||
      (evidence.receipt && evidence.receipt.command_id !== operationId) ||
      evidence.found !== !!evidence.receipt ||
      evidence.messages.length > 1
    )
      throw new ConversationError(
        'Original schedule command receipt mismatch.',
        409,
      );
    // A command acceptance proves this original control/admission only. It does
    // not imply scheduled execution, delivery, or the current schedule revision.
    const accepted =
      evidence.found &&
      evidence.receipt &&
      evidence.receipt.status !== 'rejected';
    return this.receipt(
      this.settle(record, accepted ? 'accepted' : 'outcome_unknown', evidence),
      bound,
    );
  }
}
