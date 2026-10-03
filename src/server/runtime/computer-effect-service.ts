import { initializeOperationRegistry } from './operation-registry.js';
import {
  edgeProofRequest,
  type EdgeActor,
  type EdgeProofRequest,
  type EdgeExecute,
} from '../../shared/computer-edge-protocol.js';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import Ajv, { type ValidateFunction } from 'ajv';
import { producerSchema } from '../../shared/runtime/producer/schema.generated.js';
import type {
  DotsComputerProposal,
  DotsComputerObserveRequest,
  DotsComputerObserveResult,
  DotsDispatchRequest,
  DotsEffectIdentity,
  DotsEffectReceipt,
  DotsInspectRequest,
} from '../../shared/runtime/producer/wire.generated.js';
import {
  computerInputs,
  computerPermissionsSchema,
  type ComputerAction,
  type ComputerPermissions,
} from '../../shared/computer-types.js';

type Reason = Exclude<DotsEffectReceipt['reason'], 'committed' | 'unknown'>;
type Mode = 'dispatch' | 'inspect' | 'observe';
export class ComputerEffectError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 409 | 503 = 400,
  ) {
    super(message);
  }
}
const sha = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
/** Exact producer ensure_ascii JSON. Nonintegral numbers are deliberately
 * unavailable until Python float canonicalization is qualified, never rounded. */
