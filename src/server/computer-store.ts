import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type {
  ComputerAudit,
  ComputerPermissions,
} from '../shared/computer-types.js';
export class ComputerStore {
  constructor(private db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS computer_permissions(dotId TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS computer_audit(id TEXT PRIMARY KEY,dotId TEXT NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,outcome TEXT NOT NULL,createdAt INTEGER NOT NULL);`);
    for (const column of ['operationId', 'effectId', 'agentId', 'sessionId'])
      if (
        !db
          .prepare('PRAGMA table_info(computer_audit)')
          .all()
          .some((row) => row.name === column)
      )
        db.exec(`ALTER TABLE computer_audit ADD COLUMN ${column} TEXT`);
    // A legacy pending write might have reached the executor before a crash.
    // Retain uncertainty instead of manufacturing failure or pruning its audit.
    db.prepare(
      "UPDATE computer_audit SET outcome='unknown' WHERE outcome='pending'",
    ).run();
  }
  permissions(id: string): ComputerPermissions {
    const row = this.db
      .prepare('SELECT value FROM computer_permissions WHERE dotId=?')
      .get(id);
    return row
      ? JSON.parse(String(row.value))
      : { enabled: false, browser: false, files: false, shell: false };
  }
  patch(id: string, patch: Partial<ComputerPermissions>) {
    const value = { ...this.permissions(id), ...patch };
    this.db
      .prepare('INSERT OR REPLACE INTO computer_permissions VALUES (?,?)')
      .run(id, JSON.stringify(value));
    return value;
  }
  begin(
    dotId: string,
    action: string,
    actor: 'owner' | 'agent',
    scope?: {
      operationId: string;
      effectId: string | null;
      agentId: string | null;
      sessionId: string;
    },
  ) {
    const id = randomUUID();
    this.db
      .prepare(
        'INSERT INTO computer_audit(id,dotId,action,actor,outcome,createdAt,operationId,effectId,agentId,sessionId) VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        dotId,
        action,
        actor,
        'pending',
        Date.now(),
        scope?.operationId ?? null,
        scope?.effectId ?? null,
        scope?.agentId ?? null,
        scope?.sessionId ?? null,
      );
    return id;
  }
  finish(id: string, outcome: 'succeeded' | 'failed' | 'unknown') {
    this.db
      .prepare('UPDATE computer_audit SET outcome=? WHERE id=?')
      .run(outcome, id);
    this.db
      .prepare(
        `DELETE FROM computer_audit WHERE dotId=(SELECT dotId FROM computer_audit WHERE id=?) AND outcome IN ('succeeded','failed') AND id NOT IN (SELECT id FROM computer_audit WHERE dotId=(SELECT dotId FROM computer_audit WHERE id=?) AND outcome IN ('succeeded','failed') ORDER BY createdAt DESC,rowid DESC LIMIT 1000)`,
      )
      .run(id, id);
  }
  audit(id: string): ComputerAudit[] {
    return this.db
      .prepare(
        'SELECT id,action,actor,outcome,createdAt,operationId,effectId,agentId,sessionId FROM computer_audit WHERE dotId=? ORDER BY createdAt DESC LIMIT 50',
      )
      .all(id) as unknown as ComputerAudit[];
  }
}
