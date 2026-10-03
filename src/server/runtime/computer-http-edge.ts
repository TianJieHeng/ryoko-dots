import { readFileSync, statSync } from 'node:fs';
import { z } from 'zod';
import type { ComputerAction } from '../../shared/computer-types.js';
import {
  edgeCanonical,
  computerHostQualificationSchema,
  edgeTargetIdentitySchema,
  edgeDigest,
  edgeReceiptSchema,
  edgeStateSchema,
  effectIdentitySchema,
  type EdgeActor,
  type EdgeBinding,
  type EdgeChange,
  type EdgeExecute,
  type EdgeReceipt,
  type EdgeProofRequest,
  type EdgeTargetIdentity,
} from '../../shared/computer-edge-protocol.js';
import type { NativeComputerEdge } from './computer-effect-service.js';

export interface ComputerProtocolTransport {
  configured(): boolean;
  /** Discovery and endpoint identity validation precede beforeSend. The actual
   * signed HTTP fetch follows beforeSend synchronously, without an intervening await. */
  request(
    path: string,
    body: unknown,
    role: 'agent' | 'owner',
    signal: AbortSignal,
    beforeSend?: () => void,
    expectedTarget?: EdgeTargetIdentity | null,
  ): Promise<unknown>;
}
export interface ComputerHostQualification {
  protocol: 'dots-computer-edge/1';
  buildSha256: string;
  configurationSha256: string;
  evidence: 'target-host' | 'synthetic';
  dotId: string;
  executorId: string;
  /** Operator-reviewed immutable image/runtime acceptance receipt, not a UI toggle. */
  receiptSha256: string;
  actions: readonly ComputerAction[];
}
export class ComputerTargetUnknown extends Error {}
export class ComputerTargetRejected extends Error {
  constructor(readonly receipt: EdgeReceipt) {
    super('Target proved nonapplication.');
  }
}
export class NativeComputerHttpEdge implements NativeComputerEdge {
  private qualification: ComputerHostQualification | null;
  get qualified() {
    return this.qualification !== null && this.verified;
  }
  readonly qualifiedActions: readonly ComputerAction[];
  readonly dotId: string;
  readonly executorId: string;
  private ready = false;
  private verified = false;
  get configured() {
    return this.transport.configured() && this.qualification !== null;
  }
  constructor(
    readonly binding: EdgeBinding,
    private transport: ComputerProtocolTransport,
    qualification: ComputerHostQualification | null,
  ) {
    this.dotId = binding.dotId;
    this.executorId = binding.executorId;
    const valid = computerHostQualificationSchema.safeParse(qualification);
    this.qualification =
      valid.success &&
      valid.data.dotId === binding.dotId &&
      valid.data.executorId === binding.executorId
        ? valid.data
        : null;
    this.qualifiedActions = this.qualification?.actions ?? [];
  }
  private request(
    ...args: Parameters<ComputerProtocolTransport['request']>
  ): Promise<unknown> {
    const q = this.qualification;
    const expectedTarget = q
      ? {
          buildSha256: q.buildSha256,
          configurationSha256: q.configurationSha256,
          evidence: q.evidence,
        }
      : null;
    return this.transport.request(
      args[0],
      args[1],
      args[2],
      args[3],
      args[4],
      expectedTarget,
    );
  }
  available() {
    return this.qualified && this.ready && this.transport.configured();
  }
  async refresh(actor: EdgeActor, signal: AbortSignal) {
    this.ready = false;
    const raw = await this.request(
      '/edge/status',
      { actor },
      actor.kind,
      signal,
    );
    const status = z
      .object({
        protocol: z.literal('dots-computer-edge/1'),
        dotId: z.literal(this.dotId),
        executorId: z.literal(this.executorId),
        state: edgeStateSchema,
        identity: edgeTargetIdentitySchema.nullable(),
        actions: z.array(z.string()),
      })
      .strict()
      .parse(raw);
    this.ready =
      this.qualification !== null &&
      status.identity !== null &&
      status.identity.buildSha256 === this.qualification.buildSha256 &&
      status.identity.configurationSha256 ===
        this.qualification.configurationSha256 &&
      status.identity.evidence === this.qualification.evidence &&
      this.qualifiedActions.every((a) => status.actions.includes(a));
    this.verified = this.ready;
    return status;
  }
  async change(
    request: EdgeChange,
    signal: AbortSignal,
    beforeSend: () => void,
  ) {
    if (request.actor.kind !== 'owner')
      throw new Error('Authenticated owner action required.');
    const state = edgeStateSchema.parse(
      await this.request('/edge/change', request, 'owner', signal, beforeSend),
    );
    return state;
  }
  async inspectChange(
    operationId: string,
    actor: EdgeActor,
    signal: AbortSignal,
  ) {
    if (actor.kind !== 'owner') throw new Error('Owner required.');
    return z
      .object({
        change: z
          .object({
            operationId: z.string(),
            requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
            state: edgeStateSchema,
          })
          .strict()
          .nullable(),
      })
      .strict()
      .parse(
        await this.request(
          '/edge/change-inspect',
          { operationId, actor },
          'owner',
          signal,
        ),
      );
  }
  async screen(
    actor: EdgeActor,
    expectedGrantRevision: number,
    expectedControlRevision: number,
    signal: AbortSignal,
  ) {
    if (
      actor.kind !== 'owner' ||
      !this.available() ||
      !this.qualifiedActions.includes('screenshot')
    )
      throw new Error('Owner screen unavailable.');
    return z
      .object({
        snapshotId: z.number().int().nonnegative().safe(),
        output: z
          .object({
            snapshotId: z.number().int().nonnegative().safe(),
            base64: z.string().max(16_000_000),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            url: z.string().max(2048),
            capturedAt: z.number().int().nonnegative().safe(),
          })
          .strict(),
      })
      .strict()
      .parse(
        await this.request(
          '/edge/screen',
          {
            actor,
            action: 'screenshot',
            input: {},
            expectedGrantRevision,
            expectedControlRevision,
          },
          'owner',
          signal,
        ),
      );
  }
  async execute(
    action: ComputerAction,
    input: unknown,
    edge: Parameters<NativeComputerEdge['execute']>[2],
  ): Promise<unknown> {
    if (!this.available() || !this.qualifiedActions.includes(action))
      throw new ComputerTargetUnknown('Executor unavailable.');
    const { fence } = edge;
    if (!fence.authority || (fence.actor === 'agent' && !fence.identity))
      throw new Error('Verified edge identity required.');
    const body: EdgeExecute = {
      operationId: fence.operationId,
      actor: fence.authority,
      identity: fence.identity
        ? effectIdentitySchema.parse(fence.identity)
        : null,
      action,
      input,
      fence: {
        grantRevision: fence.grantRevision,
        controlRevision: fence.controlRevision,
        snapshotId: fence.snapshotId,
        snapshotSha256: fence.snapshotSha256,
      },
    };
    const receipt = edgeReceiptSchema.parse(
      await this.request(
        '/edge/execute',
        body,
        fence.actor,
        edge.signal,
        edge.beforeSend,
      ),
    );
    this.verify(receipt, body);
    if (receipt.state === 'not_applied')
      throw new ComputerTargetRejected(receipt);
    if (receipt.state !== 'committed')
      throw new ComputerTargetUnknown('Target operation unresolved.');
    return receipt.result;
  }
  private verify(
    receipt: EdgeReceipt,
    request: EdgeExecute | EdgeProofRequest,
  ) {
    if (
      receipt.operationId !== request.operationId ||
      receipt.requestSha256 !==
        ('requestSha256' in request
          ? request.requestSha256
          : edgeDigest(request)) ||
      edgeCanonical(receipt.identity) !== edgeCanonical(request.identity) ||
      edgeCanonical(receipt.actor) !== edgeCanonical(request.actor) ||
      (receipt.state === 'committed' &&
        (receipt.resultSha256 !== edgeDigest(receipt.result) ||
          receipt.receiptId === null))
    )
      throw new ComputerTargetUnknown('Target proof mismatch.');
  }
  /** Read-only operation-bound recovery. Never dispatches or manufactures proof. */
  async inspect(
    request: EdgeProofRequest,
    actor: EdgeActor,
    signal: AbortSignal,
  ): Promise<EdgeReceipt | null> {
    const raw = z
      .object({ receipt: edgeReceiptSchema.nullable() })
      .strict()
      .parse(
        await this.request(
          '/edge/inspect',
          { operationId: request.operationId, actor },
          actor.kind,
          signal,
        ),
      );
    if (raw.receipt) this.verify(raw.receipt, request);
    return raw.receipt;
  }
  async observe(
    action: Parameters<NativeComputerEdge['observe']>[0],
    input: unknown,
    edge: Parameters<NativeComputerEdge['observe']>[2],
  ) {
    if (
      !this.available() ||
      !this.qualifiedActions.includes(action) ||
      !edge.authority
    )
      throw new Error('Verified observation authority required.');
    const body = {
      actor: edge.authority,
      action,
      input,
      expectedGrantRevision: edge.expectedGrantRevision,
      expectedControlRevision: edge.expectedControlRevision,
    };
    return z
      .object({
        snapshotId: z.number().int().nonnegative().safe(),
        output: z.unknown(),
      })
      .strict()
      .parse(
        await this.request(
          '/edge/observe',
          body,
          edge.authority.kind,
          edge.signal,
        ),
      );
  }
}

/** Read only explicitly configured, bounded operator evidence. Absent evidence
 * never manufactures a qualified executor; synthetic fixture reports are denied. */
export function loadComputerHostQualification(
  path: string | undefined,
  binding: Pick<EdgeBinding, 'dotId' | 'executorId'>,
): ComputerHostQualification | null {
  if (!path) return null;
  if (statSync(path).size > 65536)
    throw new Error('Qualification file exceeds its bound.');
  const qualification = computerHostQualificationSchema.parse(
    JSON.parse(readFileSync(path, 'utf8')),
  );
  if (
    qualification.evidence !== 'target-host' ||
    qualification.dotId !== binding.dotId ||
    qualification.executorId !== binding.executorId
  )
    throw new Error('Qualification is not for this target host.');
  return qualification;
}
