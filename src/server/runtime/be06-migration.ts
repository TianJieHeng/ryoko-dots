import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { be06Digest, Be06Error, canonicalBe06 } from './be06-service.js';
export interface LegacyEnrollment {
  kind: 'dot' | 'conversation';
  id: string;
  dotId: string;
  legacyContainerId: string | null;
  /** Conversation enrollment never had a delivery flag. Do not infer it from current Dot settings. */
  legacySkillDeliveryEnabled: boolean | null;
}
/** Read only metadata, never memory bodies or transcript content. No enrollment authority is created. */
export function inventoryLegacyEnrollment(
  db: DatabaseSync,
  ownerId: string,
): LegacyEnrollment[] {
  const columns = (table: string) =>
    new Set(
      db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => String(row.name)),
    );
  const dots = columns('dots'),
    threads = columns('thread_bindings');
  const dotRows = dots.size
    ? db
        .prepare(
          `SELECT id,${dots.has('learningContainerId') ? 'learningContainerId' : 'NULL AS learningContainerId'},${dots.has('skillDeliveryEnabled') ? 'skillDeliveryEnabled' : '0 AS skillDeliveryEnabled'} FROM dots ORDER BY id`,
        )
        .all()
    : [];
  const threadRows = threads.size
    ? db
        .prepare(
          `SELECT id,dotId,${threads.has('learningContainerId') ? 'learningContainerId' : 'NULL AS learningContainerId'} FROM thread_bindings WHERE ownerId=? ORDER BY id`,
        )
        .all(ownerId)
    : [];
  return [
    ...dotRows.map((row) => ({
      kind: 'dot' as const,
      id: String(row.id),
      dotId: String(row.id),
      legacyContainerId:
        row.learningContainerId === null
          ? null
          : String(row.learningContainerId),
      legacySkillDeliveryEnabled: !!row.skillDeliveryEnabled,
    })),
    ...threadRows.map((row) => ({
      kind: 'conversation' as const,
      id: String(row.id),
      dotId: String(row.dotId),
      legacyContainerId:
        row.learningContainerId === null
          ? null
          : String(row.learningContainerId),
      legacySkillDeliveryEnabled: null,
    })),
  ];
}
/** Freeze once into the new adapter DB; later live settings cannot rewrite migration evidence. */
export function freezeLegacyEnrollment(
  db: DatabaseSync,
  ownerId: string,
  rows: LegacyEnrollment[],
) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS runtime_legacy_learning_inventory(ownerId TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,evidence TEXT NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(ownerId,kind,id))',
  );
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of rows) {
      const evidence = canonicalBe06(row);
      db.prepare(
        'INSERT OR IGNORE INTO runtime_legacy_learning_inventory VALUES(?,?,?,?,?)',
      ).run(ownerId, row.kind, row.id, evidence, be06Digest(row));
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return db
    .prepare(
      'SELECT evidence,digest FROM runtime_legacy_learning_inventory WHERE ownerId=? ORDER BY kind,id',
    )
    .all(ownerId)
    .map((row) => ({
      evidence: JSON.parse(String(row.evidence)) as LegacyEnrollment,
      digest: String(row.digest),
      migrationState: 'review_required' as const,
      enrollmentAuthorized: false as const,
    }));
}
/** Explicit replacement for the legacy global injector in a self-hosted composition. */
export function legacyPreferenceInjection(): never {
  throw new Be06Error('legacy_global_preference_injection_disabled', 503);
}

/** Inventory references only: never duplicate private memory content or enroll it into an agent. */
export function frozenLegacyMemoryInventory(
  db: DatabaseSync,
  ownerId: string,
  offset = 0,
  limit = 20,
) {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 20
  )
    throw new Be06Error('invalid_legacy_inventory_page', 400);
  db.exec(`CREATE TABLE IF NOT EXISTS runtime_legacy_memory_inventory(ownerId TEXT NOT NULL,recordId TEXT NOT NULL,contentDigest TEXT NOT NULL,byteCount INTEGER NOT NULL,createdAt INTEGER NOT NULL,PRIMARY KEY(ownerId,recordId));
    CREATE TABLE IF NOT EXISTS runtime_legacy_memory_snapshot(ownerId TEXT PRIMARY KEY,sourceCount INTEGER NOT NULL);`);
  const exists = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='memories'",
    )
    .get();
  if (
    exists &&
    !db
      .prepare('SELECT 1 FROM runtime_legacy_memory_snapshot WHERE ownerId=?')
      .get(ownerId)
  ) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const count = Number(
        db.prepare('SELECT count(*) n FROM memories').get()?.n ?? 0,
      );
      for (const row of db
        .prepare(
          'SELECT id,text,createdAt FROM memories ORDER BY id LIMIT 10000',
        )
        .iterate()) {
        const text = String(row.text);
        db.prepare(
          'INSERT INTO runtime_legacy_memory_inventory VALUES(?,?,?,?,?)',
        ).run(
          ownerId,
          String(row.id),
          createHash('sha256').update(text).digest('hex'),
          Buffer.byteLength(text),
          Number(row.createdAt),
        );
      }
      db.prepare('INSERT INTO runtime_legacy_memory_snapshot VALUES(?,?)').run(
        ownerId,
        count,
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  const sourceCount = Number(
    db
      .prepare(
        'SELECT sourceCount FROM runtime_legacy_memory_snapshot WHERE ownerId=?',
      )
      .get(ownerId)?.sourceCount ?? 0,
  );
  const rows = db
    .prepare(
      'SELECT * FROM runtime_legacy_memory_inventory WHERE ownerId=? ORDER BY recordId LIMIT ? OFFSET ?',
    )
    .all(ownerId, limit, offset);
  const records = rows.map((row) => {
    const source = exists
      ? db
          .prepare('SELECT text FROM memories WHERE id=?')
          .get(String(row.recordId))
      : undefined;
    const text = source ? String(source.text) : null;
    const current =
      text !== null &&
      createHash('sha256').update(text).digest('hex') === row.contentDigest;
    return {
      id: String(row.recordId),
      sourceRef: `legacy-memory:${String(row.recordId)}`,
      contentDigest: String(row.contentDigest),
      byteCount: Number(row.byteCount),
      createdAt: Number(row.createdAt),
      content: current && Number(row.byteCount) <= 32768 ? text : null,
      unavailableReason: !current
        ? 'source_changed_or_removed'
        : Number(row.byteCount) > 32768
          ? 'content_exceeds_review_bound'
          : null,
      migrationState: 'review_required' as const,
      enrollmentAuthorized: false as const,
    };
  });
  const nextOffset = offset + records.length;
  return {
    records,
    offset,
    nextOffset,
    hasMore: nextOffset < Math.min(sourceCount, 10000),
    sourceCount,
    inventoryComplete: sourceCount <= 10000,
    personalHarnessDestinationSupported: false as const,
  };
}
