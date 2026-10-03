import type { WorkflowRunPrepareResult } from '../../shared/runtime/be06-producer/wire.generated.js';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { contractVersion } from '../../shared/runtime/contracts.js';
import {
  reviewSchema,
  type RuntimeReview,
} from '../../shared/runtime/reviews.js';
import type {
  MissionListResult,
  MissionGetResult,
  MissionResult,
  RuntimeApprovalGetResult,
  RuntimeApprovalResolveResult,
  RuntimeApprovalListResult,
  RuntimeControlResult,
  RuntimeDeliveryReceipt,
  RuntimeEffectListResult,
} from '../../shared/runtime/producer/wire.generated.js';
import { browserScope, type Guard } from '../self-hosted-platform.js';
import type { VerifiedConversationScope } from './bindings.js';
import { ConversationError, intentDigest } from './conversation-ledger.js';
import {
  initializeOperationRegistry,
  claimOperation,
} from './operation-registry.js';
import type { ReadBinding } from './projection.js';
import type { LaunchConfig } from './stdio.js';

export interface ControlResults {
  'runtime.control.get': RuntimeControlResult;
  'runtime.control.pause': RuntimeControlResult;
  'runtime.control.resume': RuntimeControlResult;
  'runtime.approvals.list': RuntimeApprovalListResult;
  'runtime.approval.get': RuntimeApprovalGetResult;
  'runtime.approval.resolve': RuntimeApprovalResolveResult;
  'runtime.effects.list': RuntimeEffectListResult;
  'runtime.mission.history': MissionListResult;
  'runtime.mission.get': MissionGetResult;
  'runtime.mission.pause': MissionResult;
  'runtime.mission.resume': MissionResult;
  'runtime.mission.cancel': MissionResult;
  'runtime.delivery.status': RuntimeDeliveryReceipt;
  'runtime.delivery.retry': RuntimeDeliveryReceipt;
}
export interface ControlTransport {
  readonly config: LaunchConfig;
  readonly connected: boolean;
  readonly epoch?: number;
  call<M extends keyof ControlResults>(
    method: M,
    params: unknown,
  ): Promise<ControlResults[M]>;
}
/** Only CommandService may supply this verified, already connected binding. */
export interface ControlBinding {
  scope: VerifiedConversationScope;
  binding: ReadBinding;
  epoch: number;
}
export const controlActionSchema = z.strictObject({
  operationId: z.uuid(),
  intentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  action: z.enum([
    'pause',
    'resume',
    'cancel',
    'approval.resolve',
    'retry_delivery',
  ]),
  payload: z.record(z.string(), z.unknown()),
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  expectedGeneration: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER),
});
export type ControlAction = z.infer<typeof controlActionSchema>;
interface ControlRecord {
  operationId: string;
  ownerId: string;
  conversationId: string;
  authority: string;
  digest: string;
  intent: string;
  state: 'pending' | 'accepted' | 'rejected' | 'outcome_unknown';
  result: string | null;
  evidence: string | null;
}
type ActionIntent = Pick<
  ControlAction,
  'action' | 'payload' | 'expectedRevision'
> & { path: string };
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
export const canonicalControlIntent = (value: ActionIntent) =>
  JSON.stringify(canonical(value));
const createByteDigest = (value: Buffer) =>
  createHash('sha256').update(value).digest('hex');
const jsonDigest = (value: unknown) =>
  intentDigest(JSON.stringify(canonical(value)));
