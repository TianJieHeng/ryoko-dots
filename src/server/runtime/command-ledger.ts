import { DatabaseSync } from 'node:sqlite';
import {
  initializeOperationRegistry,
  claimOperation,
} from './operation-registry.js';
import { ConversationError, intentDigest } from './conversation-ledger.js';
import type {
  CommandIntent,
  CommandReceipt,
} from '../../shared/runtime/contracts.js';
export interface CommandRecord {
  operationId: string;
  ownerId: string;
  conversationId: string;
  authority: string;
  digest: string;
  intent: string;
  payload: string;
  createdAt: number;
  state: 'pending' | 'accepted' | 'outcome_unknown' | 'terminal';
  result: string | null;
}
export function canonicalCommand(intent: CommandIntent): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(intent).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
  );
}
/** Immutable ingress identity is committed before binding or dispatch. No transcript truth lives here. */
export class CommandLedger {
  private db: DatabaseSync;
  constructor(
    path: string,
    readonly ownerId: string,
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runtime_command_ingress(operationId TEXT PRIMARY KEY, ownerId TEXT NOT NULL, conversationId TEXT NOT NULL, authority TEXT NOT NULL, digest TEXT NOT NULL, intent TEXT NOT NULL, payload TEXT NOT NULL, createdAt INTEGER NOT NULL, state TEXT NOT NULL, result TEXT);
      CREATE INDEX IF NOT EXISTS runtime_command_recovery ON runtime_command_ingress(ownerId,state,conversationId);`);
    initializeOperationRegistry(this.db, 'command');
  }
  close() {
    this.db.close();
  }
  get(id: string): CommandRecord | undefined {
    return this.db
      .prepare(
        'SELECT * FROM runtime_command_ingress WHERE operationId=? AND ownerId=?',
      )
      .get(id, this.ownerId) as unknown as CommandRecord | undefined;
  }
  admit(
    operationId: string,
    digest: string,
    intent: CommandIntent,
    authority: string,
    payload: object = {},
  ) {
    const bytes = canonicalCommand(intent);
    if (intentDigest(bytes) !== digest)
      throw new ConversationError('Command intent digest mismatch.', 400);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (
        !claimOperation(
          this.db,
          operationId,
          this.ownerId,
          'command',
          digest,
          authority,
        )
      )
        throw new ConversationError(
          'Operation ID conflicts with another original intent or operation family.',
          409,
        );
      const prior = this.get(operationId);
      if (prior) {
        if (
          prior.digest !== digest ||
          prior.authority !== authority ||
          prior.intent !== bytes ||
          prior.conversationId !== intent.conversationId
        )
          throw new ConversationError(
            'Operation ID conflicts with original command intent or authority.',
            409,
          );
        this.db.exec('COMMIT');
        return { record: prior, fresh: false };
      }
      const count = this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM runtime_command_ingress WHERE ownerId=? AND state!='terminal'",
        )
        .get(this.ownerId);
      if (Number(count?.n) >= 256)
        throw new ConversationError(
          'Command recovery queue is full. Inspect outstanding work before submitting more.',
          503,
        );
      this.db
        .prepare(
          'INSERT INTO runtime_command_ingress VALUES(?,?,?,?,?,?,?,?,?,NULL)',
        )
        .run(
          operationId,
          this.ownerId,
          intent.conversationId,
          authority,
          digest,
          bytes,
          JSON.stringify(payload),
          Date.now(),
          'pending',
        );
      this.db.exec('COMMIT');
      return { record: this.get(operationId)!, fresh: true };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  settle(id: string, state: CommandRecord['state'], result?: CommandReceipt) {
    this.db
      .prepare(
        'UPDATE runtime_command_ingress SET state=?,result=COALESCE(?,result) WHERE operationId=? AND ownerId=?',
      )
      .run(state, result ? JSON.stringify(result) : null, id, this.ownerId);
  }
  list(conversationId: string, authority: string, cursor: string | undefined) {
    const rows = this.db
      .prepare(
        'SELECT rowid AS cursor,* FROM runtime_command_ingress WHERE ownerId=? AND conversationId=? AND authority=? AND rowid<? ORDER BY rowid DESC LIMIT 11',
      )
      .all(
        this.ownerId,
        conversationId,
        authority,
        cursor ? Number(cursor) : Number.MAX_SAFE_INTEGER,
      ) as unknown as (CommandRecord & { cursor: number })[];
    return {
      records: rows.slice(0, 10),
      nextCursor: rows.length > 10 ? String(rows[9].cursor) : null,
    };
  }
  recoverableRecords(): CommandRecord[] {
    return this.db
      .prepare(
        "SELECT * FROM runtime_command_ingress WHERE ownerId=? AND state!='terminal' LIMIT 256",
      )
      .all(this.ownerId) as unknown as CommandRecord[];
  }
  recoverable() {
    return this.db
      .prepare(
        "SELECT DISTINCT conversationId FROM runtime_command_ingress WHERE ownerId=? AND state!='terminal' LIMIT 256",
      )
      .all(this.ownerId)
      .map((row) => String(row.conversationId));
  }
}
