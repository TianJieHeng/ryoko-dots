import type { DatabaseSync } from 'node:sqlite';
/** Global operation namespace. Call claim inside the owning admission transaction. */
export function initializeOperationRegistry(
  db: DatabaseSync,
  family: 'conversation' | 'command' | 'control' | 'page',
) {
  const [table, authority] =
    family === 'conversation'
      ? ['conversation_operations', 'binding']
      : family === 'command'
        ? ['runtime_command_ingress', 'authority']
        : family === 'control'
          ? ['runtime_control_ingress', 'authority']
          : ['runtime_page_ingress', 'authority'];
  db.exec(
    `CREATE TABLE IF NOT EXISTS runtime_operation_registry(operationId TEXT PRIMARY KEY,ownerId TEXT NOT NULL,family TEXT NOT NULL,digest TEXT NOT NULL,authority TEXT NOT NULL)`,
  );
  db.exec('BEGIN IMMEDIATE');
  try {
    const conflict = db
      .prepare(
        `SELECT 1 FROM ${table} AS source JOIN runtime_operation_registry AS registry USING(operationId) WHERE registry.ownerId!=source.ownerId OR registry.family!=? OR registry.digest!=source.digest OR registry.authority!=source.${authority} LIMIT 1`,
      )
      .get(family);
    if (conflict)
      throw new Error(
        'Existing operation namespace conflicts; migration requires reconciliation.',
      );
    db.prepare(
      `INSERT OR IGNORE INTO runtime_operation_registry SELECT operationId,ownerId,?,digest,${authority} FROM ${table}`,
    ).run(family);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export function claimOperation(
  db: DatabaseSync,
  operationId: string,
  ownerId: string,
  family: 'conversation' | 'command' | 'control' | 'page',
  digest: string,
  authority: string,
) {
  const row = db
    .prepare('SELECT * FROM runtime_operation_registry WHERE operationId=?')
    .get(operationId);
  if (
    row &&
    (row.ownerId !== ownerId ||
      row.family !== family ||
      row.digest !== digest ||
      row.authority !== authority)
  )
    return false;
  if (!row)
    db.prepare('INSERT INTO runtime_operation_registry VALUES(?,?,?,?,?)').run(
      operationId,
      ownerId,
      family,
      digest,
      authority,
    );
  return true;
}
