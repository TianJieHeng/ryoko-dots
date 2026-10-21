import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { HTTPException } from 'hono/http-exception';
import type { RuntimeAdapter, Guard, RunSnapshot } from './adapter.js';
import type {
  HubDot,
  HubThread,
  HubRun,
  HubEvent,
} from '../../shared/hub/types.js';
type DotRow = {
  id: string;
  name: string;
  kind: 'hermes' | 'codex';
  runtime: string;
  archived: number;
  isDefault: number;
};
function fail(status: 400 | 403 | 404 | 409 | 503, message: string): never {
  throw new HTTPException(status, { message });
}
const terminal = new Set(['completed', 'failed', 'cancelled']);
export class DotHub {
  readonly db: DatabaseSync;
  readonly adapters = new Map<string, RuntimeAdapter>();
  templates: { id: string; kind: string; name: string }[] = [];
  enroll?: (templateId: string, name: string) => HubDot;
  private pending = new Set<string>();
  private recoveryTimer?: ReturnType<typeof setTimeout>;
  private recovering?: Promise<void>;
  private stopping = false;
  startRecovery() {
    const tick = async () => {
      for (const row of this.db
        .prepare(
          "SELECT id FROM hub_runs WHERE state NOT IN ('completed','failed','cancelled') LIMIT 100",
        )
        .all()) {
        if (this.stopping) return;
        await this.inspect(String(row.id), () => {
          if (this.stopping) throw Error('Stopping');
        }).catch(() => {});
      }
      if (!this.stopping)
        this.recoveryTimer = setTimeout(() => {
          this.recovering = tick();
        }, 3000);
    };
    this.recovering = tick();
  }
  constructor(
    path: string,
    readonly maxConcurrent = 4,
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS hub_dots(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,runtime TEXT UNIQUE NOT NULL,archived INTEGER NOT NULL DEFAULT 0,isDefault INTEGER NOT NULL DEFAULT 0);
      CREATE UNIQUE INDEX IF NOT EXISTS hub_default ON hub_dots(isDefault) WHERE isDefault=1;
      CREATE TABLE IF NOT EXISTS hub_threads(id TEXT PRIMARY KEY,dotId TEXT NOT NULL,nativeId TEXT,title TEXT NOT NULL,state TEXT NOT NULL,createdAt INTEGER NOT NULL,operationId TEXT UNIQUE,intent TEXT,UNIQUE(dotId,nativeId));
      CREATE TABLE IF NOT EXISTS hub_runs(id TEXT PRIMARY KEY,threadId TEXT NOT NULL,text TEXT NOT NULL,state TEXT NOT NULL,nativeId TEXT,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,detail TEXT);
      CREATE TABLE IF NOT EXISTS hub_events(id INTEGER PRIMARY KEY AUTOINCREMENT,runId TEXT NOT NULL,state TEXT NOT NULL,at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS hub_run_thread ON hub_runs(threadId,createdAt);
      CREATE INDEX IF NOT EXISTS hub_event_run ON hub_events(runId,id);`);
    this.db
      .prepare(
        "UPDATE hub_runs SET state='unknown',detail='Service restarted; inspect runtime state before retrying.' WHERE state IN ('accepted','running','waiting_approval')",
      )
      .run();
  }
  register(
    dot: {
      id: string;
      name: string;
      kind: 'hermes' | 'codex';
      runtime: string;
    },
    adapter: RuntimeAdapter,
    isDefault = false,
  ) {
    const old = this.db
      .prepare('SELECT * FROM hub_dots WHERE id=? OR runtime=?')
      .get(dot.id, dot.runtime) as unknown as DotRow | undefined;
    if (
      old &&
      (old.id !== dot.id ||
        old.kind !== dot.kind ||
        old.runtime !== dot.runtime)
    )
      fail(409, 'Runtime identity cannot be rebound.');
    this.db
      .prepare('INSERT OR IGNORE INTO hub_dots VALUES(?,?,?,?,0,?)')
      .run(
        dot.id,
        dot.name,
        dot.kind,
        dot.runtime,
        Number(
          isDefault &&
            !this.db.prepare('SELECT id FROM hub_dots WHERE isDefault=1').get(),
        ),
      );
    this.adapters.set(dot.runtime, adapter);
  }
  dot(id: string): HubDot {
    const r = this.db
      .prepare('SELECT * FROM hub_dots WHERE id=?')
      .get(id) as unknown as DotRow | undefined;
    if (!r) fail(404, 'Dot not found.');
    const a = this.adapters.get(r.runtime);
    return {
      ...r,
      archived: !!r.archived,
      isDefault: !!r.isDefault,
      readiness: a?.readiness() ?? 'unconfigured',
      capabilities: a?.capabilities ?? {
        chat: false,
        cancel: false,
        computer: false,
        children: false,
        approvals: false,
      },
    };
  }
  dots(cursor: string | undefined, allowed?: string[]) {
    const rows = this.db
      .prepare('SELECT id FROM hub_dots WHERE id>? ORDER BY id')
      .all(cursor ?? '')
      .filter((r) => !allowed || allowed.includes(String(r.id)));
    const items = rows.slice(0, 50).map((r) => this.dot(String(r.id)));
    return { items, nextCursor: rows.length > 50 ? items.at(-1)!.id : null };
  }
  update(
    id: string,
    input: { name?: string; archived?: boolean; isDefault?: boolean },
  ) {
    const dot = this.dot(id);
    if (
      input.archived &&
      this.db
        .prepare(
          "SELECT 1 FROM hub_runs r JOIN hub_threads t ON t.id=r.threadId WHERE t.dotId=? AND r.state NOT IN ('completed','failed','cancelled')",
        )
        .get(id)
    )
      fail(409, 'Resolve active or uncertain work before archiving.');
    if (input.archived && dot.isDefault)
      fail(409, 'Select another default Dot before archiving.');
    if (input.isDefault && dot.archived) fail(409, 'Restore this Dot first.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (input.isDefault) this.db.exec('UPDATE hub_dots SET isDefault=0');
      this.db
        .prepare('UPDATE hub_dots SET name=?,archived=?,isDefault=? WHERE id=?')
        .run(
          input.name ?? dot.name,
          Number(input.archived ?? dot.archived),
          Number(input.isDefault ?? dot.isDefault),
          id,
        );
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return this.dot(id);
  }
  adapter(dotId: string, write = false) {
    const d = this.dot(dotId);
    if (write && d.archived) fail(409, 'This Dot is archived.');
    return (
      this.adapters.get(d.runtime) ?? fail(503, 'Runtime is not configured.')
    );
  }
  thread(id: string) {
    return (
      (this.db
        .prepare('SELECT * FROM hub_threads WHERE id=?')
        .get(id) as unknown as HubThread | undefined) ??
      fail(404, 'Conversation not found.')
    );
  }
  run(id: string) {
    return (
      (this.db
        .prepare('SELECT * FROM hub_runs WHERE id=?')
        .get(id) as unknown as HubRun | undefined) ??
      fail(404, 'Run not found.')
    );
  }
  async create(
    dotId: string,
    operationId: string,
    title: string,
    guard: Guard,
  ) {
    guard();
    const intent = JSON.stringify({ dotId, title });
    const old = this.db
      .prepare('SELECT * FROM hub_threads WHERE operationId=?')
      .get(operationId) as unknown as
      (HubThread & { intent: string }) | undefined;
    if (old) {
      if (old.intent !== intent)
        fail(409, 'Operation ID is already bound to different input.');
      return old;
    }
    if (this.db.prepare('SELECT id FROM hub_runs WHERE id=?').get(operationId))
      fail(409, 'Operation ID already used.');
    const adapter = this.adapter(dotId, true);
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO hub_threads VALUES(?,?,NULL,?,?,?, ?,?)')
      .run(id, dotId, title, 'creating', Date.now(), operationId, intent);
    try {
      const native = await adapter.create(operationId, title, guard);
      guard();
      this.db
        .prepare("UPDATE hub_threads SET nativeId=?,state='ready' WHERE id=?")
        .run(native, id);
    } catch {
      this.db
        .prepare("UPDATE hub_threads SET state='unknown' WHERE id=?")
        .run(id);
    }
    return this.thread(id);
  }
  async threads(dotId: string, cursor: string | undefined, guard: Guard) {
    const r = await this.adapter(dotId).list(cursor, guard);
    guard();
    const items = r.items.map((item) => {
      let row = this.db
        .prepare('SELECT * FROM hub_threads WHERE dotId=? AND nativeId=?')
        .get(dotId, item.id) as unknown as HubThread | undefined;
      if (!row) {
        const id = createHash('sha256')
          .update(dotId + '\0' + item.id)
          .digest('hex');
        this.db
          .prepare(
            "INSERT INTO hub_threads VALUES(?,?,?,?,'ready',?,NULL,NULL)",
          )
          .run(id, dotId, item.id, item.title, Date.now());
        row = this.thread(id);
      }
      return row;
    });
    return { items, nextCursor: r.nextCursor };
  }
  async messages(id: string, cursor: string | undefined, guard: Guard) {
    const t = this.thread(id);
    if (!t.nativeId) fail(409, 'Conversation creation outcome is unknown.');
    return this.adapter(t.dotId).messages(t.nativeId, cursor, guard);
  }
  async submit(id: string, operationId: string, text: string, guard: Guard) {
    guard();
    const t = this.thread(id);
    const a = this.adapter(t.dotId, true);
    if (!t.nativeId) fail(409, 'Conversation is not ready.');
    const old = this.db
      .prepare('SELECT * FROM hub_runs WHERE id=?')
      .get(operationId) as unknown as HubRun | undefined;
    if (old) {
      if (old.threadId !== id || old.text !== text)
        fail(409, 'Operation ID is already bound to different input.');
      return this.inspect(operationId, guard);
    }
    if (
      this.db
        .prepare('SELECT id FROM hub_threads WHERE operationId=?')
        .get(operationId)
    )
      fail(409, 'Operation ID already used.');
    const active = this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM hub_runs WHERE state NOT IN ('completed','failed','cancelled')",
      )
      .get()!;
    if (Number(active.n) >= this.maxConcurrent)
      fail(409, 'Concurrent task limit reached. Wait for a task to finish.');
    if (
      this.db
        .prepare(
          "SELECT id FROM hub_runs WHERE threadId=? AND state NOT IN ('completed','failed','cancelled')",
        )
        .get(id)
    )
      fail(
        409,
        'This conversation has unfinished or uncertain work. Inspect it first.',
      );
    const now = Date.now();
    this.db
      .prepare('INSERT INTO hub_runs VALUES(?,?,?,?,NULL,?,?,NULL)')
      .run(operationId, id, text, 'accepted', now, now);
    this.event(operationId, 'accepted');
    this.pending.add(operationId);
    try {
      this.settle(
        operationId,
        await a.submit(t.nativeId, operationId, text, guard),
      );
    } catch {
      this.settle(operationId, {
        state: 'unknown',
        nativeId: null,
        detail:
          'Delivery is uncertain. Check this run; do not resend automatically.',
      });
    } finally {
      this.pending.delete(operationId);
    }
    guard();
    return this.run(operationId);
  }
  private event(id: string, state: HubRun['state']) {
    this.db
      .prepare('INSERT INTO hub_events(runId,state,at) VALUES(?,?,?)')
      .run(id, state, Date.now());
  }
  private settle(id: string, s: RunSnapshot) {
    const old = this.run(id);
    this.db
      .prepare(
        'UPDATE hub_runs SET state=?,nativeId=?,updatedAt=?,detail=? WHERE id=?',
      )
      .run(
        s.state,
        s.nativeId ?? old.nativeId,
        Date.now(),
        s.detail ?? null,
        id,
      );
    if (old.state !== s.state) this.event(id, s.state);
  }
  async inspect(id: string, guard: Guard) {
    guard();
    const r = this.run(id);
    if (terminal.has(r.state) || this.pending.has(id)) return r;
    const t = this.thread(r.threadId);
    try {
      const result = await this.adapter(t.dotId).inspect(
        t.nativeId!,
        id,
        r.nativeId,
        guard,
      );
      guard();
      this.settle(id, result);
    } catch {
      guard();
    }
    return this.run(id);
  }
  async cancel(id: string, cancelId: string, guard: Guard) {
    const r = this.run(id),
      t = this.thread(r.threadId);
    if (terminal.has(r.state)) return r;
    const a = this.adapter(t.dotId);
    if (!a.capabilities.cancel) fail(409, 'Cancellation is unsupported.');
    this.settle(
      id,
      await a.cancel(t.nativeId!, id, r.nativeId, cancelId, guard),
    );
    guard();
    return this.run(id);
  }
  events(id: string, cursor: number) {
    this.run(id);
    const rows = this.db
      .prepare(
        'SELECT * FROM hub_events WHERE runId=? AND id>? ORDER BY id LIMIT 101',
      )
      .all(id, cursor) as unknown as HubEvent[];
    const items = rows.slice(0, 100);
    return {
      items,
      nextCursor: items.at(-1)?.id ?? cursor,
      hasMore: rows.length > 100,
    };
  }
  runs(threadId?: string) {
    return (threadId
      ? this.db
          .prepare(
            'SELECT * FROM hub_runs WHERE threadId=? ORDER BY createdAt DESC LIMIT 100',
          )
          .all(threadId)
      : this.db
          .prepare('SELECT * FROM hub_runs ORDER BY createdAt DESC LIMIT 100')
          .all()) as unknown as HubRun[];
  }
  activity(cursor: string | undefined, allowed?: string[]) {
    let before = Number.MAX_SAFE_INTEGER,
      beforeId = '~';
    if (cursor) {
      const parts = cursor.split(':');
      before = Number(parts.shift());
      beforeId = parts.join(':');
      if (!Number.isSafeInteger(before) || before < 0 || !beforeId)
        fail(400, 'Invalid activity cursor.');
    }
    const rows = this.db
      .prepare(
        `SELECT r.*,t.dotId,d.name AS dotName FROM hub_runs r JOIN hub_threads t ON t.id=r.threadId JOIN hub_dots d ON d.id=t.dotId WHERE (r.createdAt<? OR (r.createdAt=? AND r.id<?)) AND (? IS NULL OR t.dotId IN (SELECT value FROM json_each(?))) ORDER BY r.createdAt DESC,r.id DESC LIMIT 101`,
      )
      .all(
        before,
        before,
        beforeId,
        allowed ? JSON.stringify(allowed) : null,
        allowed ? JSON.stringify(allowed) : null,
      ) as unknown as (HubRun & { dotId: string; dotName: string })[];
    const items = rows.slice(0, 100),
      last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > 100 && last ? last.createdAt + ':' + last.id : null,
    };
  }
  async children(id: string, guard: Guard) {
    const r = this.run(id),
      t = this.thread(r.threadId),
      a = this.adapter(t.dotId);
    guard();
    return {
      supported: a.capabilities.children,
      items: a.capabilities.children
        ? await a.children(t.nativeId!, r.nativeId, guard)
        : [],
    };
  }
  async stop() {
    this.stopping = true;
    clearTimeout(this.recoveryTimer);
    await this.recovering;
    await Promise.allSettled([...this.adapters.values()].map((a) => a.stop()));
    this.db.close();
  }
}
