import { DatabaseSync } from 'node:sqlite';
import {
  initializeOperationRegistry,
  claimOperation,
} from './operation-registry.js';
import { createHash } from 'node:crypto';
import type { RuntimeConversation } from '../../shared/runtime/contracts.js';
export class ConversationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503 = 503,
  ) {
    super(message);
  }
}
export interface Operation {
  operationId: string;
  ownerId: string;
  dotId: string;
  binding: string;
  kind: 'create' | 'rename' | 'archive';
  intent: string;
  digest: string;
  producerKey: string;
  state: 'pending' | 'accepted' | 'rejected' | 'outcome_unknown';
  result: string | null;
}
export const intentDigest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
/** Durable ingress identity, not a second transcript owner. */
export class ConversationLedger {
  private db: DatabaseSync;
  constructor(
    path: string,
    readonly ownerId: string,
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS conversation_operations(operationId TEXT PRIMARY KEY, ownerId TEXT NOT NULL, dotId TEXT NOT NULL, binding TEXT NOT NULL, kind TEXT NOT NULL, intent TEXT NOT NULL, digest TEXT NOT NULL, producerKey TEXT NOT NULL, state TEXT NOT NULL, result TEXT);
      CREATE TABLE IF NOT EXISTS canonical_conversations(id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, dotId TEXT NOT NULL, value TEXT NOT NULL, spaceId TEXT, pageId TEXT);
      CREATE TABLE IF NOT EXISTS canonical_page_reservations(pageId TEXT NOT NULL, dotId TEXT NOT NULL, ownerId TEXT NOT NULL, producerKey TEXT NOT NULL UNIQUE, PRIMARY KEY(pageId,dotId));`);
    initializeOperationRegistry(this.db, 'conversation');
  }
  close() {
    this.db.close();
  }
  operation(id: string): Operation | undefined {
    return this.db
      .prepare(
        'SELECT * FROM conversation_operations WHERE operationId=? AND ownerId=?',
      )
      .get(id, this.ownerId) as unknown as Operation | undefined;
  }
  admit(
    input: Omit<Operation, 'ownerId' | 'state' | 'result' | 'digest'>,
    pageId?: string,
  ): { operation: Operation; fresh: boolean } {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const digest = intentDigest(input.intent);
      if (
        !claimOperation(
          this.db,
          input.operationId,
          this.ownerId,
          'conversation',
          digest,
          input.binding,
        )
      )
        throw new ConversationError(
          'Operation ID conflicts with another original intent or operation family.',
          409,
        );
      const existing = this.operation(input.operationId);
      if (existing) {
        if (
          existing.digest !== digest ||
          existing.binding !== input.binding ||
          existing.dotId !== input.dotId ||
          existing.kind !== input.kind
        )
          throw new ConversationError(
            'Operation ID conflicts with its original intent or authority.',
            409,
          );
        this.db.exec('COMMIT');
        return { operation: existing, fresh: false };
      }
      let producerKey = input.producerKey;
      if (pageId) {
        this.db
          .prepare(
            'INSERT OR IGNORE INTO canonical_page_reservations VALUES(?,?,?,?)',
          )
          .run(pageId, input.dotId, this.ownerId, producerKey);
        const row = this.db
          .prepare(
            'SELECT * FROM canonical_page_reservations WHERE pageId=? AND dotId=? AND ownerId=?',
          )
          .get(pageId, input.dotId, this.ownerId);
        if (!row)
          throw new ConversationError(
            'Page reservation belongs to another owner.',
            403,
          );
        producerKey = String(row.producerKey);
      }
      this.db
        .prepare(
          'INSERT INTO conversation_operations VALUES(?,?,?,?,?,?,?,?,?,NULL)',
        )
        .run(
          input.operationId,
          this.ownerId,
          input.dotId,
          input.binding,
          input.kind,
          input.intent,
          digest,
          producerKey,
          'pending',
        );
      this.db.exec('COMMIT');
      return { operation: this.operation(input.operationId)!, fresh: true };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  settle(
    id: string,
    state: Operation['state'],
    result: RuntimeConversation | null = null,
  ) {
    this.db
      .prepare(
        'UPDATE conversation_operations SET state=?, result=? WHERE operationId=? AND ownerId=?',
      )
      .run(state, result ? JSON.stringify(result) : null, id, this.ownerId);
  }
  remember(
    conversation: RuntimeConversation,
    spaceId: string | null,
    pageId: string | null,
  ) {
    const prior = this.metadata(conversation.id);
    if (
      prior &&
      (prior.dotId !== conversation.dotId ||
        (prior.spaceId !== spaceId && prior.spaceId !== null) ||
        (prior.pageId !== pageId && prior.pageId !== null))
    )
      throw new ConversationError(
        'Canonical mapping cannot change authority.',
        403,
      );
    this.db
      .prepare(
        "INSERT INTO canonical_conversations VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,spaceId=COALESCE(canonical_conversations.spaceId,excluded.spaceId),pageId=COALESCE(canonical_conversations.pageId,excluded.pageId) WHERE json_extract(canonical_conversations.value,'$.revision')<=json_extract(excluded.value,'$.revision')",
      )
      .run(
        conversation.id,
        this.ownerId,
        conversation.dotId,
        JSON.stringify(conversation),
        spaceId,
        pageId,
      );
  }
  metadata(id: string) {
    const row = this.db
      .prepare('SELECT * FROM canonical_conversations WHERE id=? AND ownerId=?')
      .get(id, this.ownerId);
    return row
      ? {
          dotId: String(row.dotId),
          spaceId: row.spaceId as string | null,
          pageId: row.pageId as string | null,
          conversation: JSON.parse(String(row.value)) as RuntimeConversation,
        }
      : undefined;
  }
  pageKeyIntent(key: string) {
    return this.db
      .prepare(
        'SELECT intent FROM conversation_operations WHERE producerKey=? AND ownerId=? ORDER BY rowid LIMIT 1',
      )
      .get(key, this.ownerId)?.intent as string | undefined;
  }
}
