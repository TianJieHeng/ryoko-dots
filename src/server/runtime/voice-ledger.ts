import { DatabaseSync } from 'node:sqlite';
import type {
  RuntimeVoiceCall,
  RuntimeComputeReceipt,
} from '../../shared/runtime/voice.js';
import { ConversationError, intentDigest } from './conversation-ledger.js';

export interface VoiceCallRecord {
  call: RuntimeVoiceCall;
  ownerId: string;
  authority: string;
  speakerId: string;
  sessionId: string;
  operationId: string;
  provider: string;
  providerId: string | null;
  expiresAt: number;
  connectBy: number;
  admission: 'pending' | 'admitted' | 'rejected' | 'unknown';
  answer: string | null;
  remoteEnded: boolean;
  hangupOperationId: string | null;
  computeDetached: boolean;
  maxCompute: number;
}
export interface VoiceOperation {
  operationId: string;
  ownerId: string;
  callId: string;
  family: 'media' | 'compute' | 'control';
  digest: string;
  authority: string;
  intent: string;
  state: 'pending' | 'accepted' | 'rejected' | 'unknown';
  commandId: string | null;
  result: string | null;
}
export interface TranscriptSegment {
  eventId: string;
  sequence: number;
  speaker: 'owner' | 'assistant';
  text: string;
}

