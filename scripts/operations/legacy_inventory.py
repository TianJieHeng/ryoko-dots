#!/usr/bin/env python3
"""Read-only legacy inventory and resumable inert archive staging.
This deliberately does NOT implement canonical history admission: no qualified
producer history-import contract exists in the inspected generated surface.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
from safe_state import SafetyError, canonical, digest, read_bytes, secure_path, write_private

# Preserve source rows as migration evidence, NEVER pass them to live services.
# Auth cookies, token hashes and unrelated runtime security tables are excluded.
TABLE_KEYS = {
    'settings': ['id'], 'memories': ['id'], 'tasks': ['id'], 'runs': ['id'],
    'events': ['id'], 'spaces': ['id'], 'dots': ['id'],
    'thread_bindings': ['id'], 'task_threads': ['taskId'],
    'calls': ['id'], 'captures': ['threadId'], 'dot_spaces': ['dotId', 'spaceId'],
    'pages': ['id'], 'page_threads': ['pageId', 'dotId'],
    'page_reviews': ['threadId', 'toolCallId'],
    'computer_permissions': ['dotId'], 'computer_audit': ['id'],
    'runtime_page_versions': ['pageId', 'revision'],
    'runtime_page_lineage': ['pageId', 'revision'],
}
MAX_ROWS = 1_000_000
MAX_ROW_BYTES = 2_000_000


def readonly_db(source):
    p = secure_path(source)
    # immutable=1 is read-only even to WAL/SHM. It would miss WAL content, so
    # refuse uncheckpointed input. Run against normalized snapshot for live WAL.
    for suffix in ('-wal', '-journal'):
        side = Path(str(p) + suffix)
        if side.is_symlink() or side.exists() and side.stat().st_size:
            raise SafetyError('inventory requires normalized offline snapshot; pending journal present')
    db = sqlite3.connect(p.as_uri() + '?mode=ro&immutable=1', uri=True)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    db.execute('PRAGMA trusted_schema=OFF')
    if [tuple(r) for r in db.execute('PRAGMA integrity_check')] != [('ok',)]:
        db.close()
        raise SafetyError('source SQLite integrity failed')
    return p, db


def json_cell(value):
    return {'encoding': 'base64', 'value': base64.b64encode(value).decode()} if isinstance(value, bytes) else value


def stable_id(source_namespace, table, source_key):
    return 'legacy_' + hashlib.sha256(canonical([source_namespace, table, source_key])).hexdigest()


def rows(db, namespace):
    tables = {r['name'] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    count = 0
    for table, keys in TABLE_KEYS.items():
        if table not in tables:
            continue
        columns = {r['name'] for r in db.execute(f'PRAGMA table_info("{table}")')}
        if not set(keys) <= columns:
            raise SafetyError('legacy schema lacks stable primary key')
        order = ','.join('"' + k + '"' for k in keys)
        for row in db.execute(f'SELECT * FROM "{table}" ORDER BY {order}'):
            count += 1
            if count > MAX_ROWS:
                raise SafetyError('legacy row bound exceeded')
            value = {k: json_cell(row[k]) for k in row.keys()}
            data = canonical(value)
            if len(data) > MAX_ROW_BYTES:
                raise SafetyError('legacy row bound exceeded')
            key = [value[k] for k in keys]
            if any(k is None for k in key):
                raise SafetyError('legacy primary key is null')
            yield table, stable_id(namespace, table, key), hashlib.sha256(data).hexdigest(), data


def inventory(source, namespace):
    if not isinstance(namespace, str) or not 1 <= len(namespace) <= 256:
        raise SafetyError('stable operator source namespace required')
    path, db = readonly_db(source)
    before = digest(path)
    try:
        counts, digests = {}, {}
        for table, sid, h, _ in rows(db, namespace):
            counts[table] = counts.get(table, 0) + 1
            digests.setdefault(table, hashlib.sha256()).update(canonical([sid, h]))
        known = set(TABLE_KEYS)
        all_tables = {r['name'] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
        result = {
            'version': 1, 'sourceNamespace': namespace, 'sourceSha256': before[0],
            'counts': counts, 'digests': {k: v.hexdigest() for k, v in digests.items()},
            'notInventoriedTables': sorted(all_tables - known),
            'intelligenceHistory': {'state': 'unavailable', 'complete': False, 'reason': 'No authorized managed history export was supplied or fetched. SQLite mappings are not conversations.'},
            'canonicalImport': {'state': 'unsupported', 'complete': False, 'reason': 'No qualified inert canonical history-import adapter is wired.'},
            'fullMigrationComplete': False,
            'policy': {'historyReplay': False, 'memoryFanout': False, 'learningEnrollment': False, 'schedulesActivated': False, 'computerCredentialsCopied': False},
        }
        if before != digest(path):
            raise SafetyError('source changed during inventory')
        return result
    finally:
        db.close()


def stage_archive(source, namespace, destination, batch_size=100, max_batches=None):
    """Resumable deterministic inert archive. Batch cursor commits with rows.
    Different bytes at same stable ID become durable quarantine, never overwrite.
    No payload is interpreted, scheduled, approved or executed.
    """
    report = inventory(source, namespace)
    destination = Path(os.path.abspath(destination))
    secure_path(destination.parent, directory=True, private=True)
    if destination == Path(source).absolute():
        raise SafetyError('archive cannot be source')
    if not 1 <= batch_size <= 1000 or max_batches is not None and max_batches < 1:
        raise SafetyError('invalid batch limit')
    if not destination.exists():
        write_private(destination, b'')
    else:
        secure_path(destination, private=True)
        check = sqlite3.connect(destination.as_uri() + '?mode=ro', uri=True)
        try:
            if check.execute('SELECT format FROM archive_meta WHERE id=1').fetchone() != ('dots-inert-archive-v1',):
                raise SafetyError('destination is not an inert migration archive')
        finally:
            check.close()
    secure_path(destination, private=True)
    archive = sqlite3.connect(destination)
    archive.executescript('''PRAGMA journal_mode=DELETE;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS archive_meta(id INTEGER PRIMARY KEY CHECK(id=1), format TEXT NOT NULL);
      INSERT OR IGNORE INTO archive_meta VALUES(1,'dots-inert-archive-v1');
      CREATE TABLE IF NOT EXISTS imports(source TEXT NOT NULL, digest TEXT NOT NULL, cursor INTEGER NOT NULL, complete INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(source,digest));
      CREATE TABLE IF NOT EXISTS archived_records(id TEXT PRIMARY KEY, source TEXT NOT NULL, family TEXT NOT NULL, digest TEXT NOT NULL, payload BLOB NOT NULL, executable INTEGER NOT NULL DEFAULT 0 CHECK(executable=0));
      CREATE TABLE IF NOT EXISTS quarantine(id TEXT NOT NULL, source TEXT NOT NULL, sourceDigest TEXT NOT NULL, existingDigest TEXT NOT NULL, incomingDigest TEXT NOT NULL, payload BLOB NOT NULL, reason TEXT NOT NULL, PRIMARY KEY(id,incomingDigest));
      CREATE TABLE IF NOT EXISTS migration_tombstones(id TEXT PRIMARY KEY, reason TEXT NOT NULL);
    ''')
    if archive.execute('SELECT format FROM archive_meta WHERE id=1').fetchone() != ('dots-inert-archive-v1',):
        archive.close()
        raise SafetyError('unsupported archive format')
    source_digest = report['sourceSha256']
    with archive:
        archive.execute('INSERT OR IGNORE INTO imports(source,digest,cursor) VALUES(?,?,0)', (namespace, source_digest))
    cursor, complete = archive.execute('SELECT cursor,complete FROM imports WHERE source=? AND digest=?', (namespace, source_digest)).fetchone()
    _, db = readonly_db(source)
    try:
        batch, processed, batches = [], 0, 0
        def commit(items, end):
            with archive:
                for table, sid, h, data in items:
                    old = archive.execute('SELECT digest FROM archived_records WHERE id=?', (sid,)).fetchone()
                    tombstone = archive.execute('SELECT 1 FROM migration_tombstones WHERE id=?', (sid,)).fetchone()
                    if tombstone or old and old[0] != h:
                        archive.execute('INSERT OR IGNORE INTO quarantine VALUES(?,?,?,?,?,?,?)', (sid, namespace, source_digest, old[0] if old else '', h, b'{}' if tombstone else data, 'tombstoned' if tombstone else 'stable-id-content-conflict'))
                    elif not old:
                        archive.execute('INSERT INTO archived_records(id,source,family,digest,payload) VALUES(?,?,?,?,?)', (sid, namespace, table, h, data))
                archive.execute('UPDATE imports SET cursor=? WHERE source=? AND digest=?', (end, namespace, source_digest))
        for item in rows(db, namespace):
            processed += 1
            if processed <= cursor:
                continue
            batch.append(item)
            if len(batch) == batch_size:
                commit(batch, processed)
                batch = []
                batches += 1
                if max_batches is not None and batches >= max_batches:
                    break
        else:
            if batch:
                commit(batch, processed)
            if digest(Path(source))[0] != source_digest:
                raise SafetyError('source changed during import')
            with archive:
                archive.execute('UPDATE imports SET complete=1 WHERE source=? AND digest=?', (namespace, source_digest))
        cursor, complete = archive.execute('SELECT cursor,complete FROM imports WHERE source=? AND digest=?', (namespace, source_digest)).fetchone()
        return {**report, 'archiveStaging': {'processedRows': cursor, 'sourceFullyStaged': bool(complete), 'totalArchivedRows': archive.execute('SELECT count(*) FROM archived_records').fetchone()[0], 'quarantinedRows': archive.execute('SELECT count(*) FROM quarantine').fetchone()[0]}, 'fullMigrationComplete': False}
    finally:
        db.close()
        archive.close()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('action', choices=['inventory', 'stage-archive'])
    p.add_argument('--source', required=True)
    p.add_argument('--namespace', required=True)
    p.add_argument('--destination')
    p.add_argument('--batch-size', type=int, default=100)
    p.add_argument('--max-batches', type=int)
    a = p.parse_args()
    try:
        if a.action == 'stage-archive':
            if not a.destination:
                p.error('--destination is required for stage-archive')
            result = stage_archive(a.source, a.namespace, a.destination, a.batch_size, a.max_batches)
        else:
            result = inventory(a.source, a.namespace)
        print(json.dumps(result, sort_keys=True))
    except (OSError, SafetyError, sqlite3.Error, ValueError, KeyError):
        print(json.dumps({'ok': False, 'error': 'legacy inventory/import rejected'}), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