export function computerCanonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, sort(x)]),
      );
    if (typeof v === 'number' && (!Number.isSafeInteger(v) || Object.is(v, -0)))
      throw new ComputerEffectError(
        'Native computer numbers require exact safe integers.',
      );
    if (!['string', 'number', 'boolean'].includes(typeof v) && v !== null)
      throw new ComputerEffectError('Invalid native computer JSON.');
    return v;
  };
  return JSON.stringify(sort(value)).replace(
    /[\u007f-\uffff]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
const digest = (v: unknown) => sha(computerCanonical(v));
const validators = new Map<string, ValidateFunction>();
function validate(name: string, value: unknown) {
  let validator = validators.get(name);
  if (!validator) {
    const schemas = producerSchema.components.schemas as Record<
      string,
      unknown
    >;
    if (!schemas[name])
      throw new ComputerEffectError('Pinned computer schema unavailable.', 503);
    validator = new Ajv({
      allErrors: false,
      coerceTypes: false,
      useDefaults: false,
      removeAdditional: false,
    }).compile({
      components: producerSchema.components,
      $ref: `#/components/schemas/${name}`,
    });
    validators.set(name, validator);
  }
  if (!validator(value)) throw new ComputerEffectError(`Invalid ${name}.`);
}
function bounded(value: unknown, limit = 200000) {
  const bytes = JSON.stringify(value);
  if (!bytes || Buffer.byteLength(bytes) > limit)
    throw new ComputerEffectError(
      'Native computer envelope exceeds its bound.',
    );
}
/** Cancellation bounds the local wait even if a defective executor ignores abort.
 * It does not assert remote cancellation or authorize another send. */
function untilAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () =>
      reject(new ComputerEffectError('Computer transport interrupted.', 503));
    signal.addEventListener('abort', abort, { once: true });
    work
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}
/** Capture and freeze approved callback bytes before the first asynchronous edge. */
function immutable<T>(value: T): T {
  const freeze = (item: unknown) => {
    if (item && typeof item === 'object') {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  };
  const copy = JSON.parse(JSON.stringify(value)) as T;
  freeze(copy);
  return copy;
}
function kind(action: string): 'browser' | 'files' | 'shell' {
  return action === 'exec'
    ? 'shell'
    : action.startsWith('files_')
      ? 'files'
      : 'browser';
}
function normalized(action: ComputerAction, input: unknown, agent: boolean) {
  if (
    !Object.hasOwn(computerInputs, action) ||
    (agent && action.startsWith('human_'))
  )
    throw new ComputerEffectError('Unsupported computer action.');
  const parsed = computerInputs[action].parse(input);
  // Producer defaults are mandatory in a normalized proposal.
  if (agent && action === 'type' && !Object.hasOwn(parsed, 'submit'))
    throw new ComputerEffectError(
      'Computer type requires the normalized submit field.',
    );
  if (
    agent &&
    action === 'files_write' &&
    (!Object.hasOwn(parsed, 'append') ||
      String((parsed as unknown as { contents: string }).contents).length >
        24000)
  )
    throw new ComputerEffectError(
      'Computer write exceeds the producer contract.',
    );
  if (computerCanonical(parsed) !== computerCanonical(input))
    throw new ComputerEffectError('Computer input is not exactly normalized.');
  return parsed;
}

/** Construct only from the verified, current owned stdio binder. Never from
 * callback or browser JSON. Generation is the producer lease, not a UI epoch. */
export interface NativeComputerPeer {
  sessionId: string;
  principalId: string;
  profileId: string;
  agentId: string;
  runtimeSessionId: string;
  policyDigest: string;
  runId: string;
  generation: number;
  grantRevision: number;
  assertCurrent(): void;
  canAccess(mode: Mode): boolean;
}
export interface NativeComputerEdge {
  readonly dotId: string;
  readonly executorId: string;
  /** True only after explicit target-host qualification, never from a UI flag. */
  readonly qualified: boolean;
  readonly qualifiedActions: readonly ComputerAction[];
  /** Pure, fail-closed current configuration/running check; never provisions. */
  available(): boolean;
  operationalState?(): 'ready' | 'unavailable' | 'unconfigured' | 'unsupported';
  /** Preserve endpoint/container/HMAC identity, path sandbox, SSRF/DNS pinning,
   * redirects, response bounds and secret redaction. Invoke beforeSend exactly
   * once immediately at the final send edge, without an intervening await.
   * Abort must propagate to the supervisor; loss after send remains unknown. */
  execute(
    action: ComputerAction,
    input: unknown,
    edge: {
      signal: AbortSignal;
      /** The host must enforce these expected fences atomically with starting the
       * action; local polling/cancellation alone cannot close the final-send race. */
      fence: {
        operationId: string;
        identity?: DotsEffectIdentity;
        authority?: EdgeActor;
        effectId: string | null;
        actor: 'agent' | 'owner';
        grantRevision: number;
        controlRevision: number;
        snapshotId: number | null;
        snapshotSha256: string | null;
      };
      beforeSend(): void;
    },
  ): Promise<unknown>;
  inspect?(
    request: EdgeProofRequest,
    actor: EdgeActor,
    signal: AbortSignal,
  ): Promise<
    import('../../shared/computer-edge-protocol.js').EdgeReceipt | null
  >;
  /** Read-only actions only. snapshotId must be the actual executor snapshot ID. */
  observe(
    action: 'snapshot' | 'read' | 'screenshot' | 'files_list' | 'files_read',
    input: unknown,
    edge: {
      signal: AbortSignal;
      expectedGrantRevision: number;
      expectedControlRevision: number;
      authority?: EdgeActor;
    },
  ): Promise<{ snapshotId: number; output: unknown }>;
}
interface Fence {
  revision: number;
  grantRevision: number;
  controlRevision: number;
  permissions: ComputerPermissions;
  holder: 'bot' | 'human';
  transitioning: boolean;
  resumeSnapshotRequired: boolean;
  snapshotId: number | null;
  snapshotSha256: string | null;
  snapshotAt: number | null;
}
interface Row {
  identity: string;
  proposalDigest: string;
  receipt: string | null;
  resultJson: string | null;
}
interface Binding {
  ownerId: string;
  dotId: string;
  executorId: string;
  principalId: string;
  profileId: string;
  agentId: string;
}
/** Bounded native callback core. No HTTP routes, model loop, approval resolver,
 * supervisor provisioning, transport reconnect or mutation retry lives here. */
export class ComputerEffectService {
  private active = new Set<AbortController>();
  constructor(
    private db: DatabaseSync,
    readonly binding: Binding,
    private edge: NativeComputerEdge | null,
    private secrets: () => readonly string[] = () => [],
    private now: () => number = Date.now,
  ) {
    const owner = db
      .prepare('SELECT ownerId FROM workspace_owner WHERE singleton=1')
      .get();
    if (!owner || owner.ownerId !== binding.ownerId)
      throw new ComputerEffectError('Computer workspace owner mismatch.', 403);
    if (
      edge &&
      (edge.dotId !== binding.dotId || edge.executorId !== binding.executorId)
    )
      throw new ComputerEffectError(
        'Computer edge belongs to another Dot.',
        403,
      );
    db.exec(`CREATE TABLE IF NOT EXISTS runtime_operation_registry(operationId TEXT PRIMARY KEY,ownerId TEXT NOT NULL,family TEXT NOT NULL,digest TEXT NOT NULL,authority TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_computer_target_requests(operationId TEXT PRIMARY KEY, request TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_computer_fences(executorId TEXT PRIMARY KEY, dotId TEXT NOT NULL UNIQUE, actorKey TEXT NOT NULL UNIQUE, binding TEXT NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_computer_effects(effectId TEXT PRIMARY KEY, operationId TEXT NOT NULL UNIQUE, approvalId TEXT NOT NULL UNIQUE, executorId TEXT NOT NULL, identity TEXT NOT NULL, proposalDigest TEXT NOT NULL, receipt TEXT, resultJson TEXT, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_computer_reservations(executorId TEXT PRIMARY KEY, operationId TEXT NOT NULL, actor TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_computer_owner_fences(id TEXT PRIMARY KEY, executorId TEXT NOT NULL, ownerId TEXT NOT NULL, action TEXT NOT NULL, revision INTEGER NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_computer_owner_actions(operationId TEXT PRIMARY KEY, executorId TEXT NOT NULL, ownerId TEXT NOT NULL, intentDigest TEXT NOT NULL, action TEXT NOT NULL, state TEXT NOT NULL, resultJson TEXT, resultSha256 TEXT, createdAt INTEGER NOT NULL);
      CREATE TRIGGER IF NOT EXISTS runtime_computer_receipt_immutable BEFORE UPDATE ON runtime_computer_effects WHEN OLD.receipt IS NOT NULL BEGIN SELECT RAISE(ABORT,'Computer receipt is immutable'); END;`);
    const old = db
      .prepare(
        'SELECT binding FROM runtime_computer_fences WHERE executorId=? OR dotId=? OR actorKey=?',
      )
      .get(
        binding.executorId,
        binding.dotId,
        computerCanonical([
          binding.principalId,
          binding.profileId,
          binding.agentId,
        ]),
      );
    if (old && old.binding !== computerCanonical(binding))
      throw new ComputerEffectError(
        'Computer identity cannot be rebound.',
        403,
      );
    if (!old)
      db.prepare('INSERT INTO runtime_computer_fences VALUES(?,?,?,?,?)').run(
        binding.executorId,
        binding.dotId,
        computerCanonical([
          binding.principalId,
          binding.profileId,
          binding.agentId,
        ]),
        computerCanonical(binding),
        computerCanonical({
          revision: 0,
          grantRevision: 0,
          controlRevision: 0,
          permissions: {
            enabled: false,
            browser: false,
            files: false,
            shell: false,
          },
          holder: 'bot',
          transitioning: false,
          resumeSnapshotRequired: true,
          snapshotId: null,
          snapshotSha256: null,
          snapshotAt: null,
        }),
      );
    initializeOperationRegistry(db, 'computer');
    initializeOperationRegistry(db, 'computer_owner');
  }
  private claim(
    operation: string,
    family: 'computer' | 'computer_owner',
    hash: string,
    authority: string,
  ) {
    let prior = this.db
      .prepare('SELECT * FROM runtime_operation_registry WHERE operationId=?')
      .get(operation);
    if (prior?.family === 'computer_ingress' && family === 'computer') {
      const identity = JSON.parse(authority) as DotsEffectIdentity;
      const expected = computerCanonical({
        binding: this.binding,
        session: identity.runtime_session_id,
      });
      const ingress = this.db
        .prepare(
          'SELECT authority,digest,prepared FROM runtime_computer_ingress WHERE operationId=? AND ownerId=?',
        )
        .get(operation, this.binding.ownerId);
      const prepared = ingress?.prepared
        ? (JSON.parse(String(ingress.prepared)) as {
            run_id: string;
            approval_id: string;
            approval_digest: string;
          })
        : null;
      if (
        prior.ownerId !== this.binding.ownerId ||
        prior.digest !== hash ||
        prior.authority !== expected ||
        ingress?.digest !== hash ||
        ingress?.authority !== expected ||
        prepared?.run_id !== identity.run_id ||
        prepared.approval_id !== identity.approval_id ||
        prepared.approval_digest !== identity.approval_digest
      )
        throw new ComputerEffectError(
          'Prepared computer operation authority mismatch.',
          409,
        );
      this.db
        .prepare(
          'UPDATE runtime_operation_registry SET family=?,authority=? WHERE operationId=?',
        )
        .run(family, authority, operation);
      prior = this.db
        .prepare('SELECT * FROM runtime_operation_registry WHERE operationId=?')
        .get(operation);
    }
    if (
      prior &&
      (prior.ownerId !== this.binding.ownerId ||
        prior.family !== family ||
        prior.digest !== hash ||
        prior.authority !== authority)
    )
      throw new ComputerEffectError(
        'Operation is already owned by another authority or family.',
        409,
      );
    if (!prior)
      this.db
        .prepare('INSERT INTO runtime_operation_registry VALUES(?,?,?,?,?)')
        .run(operation, this.binding.ownerId, family, hash, authority);
  }
  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  fence(): Fence {
    const row = this.db
      .prepare('SELECT value FROM runtime_computer_fences WHERE executorId=?')
      .get(this.binding.executorId);
    if (!row) throw new ComputerEffectError('Computer fence unavailable.', 503);
    return JSON.parse(String(row.value)) as Fence;
  }
  private save(fence: Fence) {
    this.db
      .prepare('UPDATE runtime_computer_fences SET value=? WHERE executorId=?')
      .run(computerCanonical(fence), this.binding.executorId);
  }
  /** Must be the SAME authority revision used in runtime.dots.register. Owner
   * routes and every permission writer must use this fence, never old patch(). */
  permissions(patch: unknown, expected: number, authenticate: () => void) {
    const parsed = computerPermissionsSchema.partial().parse(patch);
    const value = this.tx(() => {
      authenticate();
      const current = this.fence();
      if (current.grantRevision !== expected)
        throw new ComputerEffectError('Computer grant conflict.', 409);
      const next = {
        ...current,
        permissions: { ...current.permissions, ...parsed },
        revision: current.revision + 1,
        grantRevision: current.grantRevision + 1,
        resumeSnapshotRequired: true,
        snapshotId: null,
        snapshotSha256: null,
        snapshotAt: null,
      };
      this.save(next);
      this.db
        .prepare(
          'INSERT INTO runtime_computer_owner_fences VALUES(?,?,?,?,?,?)',
        )
        .run(
          randomUUID(),
          this.binding.executorId,
          this.binding.ownerId,
          'permissions',
          next.grantRevision,
          this.now(),
        );
      return next;
    });
    this.abort();
    return value;
  }
  /** Fence FIRST, then perform the real owner control/lifecycle call separately.
   * A failed/unknown handoff leaves the transition locked. Release is only an
   * observed real supervisor acknowledgement; it never reuses an old snapshot. */
  controlFence(
    holder: 'bot' | 'human',
    transitioning: boolean,
    expected: number,
    authenticate: () => void,
  ) {
    const value = this.tx(() => {
      authenticate();
      const current = this.fence();
      if (current.controlRevision !== expected)
        throw new ComputerEffectError('Computer control conflict.', 409);
      const next = {
        ...current,
        holder,
        transitioning,
        controlRevision: current.controlRevision + 1,
        revision: current.revision + 1,
        resumeSnapshotRequired: true,
        snapshotId: null,
        snapshotSha256: null,
        snapshotAt: null,
      };
      this.save(next);
      this.db
        .prepare(
          'INSERT INTO runtime_computer_owner_fences VALUES(?,?,?,?,?,?)',
        )
        .run(
          randomUUID(),
          this.binding.executorId,
          this.binding.ownerId,
          'control_fence',
          next.controlRevision,
          this.now(),
        );
      return next;
    });
    this.abort();
    return value;
  }
  /** Owner control bridge calls this only after exact authenticated target-state
   * proof. It clears transition without inventing a second control revision. */
  acknowledgeTarget(
    expectedGrant: number,
    expectedControl: number,
    holder: 'bot' | 'human',
    transitioning: boolean,
    authenticate: () => void,
  ) {
    return this.tx(() => {
      authenticate();
      const current = this.fence();
      if (
        current.grantRevision !== expectedGrant ||
        current.controlRevision !== expectedControl ||
        current.holder !== holder
      )
        throw new ComputerEffectError('Stale target acknowledgment.', 409);
      const next = {
        ...current,
        revision: current.revision + 1,
        transitioning,
        resumeSnapshotRequired: true,
        snapshotId: null,
        snapshotSha256: null,
        snapshotAt: null,
      };
      this.save(next);
      return next;
    });
  }
  close() {
    this.abort();
  }
  private abort() {
    for (const controller of this.active) controller.abort();
  }
  private agentActor(peer: NativeComputerPeer): EdgeActor {
    return {
      kind: 'agent',
      liveSessionId: peer.sessionId,
      authority: {
        principal_id: peer.principalId,
        profile_id: peer.profileId,
        agent_id: peer.agentId,
        runtime_session_id: peer.runtimeSessionId,
        run_id: peer.runId,
        generation: peer.generation,
        policy_digest: peer.policyDigest,
      },
    };
  }
  private currentPeer(
    session: string,
    identity: DotsEffectIdentity | DotsComputerObserveRequest['authority'],
    peer: NativeComputerPeer,
    mode: Mode,
  ) {
    peer.assertCurrent();
    if (
      session !== peer.sessionId ||
      identity.principal_id !== this.binding.principalId ||
      identity.profile_id !== this.binding.profileId ||
      identity.agent_id !== this.binding.agentId ||
      identity.principal_id !== peer.principalId ||
      identity.profile_id !== peer.profileId ||
      identity.agent_id !== peer.agentId ||
      identity.runtime_session_id !== peer.runtimeSessionId ||
      (mode !== 'inspect' &&
        (identity.generation !== peer.generation ||
          identity.policy_digest !== peer.policyDigest ||
          identity.run_id !== peer.runId)) ||
      !peer.canAccess(mode)
    )
      throw new ComputerEffectError(
        'Foreign, stale or revoked computer authority.',
        403,
      );
  }
  private deadline(at: number) {
    if (!Number.isFinite(at) || at * 1000 <= this.now())
      throw new ComputerEffectError('Computer callback deadline expired.', 409);
  }
  private scope(identity: DotsEffectIdentity) {
    if (
      identity.schema_version !== 1 ||
      identity.adapter_kind !== 'computer' ||
      identity.adapter_id !== this.binding.executorId
    )
      throw new ComputerEffectError('Computer effect adapter mismatch.', 403);
    const scope = JSON.parse(identity.scope_json) as Omit<
      DotsComputerProposal,
      'input'
    >;
    validate('DotsComputerProposal', { ...scope, input: {} });
    if (
      Object.hasOwn(scope, 'input') ||
      scope.kind !== 'computer' ||
      scope.executor_id !== this.binding.executorId ||
      scope.expected_grant_revision !== identity.grant_revision ||
      computerCanonical(scope) !== identity.scope_json
    )
      throw new ComputerEffectError('Computer effect scope mismatch.', 403);
    return scope;
  }
  private unknown(identity: DotsEffectIdentity): DotsEffectReceipt {
    return {
      identity,
      state: 'outcome_unknown',
      receipt_id: null,
      content_sha256: null,
      version: null,
      result_sha256: null,
      reason: 'unknown',
    };
  }
  private row(identity: DotsEffectIdentity): Row | undefined {
    const row = this.db
      .prepare('SELECT * FROM runtime_computer_effects WHERE effectId=?')
      .get(identity.effect_id) as unknown as Row | undefined;
    if (row && row.identity !== computerCanonical(identity))
      throw new ComputerEffectError('Computer effect identity conflict.', 409);
    return row;
  }
  private receipt(row: Row, identity: DotsEffectIdentity): DotsEffectReceipt {
    if (!row.receipt) return this.unknown(identity);
    const receipt = JSON.parse(row.receipt) as DotsEffectReceipt;
    validate('DotsEffectReceipt', receipt);
    if (
      computerCanonical(receipt.identity) !== computerCanonical(identity) ||
      !receipt.receipt_id ||
      receipt.state === 'outcome_unknown' ||
      (receipt.state === 'committed' &&
        (receipt.reason !== 'committed' ||
          receipt.content_sha256 !== identity.content_sha256 ||
          row.resultJson === null ||
          sha(row.resultJson) !== receipt.result_sha256)) ||
      (receipt.state === 'not_applied' &&
        ['committed', 'unknown'].includes(receipt.reason))
    )
      throw new ComputerEffectError('Invalid durable computer proof.', 503);
    return receipt;
  }
  private finish(
    identity: DotsEffectIdentity,
    reason: Reason | 'committed',
    result: string | null = null,
  ) {
    const receipt: DotsEffectReceipt = {
      identity,
      state: reason === 'committed' ? 'committed' : 'not_applied',
      receipt_id: randomUUID(),
      content_sha256: identity.content_sha256,
      version: null,
      result_sha256: result === null ? null : sha(result),
      reason,
    };
    validate('DotsEffectReceipt', receipt);
    const change = this.db
      .prepare(
        'UPDATE runtime_computer_effects SET receipt=?,resultJson=? WHERE effectId=? AND receipt IS NULL',
      )
      .run(computerCanonical(receipt), result, identity.effect_id);
    if (change.changes !== 1)
      throw new ComputerEffectError('Computer receipt already settled.', 409);
    this.db
      .prepare(
        'DELETE FROM runtime_computer_reservations WHERE executorId=? AND operationId=?',
      )
      .run(this.binding.executorId, identity.operation_id);
    return receipt;
  }
  private result(value: unknown): string {
    bounded(value, 4000000);
    computerCanonical(value); // Reject JSON.stringify coercions such as NaN -> null.
    let bytes = JSON.stringify(value);
    // Scrub keys as well as values, including escaped JSON secrets, before any persistence.
    for (const secret of this.secrets())
      if (secret) {
        const encoded = JSON.stringify(secret).slice(1, -1);
        bytes = bytes.split(encoded).join('[redacted]');
      }
    const sanitized = JSON.parse(bytes) as unknown;
    if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized))
      delete (sanitized as Record<string, unknown>).command;
    const result = computerCanonical(sanitized);
    if (Buffer.byteLength(result) > 65536)
      throw new ComputerEffectError('Computer result exceeds its bound.', 503);
    return result;
  }
  private rejection(
    proposal: DotsComputerProposal,
    peer: NativeComputerPeer,
  ): Reason | null {
    const f = this.fence();
    if (
      f.grantRevision !== proposal.expected_grant_revision ||
      f.grantRevision !== peer.grantRevision ||
      !f.permissions.enabled ||
      !f.permissions[kind(proposal.action)]
    )
      return 'grant_revoked';
    if (f.holder !== 'bot' || f.transitioning) return 'takeover';
    if (
      f.controlRevision !== proposal.expected_control_revision ||
      f.resumeSnapshotRequired ||
      f.snapshotId !== proposal.snapshot_id ||
      f.snapshotSha256 !== proposal.snapshot_sha256 ||
      f.snapshotAt === null ||
      this.now() - f.snapshotAt > 15000 ||
      f.snapshotAt > this.now()
    )
      return 'stale_snapshot';
    if (
      !this.edge?.qualified ||
      !this.edge.qualifiedActions.includes(proposal.action) ||
      !this.edge.available()
    )
      return 'unavailable';
    return null;
  }
  async dispatch(
    raw: unknown,
    peer: NativeComputerPeer,
  ): Promise<DotsEffectReceipt> {
    bounded(raw);
    validate('DotsDispatchRequest', raw);
    const r = immutable(raw as DotsDispatchRequest),
      { identity, proposal } = r;
    this.currentPeer(r.session_id, identity, peer, 'dispatch');
    const scope = this.scope(identity);
    if (proposal.kind !== 'computer')
      throw new ComputerEffectError('Only computer effects accepted.');
    normalized(proposal.action, proposal.input, true);
    const { input, ...givenScope } = proposal;
    const action = {
      name: 'runtime.dots.computer.execute',
      arguments: proposal,
      operation_class: 'dots_computer_action',
      resource_roots: [],
      destination: `dots:${digest(scope)}`,
      destination_purpose: 'dots_computer',
      contract_digest: digest({ schema_version: 1, kind: 'computer', scope }),
    };
    if (
      computerCanonical(givenScope) !== identity.scope_json ||
      computerCanonical(input) !== r.content_json ||
      sha(r.content_json) !== identity.content_sha256 ||
      Buffer.byteLength(r.content_json) !== identity.content_size ||
      digest(proposal) !== identity.input_digest ||
      digest(action) !== identity.action_digest ||
      ('snapshotId' in input && input.snapshotId !== proposal.snapshot_id)
    )
      throw new ComputerEffectError(
        'Exact computer approval bytes changed.',
        409,
      );
    this.deadline(r.deadline_at);
    const previous = this.tx(() => {
      const old = this.row(identity);
      if (old) {
        if (old.proposalDigest !== identity.input_digest)
          throw new ComputerEffectError('Computer proposal conflict.', 409);
        return this.receipt(old, identity);
      }
      if (
        this.db
          .prepare(
            'SELECT 1 FROM runtime_computer_effects WHERE operationId=? OR approvalId=?',
          )
          .get(identity.operation_id, identity.approval_id) ||
        this.db
          .prepare(
            'SELECT 1 FROM runtime_computer_owner_actions WHERE operationId=?',
          )
          .get(identity.operation_id)
      )
        throw new ComputerEffectError(
          'Computer operation or approval already admitted.',
          409,
        );
      this.claim(
        identity.operation_id,
        'computer',
        identity.input_digest,
        computerCanonical(identity),
      );
      this.db
        .prepare(
          'INSERT INTO runtime_computer_effects VALUES(?,?,?,?,?,?,NULL,NULL,?)',
        )
        .run(
          identity.effect_id,
          identity.operation_id,
          identity.approval_id,
          this.binding.executorId,
          computerCanonical(identity),
          identity.input_digest,
          this.now(),
        );
      return null;
    });
    if (previous) return previous;
    let reason = this.rejection(proposal, peer);
    if (reason) return this.tx(() => this.finish(identity, reason!));
    if (this.active.size >= 8)
      return this.tx(() => this.finish(identity, 'unavailable'));
    const reserved = this.tx(() => {
      if (
        this.db
          .prepare(
            'SELECT 1 FROM runtime_computer_reservations WHERE executorId=?',
          )
          .get(this.binding.executorId) ||
        this.db
          .prepare(
            'SELECT 1 FROM runtime_computer_effects WHERE executorId=? AND receipt IS NULL AND effectId!=?',
          )
          .get(this.binding.executorId, identity.effect_id) ||
        this.db
          .prepare(
            "SELECT 1 FROM runtime_computer_owner_actions WHERE executorId=? AND state='unknown'",
          )
          .get(this.binding.executorId)
      )
        return false;
      this.db
        .prepare('INSERT INTO runtime_computer_reservations VALUES(?,?,?)')
        .run(this.binding.executorId, identity.operation_id, 'agent');
      return true;
    });
    if (!reserved) return this.tx(() => this.finish(identity, 'conflict'));
    const controller = new AbortController();
    this.active.add(controller);
    let sent = false,
      duplicateSend = false,
      denied: Reason | null = null;
    const timer = setTimeout(
      () => controller.abort(),
      Math.min(70000, r.deadline_at * 1000 - this.now()),
    );
    // Cross-process revocation is read from the shared workspace DB as well.
    const watcher = setInterval(() => {
      try {
        this.currentPeer(r.session_id, identity, peer, 'dispatch');
        if (this.rejection(proposal, peer)) controller.abort();
      } catch {
        controller.abort();
      }
    }, 25);
    try {
      const targetRequest = {
        operationId: identity.operation_id,
        actor: this.agentActor(peer),
        identity,
        action: proposal.action,
        input,
        fence: {
          grantRevision: proposal.expected_grant_revision,
          controlRevision: proposal.expected_control_revision,
          snapshotId: proposal.snapshot_id,
          snapshotSha256: proposal.snapshot_sha256,
        },
      };
      this.db
        .prepare('INSERT INTO runtime_computer_target_requests VALUES(?,?)')
        .run(
          identity.operation_id,
          computerCanonical(edgeProofRequest(targetRequest as EdgeExecute)),
        );
      const result = await untilAbort(
        this.edge!.execute(proposal.action, input, {
          signal: controller.signal,
          fence: {
            operationId: identity.operation_id,
            identity,
            authority: this.agentActor(peer),
            effectId: identity.effect_id,
            actor: 'agent',
            grantRevision: proposal.expected_grant_revision,
            controlRevision: proposal.expected_control_revision,
            snapshotId: proposal.snapshot_id,
            snapshotSha256: proposal.snapshot_sha256,
          },
          beforeSend: () => {
            if (sent) {
              duplicateSend = true;
              controller.abort();
              throw new ComputerEffectError(
                'Computer effect cannot send twice.',
                409,
              );
            }
            this.tx(() => {
              this.currentPeer(r.session_id, identity, peer, 'dispatch');
              this.deadline(r.deadline_at);
              reason = this.rejection(proposal, peer);
              if (reason) {
                denied = reason;
                throw new ComputerEffectError('Computer dispatch fenced.', 409);
              }
              controller.signal.throwIfAborted();
            });
            sent = true;
          },
        }),
        controller.signal,
      );
      if (!sent || duplicateSend || controller.signal.aborted)
        return this.unknown(identity);
      const bytes = this.result(result);
      return this.tx(() => {
        this.currentPeer(r.session_id, identity, peer, 'dispatch');
        this.deadline(r.deadline_at);
        // Snapshot may have changed as a consequence of the action, but its original
        // local fence must still be unchanged when persisting the witnessed receipt.
        if (this.rejection(proposal, peer)) return this.unknown(identity);
        const receipt = this.finish(identity, 'committed', bytes);
        const f = this.fence();
        // Each subsequent effect requires a fresh actual observation, including shell.
        this.save({
          ...f,
          revision: f.revision + 1,
          resumeSnapshotRequired: true,
          snapshotId: null,
          snapshotSha256: null,
          snapshotAt: null,
        });
        return receipt;
      });
    } catch {
      if (!sent && denied) return this.tx(() => this.finish(identity, denied!));
      // An exception, timeout, lost response, malformed result or post-send revoke
      // is never proof of non-application. Durable admission remains inspect-only.
      return this.unknown(identity);
    } finally {
      clearTimeout(timer);
      clearInterval(watcher);
      this.active.delete(controller);
    }
  }
  inspect(raw: unknown, peer: NativeComputerPeer): DotsEffectReceipt {
    bounded(raw);
    validate('DotsInspectRequest', raw);
    const r = immutable(raw as DotsInspectRequest);
    this.currentPeer(r.session_id, r.identity, peer, 'inspect');
    this.deadline(r.deadline_at);
    this.scope(r.identity);
    const row = this.row(r.identity);
    return row ? this.receipt(row, r.identity) : this.unknown(r.identity);
  }
  /** Producer reconciliation must use this asynchronous entry. Its only remote
   * action is target receipt inspection; unknown is never retried. */
  async reconcile(
    raw: unknown,
    peer: NativeComputerPeer,
  ): Promise<DotsEffectReceipt> {
    const local = this.inspect(raw, peer);
    if (local.state !== 'outcome_unknown' || !this.edge?.inspect) return local;
    const identity = local.identity;
    const row = this.db
      .prepare(
        'SELECT request FROM runtime_computer_target_requests WHERE operationId=?',
      )
      .get(identity.operation_id);
    if (!row) return local;
    const request = JSON.parse(String(row.request)) as EdgeProofRequest;
    if (computerCanonical(request.identity) !== computerCanonical(identity))
      throw new ComputerEffectError('Target recovery identity conflict.', 409);
    const proof = await this.edge
      .inspect(request, this.agentActor(peer), AbortSignal.timeout(10000))
      .catch(() => null);
    if (!proof || proof.state === 'unknown') return local;
    return this.tx(() => {
      this.currentPeer(
        (raw as DotsInspectRequest).session_id,
        identity,
        peer,
        'inspect',
      );
      const current = this.row(identity);
      if (!current) return local;
      const receipt = this.receipt(current, identity);
      if (receipt.state !== 'outcome_unknown') return receipt;
      return this.finish(
        identity,
        proof.state === 'committed'
          ? 'committed'
          : proof.reason === 'busy'
            ? 'conflict'
            : proof.reason === 'unavailable'
              ? 'unavailable'
              : 'grant_revoked',
        proof.state === 'committed' ? this.result(proof.result) : null,
      );
    });
  }
  async observe(
    raw: unknown,
    peer: NativeComputerPeer,
  ): Promise<DotsComputerObserveResult> {
    bounded(raw);
    validate('DotsComputerObserveRequest', raw);
    const r = immutable(raw as DotsComputerObserveRequest),
      s = r.scope;
    this.currentPeer(r.session_id, r.authority, peer, 'observe');
    this.deadline(r.deadline_at);
    const first = this.fence();
    if (this.active.size >= 8)
      throw new ComputerEffectError('Computer read queue full.', 503);
    if (
      s.executor_id !== this.binding.executorId ||
      s.expected_grant_revision !== first.grantRevision ||
      peer.grantRevision !== first.grantRevision
    )
      throw new ComputerEffectError(
        'Computer observation grant mismatch.',
        403,
      );
    let content: string,
      snapshotId = first.snapshotId ?? 0;
    if (s.action === 'result') {
      if (computerCanonical(s.input ?? {}) !== '{}')
        throw new ComputerEffectError('Unexpected result input.');
      if (!s.effect_id)
        throw new ComputerEffectError('Computer result needs an effect ID.');
      const row = this.db
        .prepare(
          'SELECT * FROM runtime_computer_effects WHERE effectId=? AND executorId=?',
        )
        .get(s.effect_id, this.binding.executorId) as unknown as
        Row | undefined;
      if (!row)
        throw new ComputerEffectError('Computer result unavailable.', 503);
      const identity = JSON.parse(row.identity) as DotsEffectIdentity;
      this.currentPeer(r.session_id, identity, peer, 'inspect');
      if (
        this.receipt(row, identity).state !== 'committed' ||
        row.resultJson === null
      )
        throw new ComputerEffectError('Computer result is unresolved.', 409);
      content = row.resultJson;
    } else {
      if (s.effect_id !== null && s.effect_id !== undefined)
        throw new ComputerEffectError('Unexpected observation effect ID.');
      normalized(s.action, s.input ?? {}, true);
      if (
        !first.permissions.enabled ||
        !first.permissions[kind(s.action)] ||
        first.holder !== 'bot' ||
        first.transitioning ||
        !this.edge?.qualified ||
        !this.edge.qualifiedActions.includes(s.action) ||
        !this.edge.available()
      )
        throw new ComputerEffectError('Computer observation unavailable.', 503);
      const controller = new AbortController();
      this.active.add(controller);
      const timer = setTimeout(
        () => controller.abort(),
        Math.min(70000, r.deadline_at * 1000 - this.now()),
      );
      try {
        const observed = await untilAbort(
          this.edge.observe(s.action, s.input ?? {}, {
            signal: controller.signal,
            expectedGrantRevision: first.grantRevision,
            expectedControlRevision: first.controlRevision,
            authority: this.agentActor(peer),
          }),
          controller.signal,
        );
        controller.signal.throwIfAborted();
        this.deadline(r.deadline_at);
        if (
          !Number.isSafeInteger(observed.snapshotId) ||
          observed.snapshotId < 0
        )
          throw new ComputerEffectError('Invalid native snapshot ID.', 503);
        snapshotId = observed.snapshotId;
        content = this.result(observed.output);
      } catch {
        throw new ComputerEffectError('Computer observation unavailable.', 503);
      } finally {
        clearTimeout(timer);
        this.active.delete(controller);
      }
    }
    return this.tx(() => {
      this.currentPeer(r.session_id, r.authority, peer, 'observe');
      this.deadline(r.deadline_at);
      const current = this.fence();
      if (computerCanonical(current) !== computerCanonical(first))
        throw new ComputerEffectError(
          'Computer changed during observation.',
          409,
        );
      if (s.action === 'snapshot')
        this.save({
          ...current,
          revision: current.revision + 1,
          snapshotId,
          snapshotSha256: sha(content),
          snapshotAt: this.now(),
          resumeSnapshotRequired: false,
        });
      const f = this.fence();
      const result: DotsComputerObserveResult = {
        authority: r.authority,
        scope: s,
        control_revision: f.controlRevision,
        snapshot_id: snapshotId,
        snapshot_sha256:
          s.action === 'snapshot'
            ? sha(content)
            : (f.snapshotSha256 ?? sha(content)),
        content_json: content,
        content_sha256: sha(content),
      };
      validate('DotsComputerObserveResult', result);
      return result;
    });
  }
  /** Authenticated owner reads share the exact durable grant/control fence. Only
   * a witnessed target snapshot clears the post-handoff freshness requirement. */
  async ownerObserve(
    action: 'snapshot' | 'screenshot' | 'read' | 'files_list' | 'files_read',
    input: unknown,
    actor: Extract<EdgeActor, { kind: 'owner' }>,
    authenticate: () => void,
  ): Promise<unknown> {
    authenticate();
    normalized(action, input, false);
    const first = this.fence();
    if (
      actor.ownerId !== this.binding.ownerId ||
      !first.permissions.enabled ||
      !first.permissions[kind(action)] ||
      first.transitioning ||
      !this.edge?.qualified ||
      !this.edge.qualifiedActions.includes(action) ||
      !this.edge.available()
    )
      throw new ComputerEffectError('Owner observation unavailable.', 503);
    const controller = new AbortController();
    this.active.add(controller);
    const timer = setTimeout(() => controller.abort(), 70000);
    try {
      const observed = await untilAbort(
        this.edge.observe(action, input, {
          signal: controller.signal,
          expectedGrantRevision: first.grantRevision,
          expectedControlRevision: first.controlRevision,
          authority: actor,
        }),
        controller.signal,
      );
      controller.signal.throwIfAborted();
      const bytes = this.result(observed.output);
      if (!Number.isSafeInteger(observed.snapshotId) || observed.snapshotId < 0)
        throw new ComputerEffectError('Invalid target snapshot.', 503);
      return this.tx(() => {
        authenticate();
        const current = this.fence();
        if (computerCanonical(current) !== computerCanonical(first))
          throw new ComputerEffectError(
            'Owner observation fence changed.',
            409,
          );
        if (action === 'snapshot')
          this.save({
            ...current,
            revision: current.revision + 1,
            snapshotId: observed.snapshotId,
            snapshotSha256: sha(bytes),
            snapshotAt: this.now(),
            resumeSnapshotRequired: false,
          });
        return JSON.parse(bytes) as unknown;
      });
    } finally {
      clearTimeout(timer);
      this.active.delete(controller);
    }
  }
  private ownerBytes(bytes: unknown, hash: unknown): unknown {
    if (bytes === null && hash === null) return null;
    if (
      typeof bytes !== 'string' ||
      typeof hash !== 'string' ||
      sha(bytes) !== hash
    )
      throw new ComputerEffectError(
        'Owner computer result integrity mismatch.',
        503,
      );
    return JSON.parse(bytes) as unknown;
  }
  /** Authenticated GET recovery only. Missing rows do not admit or replay work. */
  ownerOperation(operationId: string, authenticate: () => void) {
    authenticate();
    const row = this.db
      .prepare(
        'SELECT * FROM runtime_computer_owner_actions WHERE operationId=? AND executorId=? AND ownerId=?',
      )
      .get(operationId, this.binding.executorId, this.binding.ownerId);
    if (!row)
      throw new ComputerEffectError(
        'Owner computer operation is unavailable.',
        503,
      );
    const result = {
      operationId,
      executorId: this.binding.executorId,
      intentDigest: String(row.intentDigest),
      action: String(row.action),
      state: String(row.state),
      result: this.ownerBytes(row.resultJson, row.resultSha256),
    };
    authenticate();
    return result;
  }
  async reconcileOwnerOperation(
    operationId: string,
    actor: Extract<EdgeActor, { kind: 'owner' }>,
    authenticate: () => void,
  ) {
    const current = this.ownerOperation(operationId, authenticate);
    if (current.state !== 'unknown' || !this.edge?.inspect) return current;
    if (actor.ownerId !== this.binding.ownerId)
      throw new ComputerEffectError('Owner mismatch.', 403);
    const row = this.db
      .prepare(
        'SELECT request FROM runtime_computer_target_requests WHERE operationId=?',
      )
      .get(operationId);
    if (!row) return current;
    const request = JSON.parse(String(row.request)) as EdgeProofRequest;
    const proof = await this.edge
      .inspect(request, actor, AbortSignal.timeout(10000))
      .catch(() => null);
    if (!proof || proof.state === 'unknown') return current;
    this.tx(() => {
      authenticate();
      const result =
        proof.state === 'committed' ? this.result(proof.result) : null;
      this.db
        .prepare(
          "UPDATE runtime_computer_owner_actions SET state=?,resultJson=?,resultSha256=? WHERE operationId=? AND state='unknown'",
        )
        .run(
          proof.state,
          result,
          result === null ? null : sha(result),
          operationId,
        );
      this.db
        .prepare(
          'DELETE FROM runtime_computer_reservations WHERE executorId=? AND operationId=?',
        )
        .run(this.binding.executorId, operationId);
    });
    return this.ownerOperation(operationId, authenticate);
  }
  /** Explicit authenticated native-owner path; no producer effect/approval is
   * invented. Exact operation retries inspect only, including after restart. */
  async ownerAction(
    operationId: string,
    action: ComputerAction,
    input: unknown,
    expectedControl: number,
    expectedGrant: number,
    authenticate: () => void,
    ownerSession?: { authSessionId: string; authRevision: number },
  ) {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(operationId))
      throw new ComputerEffectError('Invalid owner operation ID.');
    bounded(input);
    normalized(action, input, false);
    input = immutable(input);
    authenticate();
    const intent = digest({ action, input, expectedControl, expectedGrant });
    const previous = this.tx(() => {
      authenticate();
      const old = this.db
        .prepare(
          'SELECT * FROM runtime_computer_owner_actions WHERE operationId=?',
        )
        .get(operationId);
      if (old) {
        if (
          old.ownerId !== this.binding.ownerId ||
          old.executorId !== this.binding.executorId ||
          old.intentDigest !== intent
        )
          throw new ComputerEffectError(
            'Owner computer operation conflict.',
            409,
          );
        return {
          state: String(old.state),
          result: this.ownerBytes(old.resultJson, old.resultSha256),
        };
      }
      if (
        this.db
          .prepare('SELECT 1 FROM runtime_computer_effects WHERE operationId=?')
          .get(operationId)
      )
        throw new ComputerEffectError(
          'Computer operation belongs to a producer effect.',
          409,
        );
      this.claim(
        operationId,
        'computer_owner',
        intent,
        computerCanonical(this.binding),
      );
      this.db
        .prepare(
          "INSERT INTO runtime_computer_owner_actions VALUES(?,?,?,?,?,'unknown',NULL,NULL,?)",
        )
        .run(
          operationId,
          this.binding.executorId,
          this.binding.ownerId,
          intent,
          action,
          this.now(),
        );
      return null;
    });
    if (previous) return previous;
    const reserved = this.tx(() => {
      if (
        this.db
          .prepare(
            'SELECT 1 FROM runtime_computer_reservations WHERE executorId=?',
          )
          .get(this.binding.executorId) ||
        this.db
          .prepare(
            'SELECT 1 FROM runtime_computer_effects WHERE executorId=? AND receipt IS NULL',
          )
          .get(this.binding.executorId) ||
        this.db
          .prepare(
            "SELECT 1 FROM runtime_computer_owner_actions WHERE executorId=? AND state='unknown' AND operationId!=?",
          )
          .get(this.binding.executorId, operationId)
      )
        return false;
      this.db
        .prepare('INSERT INTO runtime_computer_reservations VALUES(?,?,?)')
        .run(this.binding.executorId, operationId, 'owner');
      return true;
    });
    if (!reserved) {
      this.db
        .prepare(
          "UPDATE runtime_computer_owner_actions SET state='not_applied' WHERE operationId=?",
        )
        .run(operationId);
      return { state: 'not_applied', result: null };
    }
    const allowed = () => {
      authenticate();
      const f = this.fence();
      if (
        f.controlRevision !== expectedControl ||
        f.grantRevision !== expectedGrant ||
        !f.permissions.enabled ||
        !f.permissions[kind(action)] ||
        f.transitioning ||
        (kind(action) === 'browser' &&
          f.holder !== (action.startsWith('human_') ? 'human' : 'bot')) ||
        !this.edge?.qualified ||
        !this.edge.qualifiedActions.includes(action) ||
        !this.edge.available()
      )
        throw new ComputerEffectError('Owner computer action fenced.', 409);
    };
    const controller = new AbortController();
    this.active.add(controller);
    const timer = setTimeout(() => controller.abort(), 70000);
    let sent = false;
    const watcher = setInterval(() => {
      try {
        allowed();
      } catch {
        controller.abort();
      }
    }, 25);
    try {
      allowed();
      if (ownerSession) {
        const f = this.fence();
        const request: EdgeExecute = {
          operationId,
          actor: {
            kind: 'owner',
            ownerId: this.binding.ownerId,
            ...ownerSession,
          },
          identity: null,
          action,
          input,
          fence: {
            grantRevision: expectedGrant,
            controlRevision: expectedControl,
            snapshotId: f.snapshotId,
            snapshotSha256: f.snapshotSha256,
          },
        };
        this.db
          .prepare('INSERT INTO runtime_computer_target_requests VALUES(?,?)')
          .run(operationId, computerCanonical(edgeProofRequest(request)));
      }
      const raw = await untilAbort(
        this.edge!.execute(action, input, {
          signal: controller.signal,
          fence: {
            operationId,
            ...(ownerSession
              ? {
                  authority: {
                    kind: 'owner' as const,
                    ownerId: this.binding.ownerId,
                    ...ownerSession,
                  },
                }
              : {}),
            effectId: null,
            actor: 'owner',
            grantRevision: expectedGrant,
            controlRevision: expectedControl,
            snapshotId: this.fence().snapshotId,
            snapshotSha256: this.fence().snapshotSha256,
          },
          beforeSend: () => {
            if (sent)
              throw new ComputerEffectError(
                'Owner operation cannot send twice.',
                409,
              );
            allowed();
            controller.signal.throwIfAborted();
            sent = true;
          },
        }),
        controller.signal,
      );
      allowed();
      controller.signal.throwIfAborted();
      if (!sent) return { state: 'unknown', result: null };
      const bytes = this.result(raw);
      return this.tx(() => {
        allowed();
        this.db
          .prepare(
            "UPDATE runtime_computer_owner_actions SET state='committed',resultJson=?,resultSha256=? WHERE operationId=?",
          )
          .run(bytes, sha(bytes), operationId);
        this.db
          .prepare(
            'DELETE FROM runtime_computer_reservations WHERE executorId=? AND operationId=?',
          )
          .run(this.binding.executorId, operationId);
        const f = this.fence();
        this.save({
          ...f,
          revision: f.revision + 1,
          resumeSnapshotRequired: true,
          snapshotId: null,
          snapshotSha256: null,
          snapshotAt: null,
        });
        return { state: 'committed', result: JSON.parse(bytes) as unknown };
      });
    } catch {
      return { state: 'unknown', result: null };
    } finally {
      clearTimeout(timer);
      clearInterval(watcher);
      this.active.delete(controller);
    }
  }
}
