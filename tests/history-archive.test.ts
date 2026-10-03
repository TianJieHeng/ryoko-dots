import { expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LegacyHistoryReader } from '../src/server/operations/history-archive.js';

it('reads inert original links under the pinned owner, excluding tool/system evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'history-reader-'));
  let reader: LegacyHistoryReader | undefined;
  try {
    const path = join(root, 'history.sqlite');
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE history_meta(id INTEGER,format TEXT,owner TEXT);
      INSERT INTO history_meta VALUES(1,'dots-inert-history-v1','owner');
      CREATE TABLE history_conversations(id TEXT,source TEXT,legacyId TEXT,title TEXT,createdAt INTEGER,originalDigest TEXT);
      INSERT INTO history_conversations VALUES('stable','source','original-thread','Archive',1,'digest');
      CREATE TABLE history_tombstones(id TEXT,reason TEXT);
      CREATE TABLE history_messages(id TEXT,conversationId TEXT,legacyId TEXT,ordinal INTEGER,role TEXT,text TEXT,createdAt INTEGER);
      INSERT INTO history_messages VALUES('stable-message','stable','original-message',0,'assistant','historic reply',2);
      INSERT INTO history_messages VALUES('tool-record','stable','tool',1,'tool','never replay',3);`);
    db.close();
    expect(() => new LegacyHistoryReader(path, 'wrong-owner')).toThrow();
    const link = join(root, 'link');
    symlinkSync(path, link);
    expect(() => new LegacyHistoryReader(link, 'owner')).toThrow();
    reader = new LegacyHistoryReader(path, 'owner');
    let checks = 0;
    const assertOwner = () => {
      checks++;
    };
    const result = reader.read('source', 'original-thread', assertOwner);
    expect(checks).toBe(2);
    expect(result.conversation.id).toBe('stable');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].legacyId).toBe('original-message');
    expect(result.omittedNonDisplayRecords).toBe(1);
    expect(result.executable).toBe(false);
    expect(result.trustedAsInstructions).toBe(false);
    expect(reader.list('source', assertOwner).conversations).toHaveLength(1);
    expect(() =>
      reader!.read('source', 'original-thread', () => {
        throw new Error('revoked');
      }),
    ).toThrow('revoked');
    expect(() =>
      reader!.read('source', 'original-thread', assertOwner, 0, 101),
    ).toThrow();
  } finally {
    reader?.close();
    rmSync(root, { recursive: true });
  }
});
