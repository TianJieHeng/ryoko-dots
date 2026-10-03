import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  contractVersion,
  type RuntimeScope,
} from '../../shared/runtime/contracts.js';
import type {
  RuntimeDeliveryReceipt,
  RuntimeResultChunk,
} from '../../shared/runtime/producer/wire.generated.js';
import { browserScope, type Guard } from '../self-hosted-platform.js';
import type { VerifiedConversationScope } from './bindings.js';
import type { ControlBinding } from './control-service.js';
import { ConversationError } from './conversation-ledger.js';
import type { LaunchConfig } from './stdio.js';

const id = z.string().min(1).max(256);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const maxResultBytes = 8 * 1024 * 1024;
const chunkBytes = 65536;
const referenceSchema = z.strictObject({
  delivery_id: id,
  command_id: id,
  artifact_id: id,
  version: integer.refine((value) => value > 0),
  sha256: digest,
  size: integer.max(maxResultBytes),
  mime: z.literal('application/json'),
  attempt_token: id,
});
/** Only this public result notification may cross the private-output boundary. */
export const resultAvailableEventSchema = z.strictObject({
  type: z.literal('runtime.result.available'),
  session_id: id,
  payload: referenceSchema,
  seq: integer.optional(),
});
export type ResultAvailableEvent = z.infer<typeof resultAvailableEventSchema>;
const chunkSchema = referenceSchema
  .omit({ attempt_token: true, delivery_id: true })
  .extend({
    delivery_id: id.nullable(),
    offset: integer,
    data_base64: z.string().max(Math.ceil(chunkBytes / 3) * 4),
    next_offset: integer,
    eof: z.boolean(),
    publication_state: z.enum(['committed', 'published_uncommitted']),
  });
type SafeResultChunk = z.infer<typeof chunkSchema>;
export interface DeliveryResults {
  'runtime.result.get': RuntimeResultChunk;
  'runtime.delivery.status': RuntimeDeliveryReceipt;
  'runtime.delivery.ack': RuntimeDeliveryReceipt;
}
export interface DeliveryTransport {
  readonly config: LaunchConfig;
  readonly connected: boolean;
  readonly epoch?: number;
  call<M extends keyof DeliveryResults>(
    method: M,
    params: unknown,
  ): Promise<DeliveryResults[M]>;
}
export const browserDeliveryAcknowledgmentSchema = z
  .strictObject({
    receiptId: z.uuid(),
    sha256: digest,
    textReceived: z.boolean(),
    artifactReceived: z.boolean(),
  })
  .refine((value) => value.textReceived || value.artifactReceived);
export type BrowserDeliveryAcknowledgment = z.infer<
  typeof browserDeliveryAcknowledgmentSchema
>;
export interface BrowserDeliveryAcknowledgmentResult {
  version: typeof contractVersion;
  scope: RuntimeScope;
  conversationId: string;
  deliveryId: string;
  receiptId: string;
  status: 'accepted' | 'rejected' | 'outcome_unknown';
  delivery: RuntimeDeliveryReceipt | null;
  humanReadConfirmed: false;
}
interface BrowserReceipt {
  receiptId: string;
  ownerId: string;
  conversationId: string;
  authority: string;
  deliveryId: string;
  commandId: string;
  artifactId: string;
  version: number;
  sha256: string;
  attemptToken: string;
  intent: string | null;
  state: 'issued' | 'pending' | 'accepted' | 'rejected' | 'outcome_unknown';
  result: string | null;
}
const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
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
const invalidResult = () =>
  new ConversationError('Runtime result bytes or scope are inconsistent.', 409);

/** Reads Ryoko's immutable object. It never runs inference, emits delivery, or
 * acknowledges a GET. Browser receipt claims are explicit and durable; they are
 * not proof of human reading. No paths/URLs from the artifact are followed. */
