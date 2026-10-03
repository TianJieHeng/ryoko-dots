import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  SlackFailure,
  configurationDigest,
  hash,
  type SlackConfig,
  type SlackEvent,
  type EventRecord,
  type ThreadRecord,
  type OutboxRecord,
  type SendPayload,
  type ImmutableOutput,
} from './slack-types.js';

/** Local ingress/mapping/outbox evidence, never a second transcript or execution owner. */
export class SlackLedger {
  private db: DatabaseSync;
  private holder = randomUUID();
  private acquired = false;
  private scanOffsets = new Map<string, number>();
  constructor(
    path: string,
    private config: SlackConfig,
    private now: () => number = Date.now,
  ) {
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS dots_slack_installation(id INTEGER PRIMARY KEY CHECK(id=1),identity TEXT NOT NULL,holder TEXT,expires INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS dots_slack_authority(id INTEGER PRIMARY KEY CHECK(id=1),digest TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dots_slack_threads(threadKey TEXT PRIMARY KEY,teamId TEXT NOT NULL,channelId TEXT NOT NULL,threadTs TEXT NOT NULL,createOperationId TEXT NOT NULL UNIQUE,conversationId TEXT UNIQUE);
      CREATE TABLE IF NOT EXISTS dots_slack_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,eventId TEXT NOT NULL UNIQUE,teamId TEXT NOT NULL,channelId TEXT NOT NULL,actorId TEXT NOT NULL,messageTs TEXT NOT NULL,threadTs TEXT NOT NULL,text TEXT NOT NULL,kind TEXT NOT NULL,threadKey TEXT NOT NULL,operationId TEXT NOT NULL UNIQUE,conversationId TEXT,state TEXT NOT NULL,UNIQUE(teamId,channelId,messageTs));
      CREATE TABLE IF NOT EXISTS dots_slack_event_aliases(eventId TEXT PRIMARY KEY,digest TEXT NOT NULL,operationId TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dots_slack_outbox(id TEXT PRIMARY KEY,operationId TEXT NOT NULL,conversationId TEXT NOT NULL,channelId TEXT NOT NULL,threadTs TEXT NOT NULL,artifactId TEXT NOT NULL,outputVersion INTEGER NOT NULL,sha256 TEXT NOT NULL,payload TEXT NOT NULL,digest TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL,nextAt INTEGER NOT NULL,providerReceipt TEXT,revision INTEGER NOT NULL,reviewPath TEXT,UNIQUE(operationId,artifactId,outputVersion));
      CREATE TABLE IF NOT EXISTS dots_slack_throttle(id TEXT PRIMARY KEY,nextAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS dots_slack_inspection(id TEXT PRIMARY KEY,cursor TEXT,nextAt INTEGER NOT NULL);`);
    const identity = JSON.stringify([
      config.authority,
      config.ownerId,
      config.dotId,
      config.teamId,
      config.appId,
      config.botUserId,
      config.appOrigin,
    ]);
    this.db
      .prepare(
        'INSERT OR IGNORE INTO dots_slack_installation(id,identity) VALUES(1,?)',
      )
      .run(identity);
    if (
      this.db
        .prepare('SELECT identity FROM dots_slack_installation WHERE id=1')
        .get()?.identity !== identity
    ) {
      this.db.close();
      throw new SlackFailure('conflict');
    }
  }
  private checkAuthority(freeze = false) {
    const digest = configurationDigest(this.config);
    const previous = this.db
      .prepare('SELECT digest FROM dots_slack_authority WHERE id=1')
      .get();
    if (previous && previous.digest !== digest)
      throw new SlackFailure('conflict');
    if (freeze && !previous)
      this.db
        .prepare('INSERT INTO dots_slack_authority VALUES(1,?)')
        .run(digest);
  }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  acquire() {
    this.transaction(() => {
      this.checkAuthority();
      const row = this.db
        .prepare(
          'SELECT holder,expires FROM dots_slack_installation WHERE id=1',
        )
        .get()!;
      if (
        row.holder &&
        row.holder !== this.holder &&
        Number(row.expires) > this.now()
      )
        throw new SlackFailure('conflict');
      this.db
        .prepare(
          'UPDATE dots_slack_installation SET holder=?,expires=? WHERE id=1',
        )
        .run(this.holder, this.now() + 60000);
      // After process loss, a sending record is never treated as unsent.
      this.db.exec(
        "UPDATE dots_slack_outbox SET state='unknown',revision=revision+1 WHERE state='sending'; UPDATE dots_slack_events SET state='unknown' WHERE state='dispatching'; UPDATE dots_slack_events SET state='queued' WHERE state='preparing';",
      );
      this.acquired = true;
    });
  }
  fence() {
    if (!this.acquired) throw new SlackFailure('unavailable');
    // Atomic holder CAS permits renewal after idle expiry only if no other worker took over.
    const changed = this.db
      .prepare(
        'UPDATE dots_slack_installation SET expires=? WHERE id=1 AND holder=?',
      )
      .run(this.now() + 60000, this.holder);
    if (changed.changes !== 1) throw new SlackFailure('unavailable');
  }
  close() {
    if (this.acquired)
      this.db
        .prepare(
          'UPDATE dots_slack_installation SET holder=NULL,expires=0 WHERE id=1 AND holder=?',
        )
        .run(this.holder);
    this.acquired = false;
    this.db.close();
  }
  thread(key: string): ThreadRecord | undefined {
    return this.db
      .prepare('SELECT * FROM dots_slack_threads WHERE threadKey=?')
      .get(key) as unknown as ThreadRecord | undefined;
  }
  event(id: string): EventRecord | undefined {
    return this.db
      .prepare(
        'SELECT e.* FROM dots_slack_events e JOIN dots_slack_event_aliases a USING(operationId) WHERE a.eventId=?',
      )
      .get(id) as unknown as EventRecord | undefined;
  }
  byOperation(id: string): EventRecord | undefined {
    return this.db
      .prepare('SELECT * FROM dots_slack_events WHERE operationId=?')
      .get(id) as unknown as EventRecord | undefined;
  }
  receive(event: SlackEvent): { duplicate: boolean; event: EventRecord } {
    return this.transaction(() => {
      this.fence();
      this.checkAuthority(true);
      const digest = hash(
        JSON.stringify([
          event.teamId,
          event.channelId,
          event.actorId,
          event.messageTs,
          event.threadTs,
          event.text,
        ]),
      );
      const alias = this.db
        .prepare('SELECT * FROM dots_slack_event_aliases WHERE eventId=?')
        .get(event.eventId);
      if (alias) {
        if (alias.digest !== digest) throw new SlackFailure('conflict');
        return {
          duplicate: true,
          event: this.byOperation(String(alias.operationId))!,
        };
      }
      if (
        Number(
          this.db
            .prepare('SELECT COUNT(*) AS n FROM dots_slack_event_aliases')
            .get()?.n,
        ) >= 100000
      )
        throw new SlackFailure('unavailable');
      const existing = this.db
        .prepare(
          'SELECT * FROM dots_slack_events WHERE teamId=? AND channelId=? AND messageTs=?',
        )
        .get(event.teamId, event.channelId, event.messageTs) as unknown as
        EventRecord | undefined;
      if (existing) {
        const original = hash(
          JSON.stringify([
            existing.teamId,
            existing.channelId,
            existing.actorId,
            existing.messageTs,
            existing.threadTs,
            existing.text,
          ]),
        );
        if (original !== digest) throw new SlackFailure('conflict');
        this.db
          .prepare('INSERT INTO dots_slack_event_aliases VALUES(?,?,?)')
          .run(event.eventId, digest, existing.operationId);
        return { duplicate: true, event: existing };
      }
      if (
        Number(
          this.db
            .prepare(
              "SELECT COUNT(*) AS n FROM dots_slack_events WHERE state NOT IN ('complete','rejected')",
            )
            .get()?.n,
        ) >= 256
      )
        throw new SlackFailure('unavailable');
      const threadKey = hash(
        JSON.stringify([event.teamId, event.channelId, event.threadTs]),
      );
      this.db
        .prepare(
          'INSERT OR IGNORE INTO dots_slack_threads VALUES(?,?,?,?,?,NULL)',
        )
        .run(
          threadKey,
          event.teamId,
          event.channelId,
          event.threadTs,
          randomUUID(),
        );
      const operationId = randomUUID();
      this.db
        .prepare(
          "INSERT INTO dots_slack_events(eventId,teamId,channelId,actorId,messageTs,threadTs,text,kind,threadKey,operationId,state) VALUES(?,?,?,?,?,?,?,?,?,?,'queued')",
        )
        .run(
          event.eventId,
          event.teamId,
          event.channelId,
          event.actorId,
          event.messageTs,
          event.threadTs,
          event.text,
          event.kind,
          threadKey,
          operationId,
        );
      this.db
        .prepare('INSERT INTO dots_slack_event_aliases VALUES(?,?,?)')
        .run(event.eventId, digest, operationId);
      return { duplicate: false, event: this.byOperation(operationId)! };
    });
  }
  map(threadKey: string, conversationId: string) {
    this.fence();
    const row = this.thread(threadKey);
    if (!row || (row.conversationId && row.conversationId !== conversationId))
      throw new SlackFailure('conflict');
    this.db
      .prepare(
        'UPDATE dots_slack_threads SET conversationId=? WHERE threadKey=?',
      )
      .run(conversationId, threadKey);
    this.db
      .prepare(
        'UPDATE dots_slack_events SET conversationId=? WHERE threadKey=?',
      )
      .run(conversationId, threadKey);
  }
  events(states: EventRecord['state'][], limit = 32) {
    const key = states.join(',');
    const after = states.includes('queued')
      ? 0
      : (this.scanOffsets.get(key) ?? 0);
    const read = (cursor: number) =>
      this.db
        .prepare(
          `SELECT * FROM dots_slack_events WHERE state IN (${states.map(() => '?').join(',')}) AND sequence>? ORDER BY sequence LIMIT ?`,
        )
        .all(...states, cursor, limit) as unknown as EventRecord[];
    let rows = read(after);
    if (!rows.length && after) rows = read(0);
    if (rows.length) this.scanOffsets.set(key, rows[rows.length - 1].sequence);
    return rows;
  }
  earlierPending(event: EventRecord) {
    return !!this.db
      .prepare(
        "SELECT 1 FROM dots_slack_events WHERE threadKey=? AND sequence<? AND state IN ('queued','preparing','dispatching','unknown') LIMIT 1",
      )
      .get(event.threadKey, event.sequence);
  }
  settleEvent(operationId: string, state: EventRecord['state']) {
    this.fence();
    this.db
      .prepare('UPDATE dots_slack_events SET state=? WHERE operationId=?')
      .run(state, operationId);
  }
  origins(conversationId: string) {
    return this.db
      .prepare(
        'SELECT eventId,actorId,teamId,channelId,threadTs,messageTs,sequence,operationId,state FROM dots_slack_events WHERE conversationId=? ORDER BY sequence LIMIT 500',
      )
      .all(conversationId);
  }
  outbox(id: string): OutboxRecord | undefined {
    return this.db
      .prepare('SELECT * FROM dots_slack_outbox WHERE id=?')
      .get(id) as unknown as OutboxRecord | undefined;
  }
  queue(
    event: EventRecord,
    output: ImmutableOutput,
    build: (id: string) => SendPayload,
  ) {
    return this.transaction(() => {
      this.fence();
      if (!event.conversationId) throw new SlackFailure('denied');
      const previous = this.db
        .prepare(
          'SELECT * FROM dots_slack_outbox WHERE operationId=? AND artifactId=? AND outputVersion=?',
        )
        .get(
          event.operationId,
          output.artifactId,
          output.version,
        ) as unknown as OutboxRecord | undefined;
      const id = previous?.id ?? randomUUID();
      const payload = JSON.stringify(build(id));
      const digest = hash(payload);
      if (previous) {
        if (
          previous.sha256 !== output.sha256 ||
          previous.digest !== digest ||
          previous.reviewPath !== (output.reviewPath ?? null)
        )
          throw new SlackFailure('conflict');
        return previous;
      }
      if (
        Number(
          this.db.prepare('SELECT COUNT(*) AS n FROM dots_slack_outbox').get()
            ?.n,
        ) >= 100000
      )
        throw new SlackFailure('unavailable');
      this.db
        .prepare(
          "INSERT INTO dots_slack_outbox VALUES(?,?,?,?,?,?,?,?,?,?,'queued',0,?,NULL,0,?)",
        )
        .run(
          id,
          event.operationId,
          event.conversationId,
          event.channelId,
          event.threadTs,
          output.artifactId,
          output.version,
          output.sha256,
          payload,
          digest,
          this.now(),
          output.reviewPath ?? null,
        );
      return this.outbox(id)!;
    });
  }
  deliveries(conversationId?: string) {
    return this.db
      .prepare(
        `SELECT * FROM dots_slack_outbox ${conversationId ? 'WHERE conversationId=?' : ''} ORDER BY rowid LIMIT 500`,
      )
      .all(
        ...(conversationId ? [conversationId] : []),
      ) as unknown as OutboxRecord[];
  }
  due() {
    return this.db
      .prepare(
        "SELECT * FROM dots_slack_outbox WHERE state='queued' AND nextAt<=? ORDER BY rowid LIMIT 32",
      )
      .all(this.now()) as unknown as OutboxRecord[];
  }
  throttle(key: string) {
    return Number(
      this.db
        .prepare('SELECT nextAt FROM dots_slack_throttle WHERE id=?')
        .get(key)?.nextAt ?? 0,
    );
  }
  delay(key: string, until: number) {
    this.fence();
    this.db
      .prepare(
        'INSERT INTO dots_slack_throttle VALUES(?,?) ON CONFLICT(id) DO UPDATE SET nextAt=MAX(nextAt,excluded.nextAt)',
      )
      .run(key, until);
  }
  claimSend(id: string): OutboxRecord {
    return this.transaction(() => {
      this.fence();
      const row = this.outbox(id);
      if (
        !row ||
        row.state !== 'queued' ||
        row.nextAt > this.now() ||
        this.throttle('workspace') > this.now() ||
        this.throttle(row.channelId) > this.now()
      )
        throw new SlackFailure('unavailable');
      this.db
        .prepare(
          "UPDATE dots_slack_outbox SET state='sending',attempts=attempts+1,revision=revision+1 WHERE id=?",
        )
        .run(id);
      this.delay(row.channelId, this.now() + 1100);
      return this.outbox(id)!;
    });
  }
  settleSend(
    id: string,
    state: OutboxRecord['state'],
    receipt: string | null = null,
    nextAt = 0,
  ) {
    this.fence();
    this.db
      .prepare(
        'UPDATE dots_slack_outbox SET state=?,providerReceipt=COALESCE(?,providerReceipt),nextAt=?,revision=revision+1 WHERE id=?',
      )
      .run(state, receipt, nextAt, id);
  }
  inspection(id: string) {
    const row = this.db
      .prepare('SELECT * FROM dots_slack_inspection WHERE id=?')
      .get(id);
    return {
      cursor: row?.cursor ? String(row.cursor) : null,
      nextAt: Number(row?.nextAt ?? 0),
    };
  }
  inspected(id: string, cursor: string | null, nextAt: number) {
    this.fence();
    this.db
      .prepare(
        'INSERT INTO dots_slack_inspection VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET cursor=excluded.cursor,nextAt=excluded.nextAt',
      )
      .run(id, cursor, nextAt);
  }
}
