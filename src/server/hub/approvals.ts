import { createHash } from 'node:crypto';
import { HTTPException } from 'hono/http-exception';
import type { DotHub } from './service.js';
import type { Guard } from './adapter.js';
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class ScopedApprovals {
  constructor(private hub: DotHub) {
    hub.db.exec(
      'CREATE TABLE IF NOT EXISTS hub_approval_operations(id TEXT PRIMARY KEY,actor TEXT NOT NULL,requestHash TEXT NOT NULL,state TEXT NOT NULL,result TEXT)',
    );
    const columns = hub.db
      .prepare('PRAGMA table_info(hub_approval_operations)')
      .all();
    if (!columns.some((column) => column.name === 'targetKey'))
      hub.db.exec(
        'ALTER TABLE hub_approval_operations ADD COLUMN targetKey TEXT',
      );
    hub.db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS hub_approval_target ON hub_approval_operations(targetKey)',
    );
  }
  inspect(actor: string, id: string) {
    const row = this.hub.db
      .prepare(
        'SELECT actor,state,result FROM hub_approval_operations WHERE id=?',
      )
      .get(id);
    if (!row || row.actor !== actor)
      throw new HTTPException(404, {
        message: 'Approval operation not found.',
      });
    return {
      id,
      state: row.state,
      result: row.result ? JSON.parse(String(row.result)) : null,
    };
  }
  list(conversationId: string) {
    const t = this.hub.thread(conversationId),
      a = this.hub.adapter(t.dotId);
    if (
      !t.nativeId ||
      !a.capabilities.approvals ||
      !a.pendingApprovals ||
      !a.approve
    )
      throw new HTTPException(409, {
        message: 'This runtime does not expose approval decisions.',
      });
    const runs = this.hub.runs(t.id);
    return a.pendingApprovals(t.nativeId).map((p) => {
      const run = runs.find(
        (r) =>
          r.nativeId === p.turnId &&
          !['completed', 'failed', 'cancelled'].includes(r.state),
      );
      return {
        id: p.id,
        conversationId: t.id,
        runId: run?.id ?? null,
        description: p.description,
        version: hash([t.id, t.nativeId, run?.id ?? null, p]),
        actionable: !!run,
      };
    });
  }
  decide(
    actor: string,
    conversationId: string,
    approvalId: string,
    input: {
      operationId: string;
      runId: string;
      expectedVersion: string;
      decision: 'accept' | 'reject';
    },
    guard: Guard,
  ) {
    guard();
    const t = this.hub.thread(conversationId),
      r = this.hub.run(input.runId);
    if (r.threadId !== t.id)
      throw new HTTPException(404, {
        message: 'Approval run does not belong to this conversation.',
      });
    const requestHash = hash([conversationId, approvalId, input]);
    const old = this.hub.db
      .prepare('SELECT * FROM hub_approval_operations WHERE id=?')
      .get(input.operationId);
    if (old) {
      if (old.actor !== actor || old.requestHash !== requestHash)
        throw new HTTPException(409, {
          message: 'Approval operation ID is bound to another request.',
        });
      if (old.state !== 'completed')
        throw new HTTPException(409, {
          message:
            'Decision outcome is unknown. Inspect the native run; do not retry with a new ID.',
        });
      return JSON.parse(String(old.result));
    }
    const targetKey = hash([conversationId, approvalId, input.expectedVersion]);
    if (
      this.hub.db
        .prepare('SELECT id FROM hub_approval_operations WHERE targetKey=?')
        .get(targetKey)
    )
      throw new HTTPException(409, {
        message:
          'A decision already exists for this approval version. Inspect its outcome.',
      });
    const p = this.list(t.id).find((p) => p.id === approvalId);
    if (
      !p ||
      !p.actionable ||
      p.runId !== r.id ||
      p.version !== input.expectedVersion
    )
      throw new HTTPException(409, {
        message: 'Approval changed or expired. Refresh the pending request.',
      });
    guard();
    this.hub.db
      .prepare(
        "INSERT INTO hub_approval_operations(id,actor,requestHash,state,result,targetKey) VALUES(?,?,?,'outcome_unknown',NULL,?)",
      )
      .run(input.operationId, actor, requestHash, targetKey);
    const a = this.hub.adapter(t.dotId);
    a.approve!(t.nativeId!, approvalId, input.decision === 'accept', guard);
    const result = {
      operationId: input.operationId,
      approvalId,
      conversationId: t.id,
      runId: r.id,
      decision: input.decision,
      resolved: true,
    };
    this.hub.db
      .prepare(
        "UPDATE hub_approval_operations SET state='completed',result=? WHERE id=?",
      )
      .run(JSON.stringify(result), input.operationId);
    return result;
  }
}
