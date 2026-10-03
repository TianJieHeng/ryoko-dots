import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  edgeBindingSchema,
  edgeCanonical,
  edgeDigest,
  edgeReceiptSchema,
  edgeStateSchema,
  type EdgeBinding,
  type EdgeExecute,
  type EdgeReceipt,
  type EdgeState,
} from '../shared/computer-edge-protocol.js';

/** Target-owned durable journal. WAL + FULL, one process per container; a second
 * process has a new boot fence, so old-process dispatch/receipt writes are denied. */
export class ComputerEdgeStore {
  readonly bootId = randomUUID();
  constructor(
    readonly db: DatabaseSync,
    readonly dotId: string,
    readonly executorId: string,
  ) {
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS edge_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1), dotId TEXT NOT NULL, executorId TEXT NOT NULL, binding TEXT, state TEXT NOT NULL, snapshotSequence INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS edge_operations(operationId TEXT PRIMARY KEY, requestSha256 TEXT NOT NULL, actor TEXT NOT NULL, identity TEXT, receipt TEXT NOT NULL, dispatched INTEGER NOT NULL, createdAt INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS edge_effect_identity ON edge_operations(json_extract(identity,'$.effect_id')) WHERE identity IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS edge_approval_identity ON edge_operations(json_extract(identity,'$.approval_id')) WHERE identity IS NOT NULL;
      CREATE TABLE IF NOT EXISTS edge_reservation(singleton INTEGER PRIMARY KEY CHECK(singleton=1), operationId TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS edge_changes(operationId TEXT PRIMARY KEY, requestSha256 TEXT NOT NULL, result TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS edge_receipt_immutable BEFORE UPDATE ON edge_operations WHEN json_extract(OLD.receipt,'$.state') != 'unknown' BEGIN SELECT RAISE(ABORT,'Receipt is immutable'); END;`);
    this.tx(() => {
      const row = db
        .prepare('SELECT * FROM edge_state WHERE singleton=1')
        .get();
      if (row && (row.dotId !== dotId || row.executorId !== executorId))
        throw new Error('Foreign executor state.');
      if (!row)
        db.prepare('INSERT INTO edge_state VALUES(1,?,?,NULL,?,0)').run(
          dotId,
          executorId,
          edgeCanonical({
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
            bootId: this.bootId,
          }),
        );
      else {
        const state = edgeStateSchema.parse(JSON.parse(String(row.state)));
        this.save({
          ...state,
          revision: state.revision + 1,
          bootId: this.bootId,
          resumeSnapshotRequired: true,
          snapshotId: null,
          snapshotSha256: null,
          snapshotAt: null,
        });
      }
    });
  }
  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const v = fn();
      this.db.exec('COMMIT');
      return v;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  state(): EdgeState {
    const row = this.db
      .prepare('SELECT state FROM edge_state WHERE singleton=1')
      .get()!;
    const state = edgeStateSchema.parse(JSON.parse(String(row.state)));
    if (state.bootId !== this.bootId) throw new Error('Stale target process.');
    return state;
  }
  save(state: EdgeState) {
    this.db
      .prepare('UPDATE edge_state SET state=? WHERE singleton=1')
      .run(edgeCanonical(state));
  }
  binding(): EdgeBinding | null {
    const row = this.db
      .prepare('SELECT binding FROM edge_state WHERE singleton=1')
      .get()!;
    return row.binding === null
      ? null
      : edgeBindingSchema.parse(JSON.parse(String(row.binding)));
  }
  bind(binding: EdgeBinding) {
    const old = this.binding();
    if (old && edgeCanonical(old) !== edgeCanonical(binding))
      throw new Error('Executor cannot be rebound.');
    this.db
      .prepare('UPDATE edge_state SET binding=? WHERE singleton=1')
      .run(edgeCanonical(binding));
  }
  busy(): boolean {
    return !!this.db.prepare('SELECT 1 FROM edge_reservation').get();
  }
  nextSnapshot(): number {
    this.db
      .prepare(
        'UPDATE edge_state SET snapshotSequence=snapshotSequence+1 WHERE singleton=1',
      )
      .run();
    return Number(
      this.db.prepare('SELECT snapshotSequence FROM edge_state').get()!
        .snapshotSequence,
    );
  }
  inspect(operationId: string): EdgeReceipt | null {
    this.state();
    const row = this.db
      .prepare('SELECT receipt FROM edge_operations WHERE operationId=?')
      .get(operationId);
    if (!row) return null;
    const receipt = edgeReceiptSchema.parse(JSON.parse(String(row.receipt)));
    if (
      receipt.state === 'committed' &&
      (receipt.resultSha256 !== edgeDigest(receipt.result) ||
        !receipt.receiptId)
    )
      throw new Error('Receipt integrity failed.');
    return receipt;
  }
  admit(
    request: EdgeExecute,
    rejection: 'fenced' | 'busy' | 'unavailable' | null,
  ): EdgeReceipt {
    const requestSha256 = edgeDigest(request);
    const old = this.inspect(request.operationId);
    if (old) {
      if (old.requestSha256 !== requestSha256)
        throw new Error('Operation conflict.');
      return old;
    }
    if (
      this.db
        .prepare('SELECT 1 FROM edge_changes WHERE operationId=?')
        .get(request.operationId)
    )
      throw new Error('Operation conflict.');
    const receipt: EdgeReceipt = {
      operationId: request.operationId,
      requestSha256,
      actor: request.actor,
      identity: request.identity,
      state: rejection ? 'not_applied' : 'unknown',
      reason: rejection ?? 'unknown',
      result: null,
      resultSha256: null,
      receiptId: rejection ? randomUUID() : null,
    };
    this.db
      .prepare('INSERT INTO edge_operations VALUES(?,?,?,?,?,0,?)')
      .run(
        request.operationId,
        requestSha256,
        edgeCanonical(request.actor),
        request.identity ? edgeCanonical(request.identity) : null,
        edgeCanonical(receipt),
        Date.now(),
      );
    if (!rejection)
      this.db
        .prepare('INSERT INTO edge_reservation VALUES(1,?)')
        .run(request.operationId);
    return receipt;
  }
  markDispatched(operationId: string) {
    this.state();
    const reservation = this.db
      .prepare('SELECT operationId FROM edge_reservation')
      .get();
    if (reservation?.operationId !== operationId)
      throw new Error('Missing dispatch reservation.');
    this.db
      .prepare('UPDATE edge_operations SET dispatched=1 WHERE operationId=?')
      .run(operationId);
  }
  wasDispatched(operationId: string) {
    return (
      Number(
        this.db
          .prepare('SELECT dispatched FROM edge_operations WHERE operationId=?')
          .get(operationId)?.dispatched,
      ) === 1
    );
  }
  finish(operationId: string, result: unknown, notApplied = false) {
    this.state();
    const current = this.inspect(operationId)!;
    if (current.state !== 'unknown') return current;
    const receipt: EdgeReceipt = {
      ...current,
      state: notApplied ? 'not_applied' : 'committed',
      reason: notApplied ? 'fenced' : 'committed',
      result: notApplied ? null : result,
      resultSha256: notApplied ? null : edgeDigest(result),
      receiptId: randomUUID(),
    };
    this.db
      .prepare('UPDATE edge_operations SET receipt=? WHERE operationId=?')
      .run(edgeCanonical(receipt), operationId);
    this.db
      .prepare('DELETE FROM edge_reservation WHERE operationId=?')
      .run(operationId);
    const s = this.state();
    this.save({
      ...s,
      revision: s.revision + 1,
      resumeSnapshotRequired: true,
      snapshotId: null,
      snapshotSha256: null,
      snapshotAt: null,
    });
    return receipt;
  }
}
