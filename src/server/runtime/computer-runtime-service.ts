import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  computerInputs,
  computerPermissionsSchema,
  type ComputerAction,
} from '../../shared/computer-types.js';
import {
  computerStatusSchema,
  effectSchema,
  screenSchema,
} from '../../shared/runtime/computers.js';
import { contractVersion } from '../../shared/runtime/contracts.js';
import type {
  DotsComputerProposal,
  DotsEffectResult,
  DotsPreparedResult,
  DotsDispatchRequest,
  RuntimeApprovalGetResult,
} from '../../shared/runtime/producer/wire.generated.js';
import type { WorkspaceStore } from '../workspace.js';
import { browserScope, type Guard } from '../self-hosted-platform.js';
import type { ControlBinding } from './control-service.js';
import { ConversationError } from './conversation-ledger.js';
import {
  ComputerEffectService,
  computerCanonical,
  type NativeComputerEdge,
  type NativeComputerPeer,
} from './computer-effect-service.js';
import type { NativePagePeer } from './page-effect-service.js';
import {
  NativeComputerHttpEdge,
  type ComputerHostQualification,
} from './computer-http-edge.js';
import type { ComputerService } from '../computer-service.js';
import type {
  EdgeActor,
  EdgeChange,
  EdgeState,
} from '../../shared/computer-edge-protocol.js';
import type { ConversationTransport } from './stdio.js';
import type { NativeMethod } from './wire.js';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
/** FE intents deliberately preserve Unicode, unlike producer ensure_ascii bytes. */
export function computerIntentCanonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(computerIntentCanonical).join(',')}]`;
  if (v !== null && typeof v === 'object')
    return `{${Object.entries(v)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, x]) => `${JSON.stringify(k)}:${computerIntentCanonical(x)}`)
      .join(',')}}`;
  return JSON.stringify(v);
}
export const computerActionSchema = z.strictObject({
  operationId: z.uuid(),
  intentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  expectedGeneration: z.number().int().nonnegative(),
  expectedRevision: z.number().int().nonnegative(),
  action: z.string().min(1).max(40),
  input: z.unknown(),
});
export const nativeComputerPrepareSchema = computerActionSchema.omit({
  intentDigest: true,
});
export const nativeComputerExecuteSchema = z.strictObject({
  approvalId: z.string().min(1).max(256),
  approvalDigest: z.string().regex(/^[a-f0-9]{64}$/),
});
export interface ComputerRuntimeOptions {
  edge?: NativeComputerEdge | null;
  service?: ComputerService;
  qualification?: ComputerHostQualification | null;
}
export interface ComputerOwner {
  ownerId: string;
  authSessionId: string;
  authRevision: number;
  assertCurrent: Guard;
}
type Ingress = {
  operationId: string;
  conversationId: string;
  authority: string;
  digest: string;
  proposal: string;
  state: string;
  prepared: string | null;
  result: string | null;
};
/** One registered native executor; owner HTTP actions never fabricate broker effects. */
export class ComputerRuntimeService {
  private db: DatabaseSync;
  readonly effects: ComputerEffectService;
  readonly edge: NativeComputerEdge | null;
  private registrations = new Map<
    string,
    { revision: number; signature: string; epoch: number }
  >();
  private connectNative?: (id: string, auth: Guard) => Promise<unknown>;
  constructor(
    private workspace: WorkspaceStore,
    database: string,
    private transport: ConversationTransport,
    private bound: (
      id: string,
      auth: Guard,
      access: 'read' | 'write',
    ) => ControlBinding,
    private fence: (
      b: ControlBinding,
      auth: Guard,
      access: 'read' | 'write',
    ) => void,
    private options: ComputerRuntimeOptions = {},
  ) {
    this.db = new DatabaseSync(database);
    this.db.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;');
    const c = transport.config;
    const binding = {
      ownerId: workspace.ownerId,
      dotId: c.dotId,
      executorId: c.nativeComputer!.executorId,
      principalId: c.identity.principal_id,
      profileId: c.identity.profile_id,
      agentId: c.identity.agent_id,
    };
    this.edge =
      options.edge ??
      (options.service
        ? new NativeComputerHttpEdge(
            binding,
            options.service.protocol(c.dotId),
            options.qualification ?? null,
          )
        : null);
    this.effects = new ComputerEffectService(
      this.db,
      binding,
      this.edge,
      () => options.service?.protocolSecrets(c.dotId) ?? [],
    );
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS runtime_computer_ingress(operationId TEXT PRIMARY KEY,ownerId TEXT NOT NULL,conversationId TEXT NOT NULL,authority TEXT NOT NULL,digest TEXT NOT NULL,proposal TEXT NOT NULL,state TEXT NOT NULL,prepared TEXT,result TEXT);
      CREATE TABLE IF NOT EXISTS runtime_computer_owner_ingress(operationId TEXT PRIMARY KEY,ownerId TEXT NOT NULL,executorId TEXT NOT NULL,authority TEXT NOT NULL,intentDigest TEXT NOT NULL,scope TEXT NOT NULL,revision INTEGER NOT NULL,action TEXT NOT NULL,state TEXT NOT NULL,result TEXT,changeRequest TEXT,createdAt INTEGER NOT NULL);`);
    if (
      !this.db
        .prepare('PRAGMA table_info(runtime_computer_owner_ingress)')
        .all()
        .some((row) => row.name === 'resultSha256')
    )
      this.db.exec(
        'ALTER TABLE runtime_computer_owner_ingress ADD COLUMN resultSha256 TEXT',
      );
  }
  close() {
    this.effects.close();
    this.db.close();
  }
  setConnector(fn: (id: string, auth: Guard) => Promise<unknown>) {
    this.connectNative = fn;
  }
  private current(auth: Guard) {
    auth();
    const s = this.workspace.runtimeBindings.resolveDot(
      this.effects.binding.dotId,
    );
    if (
      s.agentId !== this.effects.binding.agentId ||
      s.principalId !== this.effects.binding.principalId ||
      s.profileId !== this.effects.binding.profileId
    )
      throw new ConversationError('Computer binding changed.', 403);
    this.workspace.runtimeBindings.assertCurrent(s, 'read');
    return s;
  }
  registrationSignature() {
    const f = this.effects.fence();
    return computerCanonical({
      grant: f.grantRevision,
      permissions: f.permissions,
      actions: this.edge?.qualifiedActions ?? [],
      enabled: f.permissions.enabled && (this.edge?.qualified ?? false),
    });
  }
  async register(bound: ControlBinding, auth: Guard) {
    this.fence(bound, auth, 'write');
    if (bound.scope.dotId !== this.effects.binding.dotId)
      throw new ConversationError('Computer belongs to another Dot.', 403);
    const f = this.effects.fence(),
      signature = this.registrationSignature(),
      old = this.registrations.get(bound.binding.liveSessionId),
      epoch = this.transport.epoch ?? 0;
    if (old?.signature === signature && old.epoch === epoch) return;
    const actions = (
      this.edge?.qualified ? this.edge.qualifiedActions : []
    ).filter(
      (a) =>
        !a.startsWith('human_') &&
        f.permissions[
          a === 'exec' ? 'shell' : a.startsWith('files_') ? 'files' : 'browser'
        ],
    ) as DotsComputerProposal['action'][];
    const enabled = f.permissions.enabled && !!this.edge?.qualified;
    const result = await this.transport.call('runtime.dots.register', {
      schema_version: 1,
      session_id: bound.binding.liveSessionId,
      adapter_id: this.effects.binding.executorId,
      kind: 'computer',
      revision: f.grantRevision,
      expected_revision: old?.epoch === epoch ? old.revision : null,
      enabled,
      project_ids: [],
      space_ids: [],
      actions,
    });
    this.fence(bound, auth, 'write');
    if (
      result.adapter_id !== this.effects.binding.executorId ||
      result.kind !== 'computer' ||
      result.revision !== f.grantRevision ||
      result.agent_id !== bound.scope.agentId ||
      result.enabled !== enabled ||
      !result.registered
    )
      throw new ConversationError('Computer registration mismatch.', 403);
    this.registrations.set(bound.binding.liveSessionId, {
      revision: f.grantRevision,
      signature,
      epoch,
    });
  }
  context() {
    const f = this.effects.fence();
    return JSON.stringify({
      nativeComputer: {
        executor_id: this.effects.binding.executorId,
        expected_grant_revision: f.grantRevision,
        expected_control_revision: f.controlRevision,
        qualifiedActions: this.edge?.qualifiedActions ?? [],
        available: this.edge?.available() ?? false,
      },
      instruction:
        'Use dots_computer_observe snapshot before proposing exact computer writes. Unknown effects are inspect-only; never retry them with new IDs.',
    });
  }
  assertApproval(sessionId: string, base: NativePagePeer) {
    const registration = this.registrations.get(sessionId);
    base.assertCurrent();
    this.current(() => {});
    if (
      !registration ||
      registration.epoch !== (this.transport.epoch ?? 0) ||
      registration.revision !== this.effects.fence().grantRevision ||
      !this.effects.fence().permissions.enabled
    )
      throw new ConversationError(
        'Computer approval registration changed.',
        409,
      );
  }
  private peer(base: NativePagePeer, runId: string): NativeComputerPeer {
    const registration = this.registrations.get(base.sessionId);
    return {
      sessionId: base.sessionId,
      principalId: base.principalId,
      profileId: base.profileId,
      agentId: base.agentId,
      runtimeSessionId: base.runtimeSessionId,
      policyDigest: base.policyDigest,
      runId,
      generation: base.generation,
      grantRevision: registration?.revision ?? -1,
      assertCurrent: () => {
        base.assertCurrent();
        if (!registration || registration.epoch !== (this.transport.epoch ?? 0))
          throw new ConversationError('Computer registration is stale.', 409);
      },
      canAccess: (mode) => {
        try {
          this.current(() => {});
          return (
            mode === 'inspect' ||
            (registration?.revision === this.effects.fence().grantRevision &&
              this.effects.fence().permissions.enabled)
          );
        } catch {
          return false;
        }
      },
    };
  }
  async callback(
    method: NativeMethod,
    raw: unknown,
    base: NativePagePeer,
    runId: string,
    _signal: AbortSignal,
    refresh: () => Promise<number>,
  ) {
    const peer = this.peer(base, runId);
    if (method === 'dots.computer.observe')
      return this.effects.observe(raw, peer);
    if (method === 'dots.effect.inspect')
      return this.effects.reconcile(raw, peer);
    if (method !== 'dots.effect.dispatch')
      throw new ConversationError('Unsupported computer callback.', 400);
    const r = raw as DotsDispatchRequest;
    const { effect } = await this.transport.call('runtime.effect.get', {
      schema_version: 1,
      session_id: peer.sessionId,
      effect_id: r.identity.effect_id,
    });
    peer.assertCurrent();
    if (
      effect.operation_type !== 'dots_computer_action' ||
      effect.state !== 'dispatched' ||
      effect.operation_id !== r.identity.operation_id ||
      effect.run_id !== runId ||
      effect.generation !== peer.generation ||
      effect.action_digest !== r.identity.action_digest ||
      effect.input_digest !== r.identity.input_digest ||
      effect.approval_id !== r.identity.approval_id ||
      effect.policy_digest !== r.identity.policy_digest ||
      (await refresh()) !== peer.generation
    )
      throw new ConversationError(
        'Producer computer effect proof mismatch.',
        403,
      );
    return this.effects.dispatch(raw, peer);
  }
  private authority(b: ControlBinding) {
    return computerCanonical({
      binding: this.effects.binding,
      session: b.scope.durableSessionId,
    });
  }
  private record(id: string) {
    return this.db
      .prepare(
        'SELECT * FROM runtime_computer_ingress WHERE ownerId=? AND operationId=?',
      )
      .get(this.workspace.ownerId, id) as unknown as Ingress | undefined;
  }
  manualApproval(id: string, review: RuntimeApprovalGetResult) {
    return !!this.db
      .prepare(
        "SELECT 1 FROM runtime_computer_ingress WHERE conversationId=? AND json_extract(prepared,'$.approval_id')=? AND json_extract(prepared,'$.approval_digest')=?",
      )
      .get(id, review.approval.approval_id, review.approval.approval_digest);
  }
  private nativeView(row: Ingress, b: ControlBinding) {
    return {
      version: contractVersion,
      scope: browserScope(b.scope),
      conversationId: row.conversationId,
      operationId: row.operationId,
      state: row.state,
      proposal: JSON.parse(row.proposal),
      prepared: row.prepared ? JSON.parse(row.prepared) : null,
      result: row.result ? JSON.parse(row.result) : null,
    };
  }
  async prepare(conversationId: string, raw: unknown, auth: Guard) {
    const input = nativeComputerPrepareSchema.parse(raw);
    let b = this.bound(conversationId, auth, 'write');
    if (input.expectedGeneration !== b.scope.authorityRevision)
      throw new ConversationError('Computer authority changed.', 409);
    await this.connectNative?.(conversationId, auth);
    b = this.bound(conversationId, auth, 'write');
    const f = this.effects.fence();
    if (
      f.revision !== input.expectedRevision ||
      f.snapshotId === null ||
      f.snapshotSha256 === null ||
      f.resumeSnapshotRequired
    )
      throw new ConversationError(
        'A fresh computer snapshot is required.',
        409,
      );
    if (
      !Object.hasOwn(computerInputs, input.action) ||
      input.action.startsWith('human_')
    )
      throw new ConversationError('Unsupported broker computer action.', 400);
    const validated = computerInputs[input.action as ComputerAction].parse(
      input.input,
    );
    if (computerCanonical(validated) !== computerCanonical(input.input))
      throw new ConversationError('Computer input must be normalized.', 400);
    const proposal: DotsComputerProposal = {
      kind: 'computer',
      executor_id: this.effects.binding.executorId,
      expected_grant_revision: f.grantRevision,
      expected_control_revision: f.controlRevision,
      snapshot_id: f.snapshotId,
      snapshot_sha256: f.snapshotSha256,
      action: input.action as DotsComputerProposal['action'],
      input: validated as DotsComputerProposal['input'],
    };
    const bytes = computerCanonical(proposal),
      digest = hash(bytes),
      authority = this.authority(b);
    let fresh = false;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const prior = this.db
        .prepare('SELECT * FROM runtime_operation_registry WHERE operationId=?')
        .get(input.operationId);
      const old = this.record(input.operationId);
      if (
        prior &&
        (!old || old.digest !== digest || old.authority !== authority)
      )
        throw new ConversationError(
          'Operation ID conflicts with existing work.',
          409,
        );
      if (!old) {
        this.db
          .prepare('INSERT INTO runtime_operation_registry VALUES(?,?,?,?,?)')
          .run(
            input.operationId,
            this.workspace.ownerId,
            'computer_ingress',
            digest,
            authority,
          );
        this.db
          .prepare(
            'INSERT INTO runtime_computer_ingress VALUES(?,?,?,?,?,?,?,NULL,NULL)',
          )
          .run(
            input.operationId,
            this.workspace.ownerId,
            conversationId,
            authority,
            digest,
            bytes,
            'pending',
          );
        fresh = true;
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    if (!fresh)
      return this.inspectNative(conversationId, input.operationId, auth);
    try {
      const prepared = await this.transport.call(
        'runtime.dots.computer.prepare',
        {
          schema_version: 1,
          session_id: b.binding.liveSessionId,
          command_id: input.operationId,
          proposal,
        },
      );
      if (
        prepared.command_id !== input.operationId ||
        prepared.operation_id !== input.operationId ||
        prepared.input_digest !== digest ||
        prepared.content_sha256 !== hash(computerCanonical(proposal.input))
      )
        throw new Error('Preparation mismatch');
      this.db
        .prepare(
          "UPDATE runtime_computer_ingress SET state='prepared',prepared=? WHERE operationId=?",
        )
        .run(JSON.stringify(prepared), input.operationId);
    } catch {
      this.db
        .prepare(
          "UPDATE runtime_computer_ingress SET state='outcome_unknown' WHERE operationId=?",
        )
        .run(input.operationId);
    }
    this.fence(b, auth, 'read');
    return this.nativeView(this.record(input.operationId)!, b);
  }
  async execute(
    conversationId: string,
    operationId: string,
    raw: unknown,
    auth: Guard,
  ) {
    const input = nativeComputerExecuteSchema.parse(raw),
      b = this.bound(conversationId, auth, 'write'),
      row = this.record(operationId);
    if (
      !row ||
      row.conversationId !== conversationId ||
      row.authority !== this.authority(b)
    )
      throw new ConversationError(
        'Computer operation outside this conversation.',
        403,
      );
    if (row.state !== 'prepared' || !row.prepared)
      return this.inspectNative(conversationId, operationId, auth);
    const prepared = JSON.parse(row.prepared) as DotsPreparedResult;
    if (
      prepared.approval_id !== input.approvalId ||
      prepared.approval_digest !== input.approvalDigest ||
      prepared.expires_at * 1000 <= Date.now()
    )
      throw new ConversationError(
        'Exact computer review expired or changed.',
        409,
      );
    if (
      this.db
        .prepare(
          "UPDATE runtime_computer_ingress SET state='dispatched' WHERE operationId=? AND state='prepared'",
        )
        .run(operationId).changes !== 1
    )
      return this.inspectNative(conversationId, operationId, auth);
    try {
      const result = await this.transport.call(
        'runtime.dots.computer.execute',
        {
          schema_version: 1,
          session_id: b.binding.liveSessionId,
          command_id: operationId,
          proposal: JSON.parse(row.proposal),
          approval_id: input.approvalId,
          approval_digest: input.approvalDigest,
        },
      );
      this.saveResult(row, result);
    } catch {
      this.db
        .prepare(
          "UPDATE runtime_computer_ingress SET state='outcome_unknown' WHERE operationId=? AND state='dispatched'",
        )
        .run(operationId);
    }
    this.fence(b, auth, 'read');
    return this.nativeView(this.record(operationId)!, b);
  }
  private saveResult(row: Ingress, result: DotsEffectResult) {
    if (
      result.operation_id !== row.operationId ||
      result.replay_permitted !== false ||
      (result.receipt &&
        (result.receipt.identity.input_digest !== row.digest ||
          result.receipt.identity.operation_id !== row.operationId))
    )
      throw new ConversationError('Computer receipt mismatch.', 403);
    if (result.state === 'confirmed') {
      const native = this.db
        .prepare(
          'SELECT receipt FROM runtime_computer_effects WHERE operationId=?',
        )
        .get(row.operationId);
      if (
        !native?.receipt ||
        computerCanonical(JSON.parse(String(native.receipt))) !==
          computerCanonical(result.receipt) ||
        result.receipt?.state !== 'committed'
      )
        throw new ConversationError('Native computer proof is missing.', 503);
    }
    this.db
      .prepare(
        'UPDATE runtime_computer_ingress SET state=?,result=? WHERE operationId=?',
      )
      .run(result.state, JSON.stringify(result), row.operationId);
  }
  async inspectNative(
    conversationId: string,
    operationId: string,
    auth: Guard,
  ) {
    const b = this.bound(conversationId, auth, 'read'),
      row = this.record(operationId);
    if (
      !row ||
      row.conversationId !== conversationId ||
      row.authority !== this.authority(b)
    )
      throw new ConversationError('Computer operation not found.', 404);
    if (!['confirmed', 'failed'].includes(row.state)) {
      try {
        let effectId = (
          row.result ? (JSON.parse(row.result) as DotsEffectResult) : null
        )?.effect_id;
        effectId ??= this.db
          .prepare(
            'SELECT effectId FROM runtime_computer_effects WHERE operationId=?',
          )
          .get(operationId)?.effectId as string | undefined;
        if (!effectId && row.prepared) {
          const p = JSON.parse(row.prepared) as DotsPreparedResult;
          const list = await this.transport.call('runtime.effects.list', {
            schema_version: 1,
            session_id: b.binding.liveSessionId,
            run_id: p.run_id,
            limit: 200,
            unresolved_only: false,
          });
          effectId = list.effects.find(
            (e) =>
              e.operation_id === operationId &&
              e.input_digest === row.digest &&
              e.operation_type === 'dots_computer_action',
          )?.effect_id;
        }
        if (effectId)
          this.saveResult(
            row,
            await this.transport.call('runtime.dots.effect.reconcile', {
              schema_version: 1,
              session_id: b.binding.liveSessionId,
              effect_id: effectId,
            }),
          );
      } catch {
        /* Read-only recovery cannot turn uncertainty into failure. */
      }
    }
    this.fence(b, auth, 'read');
    return this.nativeView(this.record(operationId)!, b);
  }
  private ownerActor(
    owner: ComputerOwner,
  ): Extract<EdgeActor, { kind: 'owner' }> {
    owner.assertCurrent();
    if (owner.ownerId !== this.workspace.ownerId)
      throw new ConversationError('Computer owner mismatch.', 403);
    return {
      kind: 'owner',
      ownerId: owner.ownerId,
      authSessionId: owner.authSessionId,
      authRevision: owner.authRevision,
    };
  }
  private checkExecutor(id: string) {
    if (id !== this.effects.binding.executorId)
      throw new ConversationError('Executor does not belong to this Dot.', 403);
  }
  async status(id: string, owner: ComputerOwner) {
    this.checkExecutor(id);
    const scope = this.current(owner.assertCurrent),
      actor = this.ownerActor(owner);
    if (this.edge instanceof NativeComputerHttpEdge)
      await this.edge
        .refresh(actor, AbortSignal.timeout(10000))
        .catch(() => null);
    this.current(owner.assertCurrent);
    const f = this.effects.fence();
    const audit = this.db
      .prepare(
        `SELECT operationId AS id,action,'owner' AS actor,CASE state WHEN 'committed' THEN 'reconciled' WHEN 'not_applied' THEN 'failed' ELSE 'unknown' END AS outcome,NULL AS effectId,createdAt FROM runtime_computer_owner_ingress WHERE executorId=? UNION ALL SELECT operationId AS id,json_extract(identity,'$.scope_json') AS action,'agent' AS actor,CASE json_extract(receipt,'$.state') WHEN 'committed' THEN 'reconciled' WHEN 'not_applied' THEN 'failed' ELSE 'unknown' END AS outcome,effectId,createdAt FROM runtime_computer_effects WHERE executorId=? ORDER BY outcome DESC, createdAt DESC LIMIT 1000`,
      )
      .all(id, id)
      .map((r) => ({
        ...r,
        action: r.actor === 'agent' ? 'computer action' : r.action,
      }));
    const configured = !!this.edge?.qualified;
    return computerStatusSchema.parse({
      version: contractVersion,
      scope: browserScope(scope),
      executorId: id,
      revision: f.revision,
      refreshedAt: Date.now(),
      configured,
      state: configured
        ? this.edge?.available()
          ? 'running'
          : 'unavailable'
        : 'not_configured',
      permissions: f.permissions,
      control: {
        holder: f.holder,
        requested: false,
        transitioning: f.transitioning,
        resumeSnapshotRequired: f.resumeSnapshotRequired,
      },
      audit,
      ...(!configured
        ? {
            error: 'Target-host computer capabilities have not been qualified.',
          }
        : {}),
    });
  }
  private ownerRow(id: string) {
    return this.db
      .prepare(
        'SELECT * FROM runtime_computer_owner_ingress WHERE operationId=? AND ownerId=?',
      )
      .get(id, this.workspace.ownerId);
  }
  private assertOwnerRow(row: Record<string, unknown>, auth: Guard) {
    const scope = this.current(auth);
    if (
      row.executorId !== this.effects.binding.executorId ||
      row.authority !== computerCanonical(this.effects.binding) ||
      row.ownerId !== this.workspace.ownerId ||
      computerIntentCanonical(JSON.parse(String(row.scope))) !==
        computerIntentCanonical(browserScope(scope))
    )
      throw new ConversationError(
        'Stored owner operation belongs to another authority.',
        403,
      );
  }
  private ownerView(row: Record<string, unknown>, auth: Guard) {
    this.assertOwnerRow(row, auth);
    if (
      row.result !== null &&
      (typeof row.result !== 'string' || row.resultSha256 !== hash(row.result))
    )
      throw new ConversationError(
        'Owner result integrity could not be verified.',
        503,
      );
    const output = row.result ? JSON.parse(String(row.result)) : null;
    return effectSchema.parse({
      version: contractVersion,
      scope: JSON.parse(String(row.scope)),
      executorId: row.executorId,
      revision: Math.max(Number(row.revision), this.effects.fence().revision),
      operationId: row.operationId,
      intentDigest: row.intentDigest,
      effectId: null,
      state:
        row.state === 'committed'
          ? 'reconciled'
          : row.state === 'not_applied'
            ? 'failed'
            : 'unknown',
      output: this.output(output),
    });
  }
  private output(raw: unknown) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    return {
      ...(typeof r.text === 'string' ? { text: r.text.slice(0, 100000) } : {}),
      ...(typeof r.summary === 'string'
        ? { summary: r.summary.slice(0, 2000) }
        : {}),
      ...(typeof r.exitCode === 'number' ? { exitCode: r.exitCode } : {}),
      ...(Array.isArray(r.entries) &&
      r.entries.every((v) => typeof v === 'string')
        ? { entries: r.entries.slice(0, 1000) }
        : {}),
    };
  }
  async ownerAction(id: string, raw: unknown, owner: ComputerOwner) {
    this.checkExecutor(id);
    const input = computerActionSchema.parse(raw),
      scope = this.current(owner.assertCurrent),
      actor = this.ownerActor(owner),
      f = this.effects.fence();
    if (
      input.expectedGeneration !== scope.authorityRevision ||
      input.expectedRevision !== f.revision
    )
      throw new ConversationError('Computer revision changed.', 409);
    const action = input.action;
    const data = Object.hasOwn(computerInputs, action)
      ? computerInputs[action as ComputerAction].parse(input.input)
      : action === 'permissions'
        ? computerPermissionsSchema.partial().strict().parse(input.input)
        : z.strictObject({}).parse(input.input);
    if (
      !Object.hasOwn(computerInputs, action) &&
      ![
        'permissions',
        'take',
        'release',
        'emergency_stop',
        'start',
        'stop',
      ].includes(action)
    )
      throw new ConversationError('Unknown computer action.', 400);
    if (
      hash(
        computerIntentCanonical({
          scope: browserScope(scope),
          executorId: id,
          revision: f.revision,
          action,
          input: data,
        }),
      ) !== input.intentDigest
    )
      throw new ConversationError('Computer intent digest mismatch.', 409);
    const old = this.ownerRow(input.operationId);
    if (old) {
      if (old.intentDigest !== input.intentDigest)
        throw new ConversationError('Owner operation conflicts.', 409);
      return this.inspectOwner(input.operationId, owner);
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (
        !['take', 'emergency_stop', 'permissions'].includes(action) &&
        this.db
          .prepare(
            "SELECT 1 FROM runtime_computer_owner_ingress WHERE executorId=? AND state='unknown' LIMIT 1",
          )
          .get(id)
      )
        throw new ConversationError(
          'An earlier owner action is unresolved. Inspect its original operation.',
          409,
        );
      const prior = this.db
        .prepare('SELECT 1 FROM runtime_operation_registry WHERE operationId=?')
        .get(input.operationId);
      if (prior)
        throw new ConversationError(
          'Operation belongs to another family.',
          409,
        );
      this.db
        .prepare(
          'INSERT INTO runtime_computer_owner_ingress(operationId,ownerId,executorId,authority,intentDigest,scope,revision,action,state,result,changeRequest,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,NULL,?)',
        )
        .run(
          input.operationId,
          owner.ownerId,
          id,
          computerCanonical(this.effects.binding),
          input.intentDigest,
          JSON.stringify(browserScope(scope)),
          f.revision,
          action,
          'unknown',
          null,
          Date.now(),
        );
      if (Object.hasOwn(computerInputs, action) && action !== 'snapshot')
        this.db
          .prepare('INSERT INTO runtime_operation_registry VALUES(?,?,?,?,?)')
          .run(
            input.operationId,
            owner.ownerId,
            'computer_owner',
            hash(
              computerCanonical({
                action,
                input: data,
                expectedControl: f.controlRevision,
                expectedGrant: f.grantRevision,
              }),
            ),
            computerCanonical(this.effects.binding),
          );
      if (!Object.hasOwn(computerInputs, action) || action === 'snapshot')
        this.db
          .prepare('INSERT INTO runtime_operation_registry VALUES(?,?,?,?,?)')
          .run(
            input.operationId,
            owner.ownerId,
            'computer_control',
            input.intentDigest,
            computerCanonical(this.effects.binding),
          );
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    try {
      if (action === 'permissions' || ['take', 'release'].includes(action)) {
        const change: EdgeChange = {
          operationId: input.operationId,
          actor,
          expectedGrantRevision: f.grantRevision,
          expectedControlRevision: f.controlRevision,
          change:
            action === 'permissions'
              ? {
                  kind: 'permissions',
                  permissions: { ...f.permissions, ...(data as object) },
                }
              : {
                  kind: 'control',
                  holder: action === 'release' ? 'bot' : 'human',
                },
        };
        this.db
          .prepare(
            'UPDATE runtime_computer_owner_ingress SET changeRequest=? WHERE operationId=?',
          )
          .run(computerCanonical(change), input.operationId);
        if (action === 'permissions')
          this.effects.permissions(data, f.grantRevision, owner.assertCurrent);
        else
          this.effects.controlFence(
            action === 'release' ? 'bot' : 'human',
            true,
            f.controlRevision,
            owner.assertCurrent,
          );
        if (
          !(this.edge instanceof NativeComputerHttpEdge) ||
          !this.edge.qualified
        )
          throw new Error('Qualified edge required');
        // Initial owner bootstrap binds only the immutable server mapping, never browser identity.
        if (f.grantRevision === 0 && f.controlRevision === 0)
          await this.edge.change(
            {
              ...change,
              operationId: input.operationId + ':bind',
              change: { kind: 'bind', binding: this.effects.binding },
            },
            AbortSignal.timeout(10000),
            owner.assertCurrent,
          );
        const state = await this.edge.change(
          change,
          AbortSignal.timeout(10000),
          owner.assertCurrent,
        );
        this.acknowledgeChange(change, state, owner.assertCurrent);
        this.setOwner(input.operationId, 'committed', null);
      } else if (action === 'snapshot') {
        const result = await this.effects.ownerObserve(
          'snapshot',
          data,
          actor,
          owner.assertCurrent,
        );
        this.setOwner(input.operationId, 'committed', result);
      } else if (['start', 'stop', 'emergency_stop'].includes(action)) {
        if (
          action === 'emergency_stop' &&
          (!this.options.service || !this.edge?.qualified)
        ) {
          this.effects.controlFence(
            'human',
            true,
            f.controlRevision,
            owner.assertCurrent,
          );
          return this.ownerView(
            this.ownerRow(input.operationId)!,
            owner.assertCurrent,
          );
        }
        // Supervisor lifecycle has no operation-bound lookup. Preserve uncertainty
        // even if a preceding target fence was acknowledged.
        if (
          !this.options.service ||
          !(this.edge instanceof NativeComputerHttpEdge) ||
          !this.edge.qualified
        ) {
          this.setOwner(input.operationId, 'not_applied', null);
        } else {
          const holder = action === 'emergency_stop' ? 'human' : f.holder;
          const change: EdgeChange = {
            operationId: input.operationId,
            actor,
            expectedGrantRevision: f.grantRevision,
            expectedControlRevision: f.controlRevision,
            change: { kind: 'control', holder },
          };
          this.db
            .prepare(
              'UPDATE runtime_computer_owner_ingress SET changeRequest=? WHERE operationId=?',
            )
            .run(computerCanonical(change), input.operationId);
          this.effects.controlFence(
            holder,
            true,
            f.controlRevision,
            owner.assertCurrent,
          );
          if (action === 'start')
            await this.options.service.governedLifecycle(
              this.effects.binding.dotId,
              'start',
              owner.assertCurrent,
              AbortSignal.timeout(70000),
            );
          const state = await this.edge.change(
            change,
            AbortSignal.timeout(10000),
            owner.assertCurrent,
          );
          if (action === 'start')
            this.acknowledgeChange(change, state, owner.assertCurrent);
          else
            await this.options.service.governedLifecycle(
              this.effects.binding.dotId,
              'stop',
              owner.assertCurrent,
              AbortSignal.timeout(70000),
            );
          this.setOwner(input.operationId, 'committed', null);
        }
      } else {
        const result = await this.effects.ownerAction(
          input.operationId,
          action as ComputerAction,
          data,
          f.controlRevision,
          f.grantRevision,
          owner.assertCurrent,
          actor,
        );
        this.setOwner(input.operationId, result.state, result.result);
      }
    } catch {
      /* No response is not evidence of remote nonapplication. */
    }
    return this.ownerView(
      this.ownerRow(input.operationId)!,
      owner.assertCurrent,
    );
  }
  private setOwner(id: string, state: string, result: unknown) {
    this.db
      .prepare(
        'UPDATE runtime_computer_owner_ingress SET state=?,result=?,resultSha256=? WHERE operationId=?',
      )
      .run(
        state,
        result === null ? null : computerCanonical(result),
        result === null ? null : hash(computerCanonical(result)),
        id,
      );
  }
  private acknowledgeChange(
    request: EdgeChange,
    state: EdgeState,
    auth: Guard,
  ) {
    const f = this.effects.fence();
    if (
      state.grantRevision !== f.grantRevision ||
      state.controlRevision !== f.controlRevision ||
      computerCanonical(state.permissions) !==
        computerCanonical(f.permissions) ||
      state.holder !== f.holder ||
      request.actor.kind !== 'owner'
    )
      throw new ConversationError('Target fence acknowledgment mismatch.', 409);
    this.effects.acknowledgeTarget(
      f.grantRevision,
      f.controlRevision,
      state.holder,
      state.transitioning,
      auth,
    );
  }
  hasOwner(id: string) {
    return !!this.ownerRow(id);
  }
  has(id: string) {
    return !!this.record(id);
  }
  async inspect(id: string, auth: Guard) {
    const row = this.record(id);
    if (!row) throw new ConversationError('Computer operation not found.', 404);
    return this.inspectNative(row.conversationId, id, auth);
  }
  async inspectOwner(id: string, owner: ComputerOwner) {
    const row = this.ownerRow(id);
    if (!row)
      throw new ConversationError('Owner computer operation not found.', 404);
    this.current(owner.assertCurrent);
    this.assertOwnerRow(row, owner.assertCurrent);
    const actor = this.ownerActor(owner);
    if (row.state === 'unknown') {
      try {
        if (['start', 'stop', 'emergency_stop'].includes(String(row.action)))
          return this.ownerView(row, owner.assertCurrent);
        if (row.changeRequest && this.edge instanceof NativeComputerHttpEdge) {
          const request = JSON.parse(String(row.changeRequest)) as EdgeChange;
          const state = await this.edge.inspectChange(
            id,
            actor,
            AbortSignal.timeout(10000),
          );
          if (state.change) {
            if (
              state.change.operationId !== id ||
              state.change.requestSha256 !== hash(computerCanonical(request))
            )
              throw new ConversationError(
                'Control receipt identity mismatch.',
                403,
              );
            this.acknowledgeChange(
              request,
              state.change.state,
              owner.assertCurrent,
            );
            this.setOwner(id, 'committed', null);
          }
        } else if (row.action !== 'snapshot') {
          const proof = await this.effects.reconcileOwnerOperation(
            id,
            actor,
            owner.assertCurrent,
          );
          this.setOwner(id, proof.state, proof.result);
        }
      } catch {
        /* Still unknown, no redispatch. */
      }
    }
    return this.ownerView(this.ownerRow(id)!, owner.assertCurrent);
  }
  async screen(id: string, owner: ComputerOwner) {
    this.checkExecutor(id);
    const s = this.current(owner.assertCurrent),
      f = this.effects.fence();
    if (
      !f.permissions.enabled ||
      !f.permissions.browser ||
      f.transitioning ||
      !(this.edge instanceof NativeComputerHttpEdge)
    )
      throw new ConversationError('Owner screen unavailable.', 503);
    const { output } = await this.edge.screen(
      this.ownerActor(owner),
      f.grantRevision,
      f.controlRevision,
      AbortSignal.timeout(10000),
    );
    this.current(owner.assertCurrent);
    if (this.effects.fence().revision !== f.revision)
      throw new ConversationError('Screen revision changed.', 409);
    return screenSchema.parse({
      base64: output.base64,
      width: output.width,
      height: output.height,
      url: output.url,
      capturedAt: output.capturedAt,
      version: contractVersion,
      scope: browserScope(s),
      executorId: id,
      snapshotRevision: f.revision,
    });
  }
}