const id = z.string().min(1).max(256);
const decisionSchema = z.strictObject({
  approvalDigest: z.string().regex(/^[a-f0-9]{64}$/),
  choice: z.enum(['once', 'deny']),
});
const emptyPayload = z.strictObject({});
const retryPayload = z.strictObject({
  artifactId: id,
  version: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
function target(
  path: string,
  family: 'reviews' | 'missions' | 'deliveries',
  suffix: string,
) {
  const match = path.match(
    new RegExp(`^/runtime/${family}/([^/]+)/${suffix}$`),
  );
  if (!match) return undefined;
  let value: string;
  try {
    value = decodeURIComponent(match[1]);
  } catch {
    throw new ConversationError('Invalid action target.', 400);
  }
  if (encodeURIComponent(value) !== match[1] || !id.safeParse(value).success)
    throw new ConversationError('Invalid action target.', 400);
  return value;
}
function actionPath(path: string, conversationId: string) {
  const prefix = `/runtime/conversations/${encodeURIComponent(conversationId)}/`;
  if (!path.startsWith(prefix))
    throw new ConversationError('Control conversation path mismatch.', 400);
  return `/runtime/${path.slice(prefix.length)}`;
}
/** BE04 ingress retains original intent and exact receipts. No recovery method dispatches. */
export class RuntimeControlService {
  private db: DatabaseSync;
  constructor(
    private ownerId: string,
    database: string,
    private transport: ControlTransport,
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
    private nativeDecision?: (
      bound: ControlBinding,
      params: {
        approval_id: string;
        approval_digest: string;
        choice: 'once' | 'deny';
      },
      auth: Guard,
      markDispatched: () => void,
    ) => Promise<RuntimeApprovalResolveResult | undefined>,
    private nativeDecisionReason?: (
      conversationId: string,
      review: RuntimeApprovalGetResult,
    ) => string | null,
  ) {
    this.db = new DatabaseSync(database);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runtime_control_ingress(operationId TEXT PRIMARY KEY,ownerId TEXT NOT NULL,conversationId TEXT NOT NULL,authority TEXT NOT NULL,digest TEXT NOT NULL,intent TEXT NOT NULL,state TEXT NOT NULL,result TEXT,evidence TEXT);
      CREATE TABLE IF NOT EXISTS runtime_review_presentations(ownerId TEXT NOT NULL,conversationId TEXT NOT NULL,approvalId TEXT NOT NULL,authority TEXT NOT NULL,liveBinding TEXT NOT NULL,fingerprint TEXT NOT NULL,PRIMARY KEY(ownerId,conversationId,approvalId));`);
    initializeOperationRegistry(this.db, 'control');
  }
  close() {
    this.db.close();
  }
  private record(operationId: string) {
    return this.db
      .prepare(
        'SELECT * FROM runtime_control_ingress WHERE operationId=? AND ownerId=?',
      )
      .get(operationId, this.ownerId) as unknown as ControlRecord | undefined;
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
      providerConfigurationDigest: jsonDigest(
        this.transport.config.providerEnvironment ?? {},
      ),
    });
  }
  private liveKey(bound: ControlBinding) {
    return JSON.stringify([
      bound.binding.liveSessionId,
      bound.scope.liveGeneration,
      bound.epoch,
    ]);
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
      throw new ConversationError('Runtime control binding changed.', 409);
  }
  private async call<M extends keyof ControlResults>(
    bound: ControlBinding,
    method: M,
    params: object,
    auth: Guard,
    access: 'read' | 'write' = 'read',
  ) {
    this.fence(bound, auth, access);
    const value = await this.transport.call(method, {
      ...params,
      schema_version: 1,
      session_id: bound.binding.liveSessionId,
    });
    this.fence(bound, auth, access);
    return value;
  }
  async readControl(conversationId: string, auth: Guard) {
    const bound = await this.boundSession(conversationId, auth, 'read');
    const result = await this.call(bound, 'runtime.control.get', {}, auth);
    return {
      version: contractVersion,
      scope: browserScope(bound.scope),
      conversationId,
      ...result,
    };
  }
  async readMissions(conversationId: string, auth: Guard) {
    const bound = await this.boundSession(conversationId, auth, 'read');
    const result = await this.call(
      bound,
      'runtime.mission.history',
      { limit: 100 },
      auth,
    );
    if (
      result.limit !== 100 ||
      result.complete !== false ||
      result.missions.length > 100 ||
      result.missions.some(
        (mission) =>
          mission.session_id !== bound.scope.durableSessionId ||
          mission.agent_id !== bound.scope.agentId,
      )
    )
      throw new ConversationError('Mission scope mismatch.', 403);
    return {
      version: contractVersion,
      scope: browserScope(bound.scope),
      conversationId,
      ...result,
    };
  }
  async readEffects(conversationId: string, auth: Guard) {
    const bound = await this.boundSession(conversationId, auth, 'read');
    const result = await this.call(
      bound,
      'runtime.effects.list',
      { limit: 100, unresolved_only: true },
      auth,
    );
    if (
      result.limit !== 100 ||
      result.complete !== false ||
      result.effects.length > 100
    )
      throw new ConversationError('Effect snapshot exceeds its bound.', 409);
    return {
      version: contractVersion,
      scope: browserScope(bound.scope),
      conversationId,
      ...result,
    };
  }
  async readReviews(conversationId: string, auth: Guard) {
    const bound = await this.boundSession(conversationId, auth, 'read');
    const result = await this.call(
      bound,
      'runtime.approvals.list',
      { limit: 100 },
      auth,
    );
    if (
      result.limit !== 100 ||
      result.complete !== false ||
      result.approvals.length > 100
    )
      throw new ConversationError('Approval snapshot exceeds its bound.', 409);
    return {
      version: contractVersion,
      scope: browserScope(bound.scope),
      conversationId,
      ...result,
    };
  }
  private exactReview(
    value: RuntimeApprovalGetResult,
    scope: VerifiedConversationScope,
  ): RuntimeReview | null {
    const { detail, approval } = value;
    if (!detail.reviewable) return null;
    if (
      !detail.review ||
      !detail.review_digest ||
      value.input_revision === null ||
      value.artifact_revision === null
    )
      throw new ConversationError('Exact review evidence is incomplete.', 409);
    const { action, content } = detail.review;
    let text: string | null = null;
    if (content) {
      const bytes = Buffer.from(content.data, 'base64');
      if (bytes.length > 65536 || bytes.toString('base64') !== content.data)
        throw new ConversationError(
          'Exact review content encoding is invalid.',
          409,
        );
      // Digest bytes directly: decoding to a JS string first would change non-ASCII bytes.
      if (createByteDigest(bytes) !== content.sha256)
        throw new ConversationError(
          'Exact review content digest changed.',
          409,
        );
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        throw new ConversationError(
          'Opaque review content is unavailable.',
          409,
        );
      }
    }
    return reviewSchema.parse({
      id: approval.approval_id,
      // Producer reviews are immutable and have no revision field. Zero is the
      // browser envelope version; approval_digest is the exact producer fence.
      revision: 0,
      approvalDigest: approval.approval_digest,
      actionDigest: approval.action_digest,
      scope: browserScope(scope),
      target: JSON.stringify({
        destination: action.destination,
        purpose: action.destination_purpose,
        resourceRoots: action.resource_roots,
      }),
      action: action.name,
      content: JSON.stringify(
        {
          action,
          content: text,
          mime: content?.mime ?? null,
          contentSha256: content?.sha256 ?? null,
          inputRevision: value.input_revision,
          artifactRevision: value.artifact_revision,
        },
        null,
        2,
      ),
      expiresAt: Math.floor(approval.expires_at * 1000),
      status: approval.status,
    });
  }
  private reviewFingerprint(value: RuntimeApprovalGetResult) {
    return jsonDigest({
      approvalDigest: value.approval.approval_digest,
      detail: value.detail,
      inputRevision: value.input_revision,
      artifactRevision: value.artifact_revision,
    });
  }
  async readReview(conversationId: string, approvalId: string, auth: Guard) {
    const bound = await this.boundSession(conversationId, auth, 'read');
    const result = await this.call(
      bound,
      'runtime.approval.get',
      { approval_id: id.parse(approvalId) },
      auth,
    );
    if (result.approval.approval_id !== approvalId)
      throw new ConversationError('Approval scope mismatch.', 403);
    const review = this.exactReview(result, bound.scope);
    if (review)
      this.db
        .prepare(
          'INSERT INTO runtime_review_presentations VALUES(?,?,?,?,?,?) ON CONFLICT(ownerId,conversationId,approvalId) DO UPDATE SET authority=excluded.authority,liveBinding=excluded.liveBinding,fingerprint=excluded.fingerprint',
        )
        .run(
          this.ownerId,
          conversationId,
          approvalId,
          this.authority(bound),
          this.liveKey(bound),
          this.reviewFingerprint(result),
        );
    return {
      version: contractVersion,
      scope: browserScope(bound.scope),
      conversationId,
      review,
      detail: result,
      decisionUnavailableReason:
        this.nativeDecisionReason?.(conversationId, result) ?? null,
    };
  }
  /** Reuses the exact review presentation ledger; hashes without retained bytes cannot authorize publication. */
  async assertWorkflowPublicationPresented(
    conversationId: string,
    prepared: WorkflowRunPrepareResult,
    auth: Guard,
  ) {
    const bound = await this.boundSession(conversationId, auth, 'write');
    if (prepared.proposals.length < 2 || prepared.proposals.length > 33)
      throw new ConversationError(
        'Exact workflow output set is unavailable.',
        409,
      );
    for (const proposal of prepared.proposals) {
      const current = await this.call(
        bound,
        'runtime.approval.get',
        { approval_id: proposal.approval_id },
        auth,
        'write',
      );
      const shown = this.db
        .prepare(
          'SELECT * FROM runtime_review_presentations WHERE ownerId=? AND conversationId=? AND approvalId=?',
        )
        .get(this.ownerId, conversationId, proposal.approval_id);
      const material = current.detail.review,
        approval = current.approval;
      const arguments_ = material?.action.arguments;
      const descriptor =
        arguments_ &&
        typeof arguments_.descriptor === 'object' &&
        arguments_.descriptor !== null
          ? (arguments_.descriptor as Record<string, unknown>)
          : undefined;
      const content = material?.content;
      if (
        !shown ||
        shown.authority !== this.authority(bound) ||
        shown.liveBinding !== this.liveKey(bound) ||
        shown.fingerprint !== this.reviewFingerprint(current) ||
        !this.exactReview(current, bound.scope) ||
        material?.action.operation_class !== 'project_artifact_publish' ||
        !content ||
        !descriptor ||
        arguments_?.project_id !== proposal.project_id ||
        approval.approval_id !== proposal.approval_id ||
        approval.approval_digest !== proposal.approval_digest ||
        !['pending', 'approved'].includes(approval.status) ||
        approval.expired ||
        approval.expires_at * 1000 <= Date.now() ||
        ['artifact_id', 'version', 'sha256', 'size', 'mime'].some(
          (key) => descriptor[key] !== proposal[key as keyof typeof proposal],
        ) ||
        content.sha256 !== proposal.sha256 ||
        content.mime !== proposal.mime ||
        Buffer.from(content.data, 'base64').length !== proposal.size
      )
        throw new ConversationError(
          'Display every exact workflow output before publication; the bytes, approval or scope changed.',
          409,
        );
    }
    this.fence(bound, auth, 'write');
  }
  private checkDelivery(
    bound: ControlBinding,
    value: RuntimeDeliveryReceipt,
    deliveryId: string,
  ) {
    const destination = value.destination;
    if (
      value.delivery_id !== deliveryId ||
      destination.kind !== 'local_runtime' ||
      destination.session_id !== bound.scope.durableSessionId ||
      destination.principal_id !== bound.scope.principalId ||
      destination.profile_id !== bound.scope.profileId ||
      destination.agent_id !== bound.scope.agentId
    )
      throw new ConversationError('Delivery scope mismatch.', 403);
  }
  async readDelivery(conversationId: string, deliveryId: string, auth: Guard) {
    const bound = await this.boundSession(conversationId, auth, 'read');
    const result = await this.call(
      bound,
      'runtime.delivery.status',
      { delivery_id: id.parse(deliveryId) },
      auth,
    );
    this.checkDelivery(bound, result, deliveryId);
    return {
      version: contractVersion,
      scope: browserScope(bound.scope),
      conversationId,
      delivery: result,
    };
  }
  private receipt(
    record: ControlRecord,
    bound: ControlBinding,
    status = record.state,
    reason?: string,
  ) {
    return {
      version: contractVersion,
      scope: browserScope(bound.scope),
      operationId: record.operationId,
      intentDigest: record.digest,
      status: status === 'pending' ? ('outcome_unknown' as const) : status,
      reason:
        reason ??
        (status === 'accepted'
          ? 'The exact control receipt was recorded. Execution, effects and delivery remain separate.'
          : status === 'rejected'
            ? 'Control was rejected before dispatch.'
            : 'Original outcome is unknown. Inspection never repeats this action.'),
    };
  }
  private settle(
    record: ControlRecord,
    bound: ControlBinding,
    state: Exclude<ControlRecord['state'], 'pending'>,
    evidence?: unknown,
    reason?: string,
  ) {
    const receipt = this.receipt(record, bound, state, reason);
    this.db
      .prepare(
        'UPDATE runtime_control_ingress SET state=?,result=?,evidence=COALESCE(?,evidence) WHERE operationId=? AND ownerId=?',
      )
      .run(
        state,
        JSON.stringify(receipt),
        evidence === undefined ? null : JSON.stringify(evidence),
        record.operationId,
        this.ownerId,
      );
    return receipt;
  }
  private admitRecord(
    operationId: string,
    digest: string,
    intent: ActionIntent,
    bound: ControlBinding,
  ) {
    const bytes = canonicalControlIntent(intent);
    if (intentDigest(bytes) !== digest)
      throw new ConversationError('Control intent digest mismatch.', 400);
    const authority = this.authority(bound);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (
        !claimOperation(
          this.db,
          operationId,
          this.ownerId,
          'control',
          digest,
          authority,
        )
      )
        throw new ConversationError(
          'Operation ID conflicts with original intent or authority.',
          409,
        );
      const prior = this.record(operationId);
      if (prior) {
        if (
          prior.intent !== bytes ||
          prior.authority !== authority ||
          prior.conversationId !== bound.scope.conversationId
        )
          throw new ConversationError(
            'Control operation conflicts with original intent.',
            409,
          );
        this.db.exec('COMMIT');
        return { record: prior, fresh: false };
      }
      const pending = this.db
        .prepare(
          "SELECT count(*) AS n FROM runtime_control_ingress WHERE ownerId=? AND state IN ('pending','outcome_unknown')",
        )
        .get(this.ownerId);
      if (Number(pending?.n) >= 256)
        throw new ConversationError('Control recovery queue is full.', 503);
      this.db
        .prepare(
          'INSERT INTO runtime_control_ingress VALUES(?,?,?,?,?,?,?,NULL,NULL)',
        )
        .run(
          operationId,
          this.ownerId,
          bound.scope.conversationId,
          authority,
          digest,
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
  private validateIntent(intent: ActionIntent, conversationId: string) {
    const path = actionPath(intent.path, conversationId);
    if (
      path === '/runtime/control' &&
      ['pause', 'resume'].includes(intent.action)
    ) {
      emptyPayload.parse(intent.payload);
      return;
    }
    if (
      target(path, 'reviews', 'decision') &&
      intent.action === 'approval.resolve' &&
      intent.expectedRevision === 0
    ) {
      decisionSchema.parse(intent.payload);
      return;
    }
    if (
      target(path, 'missions', 'actions') &&
      ['pause', 'resume', 'cancel'].includes(intent.action) &&
      intent.expectedRevision > 0
    ) {
      emptyPayload.parse(intent.payload);
      return;
    }
    if (
      target(path, 'deliveries', 'actions') &&
      intent.action === 'retry_delivery'
    ) {
      retryPayload.parse(intent.payload);
      return;
    }
    throw new ConversationError(
      'This exact runtime control is unsupported.',
      400,
    );
  }
  async admit(
    conversationId: string,
    path: string,
    input: ControlAction,
    auth: Guard,
  ) {
    input = controlActionSchema.parse(input);
    const intent = {
      path,
      action: input.action,
      payload: input.payload,
      expectedRevision: input.expectedRevision,
    };
    this.validateIntent(intent, conversationId);
    const bound = await this.boundSession(conversationId, auth, 'write');
    this.fence(bound, auth, 'write');
    if (input.expectedGeneration !== bound.scope.authorityRevision)
      throw new ConversationError('Control authority generation changed.', 409);
    const { record, fresh } = this.admitRecord(
      input.operationId,
      input.intentDigest,
      intent,
      bound,
    );
    if (!fresh) return this.inspect(input.operationId, auth);
    let dispatched = false;
    try {
      const dispatch = async <M extends keyof ControlResults>(
        method: M,
        params: object,
      ) => {
        this.fence(bound, auth, 'write');
        // Persist a valid producer receipt before checking whether its browser
        // detached. The durable action belongs to the original owner regardless.
        if (method === 'runtime.approval.resolve' && this.nativeDecision) {
          const result = await this.nativeDecision(
            bound,
            params as {
              approval_id: string;
              approval_digest: string;
              choice: 'once' | 'deny';
            },
            auth,
            () => {
              dispatched = true;
            },
          );
          if (result) return result as ControlResults[M];
        }
        dispatched = true;
        return this.transport.call(method, {
          ...params,
          schema_version: 1,
          session_id: bound.binding.liveSessionId,
        });
      };
      const evidence = await this.execute(
        record,
        bound,
        intent,
        auth,
        dispatch,
      );
      const receipt = this.settle(record, bound, 'accepted', evidence);
      this.fence(bound, auth, 'read');
      return receipt;
    } catch (error) {
      const latest = this.record(record.operationId)!;
      if (latest.state === 'accepted') {
        this.fence(bound, auth, 'read');
        throw error;
      }
      const receipt = this.settle(
        record,
        bound,
        dispatched ? 'outcome_unknown' : 'rejected',
      );
      this.fence(bound, auth, 'read');
      if (!dispatched && error instanceof ConversationError) throw error;
      return receipt;
    }
  }
  private async execute(
    record: ControlRecord,
    bound: ControlBinding,
    intent: ActionIntent,
    auth: Guard,
    dispatch: <M extends keyof ControlResults>(
      method: M,
      params: object,
    ) => Promise<ControlResults[M]>,
  ): Promise<unknown> {
    const path = actionPath(intent.path, record.conversationId);
    if (path === '/runtime/control') {
      const method =
        intent.action === 'pause'
          ? 'runtime.control.pause'
          : 'runtime.control.resume';
      const result = await dispatch(method, {
        operation_id: record.operationId,
        expected_revision: intent.expectedRevision,
      });
      this.checkControlReceipt(record, intent, result);
      return result;
    }
    const approvalId = target(path, 'reviews', 'decision');
    if (approvalId) {
      const payload = decisionSchema.parse(intent.payload);
      const current = await this.call(
        bound,
        'runtime.approval.get',
        { approval_id: approvalId },
        auth,
        'write',
      );
      const shown = this.db
        .prepare(
          'SELECT * FROM runtime_review_presentations WHERE ownerId=? AND conversationId=? AND approvalId=?',
        )
        .get(this.ownerId, record.conversationId, approvalId);
      const approval = current.approval;
      if (
        !shown ||
        shown.authority !== record.authority ||
        shown.liveBinding !== this.liveKey(bound) ||
        shown.fingerprint !== this.reviewFingerprint(current) ||
        !this.exactReview(current, bound.scope) ||
        approval.approval_id !== approvalId ||
        approval.approval_digest !== payload.approvalDigest ||
        approval.status !== 'pending' ||
        approval.expired ||
        approval.expires_at * 1000 <= Date.now()
      )
        throw new ConversationError(
          'Review changed, expired, or is no longer authorized. Refresh exact review.',
          409,
        );
      const result = await dispatch('runtime.approval.resolve', {
        approval_id: approvalId,
        approval_digest: payload.approvalDigest,
        choice: payload.choice,
      });
      if (
        result.approval.approval_id !== approvalId ||
        result.approval.approval_digest !== payload.approvalDigest ||
        !(
          payload.choice === 'once' ? ['approved', 'consumed'] : ['denied']
        ).includes(result.approval.status) ||
        result.dispatch_performed !== false
      )
        throw new ConversationError('Approval receipt mismatch.', 409);
      return result;
    }
    const missionId = target(path, 'missions', 'actions');
    if (missionId) {
      const current = await this.call(
        bound,
        'runtime.mission.get',
        { mission_id: missionId },
        auth,
        'write',
      );
      if (
        !current.mission ||
        current.mission.mission_id !== missionId ||
        current.mission.session_id !== bound.scope.durableSessionId ||
        current.mission.agent_id !== bound.scope.agentId ||
        current.mission.archived ||
        current.mission.revision !== intent.expectedRevision
      )
        throw new ConversationError(
          'Mission changed. Refresh before controlling this exact mission.',
          409,
        );
      const methods = {
        pause: 'runtime.mission.pause',
        resume: 'runtime.mission.resume',
        cancel: 'runtime.mission.cancel',
      } as const;
      const operation = intent.action as keyof typeof methods;
      const method = methods[operation];
      const expectedState = {
        pause: 'paused',
        resume: 'ready',
        cancel: 'cancelled',
      }[operation];
      const result = await dispatch(method, {
        mission_id: missionId,
        expected_revision: intent.expectedRevision,
        reason: 'Explicit authenticated owner control',
      });
      if (
        result.mission.mission_id !== missionId ||
        result.mission.session_id !== bound.scope.durableSessionId ||
        result.mission.agent_id !== bound.scope.agentId ||
        result.mission.revision <= intent.expectedRevision ||
        result.mission.state !== expectedState ||
        result.dispatch_performed !== false
      )
        throw new ConversationError('Mission control receipt mismatch.', 409);
      return result;
    }
    const deliveryId = target(path, 'deliveries', 'actions')!;
    const payload = retryPayload.parse(intent.payload);
    const current = await this.call(
      bound,
      'runtime.delivery.status',
      { delivery_id: deliveryId },
      auth,
      'write',
    );
    this.checkDelivery(bound, current, deliveryId);
    if (
      current.artifact_id !== payload.artifactId ||
      current.version !== payload.version ||
      current.sha256 !== payload.sha256 ||
      current.attempt_count !== intent.expectedRevision ||
      !current.result_available ||
      ![
        'pending',
        'failed',
        'awaiting_ack',
        'partial',
        'outcome_unknown',
      ].includes(current.state)
    )
      throw new ConversationError(
        'Delivery changed or requires inspection. No retry was sent.',
        409,
      );
    const result = await dispatch('runtime.delivery.retry', {
      delivery_id: deliveryId,
    });
    this.checkDelivery(bound, result, deliveryId);
    if (
      result.artifact_id !== payload.artifactId ||
      result.version !== payload.version ||
      result.sha256 !== payload.sha256
    )
      throw new ConversationError('Delivery receipt bytes changed.', 409);
    return result;
  }
  private checkControlReceipt(
    record: ControlRecord,
    intent: ActionIntent,
    result: RuntimeControlResult,
  ) {
    const expected = {
      expected_revision: intent.expectedRevision,
      operation_id: record.operationId,
      paused: intent.action === 'pause',
    };
    if (
      !result.operation ||
      result.operation.operation_id !== record.operationId ||
      result.operation.digest !== jsonDigest(expected) ||
      result.operation.revision !== intent.expectedRevision + 1 ||
      result.operation.paused !== expected.paused ||
      result.operation.status !== 'committed' ||
      result.dispatch_performed !== false
    )
      throw new ConversationError('Pause control receipt mismatch.', 409);
  }
  async inspect(operationId: string, auth: Guard) {
    const record = this.record(operationId);
    if (!record)
      throw new ConversationError(
        'Control was not admitted. Inspection never dispatches.',
        404,
      );
    const bound = await this.boundSession(record.conversationId, auth, 'read');
    this.fence(bound, auth);
    if (record.authority !== this.authority(bound))
      throw new ConversationError('Control authority changed.', 403);
    if (record.state === 'accepted' || record.state === 'rejected')
      return this.receipt(record, bound);
    const intent = JSON.parse(record.intent) as ActionIntent;
    const path = actionPath(intent.path, record.conversationId);
    if (path === '/runtime/control') {
      const result = await this.call(
        bound,
        'runtime.control.get',
        { operation_id: operationId },
        auth,
      );
      if (result.operation) {
        this.checkControlReceipt(record, intent, result);
        return this.settle(record, bound, 'accepted', result);
      }
      return this.settle(record, bound, 'outcome_unknown', result);
    }
    const approvalId = target(path, 'reviews', 'decision');
    if (approvalId) {
      const result = await this.call(
        bound,
        'runtime.approval.get',
        { approval_id: approvalId },
        auth,
      );
      const payload = decisionSchema.parse(intent.payload);
      if (
        result.approval.approval_id !== approvalId ||
        result.approval.approval_digest !== payload.approvalDigest
      )
        throw new ConversationError('Original approval receipt mismatch.', 409);
      // No producer operation key exists for decisions. The immutable exact
      // approval ID/digest and recorded choice establish only this decision.
      if (
        result.decision.choice === payload.choice &&
        result.decision.resolved_at !== null
      )
        return this.settle(record, bound, 'accepted', result);
      return this.settle(
        record,
        bound,
        result.decision.choice !== null ? 'rejected' : 'outcome_unknown',
        result,
        result.decision.choice !== null
          ? 'Another exact decision was recorded. No action was replayed.'
          : undefined,
      );
    }
    const missionId = target(path, 'missions', 'actions');
    if (missionId) {
      const evidence = await this.call(
        bound,
        'runtime.mission.get',
        { mission_id: missionId },
        auth,
      );
      if (
        evidence.mission &&
        (evidence.mission.mission_id !== missionId ||
          evidence.mission.session_id !== bound.scope.durableSessionId ||
          evidence.mission.agent_id !== bound.scope.agentId)
      )
        throw new ConversationError('Original mission scope mismatch.', 403);
      // State alone cannot identify this original mutation. Never claim the
      // receipt was recovered from another tab's later pause/cancel/resume.
      return this.settle(record, bound, 'outcome_unknown', evidence);
    }
    const deliveryId = target(path, 'deliveries', 'actions')!;
    const result = await this.call(
      bound,
      'runtime.delivery.status',
      { delivery_id: deliveryId },
      auth,
    );
    this.checkDelivery(bound, result, deliveryId);
    const payload = retryPayload.parse(intent.payload);
    if (
      result.artifact_id !== payload.artifactId ||
      result.version !== payload.version ||
      result.sha256 !== payload.sha256
    )
      throw new ConversationError('Original delivery identity changed.', 409);
    // A later attempt count or delivery acknowledgment cannot identify this
    // unkeyed retry. Preserve unknown ingress alongside inspectable delivery.
    return this.settle(record, bound, 'outcome_unknown', result);
  }
}
