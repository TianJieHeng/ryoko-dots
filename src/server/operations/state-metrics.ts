import type { DatabaseSync } from 'node:sqlite';
import { statfsSync } from 'node:fs';
/** Read-only local ledger gauges. These are current unresolved records, not
 * global provider queues or proof that a pending approval is stuck. */
export function stateMetrics(db: DatabaseSync, stateDirectory: string) {
  const known = new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name),
  );
  const count = (table: string, predicate: string) =>
    known.has(table)
      ? Number(
          db
            .prepare(`SELECT count(*) AS n FROM ${table} WHERE ${predicate}`)
            .get()?.n ?? 0,
        )
      : 0;
  const disk = statfsSync(stateDirectory);
  return {
    storage_free_bytes: Math.min(
      Number.MAX_SAFE_INTEGER,
      disk.bavail * disk.bsize,
    ),
    queue_depth: count('runtime_command_ingress', "state != 'terminal'"),
    command_unknown: count(
      'runtime_command_ingress',
      "state='outcome_unknown'",
    ),
    control_unresolved: count(
      'runtime_control_ingress',
      "state IN ('pending','outcome_unknown')",
    ),
    effect_unknown: count('runtime_computer_owner_actions', "state='unknown'"),
    delivery_unknown:
      count(
        'runtime_browser_delivery_receipts',
        "state IN ('pending','outcome_unknown')",
      ) + count('dots_slack_outbox', "state='unknown'"),
    slack_queue_depth:
      count(
        'dots_slack_events',
        "state IN ('queued','preparing','dispatching')",
      ) + count('dots_slack_outbox', "state IN ('queued','sending')"),
    voice_unknown: count('runtime_voice_operations', "state='unknown'"),
    schedule_unknown: count(
      'runtime_schedule_ingress',
      "state='outcome_unknown'",
    ),
  };
}