/** Dots is the call/transcript owner; accepted compute remains Ryoko-owned. */
export class VoiceLedger {
  private db: DatabaseSync;
  constructor(
    path: string,
    readonly ownerId: string,
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runtime_operation_registry(operationId TEXT PRIMARY KEY,ownerId TEXT NOT NULL,family TEXT NOT NULL,digest TEXT NOT NULL,authority TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_voice_calls(id TEXT PRIMARY KEY,ownerId TEXT NOT NULL,conversationId TEXT NOT NULL,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_voice_operations(operationId TEXT PRIMARY KEY,ownerId TEXT NOT NULL,callId TEXT NOT NULL,family TEXT NOT NULL,digest TEXT NOT NULL,authority TEXT NOT NULL,intent TEXT NOT NULL,state TEXT NOT NULL,commandId TEXT,result TEXT);
      CREATE TABLE IF NOT EXISTS runtime_voice_compute_keys(ownerId TEXT NOT NULL,callId TEXT NOT NULL,toolCallId TEXT NOT NULL,operationId TEXT NOT NULL UNIQUE,PRIMARY KEY(ownerId,callId,toolCallId));
      CREATE TABLE IF NOT EXISTS runtime_voice_transcripts(ownerId TEXT NOT NULL,callId TEXT NOT NULL,eventId TEXT NOT NULL,sequence INTEGER NOT NULL,speaker TEXT NOT NULL,text TEXT NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(ownerId,callId,eventId),UNIQUE(ownerId,callId,sequence));`);
    this.transaction(() => {
      const conflict = this.db
        .prepare(
          `SELECT 1 FROM runtime_voice_operations AS voice JOIN runtime_operation_registry AS registry USING(operationId) WHERE registry.ownerId!=voice.ownerId OR registry.family!='voice' OR registry.digest!=voice.digest OR registry.authority!=voice.authority LIMIT 1`,
        )
        .get();
      if (conflict)
        throw new ConversationError(
          'Stored voice operation namespace conflicts; reconcile before startup.',
          409,
        );
      this.db.exec(
        `INSERT OR IGNORE INTO runtime_operation_registry SELECT operationId,ownerId,'voice',digest,authority FROM runtime_voice_operations`,
      );
    });
  }
  close() {
    this.db.close();
  }
  private transaction<T>(fn: () => T): T {
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
  operation(id: string) {
    return this.db
      .prepare(
        'SELECT * FROM runtime_voice_operations WHERE operationId=? AND ownerId=?',
      )
      .get(id, this.ownerId) as unknown as VoiceOperation | undefined;
  }
  call(id: string): VoiceCallRecord {
    const row = this.db
      .prepare('SELECT value FROM runtime_voice_calls WHERE id=? AND ownerId=?')
      .get(id, this.ownerId);
    if (!row) throw new ConversationError('Call not found.', 404);
    return JSON.parse(String(row.value)) as VoiceCallRecord;
  }
  list(conversationId?: string): VoiceCallRecord[] {
    const rows =
      conversationId === undefined
        ? this.db
            .prepare(
              'SELECT value FROM runtime_voice_calls WHERE ownerId=? ORDER BY rowid DESC LIMIT 500',
            )
            .all(this.ownerId)
        : this.db
            .prepare(
              'SELECT value FROM runtime_voice_calls WHERE ownerId=? AND conversationId=? ORDER BY rowid DESC LIMIT 500',
            )
            .all(this.ownerId, conversationId);
    return rows.map((row) => JSON.parse(String(row.value)) as VoiceCallRecord);
  }
  update(id: string, change: (row: VoiceCallRecord) => void) {
    return this.transaction(() => {
      const row = this.call(id);
      change(row);
      this.db
        .prepare(
          'UPDATE runtime_voice_calls SET value=? WHERE id=? AND ownerId=?',
        )
        .run(JSON.stringify(row), id, this.ownerId);
      return row;
    });
  }
  private reserve(input: Omit<VoiceOperation, 'ownerId' | 'state' | 'result'>) {
    const existing = this.operation(input.operationId);
    if (existing) {
      if (
        existing.callId !== input.callId ||
        existing.authority !== input.authority ||
        existing.family !== input.family ||
        existing.digest !== input.digest ||
        existing.intent !== input.intent
      )
        throw new ConversationError(
          'Voice operation conflicts with its immutable intent or authority.',
          409,
        );
      return { operation: existing, fresh: false };
    }
    if (
      this.db
        .prepare('SELECT 1 FROM runtime_operation_registry WHERE operationId=?')
        .get(input.operationId)
    )
      throw new ConversationError(
        'Operation ID belongs to another operation family.',
        409,
      );
    const count = this.db
      .prepare(
        'SELECT COUNT(*) AS n FROM runtime_voice_operations WHERE ownerId=?',
      )
      .get(this.ownerId);
    if (Number(count?.n) >= 16384)
      throw new ConversationError(
        'Voice receipt capacity reached. Retain and reconcile receipts before further use.',
        503,
      );
    this.db
      .prepare('INSERT INTO runtime_operation_registry VALUES(?,?,?,?,?)')
      .run(
        input.operationId,
        this.ownerId,
        'voice',
        input.digest,
        input.authority,
      );
    this.db
      .prepare(
        'INSERT INTO runtime_voice_operations VALUES(?,?,?,?,?,?,?,?,?,NULL)',
      )
      .run(
        input.operationId,
        this.ownerId,
        input.callId,
        input.family,
        input.digest,
        input.authority,
        input.intent,
        'pending',
        input.commandId,
      );
    return { operation: this.operation(input.operationId)!, fresh: true };
  }
  begin(
    input: Omit<VoiceOperation, 'ownerId' | 'state' | 'result'>,
    record: VoiceCallRecord,
    maxDailySeconds: number,
    now: number,
  ) {
    return this.transaction(() => {
      const prior = this.operation(input.operationId);
      if (prior) return this.reserve({ ...input, callId: prior.callId });
      // One active or unresolved remote session, even across application restart.
      const all = this.db
        .prepare('SELECT value FROM runtime_voice_calls WHERE ownerId=?')
        .all(this.ownerId)
        .map((row) => JSON.parse(String(row.value)) as VoiceCallRecord);
      if (all.some((row) => !row.remoteEnded && row.admission !== 'rejected'))
        throw new ConversationError(
          'End or reconcile the previous media call first.',
          409,
        );
      const windowStart = Math.floor(now / 86400000) * 86400000;
      const reservedSeconds = all
        .filter((row) => row.call.startedAt >= windowStart)
        .reduce((n, row) => n + (row.expiresAt - row.call.startedAt) / 1000, 0);
      if (reservedSeconds + (record.expiresAt - now) / 1000 > maxDailySeconds)
        throw new ConversationError(
          'Daily media duration budget is exhausted.',
          409,
        );
      const result = this.reserve(input);
      this.db
        .prepare('INSERT INTO runtime_voice_calls VALUES(?,?,?,?)')
        .run(
          record.call.id,
          this.ownerId,
          record.call.threadId,
          JSON.stringify(record),
        );
      return result;
    });
  }
  compute(
    input: Omit<VoiceOperation, 'ownerId' | 'state' | 'result'>,
    toolCallId: string,
    maxCompute: number,
  ) {
    return this.transaction(() => {
      const key = this.db
        .prepare(
          'SELECT operationId FROM runtime_voice_compute_keys WHERE ownerId=? AND callId=? AND toolCallId=?',
        )
        .get(this.ownerId, input.callId, toolCallId);
      if (key && key.operationId !== input.operationId)
        throw new ConversationError(
          `This provider tool call already belongs to operation ${String(key.operationId)}. Inspect it; do not create new work.`,
          409,
        );
      if (!key) {
        const count = this.db
          .prepare(
            'SELECT COUNT(*) AS n FROM runtime_voice_compute_keys WHERE ownerId=? AND callId=?',
          )
          .get(this.ownerId, input.callId);
        if (Number(count?.n) >= maxCompute)
          throw new ConversationError('Call compute budget is exhausted.', 409);
      }
      const result = this.reserve(input);
      if (!key)
        this.db
          .prepare('INSERT INTO runtime_voice_compute_keys VALUES(?,?,?,?)')
          .run(this.ownerId, input.callId, toolCallId, input.operationId);
      return result;
    });
  }
  control(input: Omit<VoiceOperation, 'ownerId' | 'state' | 'result'>) {
    return this.transaction(() => this.reserve(input));
  }
  settle(id: string, state: VoiceOperation['state'], result?: object) {
    this.db
      .prepare(
        'UPDATE runtime_voice_operations SET state=?,result=COALESCE(?,result) WHERE operationId=? AND ownerId=?',
      )
      .run(state, result ? JSON.stringify(result) : null, id, this.ownerId);
  }
  computeReceipt(id: string, receipt: RuntimeComputeReceipt) {
    const previous = this.operation(id);
    if (!previous) throw new ConversationError('Unknown voice operation.', 404);
    const old = previous.result
      ? (JSON.parse(previous.result) as RuntimeComputeReceipt)
      : null;
    // A later pending/out-of-order read cannot erase established completion/rejection.
    if (old && ['completed', 'rejected'].includes(old.status)) {
      if (
        old.status === 'completed' &&
        old.text === null &&
        receipt.status === 'completed' &&
        receipt.text !== null
      ) {
        this.settle(id, 'accepted', receipt);
        return receipt;
      }
      return old;
    }
    if (old?.status === 'accepted' && receipt.status === 'unknown') return old;
    this.settle(
      id,
      receipt.status === 'unknown'
        ? 'unknown'
        : receipt.status === 'rejected'
          ? 'rejected'
          : 'accepted',
      receipt,
    );
    return receipt;
  }
  appendTranscript(callId: string, segments: TranscriptSegment[]) {
    return this.transaction(() => {
      const row = this.call(callId);
      for (const segment of segments) {
        const digest = intentDigest(JSON.stringify(segment));
        const previous = this.db
          .prepare(
            'SELECT digest FROM runtime_voice_transcripts WHERE ownerId=? AND callId=? AND eventId=?',
          )
          .get(this.ownerId, callId, segment.eventId);
        if (previous) {
          if (previous.digest !== digest)
            throw new ConversationError(
              'Transcript event changed its immutable bytes.',
              409,
            );
          continue;
        }
        if (
          this.db
            .prepare(
              'SELECT 1 FROM runtime_voice_transcripts WHERE ownerId=? AND callId=? AND sequence=?',
            )
            .get(this.ownerId, callId, segment.sequence)
        )
          throw new ConversationError(
            'Transcript sequence belongs to another event.',
            409,
          );
        this.db
          .prepare(
            'INSERT INTO runtime_voice_transcripts VALUES(?,?,?,?,?,?,?)',
          )
          .run(
            this.ownerId,
            callId,
            segment.eventId,
            segment.sequence,
            segment.speaker,
            segment.text,
            digest,
          );
      }
      const saved = this.db
        .prepare(
          'SELECT * FROM runtime_voice_transcripts WHERE ownerId=? AND callId=? ORDER BY sequence',
        )
        .all(this.ownerId, callId);
      const transcript = saved
        .map(
          (item) =>
            `${item.speaker === 'owner' ? 'You' : 'Media provider'}: ${String(item.text)}`,
        )
        .join('\n');
      if (saved.length > 1000 || transcript.length > 20000)
        throw new ConversationError(
          'Call transcript budget is exhausted.',
          400,
        );
      if (segments.length) row.call.transcript = transcript;
      this.db
        .prepare(
          'UPDATE runtime_voice_calls SET value=? WHERE id=? AND ownerId=?',
        )
        .run(JSON.stringify(row), callId, this.ownerId);
      return row;
    });
  }
  saveSnapshot(callId: string, transcript: string) {
    return this.update(callId, (row) => {
      const count = this.db
        .prepare(
          'SELECT COUNT(*) AS n FROM runtime_voice_transcripts WHERE ownerId=? AND callId=?',
        )
        .get(this.ownerId, callId);
      if (Number(count?.n)) return; // Structured events are authoritative over unsequenced legacy snapshots.
      if (
        !transcript ||
        row.call.transcript === transcript ||
        row.call.transcript.startsWith(transcript)
      )
        return;
      if (row.call.transcript && !transcript.startsWith(row.call.transcript))
        throw new ConversationError(
          'Unsequenced transcript snapshot conflicts. Submit identified transcript events.',
          409,
        );
      row.call.transcript = transcript;
    });
  }
}
