import {
  edgeCanonical,
  edgeActorSchema,
  edgeChangeSchema,
  edgeDigest,
  edgeExecuteSchema,
  edgeKind,
  edgeObserveSchema,
  exactEdgeInput,
  sanitizeEdgeResult,
  verifyEdge,
  type EdgeActor,
  type EdgeTargetIdentity,
  type EdgeChange,
  type EdgeExecute,
  type EdgeObserve,
} from '../shared/computer-edge-protocol.js';
import type { ComputerAction } from '../shared/computer-types.js';
import { ComputerEdgeStore } from './edge-store.js';

export interface TargetDispatch {
  signal: AbortSignal;
  /** Call synchronously immediately before EACH irreversible primitive, with no
   * await between this call and Playwright/send/write/spawn. Preparation may await. */
  guard(): void;
}
export interface ComputerTargetDriver {
  actions: readonly ComputerAction[];
  execute(
    action: ComputerAction,
    input: unknown,
    dispatch: TargetDispatch,
  ): Promise<unknown>;
  observe(
    action: EdgeObserve['action'],
    input: unknown,
    snapshotId: number,
    dispatch: TargetDispatch,
  ): Promise<unknown>;
}
class Fenced extends Error {}
const response = (value: unknown, status = 200) =>
  Response.json(value, { status });
/** Authenticated target edge. HTTP disconnect never cancels durable ownership;
 * it only requests cancellation. The exact receipt can be read after loss. */