export class RuntimeDeliveryService {
  private db: DatabaseSync;
  private notices = new Map<string, ResultAvailableEvent>();
  constructor(
    private ownerId: string,
    database: string,
    private transport: DeliveryTransport,
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
  ) {
    this.db = new DatabaseSync(database);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runtime_browser_delivery_receipts(receiptId TEXT PRIMARY KEY,ownerId TEXT NOT NULL,conversationId TEXT NOT NULL,authority TEXT NOT NULL,deliveryId TEXT NOT NULL,commandId TEXT NOT NULL,artifactId TEXT NOT NULL,version INTEGER NOT NULL,sha256 TEXT NOT NULL,attemptToken TEXT NOT NULL,intent TEXT,state TEXT NOT NULL,result TEXT);`);
  }
  close() {
    this.notices.clear();
    this.db.close();
  }
  /** Called only by the trusted transport with its captured launch epoch. No
   * notification content is returned to a browser until a scoped result read
   * and delivery status have independently matched its immutable descriptor. */
  observeResultAvailable(raw: unknown, epoch: number): boolean {
    if (!this.transport.connected || epoch !== (this.transport.epoch ?? 0))
      return false;
    const parsed = resultAvailableEventSchema.safeParse(raw);
    if (!parsed.success) return false;
    const event = parsed.data;
    const key = this.noticeKey(
      epoch,
      event.session_id,
      event.payload.command_id,
    );
    const previous = this.notices.get(key);
    if (
      previous?.seq !== undefined &&
      (event.seq === undefined || event.seq <= previous.seq)
    )
      return JSON.stringify(previous) === JSON.stringify(event);
    this.notices.delete(key);
    this.notices.set(key, event);
    while (this.notices.size > 512)
      this.notices.delete(this.notices.keys().next().value!);
    return true;
  }
  private noticeKey(epoch: number, live: string, command: string) {
    return JSON.stringify([epoch, live, command]);
  }
  private authority(bound: ControlBinding) {
    return hash(
      JSON.stringify(
        canonical({
          scope: browserScope(bound.scope),
          conversationId: bound.scope.conversationId,
          durableSessionId: bound.scope.durableSessionId,
          principal: bound.scope.principalId,
          profile: bound.scope.profileId,
          grantRevision: bound.scope.grantRevision,
          projectRevision: bound.scope.projectRevision,
          home: this.transport.config.home,
          identity: this.transport.config.identity,
          provider: hash(
            JSON.stringify(
              canonical(this.transport.config.providerEnvironment ?? {}),
            ),
          ),
        }),
      ),
    );
  }
  private fence(bound: ControlBinding, auth: Guard, access: 'read' | 'write') {
    this.assertCurrent(bound.scope, auth, access);
    if (
      !this.transport.connected ||
      bound.epoch !== (this.transport.epoch ?? 0) ||
      bound.scope.ownerId !== this.ownerId ||
      bound.binding.liveSessionId !== bound.scope.liveSessionId ||
      bound.binding.durableSessionId !== bound.scope.durableSessionId
    )
      throw new ConversationError('Runtime result binding changed.', 409);
  }
  private async call<M extends keyof DeliveryResults>(
    bound: ControlBinding,
    method: M,
    params: object,
    auth: Guard,
    access: 'read' | 'write',
  ): Promise<DeliveryResults[M]> {
    this.fence(bound, auth, access);
    const result = await this.transport.call(method, {
      ...params,
      schema_version: 1,
      session_id: bound.binding.liveSessionId,
    });
    this.fence(bound, auth, access);
    return result;
  }
  private checkDelivery(
    bound: ControlBinding,
    result: RuntimeDeliveryReceipt,
    expected: {
      deliveryId: string;
      artifactId: string;
      version: number;
      sha256: string;
    },
  ) {
    const destination = result.destination;
    if (
      result.delivery_id !== expected.deliveryId ||
      result.artifact_id !== expected.artifactId ||
      result.version !== expected.version ||
      result.sha256 !== expected.sha256 ||
      destination.kind !== 'local_runtime' ||
      destination.session_id !== bound.scope.durableSessionId ||
      destination.principal_id !== bound.scope.principalId ||
      destination.profile_id !== bound.scope.profileId ||
      destination.agent_id !== bound.scope.agentId
    )
      throw invalidResult();
  }
  async readResult(conversationId: string, commandId: string, auth: Guard) {
    id.parse(commandId);
    const bound = await this.boundSession(conversationId, auth, 'read');
    let reference: SafeResultChunk | undefined;
    const parts: Buffer[] = [];
    let offset = 0;
    for (;;) {
      const parsed = chunkSchema.safeParse(
        await this.call(
          bound,
          'runtime.result.get',
          {
            command_id: commandId,
            offset,
            limit: chunkBytes,
          },
          auth,
          'read',
        ),
      );
      if (!parsed.success) throw invalidResult();
      const chunk = parsed.data;
      if (
        chunk.command_id !== commandId ||
        chunk.offset !== offset ||
        chunk.next_offset > chunk.size ||
        chunk.eof !== (chunk.next_offset === chunk.size) ||
        (chunk.publication_state === 'committed') !==
          (chunk.delivery_id !== null)
      )
        throw invalidResult();
      if (
        reference &&
        [
          'command_id',
          'artifact_id',
          'version',
          'sha256',
          'size',
          'mime',
          'publication_state',
          'delivery_id',
        ].some(
          (key) =>
            chunk[key as keyof SafeResultChunk] !==
            reference![key as keyof SafeResultChunk],
        )
      )
        throw invalidResult();
      reference ??= chunk;
      const bytes = Buffer.from(chunk.data_base64, 'base64');
      if (
        bytes.toString('base64') !== chunk.data_base64 ||
        bytes.length !== Math.min(chunkBytes, chunk.size - offset) ||
        chunk.next_offset !== offset + bytes.length ||
        (!chunk.eof && bytes.length === 0)
      )
        throw invalidResult();
      parts.push(bytes);
      offset = chunk.next_offset;
      if (chunk.eof) break;
    }
    const bytes = Buffer.concat(parts);
    if (bytes.length !== reference.size || hash(bytes) !== reference.sha256)
      throw invalidResult();
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      );
      if (
        !result ||
        typeof result !== 'object' ||
        Array.isArray(result) ||
        ('final_response' in result &&
          typeof result.final_response !== 'string')
      )
        throw invalidResult();
    } catch {
      throw invalidResult();
    }
    let delivery: RuntimeDeliveryReceipt | null = null;
    let browserReceiptId: string | null = null;
    if (reference.delivery_id) {
      delivery = await this.call(
        bound,
        'runtime.delivery.status',
        {
          delivery_id: reference.delivery_id,
        },
        auth,
        'read',
      );
      this.checkDelivery(bound, delivery, {
        deliveryId: reference.delivery_id,
        artifactId: reference.artifact_id,
        version: reference.version,
        sha256: reference.sha256,
      });
      const notice = this.notices.get(
        this.noticeKey(bound.epoch, bound.binding.liveSessionId, commandId),
      );
      if (
        notice &&
        delivery.result_available &&
        [
          'delivery_id',
          'command_id',
          'artifact_id',
          'version',
          'sha256',
          'size',
          'mime',
        ].every(
          (key) =>
            notice.payload[key as keyof typeof notice.payload] ===
            reference![key as keyof SafeResultChunk],
        )
      ) {
        this.fence(bound, auth, 'read');
        const authority = this.authority(bound);
        const existing = this.db
          .prepare(
            "SELECT receiptId FROM runtime_browser_delivery_receipts WHERE ownerId=? AND conversationId=? AND authority=? AND deliveryId=? AND commandId=? AND artifactId=? AND version=? AND sha256=? AND attemptToken=? AND state='issued' LIMIT 1",
          )
          .get(
            this.ownerId,
            conversationId,
            authority,
            delivery.delivery_id,
            commandId,
            delivery.artifact_id,
            delivery.version,
            delivery.sha256,
            notice.payload.attempt_token,
          );
        if (existing) browserReceiptId = String(existing.receiptId);
        else {
          // Retain uncertain evidence. Capacity exhaustion disables issuance, never
          // result reads, and cannot silently erase an outstanding acknowledgment.
          const count = this.db
            .prepare(
              'SELECT COUNT(*) AS count FROM runtime_browser_delivery_receipts WHERE ownerId=?',
            )
            .get(this.ownerId)!;
          if (Number(count.count) < 4096) {
            browserReceiptId = randomUUID();
            this.db
              .prepare(
                "INSERT INTO runtime_browser_delivery_receipts VALUES(?,?,?,?,?,?,?,?,?,?,NULL,'issued',NULL)",
              )
              .run(
                browserReceiptId,
                this.ownerId,
                conversationId,
                authority,
                delivery.delivery_id,
                commandId,
                delivery.artifact_id,
                delivery.version,
                delivery.sha256,
                notice.payload.attempt_token,
              );
          }
        }
      }
    }
    this.fence(bound, auth, 'read');
    return {
      version: contractVersion,
      scope: browserScope(bound.scope),
      conversationId,
      commandId,
      artifact: {
        artifactId: reference.artifact_id,
        version: reference.version,
        sha256: reference.sha256,
        size: reference.size,
        mime: reference.mime,
        dataBase64: bytes.toString('base64'),
      },
      finalResponse:
        typeof result.final_response === 'string'
          ? result.final_response
          : null,
      publicationState: reference.publication_state,
      delivery,
      browserReceiptId,
    };
  }
  private receipt(
    receiptId: string,
    conversationId: string,
    deliveryId: string,
  ) {
    return this.db
      .prepare(
        'SELECT * FROM runtime_browser_delivery_receipts WHERE receiptId=? AND ownerId=? AND conversationId=? AND deliveryId=?',
      )
      .get(receiptId, this.ownerId, conversationId, deliveryId) as unknown as
      BrowserReceipt | undefined;
  }
  private remember(
    receiptId: string,
    state: BrowserReceipt['state'],
    result: RuntimeDeliveryReceipt | null,
  ) {
    this.db
      .prepare(
        'UPDATE runtime_browser_delivery_receipts SET state=?,result=? WHERE receiptId=? AND ownerId=?',
      )
      .run(
        state,
        result ? JSON.stringify(result) : null,
        receiptId,
        this.ownerId,
      );
  }
  /** Call only for the browser's POST after it received the exact artifact bytes
   * and/or rendered text. One issued receipt fixes one exact component claim.
   * Replaying an uncertain POST only inspects producer status; it never re-ACKs. */
  async acknowledge(
    conversationId: string,
    deliveryId: string,
    input: BrowserDeliveryAcknowledgment,
    auth: Guard,
  ): Promise<BrowserDeliveryAcknowledgmentResult> {
    const claim = browserDeliveryAcknowledgmentSchema.parse(input);
    const bound = await this.boundSession(conversationId, auth, 'write');
    this.fence(bound, auth, 'write');
    const record = this.receipt(claim.receiptId, conversationId, deliveryId);
    if (
      !record ||
      record.authority !== this.authority(bound) ||
      record.sha256 !== claim.sha256
    )
      throw new ConversationError(
        'Browser result receipt does not match this scope.',
        409,
      );
    const intent = JSON.stringify([claim.textReceived, claim.artifactReceived]);
    if (record.intent && record.intent !== intent)
      throw new ConversationError(
        'Receipt component claim changed. Read the result again.',
        409,
      );
    const response = (
      status: 'accepted' | 'rejected' | 'outcome_unknown',
      delivery: RuntimeDeliveryReceipt | null,
    ) => ({
      version: contractVersion,
      scope: browserScope(bound.scope),
      conversationId,
      deliveryId,
      receiptId: record.receiptId,
      status,
      delivery,
      humanReadConfirmed: false as const,
    });
    if (record.state === 'accepted' || record.state === 'rejected')
      return response(
        record.state,
        record.result ? JSON.parse(record.result) : null,
      );
    const current = await this.call(
      bound,
      'runtime.delivery.status',
      { delivery_id: deliveryId },
      auth,
      'write',
    );
    this.checkDelivery(bound, current, record);
    if (record.state !== 'issued') {
      const observed =
        (!claim.textReceived ||
          current.components.text === 'client_received') &&
        (!claim.artifactReceived ||
          current.components.artifact === 'client_received');
      if (observed) this.remember(record.receiptId, 'accepted', current);
      return response(observed ? 'accepted' : 'outcome_unknown', current);
    }
    // Another request may have claimed this receipt while status was in flight.
    const changed = this.db
      .prepare(
        "UPDATE runtime_browser_delivery_receipts SET intent=?,state='pending' WHERE receiptId=? AND ownerId=? AND state='issued'",
      )
      .run(intent, record.receiptId, this.ownerId).changes;
    if (!changed)
      return this.acknowledge(conversationId, deliveryId, input, auth);
    try {
      const result = await this.call(
        bound,
        'runtime.delivery.ack',
        {
          delivery_id: deliveryId,
          attempt_token: record.attemptToken,
          sha256: record.sha256,
          text_received: claim.textReceived,
          artifact_received: claim.artifactReceived,
        },
        auth,
        'write',
      );
      this.checkDelivery(bound, result, record);
      if (
        (claim.textReceived && result.components.text !== 'client_received') ||
        (claim.artifactReceived &&
          result.components.artifact !== 'client_received') ||
        result.acknowledgment_level !== 'client_received' ||
        !['partial', 'delivered'].includes(result.state)
      )
        throw invalidResult();
      this.remember(record.receiptId, 'accepted', result);
      return response('accepted', result);
    } catch {
      // Even a JSON-RPC error can follow a committed acknowledgment. Without
      // a verified non-acceptance receipt, preserve uncertainty for inspection.
      const state = 'outcome_unknown';
      this.remember(record.receiptId, state, null);
      // Never return a receipt across a revoke or newly connected transport.
      this.fence(bound, auth, 'write');
      return response(state, null);
    }
  }
}
