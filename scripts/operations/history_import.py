#!/usr/bin/env python3
"""Owner-pinned, read-only historical conversations. Never executable authority.
Input is reviewed normalized history v1, not an invented Intelligence API shape.
Original export bytes are required and their digest is checked before staging.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
from safe_state import SafetyError, canonical, digest, read_bytes, secure_path, write_private
from legacy_inventory import stable_id

MAX_EXPORT = 32 * 1024 ** 2
ROLES = {'user', 'assistant', 'system', 'tool', 'unknown'}


def bounded(value, maximum=256):
    if not isinstance(value, str) or not value or len(value) > maximum or '\x00' in value:
        raise SafetyError('invalid bounded text')
    return value


def validate_export(path, original, owner, namespace):
    bounded(owner)
    bounded(namespace)
    raw = read_bytes(path, MAX_EXPORT)
    value = json.loads(raw)
    keys = {'version', 'kind', 'ownerId', 'sourceNamespace', 'sourceSystem', 'sourceExportSha256', 'sourceDeclaredComplete', 'conversationCount', 'messageCount', 'conversations'}
    if not isinstance(value, dict) or set(value) != keys or value['version'] != 1 or value['kind'] != 'dots-inert-history-v1':
        raise SafetyError('unsupported history envelope')
    if value['ownerId'] != owner or value['sourceNamespace'] != namespace:
        raise SafetyError('operator owner/source pin mismatch')
    bounded(value['sourceSystem'], 64)
    if type(value['sourceDeclaredComplete']) is not bool:
        raise SafetyError('explicit completeness declaration required')
    if value['sourceExportSha256'] != digest(original)[0]:
        raise SafetyError('original source export digest mismatch')
    conversations = value['conversations']
    if not isinstance(conversations, list) or len(conversations) > 10000:
        raise SafetyError('conversation bound exceeded')
    conversation_ids, message_ids, count = set(), set(), 0
    for c in conversations:
        if not isinstance(c, dict) or set(c) != {'legacyId', 'title', 'createdAt', 'messages'}:
            raise SafetyError('invalid historical conversation')
        bounded(c['legacyId'])
        bounded(c['title'], 500)
        if c['legacyId'] in conversation_ids or type(c['createdAt']) is not int or c['createdAt'] < 0:
            raise SafetyError('duplicate historical conversation or invalid timestamp')
        conversation_ids.add(c['legacyId'])
        if not isinstance(c['messages'], list) or len(c['messages']) > 100000:
            raise SafetyError('message bound exceeded')
        for m in c['messages']:
            if not isinstance(m, dict) or set(m) != {'legacyId', 'role', 'text', 'createdAt'}:
                raise SafetyError('invalid historical message')
            bounded(m['legacyId'])
            key = (c['legacyId'], m['legacyId'])
            if key in message_ids or m['role'] not in ROLES or not isinstance(m['text'], str) or len(m['text']) > 262144 or type(m['createdAt']) is not int or m['createdAt'] < 0:
                raise SafetyError('duplicate or invalid historical message')
            message_ids.add(key)
            count += 1
            if count > 100000:
                raise SafetyError('total message bound exceeded')
    if type(value['conversationCount']) is not int or type(value['messageCount']) is not int or value['conversationCount'] != len(conversations) or value['messageCount'] != count:
        raise SafetyError('declared count mismatch')
    return value, hashlib.sha256(raw).hexdigest()


def open_archive(path, owner, *, readonly=False):
    path = Path(os.path.abspath(path))
    secure_path(path.parent, directory=True, private=True)
    exists = path.exists()
    if exists:
        secure_path(path, private=True)
        check = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
        try:
            if check.execute('SELECT format,owner FROM history_meta WHERE id=1').fetchone() != ('dots-inert-history-v1', owner):
                raise SafetyError('archive owner or format mismatch')
        finally:
            check.close()
    elif readonly:
        raise SafetyError('history archive is missing')
    else:
        write_private(path, b'')
    if readonly:
        db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
        db.execute('PRAGMA query_only=ON')
    else:
        db = sqlite3.connect(path)
        db.executescript('''PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
          CREATE TABLE IF NOT EXISTS history_meta(id INTEGER PRIMARY KEY CHECK(id=1),format TEXT NOT NULL,owner TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS history_imports(source TEXT NOT NULL,digest TEXT NOT NULL,originalDigest TEXT NOT NULL,system TEXT NOT NULL,declaredComplete INTEGER NOT NULL,cursor INTEGER NOT NULL DEFAULT 0,complete INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(source,digest));
          CREATE TABLE IF NOT EXISTS history_conversations(id TEXT PRIMARY KEY,source TEXT NOT NULL,legacyId TEXT NOT NULL,digest TEXT NOT NULL,title TEXT NOT NULL,createdAt INTEGER NOT NULL,originalDigest TEXT NOT NULL,executable INTEGER NOT NULL DEFAULT 0 CHECK(executable=0),UNIQUE(source,legacyId));
          CREATE TABLE IF NOT EXISTS history_messages(id TEXT PRIMARY KEY,conversationId TEXT NOT NULL,legacyId TEXT NOT NULL,ordinal INTEGER NOT NULL,role TEXT NOT NULL,text TEXT NOT NULL,createdAt INTEGER NOT NULL,digest TEXT NOT NULL,UNIQUE(conversationId,legacyId),UNIQUE(conversationId,ordinal));
          CREATE TABLE IF NOT EXISTS history_quarantine(id TEXT NOT NULL,incomingDigest TEXT NOT NULL,existingDigest TEXT NOT NULL,sourceDigest TEXT NOT NULL,evidence BLOB NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(id,incomingDigest));
          CREATE TABLE IF NOT EXISTS history_tombstones(id TEXT PRIMARY KEY,reason TEXT NOT NULL);
        ''')
        with db:
            db.execute('INSERT OR IGNORE INTO history_meta VALUES(1,?,?)', ('dots-inert-history-v1', owner))
    db.execute('PRAGMA trusted_schema=OFF')
    return db


def import_history(path, original, archive, owner, namespace, batch_size=50, max_batches=None):
    value, export_digest = validate_export(path, original, owner, namespace)
    if Path(archive).absolute() in (Path(path).absolute(), Path(original).absolute()):
        raise SafetyError('archive cannot overwrite source')
    if not 1 <= batch_size <= 500 or max_batches is not None and max_batches < 1:
        raise SafetyError('invalid batch bound')
    db = open_archive(archive, owner)
    try:
        with db:
            db.execute('INSERT OR IGNORE INTO history_imports(source,digest,originalDigest,system,declaredComplete) VALUES(?,?,?,?,?)', (namespace, export_digest, value['sourceExportSha256'], value['sourceSystem'], int(value['sourceDeclaredComplete'])))
        cursor, complete = db.execute('SELECT cursor,complete FROM history_imports WHERE source=? AND digest=?', (namespace, export_digest)).fetchone()
        batches = 0
        while cursor < len(value['conversations']) and (max_batches is None or batches < max_batches):
            batch = value['conversations'][cursor:cursor + batch_size]
            with db:
                for c in batch:
                    cid = stable_id(namespace, 'history-conversation', [c['legacyId']])
                    evidence = canonical(c)
                    h = hashlib.sha256(evidence).hexdigest()
                    previous = db.execute('SELECT digest FROM history_conversations WHERE id=?', (cid,)).fetchone()
                    tombstoned = db.execute('SELECT 1 FROM history_tombstones WHERE id=?', (cid,)).fetchone()
                    if tombstoned or previous and previous[0] != h:
                        db.execute('INSERT OR IGNORE INTO history_quarantine VALUES(?,?,?,?,?,?)', (cid, h, previous[0] if previous else '', export_digest, b'{}' if tombstoned else evidence, 'tombstoned' if tombstoned else 'stable-id-content-conflict'))
                        continue
                    if previous:
                        continue
                    db.execute('INSERT INTO history_conversations(id,source,legacyId,digest,title,createdAt,originalDigest) VALUES(?,?,?,?,?,?,?)', (cid, namespace, c['legacyId'], h, c['title'], c['createdAt'], value['sourceExportSha256']))
                    for ordinal, m in enumerate(c['messages']):
                        mid = stable_id(namespace, 'history-message', [c['legacyId'], m['legacyId']])
                        db.execute('INSERT INTO history_messages VALUES(?,?,?,?,?,?,?,?)', (mid, cid, m['legacyId'], ordinal, m['role'], m['text'], m['createdAt'], hashlib.sha256(canonical(m)).hexdigest()))
                cursor += len(batch)
                db.execute('UPDATE history_imports SET cursor=?,complete=? WHERE source=? AND digest=?', (cursor, int(cursor == len(value['conversations'])), namespace, export_digest))
            batches += 1
        if not value['conversations']:
            with db:
                db.execute('UPDATE history_imports SET complete=1 WHERE source=? AND digest=?', (namespace, export_digest))
        complete = bool(db.execute('SELECT complete FROM history_imports WHERE source=? AND digest=?', (namespace, export_digest)).fetchone()[0])
        conflicts = db.execute('SELECT count(*) FROM history_quarantine WHERE sourceDigest=?', (export_digest,)).fetchone()[0]
        return {'archiveImportComplete': complete and not conflicts, 'sourceRowsStaged': complete, 'quarantinedConversations': conflicts, 'processedConversations': cursor, 'sourceDeclaredComplete': value['sourceDeclaredComplete'], 'fullMigrationComplete': False, 'canonicalExecutionHistory': False, 'effectsDispatched': 0}
    finally:
        db.close()


def inspect_history(archive, owner, namespace, legacy_id, offset=0, limit=100):
    bounded(owner)
    bounded(namespace)
    bounded(legacy_id)
    if not isinstance(offset, int) or not isinstance(limit, int) or offset < 0 or not 1 <= limit <= 100:
        raise SafetyError('invalid read window')
    db = open_archive(archive, owner, readonly=True)
    db.row_factory = sqlite3.Row
    try:
        cid = stable_id(namespace, 'history-conversation', [legacy_id])
        if db.execute('SELECT 1 FROM history_tombstones WHERE id=?', (cid,)).fetchone():
            raise SafetyError('historical conversation was tombstoned')
        c = db.execute('SELECT id,source,legacyId,title,createdAt,originalDigest FROM history_conversations WHERE id=?', (cid,)).fetchone()
        if c is None:
            raise SafetyError('historical conversation not found')
        records = db.execute("SELECT id,legacyId,ordinal,role,text,createdAt FROM history_messages WHERE conversationId=? AND role IN ('user','assistant') ORDER BY ordinal LIMIT ? OFFSET ?", (cid, limit + 1, offset)).fetchall()
        omitted = db.execute("SELECT count(*) FROM history_messages WHERE conversationId=? AND role NOT IN ('user','assistant')", (cid,)).fetchone()[0]
        return {'conversation': dict(c), 'messages': [dict(r) for r in records[:limit]], 'nextOffset': offset + limit if len(records) > limit else None, 'omittedNonDisplayRecords': omitted, 'readOnly': True, 'trustedAsInstructions': False, 'executable': False, 'provenance': 'imported-archive'}
    finally:
        db.close()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('action', choices=['import', 'inspect'])
    p.add_argument('--archive', required=True)
    p.add_argument('--owner', required=True)
    p.add_argument('--namespace', required=True)
    p.add_argument('--normalized-export')
    p.add_argument('--original-export')
    p.add_argument('--legacy-id')
    p.add_argument('--batch-size', type=int, default=50)
    p.add_argument('--max-batches', type=int)
    p.add_argument('--offset', type=int, default=0)
    a = p.parse_args()
    try:
        if a.action == 'import':
            if not a.normalized_export or not a.original_export:
                p.error('import requires --normalized-export and --original-export')
            result = import_history(a.normalized_export, a.original_export, a.archive, a.owner, a.namespace, a.batch_size, a.max_batches)
        else:
            if not a.legacy_id:
                p.error('inspect requires --legacy-id')
            result = inspect_history(a.archive, a.owner, a.namespace, a.legacy_id, a.offset)
        print(json.dumps(result, sort_keys=True))
    except (OSError, SafetyError, sqlite3.Error, ValueError, TypeError, KeyError):
        print(json.dumps({'ok': False, 'error': 'history archive action rejected'}), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