export class ComputerEdgeService {
  private active = new Map<string, AbortController>();
  private reads = new Set<AbortController>();
  constructor(
    readonly store: ComputerEdgeStore,
    private driver: ComputerTargetDriver,
    private token: string,
    private now: () => number = Date.now,
    private identity: EdgeTargetIdentity | null = null,
  ) {
    if (token.length < 24)
      throw new Error('A scoped computer credential is required.');
  }
  private actor(actor: EdgeActor) {
    const binding = this.store.binding();
    if (!binding) throw new Fenced('Executor not bound.');
    if (actor.kind === 'owner') {
      if (actor.ownerId !== binding.ownerId) throw new Fenced('Foreign owner.');
    } else if (
      actor.authority.principal_id !== binding.principalId ||
      actor.authority.profile_id !== binding.profileId ||
      actor.authority.agent_id !== binding.agentId
    )
      throw new Fenced('Foreign actor.');
  }
  private validIdentity(request: EdgeExecute) {
    const { identity, actor, action, input, fence } = request;
    if (actor.kind === 'owner') {
      if (identity !== null)
        throw new Fenced('Owner actions cannot impersonate effects.');
      return;
    }
    if (!identity || action.startsWith('human_'))
      throw new Fenced('Agent effect required.');
    for (const [key, value] of Object.entries(actor.authority))
      if (identity[key as keyof typeof identity] !== value)
        throw new Fenced('Effect authority changed.');
    const scope = JSON.parse(identity.scope_json) as Record<string, unknown>;
    const expected = {
      kind: 'computer',
      executor_id: this.store.executorId,
      action,
      expected_grant_revision: fence.grantRevision,
      expected_control_revision: fence.controlRevision,
      snapshot_id: fence.snapshotId,
      snapshot_sha256: fence.snapshotSha256,
    };
    const proposal = { ...expected, input };
    const operation = {
      name: 'runtime.dots.computer.execute',
      arguments: proposal,
      operation_class: 'dots_computer_action',
      resource_roots: [],
      destination: `dots:${edgeDigest(expected)}`,
      destination_purpose: 'dots_computer',
      contract_digest: edgeDigest({
        schema_version: 1,
        kind: 'computer',
        scope: expected,
      }),
    };
    if (
      identity.operation_id !== request.operationId ||
      identity.adapter_id !== this.store.executorId ||
      identity.grant_revision !== fence.grantRevision ||
      edgeCanonical(scope) !== edgeCanonical(expected) ||
      identity.scope_json !== edgeCanonical(expected) ||
      identity.content_sha256 !== edgeDigest(input) ||
      identity.content_size !== Buffer.byteLength(edgeCanonical(input)) ||
      identity.input_digest !== edgeDigest(proposal) ||
      identity.action_digest !== edgeDigest(operation)
    )
      throw new Fenced('Effect bytes changed.');
  }
  private guard(request: EdgeExecute, expiresAt: number, signal: AbortSignal) {
    signal.throwIfAborted();
    this.actor(request.actor);
    const state = this.store.state(),
      f = request.fence;
    const human =
      request.actor.kind === 'owner' && request.action.startsWith('human_');
    const holder = human ? 'human' : 'bot';
    if (
      this.now() >= expiresAt ||
      !state.permissions.enabled ||
      !state.permissions[edgeKind(request.action)] ||
      state.grantRevision !== f.grantRevision ||
      state.controlRevision !== f.controlRevision ||
      state.holder !== holder ||
      state.transitioning ||
      (!human &&
        (state.resumeSnapshotRequired ||
          state.snapshotId !== f.snapshotId ||
          state.snapshotSha256 !== f.snapshotSha256 ||
          state.snapshotAt === null ||
          state.snapshotAt > this.now() ||
          this.now() - state.snapshotAt > 15000))
    )
      throw new Fenced('Target dispatch fenced.');
    if (
      (request.action === 'click' || request.action === 'type') &&
      (request.input as { snapshotId: number }).snapshotId !== f.snapshotId
    )
      throw new Fenced('Stale reference.');
  }
  private abort() {
    for (const a of [...this.active.values(), ...this.reads]) a.abort();
  }
  private change(request: EdgeChange) {
    if (request.actor.kind !== 'owner')
      throw new Fenced('Owner operation required.');
    const owner = request.actor;
    return this.store.tx(() => {
      const db = this.store.db,
        hash = edgeDigest(request);
      const prior = db
        .prepare('SELECT * FROM edge_changes WHERE operationId=?')
        .get(request.operationId);
      if (prior) {
        if (prior.requestSha256 !== hash)
          throw new Fenced('Operation conflict.');
        return JSON.parse(String(prior.result)) as unknown;
      }
      if (this.store.inspect(request.operationId))
        throw new Fenced('Operation conflict.');
      const state = this.store.state(),
        binding = this.store.binding();
      if (
        state.grantRevision !== request.expectedGrantRevision ||
        state.controlRevision !== request.expectedControlRevision
      )
        throw new Fenced('Revision conflict.');
      if (request.change.kind === 'bind') {
        const b = request.change.binding;
        if (
          b.dotId !== this.store.dotId ||
          b.executorId !== this.store.executorId ||
          b.ownerId !== owner.ownerId
        )
          throw new Fenced('Binding mismatch.');
        if (binding) this.actor(request.actor);
        this.store.bind(b);
      } else {
        this.actor(request.actor);
        const next = {
          ...state,
          revision: state.revision + 1,
          resumeSnapshotRequired: true,
          snapshotId: null,
          snapshotSha256: null,
          snapshotAt: null,
        };
        if (request.change.kind === 'permissions') {
          next.permissions = request.change.permissions;
          next.grantRevision++;
        } else {
          next.holder = request.change.holder;
          next.controlRevision++;
          next.transitioning = this.store.busy();
        }
        this.store.save(next);
        this.abort();
      }
      const result = this.store.state();
      db.prepare('INSERT INTO edge_changes VALUES(?,?,?)').run(
        request.operationId,
        hash,
        edgeCanonical(result),
      );
      return result;
    });
  }
  private async execute(
    request: EdgeExecute,
    expiresAt: number,
    disconnect: AbortSignal,
  ) {
    exactEdgeInput(request.action, request.input);
    this.validIdentity(request);
    this.actor(request.actor);
    const controller = new AbortController();
    let admitted = false;
    const receipt = this.store.tx(() => {
      const previous = this.store.inspect(request.operationId);
      if (previous) {
        if (previous.requestSha256 !== edgeDigest(request))
          throw new Fenced('Operation conflict.');
        return previous;
      }
      let rejection: 'fenced' | 'busy' | 'unavailable' | null = null;
      try {
        this.guard(request, expiresAt, controller.signal);
      } catch {
        rejection = 'fenced';
      }
      if (!rejection && !this.driver.actions.includes(request.action))
        rejection = 'unavailable';
      if (!rejection && (this.store.busy() || this.reads.size))
        rejection = 'busy';
      const receipt = this.store.admit(request, rejection);
      admitted = !rejection;
      return receipt;
    });
    // A DB row without this local admission is always inspect-only, including
    // a restart between admission and the very first target primitive.
    if (!admitted) return receipt;
    this.active.set(request.operationId, controller);
    const abort = () => controller.abort();
    disconnect.addEventListener('abort', abort, { once: true });
    if (disconnect.aborted) abort();
    const timer = setTimeout(abort, Math.max(1, expiresAt - this.now()));
    try {
      let dispatched = false;
      const result = await this.driver.execute(request.action, request.input, {
        signal: controller.signal,
        guard: () =>
          this.store.tx(() => {
            this.guard(request, expiresAt, controller.signal);
            this.store.markDispatched(request.operationId);
            dispatched = true;
          }),
      });
      if (!dispatched) throw new Error('Driver omitted target dispatch guard.');
      const safe = sanitizeEdgeResult(result, [this.token]);
      // A successfully witnessed result is useful even when the BFF lost its
      // response or revoked afterward. It does not grant another action.
      return this.store.tx(() => this.store.finish(request.operationId, safe));
    } catch {
      if (!this.store.wasDispatched(request.operationId))
        return this.store.tx(() =>
          this.store.finish(request.operationId, null, true),
        );
      return this.store.inspect(request.operationId)!;
    } finally {
      clearTimeout(timer);
      disconnect.removeEventListener('abort', abort);
      this.active.delete(request.operationId);
      this.store.tx(() => {
        const s = this.store.state();
        if (s.transitioning && !this.store.busy())
          this.store.save({
            ...s,
            transitioning: false,
            revision: s.revision + 1,
          });
      });
    }
  }
  private async observe(
    request: EdgeObserve,
    expiresAt: number,
    disconnect: AbortSignal,
    screen = false,
  ) {
    if (screen && request.actor.kind !== 'owner')
      throw new Fenced('Owner screenshot required.');
    exactEdgeInput(request.action, request.input);
    const controller = new AbortController();
    const abort = () => controller.abort();
    disconnect.addEventListener('abort', abort, { once: true });
    if (disconnect.aborted) abort();
    const timer = setTimeout(abort, Math.max(1, expiresAt - this.now()));
    const guard = () => {
      controller.signal.throwIfAborted();
      this.actor(request.actor);
      const s = this.store.state();
      if (
        this.now() >= expiresAt ||
        (!screen && this.store.busy()) ||
        !s.permissions.enabled ||
        !s.permissions[edgeKind(request.action)] ||
        (!screen && s.transitioning) ||
        s.grantRevision !== request.expectedGrantRevision ||
        s.controlRevision !== request.expectedControlRevision ||
        (request.actor.kind === 'agent' && s.holder !== 'bot')
      )
        throw new Fenced('Observation fenced.');
    };
    try {
      guard();
      if (this.reads.size) throw new Fenced('Observation busy.');
      this.reads.add(controller);
      const id =
        request.action === 'snapshot' || screen
          ? this.store.tx(() => this.store.nextSnapshot())
          : (this.store.state().snapshotId ?? 0);
      const output = sanitizeEdgeResult(
        await this.driver.observe(request.action, request.input, id, {
          signal: controller.signal,
          guard,
        }),
        [this.token],
        screen ? 16_100_000 : 65536,
      );
      guard();
      if (request.action === 'snapshot') {
        if (
          !output ||
          typeof output !== 'object' ||
          (output as { snapshotId: unknown }).snapshotId !== id
        )
          throw new Error('Snapshot identity mismatch.');
        this.store.tx(() => {
          guard();
          const s = this.store.state();
          this.store.save({
            ...s,
            revision: s.revision + 1,
            resumeSnapshotRequired: false,
            snapshotId: id,
            snapshotSha256: edgeDigest(output),
            snapshotAt: this.now(),
          });
        });
      }
      return { snapshotId: id, output };
    } finally {
      clearTimeout(timer);
      disconnect.removeEventListener('abort', abort);
      this.reads.delete(controller);
    }
  }
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/health' && request.method === 'GET')
      return response({ ok: true, protocol: 'dots-computer-edge/1' });
    // No legacy /exec, /files, /human, /control or WebSocket route remains open.
    if (
      request.method !== 'POST' ||
      ![
        '/edge/status',
        '/edge/change',
        '/edge/change-inspect',
        '/edge/execute',
        '/edge/observe',
        '/edge/screen',
        '/edge/inspect',
      ].includes(path)
    )
      return response({ error: 'Not found.' }, 404);
    try {
      if (Number(request.headers.get('content-length') ?? 0) > 200000)
        throw new Fenced('Too large.');
      const reader = request.body?.getReader();
      if (!reader) throw new Fenced('Missing body.');
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 200000) {
          await reader.cancel();
          throw new Fenced('Too large.');
        }
        chunks.push(value);
      }
      const raw = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
      const envelope = verifyEdge(
        path,
        raw,
        this.token,
        this.store.dotId,
        this.store.executorId,
        this.now(),
      );
      const body = envelope.body as { actor?: EdgeActor };
      // Bind every effect/change/read to the reviewed running target, not only
      // an earlier discovery result. A restart into another build fails closed.
      if (
        path !== '/edge/status' &&
        this.identity &&
        edgeCanonical(envelope.expectedTarget ?? null) !==
          edgeCanonical(this.identity)
      )
        throw new Fenced('Target build changed.');
      if (!body?.actor || body.actor.kind !== envelope.role)
        throw new Fenced('Role mismatch.');
      if (path === '/edge/change')
        return response(this.change(edgeChangeSchema.parse(body)));
      edgeActorSchema.parse(body.actor);
      if (!(
        path === '/edge/status' &&
        body.actor.kind === 'owner' &&
        !this.store.binding()
      ))
        this.actor(body.actor);
      if (path === '/edge/change-inspect') {
        if (body.actor.kind !== 'owner') throw new Fenced('Owner required.');
        const operationId = (body as { operationId?: unknown }).operationId;
        if (typeof operationId !== 'string' || operationId.length > 256)
          throw new Fenced('Invalid operation.');
        const row = this.store.db
          .prepare('SELECT * FROM edge_changes WHERE operationId=?')
          .get(operationId);
        return response({
          change: row
            ? {
                operationId,
                requestSha256: String(row.requestSha256),
                state: JSON.parse(String(row.result)),
              }
            : null,
        });
      }
      if (path === '/edge/status')
        return response({
          protocol: 'dots-computer-edge/1',
          identity: this.identity,
          dotId: this.store.dotId,
          executorId: this.store.executorId,
          state: this.store.state(),
          actions: this.driver.actions,
        });
      if (path === '/edge/inspect') {
        const b = body as { operationId?: unknown };
        if (typeof b.operationId !== 'string' || b.operationId.length > 256)
          throw new Fenced('Invalid operation.');
        const proof = this.store.inspect(b.operationId);
        if (
          proof &&
          (proof.actor.kind !== body.actor.kind ||
            (proof.actor.kind === 'agent' &&
              body.actor.kind === 'agent' &&
              (proof.actor.authority.runtime_session_id !==
                body.actor.authority.runtime_session_id ||
                proof.actor.authority.agent_id !==
                  body.actor.authority.agent_id)))
        )
          throw new Fenced('Foreign receipt.');
        return response({ receipt: proof });
      }
      if (path === '/edge/execute') {
        const parsed = edgeExecuteSchema.parse(body);
        return response(
          await this.execute(parsed, envelope.expiresAt, request.signal),
        );
      }
      if (
        path === '/edge/screen' &&
        (body as { action?: unknown }).action !== 'screenshot'
      )
        throw new Fenced('Screenshot required.');
      return response(
        await this.observe(
          edgeObserveSchema.parse(body),
          envelope.expiresAt,
          request.signal,
          path === '/edge/screen',
        ),
      );
    } catch {
      return response({ error: 'Computer edge request rejected.' }, 409);
    }
  }
}
