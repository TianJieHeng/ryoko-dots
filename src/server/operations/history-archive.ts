import { DatabaseSync } from 'node:sqlite';
import { lstatSync } from 'node:fs';
import { dirname, isAbsolute, parse } from 'node:path';

function bounded(value: string) {
  if (!value || value.length > 256 || value.includes('\0'))
    throw new Error('Invalid history selector.');
}
function window(offset: number, limit: number) {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new Error('Invalid history window.');
}

/** Server-owned immutable archive path only. Never constructs a runtime session. */
export class LegacyHistoryReader {
  private readonly db: DatabaseSync;
  constructor(path: string, ownerId: string) {
    bounded(ownerId);
    if (!isAbsolute(path))
      throw new Error('History archive path must be absolute.');
    for (
      let component = path;
      component !== parse(component).root;
      component = dirname(component)
    )
      if (lstatSync(component).isSymbolicLink())
        throw new Error('Unsafe history archive path.');
    const file = lstatSync(path);
    if (!file.isFile() || file.nlink !== 1)
      throw new Error('Unsafe history archive file.');
    this.db = new DatabaseSync(path, { readOnly: true });
    try {
      this.db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
      const row = this.db
        .prepare('SELECT format,owner FROM history_meta WHERE id=1')
        .get();
      if (row?.format !== 'dots-inert-history-v1' || row.owner !== ownerId)
        throw new Error('History archive owner or format mismatch.');
    } catch {
      this.db.close();
      throw new Error('History archive is unavailable for this owner.');
    }
  }
  sources(assertOwner: () => void) {
    assertOwner();
    const rows = this.db
      .prepare(
        `SELECT DISTINCT source FROM history_conversations c
      WHERE NOT EXISTS(SELECT 1 FROM history_tombstones t WHERE t.id=c.id) ORDER BY source LIMIT 101`,
      )
      .all();
    assertOwner();
    return {
      sources: rows.slice(0, 100).map((row) => String(row.source)),
      truncated: rows.length > 100,
      provenance: 'imported-archive' as const,
      readOnly: true as const,
      sourceCompleteness: 'not-certified' as const,
    };
  }
  list(source: string, assertOwner: () => void, offset = 0, limit = 100) {
    assertOwner();
    bounded(source);
    window(offset, limit);
    const rows = this.db
      .prepare(
        `SELECT id,source,legacyId,title,createdAt,originalDigest
      FROM history_conversations c WHERE source=? AND NOT EXISTS(SELECT 1 FROM history_tombstones t WHERE t.id=c.id)
      ORDER BY createdAt,id LIMIT ? OFFSET ?`,
      )
      .all(source, limit + 1, offset);
    assertOwner();
    return {
      conversations: rows.slice(0, limit),
      nextOffset: rows.length > limit ? offset + limit : null,
      provenance: 'imported-archive' as const,
      readOnly: true,
      sourceCompleteness: 'not-certified' as const,
    };
  }
  read(
    source: string,
    legacyId: string,
    assertOwner: () => void,
    offset = 0,
    limit = 100,
  ) {
    assertOwner();
    bounded(source);
    bounded(legacyId);
    window(offset, limit);
    this.db.exec('BEGIN');
    try {
      const conversation = this.db
        .prepare(
          `SELECT id,source,legacyId,title,createdAt,originalDigest FROM history_conversations c
        WHERE source=? AND legacyId=? AND NOT EXISTS(SELECT 1 FROM history_tombstones t WHERE t.id=c.id)`,
        )
        .get(source, legacyId);
      if (!conversation)
        throw new Error('Historical conversation is unavailable.');
      const rows = this.db
        .prepare(
          `SELECT id,legacyId,ordinal,role,text,createdAt FROM history_messages
        WHERE conversationId=? AND role IN ('user','assistant') ORDER BY ordinal LIMIT ? OFFSET ?`,
        )
        .all(conversation.id, limit + 1, offset);
      const omitted = this.db
        .prepare(
          "SELECT count(*) AS count FROM history_messages WHERE conversationId=? AND role NOT IN ('user','assistant')",
        )
        .get(conversation.id);
      assertOwner();
      return {
        conversation,
        messages: rows.slice(0, limit),
        nextOffset: rows.length > limit ? offset + limit : null,
        omittedNonDisplayRecords: Number(omitted?.count ?? 0),
        provenance: 'imported-archive' as const,
        readOnly: true,
        executable: false,
        trustedAsInstructions: false,
      };
    } finally {
      this.db.exec('ROLLBACK');
    }
  }
  close() {
    this.db.close();
  }
}
