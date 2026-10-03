import { DatabaseSync } from 'node:sqlite';
import type {
  MissionSnapshot,
  RuntimeEventsSinceResult,
} from '../../shared/runtime/producer/wire.generated.js';
import { validateWire } from './wire.js';
export interface ReadBinding {
  key: string;
  liveSessionId: string;
  durableSessionId: string;
  generation: number;
}
/** Durable read cache only. It never creates authoritative messages or claims.
 * The binder must supply verified IDs; no public API accepts a ReadBinding. */
export class RuntimeProjection {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runtime_read_bindings (key TEXT PRIMARY KEY, live TEXT NOT NULL, durable TEXT NOT NULL, generation INTEGER NOT NULL, snapshot TEXT, cursor TEXT, sequence INTEGER NOT NULL DEFAULT 0, lease_generation INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS runtime_read_events (binding TEXT NOT NULL REFERENCES runtime_read_bindings(key), sequence INTEGER NOT NULL, event_id TEXT NOT NULL, bytes TEXT NOT NULL, PRIMARY KEY(binding, sequence), UNIQUE(binding, event_id));`);
  }
  close() {
    this.db.close();
  }
  bind(
    key: string,
    liveSessionId: string,
    durableSessionId: string,
  ): ReadBinding {
    this.db.exec('BEGIN IMMEDIATE');
    let generation: number;
    try {
      const previous = this.db
        .prepare('SELECT generation FROM runtime_read_bindings WHERE key = ?')
        .get(key);
      generation = Number(previous?.generation ?? 0) + 1;
      this.db
        .prepare('DELETE FROM runtime_read_events WHERE binding = ?')
        .run(key);
      this.db
        .prepare(
          `INSERT INTO runtime_read_bindings (key, live, durable, generation) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET live=excluded.live, durable=excluded.durable, generation=excluded.generation, snapshot=NULL, cursor=NULL, sequence=0, lease_generation=0`,
        )
        .run(key, liveSessionId, durableSessionId, generation);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { key, liveSessionId, durableSessionId, generation };
  }
  private current(binding: ReadBinding) {
    const row = this.db
      .prepare('SELECT * FROM runtime_read_bindings WHERE key = ?')
      .get(binding.key);
    if (
      !row ||
      row.generation !== binding.generation ||
      row.live !== binding.liveSessionId ||
      row.durable !== binding.durableSessionId
    )
      throw new Error('Stale runtime binding');
    return row;
  }
  snapshot(binding: ReadBinding, snapshot: MissionSnapshot) {
    validateWire('runtime.snapshot', 'result', snapshot);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.current(binding);
      if (
        !Number.isSafeInteger(snapshot.revision) ||
        snapshot.revision < Number(previous.sequence)
      )
        throw new Error('Stale runtime snapshot');
      if (snapshot.session_id !== binding.durableSessionId)
        throw new Error('Foreign durable session');
      this.db
        .prepare('DELETE FROM runtime_read_events WHERE binding = ?')
        .run(binding.key);
      this.db
        .prepare(
          'UPDATE runtime_read_bindings SET snapshot=?, cursor=?, sequence=?, lease_generation=0 WHERE key=?',
        )
        .run(
          JSON.stringify(snapshot),
          snapshot.last_cursor,
          snapshot.revision,
          binding.key,
        );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  events(
    binding: ReadBinding,
    expectedCursor: string,
    page: RuntimeEventsSinceResult,
  ) {
    validateWire('runtime.events.since', 'result', page);
    if (page.events.length > 200)
      throw new Error('Runtime replay limit exceeded');
    if (page.status === 'snapshot_required') {
      // Producer expiry recovery is an atomic authoritative snapshot replacement.
      if (
        !page.snapshot ||
        page.events.length ||
        page.last_cursor !== page.snapshot.last_cursor
      )
        throw new Error('Invalid snapshot recovery');
      if (this.current(binding).cursor !== expectedCursor)
        throw new Error('Stale runtime cursor');
      this.snapshot(binding, page.snapshot);
      return;
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.current(binding);
      if (!row.snapshot || row.cursor !== expectedCursor || page.snapshot)
        throw new Error('Stale runtime cursor');
      let sequence = Number(row.sequence),
        lease = Number(row.lease_generation),
        cursor = expectedCursor;
      for (const event of page.events) {
        if (event.session_id !== binding.durableSessionId)
          throw new Error('Foreign durable session');
        const bytes = JSON.stringify(event);
        if (event.seq <= sequence) {
          const seen = this.db
            .prepare(
              'SELECT bytes FROM runtime_read_events WHERE binding=? AND sequence=?',
            )
            .get(binding.key, event.seq);
          if (seen?.bytes === bytes) continue;
          throw new Error('Conflicting runtime event');
        }
        if (event.seq !== sequence + 1) throw new Error('Runtime replay gap');
        if (event.generation < lease)
          throw new Error('Stale runtime lease generation');
        this.db
          .prepare('INSERT INTO runtime_read_events VALUES (?, ?, ?, ?)')
          .run(binding.key, event.seq, event.event_id, bytes);
        sequence = event.seq;
        lease = event.generation;
        cursor = event.cursor;
      }
      if (page.last_cursor !== cursor || (page.has_more && !page.events.length))
        throw new Error('Runtime cursor did not advance');
      this.db
        .prepare(
          'UPDATE runtime_read_bindings SET cursor=?, sequence=?, lease_generation=? WHERE key=?',
        )
        .run(cursor, sequence, lease, binding.key);
      this.db
        .prepare(
          'DELETE FROM runtime_read_events WHERE binding=? AND sequence <= ?',
        )
        .run(binding.key, sequence - 1000);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  read(binding: ReadBinding) {
    const row = this.current(binding);
    return {
      cursor: row.cursor as string | null,
      sequence: Number(row.sequence),
      snapshot: row.snapshot
        ? (JSON.parse(String(row.snapshot)) as MissionSnapshot)
        : null,
    };
  }
}
