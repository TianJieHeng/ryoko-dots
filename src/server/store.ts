import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  Action,
  Detail,
  Memory,
  Result,
  Run,
  Settings,
  Task,
  TaskEvent,
} from '../shared/types.js';

export type Claim = Task & { lease: string };
export interface LegacyScheduleFreeze {
  sourceId: string;
  ownerId: string;
  binding: string;
  definition: string;
  snapshot: string;
  frozenAt: number;
  retiredAt: number | null;
  retirementReceipt: string | null;
  retiredHistory: string | null;
}
export interface LegacyOccurrenceReconciliation {
  sourceId: string;
  occurrenceId: string;
  originalRun: string;
  outcome: 'completed' | 'failed' | 'cancelled' | 'skipped';
  receipt: string;
  reconciledAt: number;
}

const defaults: Settings = {
  name: 'Dot',
  paused: false,
  researchAllowed: true,
  memoryAllowed: true,
};
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, prompt TEXT NOT NULL, status TEXT NOT NULL, intervalSeconds INTEGER, nextRunAt INTEGER, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, error TEXT, lease TEXT, leaseUntil INTEGER);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, taskId TEXT NOT NULL, status TEXT NOT NULL, startedAt INTEGER NOT NULL, finishedAt INTEGER, result TEXT, error TEXT);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, taskId TEXT NOT NULL, runId TEXT, text TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, text TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS tasks_due ON tasks(status, nextRunAt);
      CREATE INDEX IF NOT EXISTS runs_task ON runs(taskId, startedAt);
      CREATE INDEX IF NOT EXISTS events_task ON events(taskId, id);`);
    // Persistent SQL guards also fence pre-upgrade Store connections. No freeze
    // is created merely by opening a database, and there is no unfreeze method.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS legacy_schedule_freezes (
        sourceId TEXT PRIMARY KEY, ownerId TEXT NOT NULL, binding TEXT NOT NULL,
        definition TEXT NOT NULL, snapshot TEXT NOT NULL, frozenAt INTEGER NOT NULL,
        retiredAt INTEGER, retirementReceipt TEXT, retiredHistory TEXT,
        CHECK ((retiredAt IS NULL AND retirementReceipt IS NULL AND retiredHistory IS NULL)
          OR (retiredAt IS NOT NULL AND retirementReceipt IS NOT NULL AND retiredHistory IS NOT NULL))
      );
      CREATE TABLE IF NOT EXISTS legacy_occurrence_reconciliations (
        sourceId TEXT NOT NULL, occurrenceId TEXT NOT NULL, originalRun TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK(outcome IN ('completed','failed','cancelled','skipped')),
        receipt TEXT NOT NULL, reconciledAt INTEGER NOT NULL,
        PRIMARY KEY(sourceId, occurrenceId)
      );
      CREATE TRIGGER IF NOT EXISTS legacy_freeze_no_replace BEFORE INSERT ON legacy_schedule_freezes
        WHEN EXISTS(SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=NEW.sourceId)
        BEGIN SELECT RAISE(ABORT, 'Legacy admission freeze is permanent.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_freeze_no_delete BEFORE DELETE ON legacy_schedule_freezes
        BEGIN SELECT RAISE(ABORT, 'Legacy admission freeze is permanent.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_freeze_immutable BEFORE UPDATE ON legacy_schedule_freezes
        WHEN OLD.retiredAt IS NOT NULL OR NEW.sourceId != OLD.sourceId OR NEW.ownerId != OLD.ownerId
          OR NEW.binding != OLD.binding OR NEW.definition != OLD.definition OR NEW.snapshot != OLD.snapshot
          OR NEW.frozenAt != OLD.frozenAt OR NEW.retiredAt IS NULL
        BEGIN SELECT RAISE(ABORT, 'Legacy migration evidence is immutable.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_task_no_insert BEFORE INSERT ON tasks
        WHEN EXISTS(SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=NEW.id)
        BEGIN SELECT RAISE(ABORT, 'Legacy task admissions are frozen.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_task_no_delete BEFORE DELETE ON tasks
        WHEN EXISTS(SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=OLD.id)
        BEGIN SELECT RAISE(ABORT, 'Legacy source history is read-only.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_task_no_move BEFORE UPDATE ON tasks
        WHEN NEW.id != OLD.id AND EXISTS(SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=NEW.id)
        BEGIN SELECT RAISE(ABORT, 'Legacy task admissions are frozen.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_task_fenced_update BEFORE UPDATE ON tasks
        WHEN EXISTS(SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=OLD.id)
          AND (NEW.id != OLD.id OR NEW.prompt != OLD.prompt OR NEW.intervalSeconds IS NOT OLD.intervalSeconds
            OR NEW.createdAt != OLD.createdAt OR OLD.status != 'running' OR NEW.status='running'
            OR NEW.lease IS NOT NULL OR NEW.leaseUntil IS NOT NULL
            OR EXISTS(SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=OLD.id AND retiredAt IS NOT NULL))
        BEGIN SELECT RAISE(ABORT, 'Legacy task admissions are frozen.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_run_no_insert BEFORE INSERT ON runs
        WHEN EXISTS(SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=NEW.taskId)
        BEGIN SELECT RAISE(ABORT, 'Legacy occurrence admissions are frozen.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_run_no_delete BEFORE DELETE ON runs
        WHEN EXISTS(SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=OLD.taskId)
        BEGIN SELECT RAISE(ABORT, 'Legacy source history is read-only.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_run_no_move BEFORE UPDATE ON runs
        WHEN (NEW.taskId != OLD.taskId AND EXISTS(SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=NEW.taskId))
          OR (NEW.id != OLD.id AND EXISTS(SELECT 1 FROM runs JOIN legacy_schedule_freezes ON sourceId=taskId WHERE runs.id=NEW.id))
        BEGIN SELECT RAISE(ABORT, 'Legacy occurrence admissions are frozen.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_run_fenced_update BEFORE UPDATE ON runs
        WHEN EXISTS(SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=OLD.taskId)
          AND (OLD.status != 'running' OR NEW.status NOT IN ('completed','failed','interrupted')
            OR NEW.id != OLD.id OR NEW.taskId != OLD.taskId OR NEW.startedAt != OLD.startedAt
            OR NEW.finishedAt IS NULL
            OR EXISTS(SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=OLD.taskId AND retiredAt IS NOT NULL)
            OR EXISTS(SELECT 1 FROM legacy_occurrence_reconciliations WHERE sourceId=OLD.taskId AND occurrenceId=OLD.id))
        BEGIN SELECT RAISE(ABORT, 'Legacy source history is read-only.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_event_no_update BEFORE UPDATE ON events
        WHEN EXISTS(SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=OLD.taskId)
        BEGIN SELECT RAISE(ABORT, 'Legacy source history is read-only.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_event_no_delete BEFORE DELETE ON events
        WHEN EXISTS(SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=OLD.taskId)
        BEGIN SELECT RAISE(ABORT, 'Legacy source history is read-only.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_event_retired_insert BEFORE INSERT ON events
        WHEN EXISTS(SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=NEW.taskId AND retiredAt IS NOT NULL)
        BEGIN SELECT RAISE(ABORT, 'Retired legacy history is read-only.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_reconciliation_no_replace BEFORE INSERT ON legacy_occurrence_reconciliations
        WHEN EXISTS(SELECT 1 FROM legacy_occurrence_reconciliations WHERE sourceId=NEW.sourceId AND occurrenceId=NEW.occurrenceId)
        BEGIN SELECT RAISE(ABORT, 'Legacy reconciliation evidence is immutable.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_reconciliation_admission BEFORE INSERT ON legacy_occurrence_reconciliations
        WHEN NOT EXISTS(SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=NEW.sourceId AND retiredAt IS NULL)
        BEGIN SELECT RAISE(ABORT, 'Frozen, unretired source required.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_reconciliation_no_update BEFORE UPDATE ON legacy_occurrence_reconciliations
        BEGIN SELECT RAISE(ABORT, 'Legacy reconciliation evidence is immutable.'); END;
      CREATE TRIGGER IF NOT EXISTS legacy_reconciliation_no_delete BEFORE DELETE ON legacy_occurrence_reconciliations
        BEGIN SELECT RAISE(ABORT, 'Legacy reconciliation evidence is immutable.'); END;
    `);
    this.db
      .prepare('INSERT OR IGNORE INTO settings VALUES (1, ?)')
      .run(JSON.stringify(defaults));
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
  settings(): Settings {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE id=1')
      .get() as { value: string };
    return JSON.parse(row.value) as Settings;
  }
  updateSettings(patch: Partial<Settings>): Settings {
    return this.transaction(() => {
      const previous = this.settings();
      const settings = { ...previous, ...patch };
      this.db
        .prepare('UPDATE settings SET value=? WHERE id=1')
        .run(JSON.stringify(settings));
      if (
        (!previous.paused && settings.paused) ||
        (previous.researchAllowed && !settings.researchAllowed) ||
        (previous.memoryAllowed && !settings.memoryAllowed)
      ) {
        const running = this.tasks().filter((t) => t.status === 'running');
        for (const task of running) {
          this.invalidate(
            task,
            'queued',
            'Run stopped because settings changed.',
          );
        }
      }
      return settings;
    });
  }
  tasks(): Task[] {
    return this.db
      .prepare('SELECT * FROM tasks ORDER BY createdAt DESC')
      .all() as unknown as Task[];
  }
  task(id: string): Task | undefined {
    return this.db
      .prepare('SELECT * FROM tasks WHERE id=?')
      .get(id) as unknown as Task | undefined;
  }
  createTask(prompt: string, intervalSeconds: number | null = null): Task {
    const now = Date.now();
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO tasks VALUES (?, ?, 'queued', ?, NULL, ?, ?, NULL, NULL, NULL)",
      )
      .run(id, prompt, intervalSeconds, now, now);
    this.event(id, null, 'Task added to the research queue.');
    return this.task(id)!;
  }
  detail(id: string): Detail | undefined {
    const task = this.task(id);
    if (!task) return undefined;
    const rows = this.db
      .prepare(
        'SELECT * FROM runs WHERE taskId=? ORDER BY startedAt DESC, rowid DESC',
      )
      .all(id) as unknown as (Omit<Run, 'result'> & {
      result: string | null;
    })[];
    return {
      task,
      runs: rows.map((row) => ({
        ...row,
        result: row.result ? (JSON.parse(row.result) as Result) : null,
      })),
      events: this.db
        .prepare('SELECT * FROM events WHERE taskId=? ORDER BY id')
        .all(id) as unknown as TaskEvent[],
    };
  }
  event(taskId: string, runId: string | null, text: string) {
    this.db
      .prepare(
        'INSERT INTO events (taskId, runId, text, createdAt) VALUES (?, ?, ?, ?)',
      )
      .run(taskId, runId, text, Date.now());
  }
  private invalidate(task: Task, status: string, reason: string) {
    const now = Date.now();
    if (task.lease)
      this.db
        .prepare(
          "UPDATE runs SET status='interrupted', finishedAt=?, error=? WHERE id=? AND status='running'",
        )
        .run(now, reason, task.lease);
    this.db
      .prepare(
        'UPDATE tasks SET status=?, lease=NULL, leaseUntil=NULL, updatedAt=? WHERE id=?',
      )
      .run(status, now, task.id);
    this.event(task.id, task.lease, reason);
  }
  action(id: string, action: Action): Task | undefined {
    return this.transaction(() => {
      const task = this.task(id);
      if (!task) return undefined;
      this.assertLegacyMutable(id);
      if (action === 'run' && task.status === 'running') return task;
      const status =
        action === 'run'
          ? 'queued'
          : action === 'pause'
            ? 'paused'
            : 'cancelled';
      this.invalidate(
        task,
        status,
        action === 'run' ? 'Task queued for a new run.' : `Task ${status}.`,
      );
      this.db
        .prepare('UPDATE tasks SET error=NULL, nextRunAt=NULL WHERE id=?')
        .run(id);
      return this.task(id);
    });
  }
  schedule(id: string, intervalSeconds: number | null): Task | undefined {
    this.assertLegacyMutable(id);
    const task = this.task(id);
    if (!task) return undefined;
    const next =
      intervalSeconds && task.status === 'completed'
        ? Date.now() + intervalSeconds * 1000
        : null;
    this.db
      .prepare(
        'UPDATE tasks SET intervalSeconds=?, nextRunAt=?, updatedAt=? WHERE id=?',
      )
      .run(intervalSeconds, next, Date.now(), id);
    this.event(
      id,
      null,
      intervalSeconds
        ? `Repeats every ${intervalSeconds / 60} minutes after a successful run.`
        : 'Repeat schedule removed.',
    );
    return this.task(id);
  }
  claim(now = Date.now()): Claim | null {
    return this.transaction(() => {
      const settings = this.settings();
      if (settings.paused || !settings.researchAllowed) return null;
      const expired = this.db
        .prepare(
          "SELECT * FROM tasks WHERE status='running' AND leaseUntil<=? AND NOT EXISTS (SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=tasks.id)",
        )
        .all(now) as unknown as Task[];
      for (const task of expired)
        this.invalidate(
          task,
          'queued',
          'Previous worker lease expired; safely retrying.',
        );
      const task = this.db
        .prepare(
          "SELECT * FROM tasks WHERE (status='queued' OR (status='completed' AND nextRunAt IS NOT NULL AND nextRunAt<=?)) AND NOT EXISTS (SELECT 1 FROM legacy_schedule_freezes WHERE sourceId=tasks.id) ORDER BY createdAt LIMIT 1",
        )
        .get(now) as unknown as Task | undefined;
      if (!task) return null;
      const lease = randomUUID();
      this.db
        .prepare(
          "UPDATE tasks SET status='running', lease=?, leaseUntil=?, nextRunAt=NULL, error=NULL, updatedAt=? WHERE id=?",
        )
        .run(lease, now + 180_000, now, task.id);
      this.db
        .prepare(
          "INSERT INTO runs VALUES (?, ?, 'running', ?, NULL, NULL, NULL)",
        )
        .run(lease, task.id, now);
      this.event(task.id, lease, 'Research worker started.');
      return { ...this.task(task.id)!, lease };
    });
  }
  owns(claim: Claim): boolean {
    const task = this.task(claim.id);
    return task?.status === 'running' && task.lease === claim.lease;
  }
  finish(claim: Claim, result: Result, now = Date.now()): boolean {
    return this.transaction(() => {
      if (!this.owns(claim)) return false;
      const task = this.task(claim.id)!;
      this.db
        .prepare(
          "UPDATE runs SET status='completed', finishedAt=?, result=? WHERE id=?",
        )
        .run(now, JSON.stringify(result), claim.lease);
      this.db
        .prepare(
          "UPDATE tasks SET status='completed', lease=NULL, leaseUntil=NULL, updatedAt=?, nextRunAt=? WHERE id=?",
        )
        .run(
          now,
          task.intervalSeconds ? now + task.intervalSeconds * 1000 : null,
          claim.id,
        );
      this.event(
        claim.id,
        claim.lease,
        result.sample
          ? 'Fictional sample brief ready.'
          : 'Research brief ready.',
      );
      return true;
    });
  }
  release(claim: Claim, reason: string) {
    this.transaction(() => {
      if (this.owns(claim)) this.invalidate(claim, 'queued', reason);
    });
  }
  fail(claim: Claim, error: string) {
    this.transaction(() => {
      if (!this.owns(claim)) return;
      const now = Date.now();
      this.db
        .prepare(
          "UPDATE runs SET status='failed', finishedAt=?, error=? WHERE id=?",
        )
        .run(now, error, claim.lease);
      this.db
        .prepare(
          "UPDATE tasks SET status='failed', lease=NULL, leaseUntil=NULL, error=?, updatedAt=? WHERE id=?",
        )
        .run(error, now, claim.id);
      this.event(claim.id, claim.lease, error);
    });
  }
  legacyWorkspaceOwner(): string | null {
    if (
      !this.db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='workspace_owner'",
        )
        .get()
    )
      return null;
    const row = this.db
      .prepare('SELECT ownerId FROM workspace_owner WHERE singleton=1')
      .get();
    return typeof row?.ownerId === 'string' ? row.ownerId : null;
  }
  private assertLegacyMutable(id: string) {
    if (this.legacyFreeze(id))
      throw new Error('Legacy task admissions are frozen.');
  }
  legacyFreeze(sourceId: string): LegacyScheduleFreeze | undefined {
    return this.db
      .prepare('SELECT * FROM legacy_schedule_freezes WHERE sourceId=?')
      .get(sourceId) as unknown as LegacyScheduleFreeze | undefined;
  }
  /** Trusted migration primitive. Caller verifies source ownership and immutable
   * runtime definition. BEGIN IMMEDIATE serializes the fence with every claim. */
  freezeLegacyTask(
    sourceId: string,
    ownerId: string,
    binding: string,
    definition: string,
    now = Date.now(),
    expectedTask?: string,
  ) {
    return this.transaction(() => {
      const previous = this.legacyFreeze(sourceId);
      if (previous) {
        if (
          previous.ownerId !== ownerId ||
          previous.binding !== binding ||
          previous.definition !== definition
        )
          throw new Error('Legacy migration definition or binding changed.');
        return previous;
      }
      const source = this.detail(sourceId);
      if (!source) throw new Error('Legacy task not found.');
      if (
        expectedTask !== undefined &&
        JSON.stringify(source.task) !== expectedTask
      )
        throw new Error('Legacy task changed before admission freeze.');
      this.db
        .prepare(
          'INSERT INTO legacy_schedule_freezes VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)',
        )
        .run(
          sourceId,
          ownerId,
          binding,
          definition,
          JSON.stringify(source),
          now,
        );
      return this.legacyFreeze(sourceId)!;
    });
  }
  legacyReconciliations(sourceId: string): LegacyOccurrenceReconciliation[] {
    return this.db
      .prepare(
        'SELECT * FROM legacy_occurrence_reconciliations WHERE sourceId=? ORDER BY occurrenceId',
      )
      .all(sourceId) as unknown as LegacyOccurrenceReconciliation[];
  }
  /** Evidence is supplied only after independent server-owned reconciliation.
   * Never infer a terminal effect from an expired lease or an interrupted run. */
  reconcileLegacyOccurrence(
    input: Omit<LegacyOccurrenceReconciliation, 'reconciledAt'>,
    now = Date.now(),
  ) {
    return this.transaction(() => {
      const frozen = this.legacyFreeze(input.sourceId);
      if (!frozen) throw new Error('Legacy source is not frozen.');
      const previous = this.legacyReconciliations(input.sourceId).find(
        (row) => row.occurrenceId === input.occurrenceId,
      );
      if (previous) {
        if (
          previous.originalRun !== input.originalRun ||
          previous.outcome !== input.outcome ||
          previous.receipt !== input.receipt
        )
          throw new Error('Legacy reconciliation evidence changed.');
        return previous;
      }
      if (frozen.retiredAt !== null)
        throw new Error('Legacy source is retired.');
      const run = this.detail(input.sourceId)?.runs.find(
        (row) => row.id === input.occurrenceId,
      );
      if (!run || JSON.stringify(run) !== input.originalRun)
        throw new Error('Legacy occurrence changed during reconciliation.');
      if (run.status === 'completed' || run.status === 'failed')
        throw new Error('Terminal legacy results cannot be rewritten.');
      this.db
        .prepare(
          'INSERT INTO legacy_occurrence_reconciliations VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          input.sourceId,
          input.occurrenceId,
          input.originalRun,
          input.outcome,
          input.receipt,
          now,
        );
      const task = this.task(input.sourceId)!;
      if (task.lease === input.occurrenceId)
        this.db
          .prepare(
            "UPDATE tasks SET status='paused', lease=NULL, leaseUntil=NULL, updatedAt=? WHERE id=?",
          )
          .run(now, input.sourceId);
      return this.legacyReconciliations(input.sourceId).find(
        (row) => row.occurrenceId === input.occurrenceId,
      )!;
    });
  }
  legacyHistory(sourceId: string) {
    const detail = this.detail(sourceId);
    if (!detail) throw new Error('Legacy task not found.');
    return { detail, reconciliations: this.legacyReconciliations(sourceId) };
  }
  legacyUnresolved(sourceId: string): string[] {
    const { detail, reconciliations } = this.legacyHistory(sourceId);
    const unresolved = detail.runs
      .filter((run) => {
        const reconciled = reconciliations.find(
          (row) => row.occurrenceId === run.id,
        );
        if (reconciled && reconciled.originalRun === JSON.stringify(run))
          return false;
        return (
          !['completed', 'failed', 'cancelled', 'skipped'].includes(
            run.status,
          ) || run.finishedAt === null
        );
      })
      .map((run) => run.id);
    if (detail.task.status === 'running' || detail.task.lease !== null) {
      const claim = detail.task.lease ?? `task:${sourceId}`;
      if (!unresolved.includes(claim)) unresolved.push(claim);
    }
    return unresolved;
  }
  /** Atomically persists the retirement receipt and exact reconciled history;
   * the admission fence is permanent and the receipt can never be replaced. */
  retireLegacyTask(
    sourceId: string,
    expectedHistory: string,
    receipt: string,
    now = Date.now(),
  ) {
    return this.transaction(() => {
      const frozen = this.legacyFreeze(sourceId);
      if (!frozen) throw new Error('Legacy source is not frozen.');
      if (frozen.retiredAt !== null) {
        if (
          frozen.retirementReceipt !== receipt ||
          frozen.retiredHistory !== expectedHistory
        )
          throw new Error('Legacy retirement evidence changed.');
        return frozen;
      }
      if (JSON.stringify(this.legacyHistory(sourceId)) !== expectedHistory)
        throw new Error('Legacy history changed during retirement.');
      if (this.legacyUnresolved(sourceId).length)
        throw new Error('Legacy occurrences still require reconciliation.');
      this.db
        .prepare(
          'UPDATE legacy_schedule_freezes SET retiredAt=?, retirementReceipt=?, retiredHistory=? WHERE sourceId=?',
        )
        .run(now, receipt, expectedHistory, sourceId);
      return this.legacyFreeze(sourceId)!;
    });
  }
  memories(): Memory[] {
    return this.db
      .prepare('SELECT * FROM memories ORDER BY createdAt DESC')
      .all() as unknown as Memory[];
  }
  saveMemory(text: string, id: string = randomUUID()): Memory {
    this.db
      .prepare(
        'INSERT INTO memories VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET text=excluded.text',
      )
      .run(id, text, Date.now());
    return this.db
      .prepare('SELECT * FROM memories WHERE id=?')
      .get(id) as unknown as Memory;
  }
  deleteMemory(id: string): boolean {
    return (
      this.db.prepare('DELETE FROM memories WHERE id=?').run(id).changes > 0
    );
  }
}
