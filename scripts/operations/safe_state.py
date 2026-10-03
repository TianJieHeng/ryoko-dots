#!/usr/bin/env python3
"""Offline-only paired state snapshots. No network, runtime or credential generation.
All state writers MUST use the same lifetime gate; see BE11-operations.md.
"""
from __future__ import annotations
import argparse
import contextlib
import ctypes
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
import tarfile
import tempfile
import time

MAX_FILES = 100_000
MAX_BYTES = 100 * 1024 ** 3
MAX_MANIFEST = 16 * 1024 ** 2


class SafetyError(Exception):
    pass


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()


def relative(value):
    if not isinstance(value, str) or not value or '\\' in value or '\x00' in value:
        raise SafetyError('invalid relative path')
    p = PurePosixPath(value)
    if p.is_absolute() or any(x in ('', '.', '..') for x in value.split('/')):
        raise SafetyError('invalid relative path')
    return value


def secure_path(path, *, directory=False, private=False):
    """Reject every symlink component and hard-linked files, including roots.
    Assumes same-UID processes and root are trusted; root dirs must be protected.
    """
    p = Path(os.path.abspath(path))
    for parent in reversed((p, *p.parents)):
        st = parent.lstat()
        if stat.S_ISLNK(st.st_mode):
            raise SafetyError('symlink is forbidden')
    st = p.lstat()
    if directory != stat.S_ISDIR(st.st_mode):
        raise SafetyError('unexpected file type')
    if not directory and (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1):
        raise SafetyError('regular single-link file required')
    if private and (st.st_uid != os.geteuid() or st.st_mode & 0o077):
        raise SafetyError('owner-only path required')
    return p


def read_bytes(path, maximum=MAX_MANIFEST):
    p = secure_path(path)
    with open(p, 'rb', opener=lambda p, flags: os.open(p, flags | os.O_NOFOLLOW)) as handle:
        before = os.fstat(handle.fileno())
        data = handle.read(maximum + 1)
        after = os.fstat(handle.fileno())
    if len(data) > maximum or stamp(before) != stamp(after):
        raise SafetyError('file exceeds bound or changed during read')
    return data


def stamp(st):
    return st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns


def digest(path):
    p = secure_path(path)
    h = hashlib.sha256()
    with open(p, 'rb', opener=lambda p, flags: os.open(p, flags | os.O_NOFOLLOW)) as handle:
        before = os.fstat(handle.fileno())
        for part in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(part)
        if stamp(before) != stamp(os.fstat(handle.fileno())):
            raise SafetyError('source changed during read')
    return h.hexdigest(), before.st_size


def write_private(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as out:
        out.write(value)
        out.flush()
        os.fsync(out.fileno())


def fsync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def publish_directory(stage, destination):
    """Linux atomic no-replace publication, never overwrite an existing target."""
    lib = ctypes.CDLL(None, use_errno=True)
    rename = getattr(lib, 'renameat2', None)
    if rename is None:
        raise SafetyError('atomic no-replace directory publication requires Linux renameat2')
    result = rename(-100, os.fsencode(stage), -100, os.fsencode(destination), 1)
    if result:
        raise OSError(ctypes.get_errno(), 'atomic publication failed')
    fsync_dir(Path(destination).parent)


@contextlib.contextmanager
def gate(path):
    p = Path(os.path.abspath(path))
    secure_path(p.parent, directory=True, private=True)
    fd = os.open(p, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_mode & 0o077 or st.st_uid != os.geteuid():
            raise SafetyError('unsafe maintenance gate')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SafetyError('state is active or maintenance is already running') from None
        yield fd
    finally:
        os.close(fd)


def load_plan(path):
    plan = json.loads(read_bytes(path))
    if not isinstance(plan, dict) or set(plan) != {'version', 'stateRoot', 'resources', 'pins'} or plan['version'] != 1:
        raise SafetyError('invalid state plan')
    root = secure_path(plan['stateRoot'], directory=True, private=True)
    if not isinstance(plan['pins'], dict) or not plan['pins'] or any(not isinstance(v, str) or len(v) > 256 for v in plan['pins'].values()):
        raise SafetyError('explicit version/config digest pins required')
    resources = plan['resources']
    if not isinstance(resources, list) or not 3 <= len(resources) <= 100:
        raise SafetyError('bounded explicit resource list required')
    seen, roles = [], set()
    for row in resources:
        if not isinstance(row, dict) or set(row) != {'role', 'path', 'kind'}:
            raise SafetyError('invalid resource')
        p = relative(row['path'])
        if p == 'manifest.json' or p.startswith('manifest.json/'):
            raise SafetyError('reserved resource path')
        if row['kind'] not in ('sqlite', 'tree') or not re.fullmatch(r'[a-z][a-z0-9_]{0,63}', row['role']):
            raise SafetyError('invalid resource kind/role')
        if row['role'] in roles or any(p == x or p.startswith(x + '/') or x.startswith(p + '/') for x in seen):
            raise SafetyError('resource overlap or duplicate role')
        seen.append(p)
        roles.add(row['role'])
        secure_path(root / p, directory=row['kind'] == 'tree')
    for role in ('dots_db', 'ryoko_db', 'artifacts'):
        found = next((r for r in resources if r['role'] == role), None)
        if found is None or found['kind'] != ('tree' if role == 'artifacts' else 'sqlite'):
            raise SafetyError('Dots DB, Ryoko DB and artifact tree are required')
    return root, resources, plan['pins']


def tree_entries(root, rel):
    base = secure_path(root / rel, directory=True)
    rows = []
    for current, dirs, files in os.walk(base, followlinks=False):
        for name in sorted(dirs):
            secure_path(Path(current) / name, directory=True)
        for name in sorted(files):
            p = secure_path(Path(current) / name)
            rows.append((p.relative_to(root).as_posix(), stamp(p.stat())))
            if len(rows) > MAX_FILES:
                raise SafetyError('file count exceeds bound')
    return sorted(rows)


def source_snapshot(root, resources):
    rows = []
    for r in resources:
        p = root / r['path']
        if r['kind'] == 'tree':
            rows += tree_entries(root, r['path'])
        else:
            rows.append((r['path'], stamp(secure_path(p).stat())))
            # WAL/SHM copied as bytes only after the supervised writer is stopped.
            # SQLite backup is applied to the isolated copy, never to live state.
            for suffix in ('-wal', '-shm', '-journal'):
                side = Path(str(p) + suffix)
                if side.exists() or side.is_symlink():
                    rows.append((r['path'] + suffix, stamp(secure_path(side).stat())))
    if len(rows) > MAX_FILES or sum(x[1][2] for x in rows) > MAX_BYTES:
        raise SafetyError('snapshot exceeds bound')
    return sorted(rows)


def copy_private(source, target):
    secure_path(source)
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with open(source, 'rb', opener=lambda p, f: os.open(p, f | os.O_NOFOLLOW)) as src:
        before = os.fstat(src.fileno())
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as out:
            shutil.copyfileobj(src, out, 1024 * 1024)
            out.flush()
            os.fsync(out.fileno())
        if stamp(before) != stamp(os.fstat(src.fileno())):
            raise SafetyError('source changed during copy')


def validate_database(path):
    # Snapshot database has no pending WAL; immutable prevents source-side writes.
    connection = sqlite3.connect(path.as_uri() + '?mode=ro&immutable=1', uri=True)
    try:
        connection.execute('PRAGMA trusted_schema=OFF')
        if connection.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise SafetyError('SQLite integrity check failed')
    finally:
        connection.close()


def snapshot(plan_path, gate_path, destination):
    started = time.monotonic()
    destination = Path(os.path.abspath(destination))
    secure_path(destination.parent, directory=True, private=True)
    with gate(gate_path):
        root, resources, pins = load_plan(plan_path)
        if destination == root or root in destination.parents:
            raise SafetyError('backup must be outside state root')
        before = source_snapshot(root, resources)
        stage = Path(tempfile.mkdtemp(prefix='.snapshot-', dir=destination.parent))
        try:
            # Read-only copy of offline WAL set. Recovery/checkpoint happens solely
            # inside this temporary, owner-only directory.
            for rel, _ in before:
                copy_private(root / rel, stage / rel)
            for r in resources:
                if r['kind'] == 'tree':
                    (stage / r['path']).mkdir(parents=True, exist_ok=True, mode=0o700)
                    continue
                db = stage / r['path']
                normalized = db.with_name(db.name + '.normalized')
                if normalized.exists():
                    raise SafetyError('reserved normalization file conflict')
                src = sqlite3.connect(db)
                dst = sqlite3.connect(normalized)
                try:
                    src.execute('PRAGMA trusted_schema=OFF')
                    src.backup(dst)
                    dst.execute('PRAGMA journal_mode=DELETE')
                finally:
                    dst.close()
                    src.close()
                os.chmod(normalized, 0o600)
                validate_database(normalized)
                os.replace(normalized, db)
                for suffix in ('-wal', '-shm', '-journal'):
                    Path(str(db) + suffix).unlink(missing_ok=True)
            if before != source_snapshot(root, resources):
                raise SafetyError('source changed across snapshot; no publication')
            files = []
            for rel, _ in tree_entries(stage, '.'):
                h, size = digest(stage / rel)
                files.append({'path': rel, 'sha256': h, 'bytes': size})
            manifest = {
                'version': 1, 'kind': 'dots-ryoko-offline-state', 'complete': True,
                'consistency': 'exclusive-lifetime-gate-offline',
                'resources': resources, 'pins': pins, 'files': files,
                'createdAtUnix': int(time.time()),
                'elapsedSeconds': round(time.monotonic() - started, 6),
                'intelligenceHistory': 'not-certified-by-sqlite-snapshot',
            }
            write_private(stage / 'manifest.json', canonical(manifest))
            for current, _, names in os.walk(stage, topdown=False):
                for name in names:
                    fd = os.open(Path(current) / name, os.O_RDONLY | os.O_NOFOLLOW)
                    try:
                        os.fsync(fd)
                    finally:
                        os.close(fd)
                fsync_dir(current)
            publish_directory(stage, destination)
            return manifest
        finally:
            if stage.exists():
                shutil.rmtree(stage)


def verify_bundle(bundle):
    root = secure_path(bundle, directory=True, private=True)
    manifest = json.loads(read_bytes(root / 'manifest.json'))
    if not isinstance(manifest, dict) or manifest.get('version') != 1 or manifest.get('kind') != 'dots-ryoko-offline-state' or manifest.get('complete') is not True:
        raise SafetyError('unrecognized/incomplete snapshot')
    files = manifest.get('files')
    if not isinstance(files, list) or len(files) > MAX_FILES:
        raise SafetyError('invalid file list')
    listed, total = set(), 0
    for row in files:
        if not isinstance(row, dict) or set(row) != {'path', 'sha256', 'bytes'}:
            raise SafetyError('invalid manifest entry')
        rel = relative(row['path'])
        if rel == 'manifest.json' or rel in listed or type(row['bytes']) is not int or row['bytes'] < 0 or not isinstance(row['sha256'], str) or not re.fullmatch('[a-f0-9]{64}', row['sha256']):
            raise SafetyError('duplicate/reserved/invalid entry')
        listed.add(rel)
        total += row['bytes']
        if total > MAX_BYTES:
            raise SafetyError('restore exceeds bound')
        h, size = digest(root / rel)
        if (h, size) != (row['sha256'], row['bytes']):
            raise SafetyError('digest/length mismatch')
    actual = {r for r, _ in tree_entries(root, '.')}
    if actual != listed | {'manifest.json'}:
        raise SafetyError('missing or unlisted snapshot files')
    resources = manifest.get('resources')
    if not isinstance(resources, list) or not 3 <= len(resources) <= 100:
        raise SafetyError('invalid resource list')
    roles, paths = set(), []
    for r in resources:
        if not isinstance(r, dict) or set(r) != {'role', 'path', 'kind'} or r['kind'] not in ('sqlite', 'tree'):
            raise SafetyError('invalid restore resource')
        relative(r['path'])
        if r['role'] in roles or any(r['path'] == p or r['path'].startswith(p + '/') or p.startswith(r['path'] + '/') for p in paths):
            raise SafetyError('duplicate/overlapping restore resource')
        paths.append(r['path'])
        roles.add(r['role'])
        secure_path(root / r['path'], directory=r['kind'] == 'tree')
        if r['kind'] == 'sqlite':
            if r['path'] not in listed or any(r['path'] + x in listed for x in ('-wal', '-shm', '-journal')):
                raise SafetyError('un-normalized SQLite snapshot')
            validate_database(root / r['path'])
    if not {'dots_db', 'ryoko_db', 'artifacts'} <= roles:
        raise SafetyError('paired state is incomplete')
    for role in ('dots_db', 'ryoko_db', 'artifacts'):
        resource = next(r for r in resources if r['role'] == role)
        if resource['kind'] != ('tree' if role == 'artifacts' else 'sqlite'):
            raise SafetyError('required resource has invalid kind')
    if manifest.get('consistency') != 'exclusive-lifetime-gate-offline' or not isinstance(manifest.get('pins'), dict) or not manifest['pins']:
        raise SafetyError('snapshot lacks consistency/version provenance')
    if any(not any(rel == r['path'] or r['kind'] == 'tree' and rel.startswith(r['path'] + '/') for r in resources) for rel in listed):
        raise SafetyError('file outside declared resources')
    return root, manifest


def restore(bundle, gate_path, destination):
    """Creates a new generation only; never overwrites active/previous state."""
    started = time.monotonic()
    destination = Path(os.path.abspath(destination))
    secure_path(destination.parent, directory=True, private=True)
    with gate(gate_path):
        source, manifest = verify_bundle(bundle)
        if destination == source or source in destination.parents:
            raise SafetyError('restore cannot be inside snapshot')
        stage = Path(tempfile.mkdtemp(prefix='.restore-', dir=destination.parent))
        try:
            for row in manifest['files']:
                copy_private(source / row['path'], stage / row['path'])
            for r in manifest['resources']:
                if r['kind'] == 'tree':
                    (stage / r['path']).mkdir(parents=True, exist_ok=True, mode=0o700)
            copy_private(source / 'manifest.json', stage / 'manifest.json')
            verify_bundle(stage)
            for current, _, _ in os.walk(stage, topdown=False):
                fsync_dir(current)
            publish_directory(stage, destination)
            return {'restored': True, 'files': len(manifest['files']), 'elapsedSeconds': round(time.monotonic() - started, 6), 'activation': 'not-performed'}
        finally:
            if stage.exists():
                shutil.rmtree(stage)


def encrypt_bundle(bundle, destination, binary, recipient):
    """Use operator-installed age; public recipient only, no new key material.
    The published encrypted container has authenticated age ciphertext; a digest
    manifest alone is corruption detection, NOT authenticity against an attacker.
    """
    root, manifest = verify_bundle(bundle)
    executable = secure_path(binary)
    if not executable.is_absolute() or not re.fullmatch(r'age1[0-9a-z]{50,100}', recipient):
        raise SafetyError('absolute age binary and native age recipient required')
    destination = Path(os.path.abspath(destination))
    secure_path(destination.parent, directory=True, private=True)
    fd, name = tempfile.mkstemp(prefix='.encrypted-', dir=destination.parent)
    stage = Path(name)
    try:
        with os.fdopen(fd, 'wb') as output:
            child = subprocess.Popen([str(executable), '--encrypt', '--recipient', recipient], stdin=subprocess.PIPE, stdout=output, stderr=subprocess.DEVNULL, env={'PATH': '/usr/bin:/bin'})
            try:
                with tarfile.open(fileobj=child.stdin, mode='w|', format=tarfile.USTAR_FORMAT) as tar:
                    for rel in ['manifest.json', *(r['path'] for r in manifest['files'])]:
                        info = tar.gettarinfo(root / rel, arcname=rel)
                        info.uid, info.gid, info.uname, info.gname = 0, 0, '', ''
                        info.mode = 0o600
                        with open(root / rel, 'rb') as source:
                            tar.addfile(info, source)
                child.stdin.close()
                if child.wait(timeout=60) != 0:
                    raise SafetyError('age encryption failed')
            finally:
                if child.poll() is None:
                    child.kill()
                    child.wait()
            output.flush()
            os.fsync(output.fileno())
        # Hard-link publication is atomic no-replace; unlink temporary only.
        os.link(stage, destination, follow_symlinks=False)
        stage.unlink()
        fsync_dir(destination.parent)
        return {'encrypted': True, 'sourceRetained': True, 'files': len(manifest['files'])}
    finally:
        stage.unlink(missing_ok=True)


def decrypt_bundle(encrypted, destination, binary, identity):
    """Decrypt operator-selected age container; extract only bounded USTAR files.
    No tar.extract/all: reject links, devices, PAX/GNU extensions and traversal.
    Does not activate restored services or change owner authentication.
    """
    source = secure_path(encrypted)
    executable = secure_path(binary)
    identity = secure_path(identity, private=True)
    destination = Path(os.path.abspath(destination))
    secure_path(destination.parent, directory=True, private=True)
    stage = Path(tempfile.mkdtemp(prefix='.decrypted-', dir=destination.parent))
    child = None
    try:
        child = subprocess.Popen([str(executable), '--decrypt', '--identity', str(identity), str(source)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env={'PATH': '/usr/bin:/bin'})
        def read_exact(size):
            chunks, remaining = [], size
            while remaining:
                chunk = child.stdout.read(remaining)
                if not chunk:
                    raise SafetyError('truncated encrypted archive')
                chunks.append(chunk)
                remaining -= len(chunk)
            return b''.join(chunks)
        seen, total = set(), 0
        while True:
            header = read_exact(512)
            if not any(header):
                if any(read_exact(512)):
                    raise SafetyError('invalid tar terminator')
                # tarfile pads to 10KiB; drain only bounded zero padding.
                padding = child.stdout.read(10241)
                if len(padding) > 10240 or any(padding):
                    raise SafetyError('trailing archive payload')
                break
            info = tarfile.TarInfo.frombuf(header, 'utf-8', 'strict')
            rel = relative(info.name)
            if not info.isreg() or info.type not in (tarfile.REGTYPE, tarfile.AREGTYPE) or rel in seen or info.size < 0:
                raise SafetyError('unsupported or duplicate archive member')
            seen.add(rel)
            total += info.size
            if len(seen) > MAX_FILES + 1 or total > MAX_BYTES + MAX_MANIFEST or rel == 'manifest.json' and info.size > MAX_MANIFEST:
                raise SafetyError('encrypted archive exceeds bound')
            target = stage / rel
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as out:
                remaining = info.size
                while remaining:
                    data = read_exact(min(1024 * 1024, remaining))
                    out.write(data)
                    remaining -= len(data)
                out.flush()
                os.fsync(out.fileno())
            if info.size % 512:
                read_exact(512 - info.size % 512)
        if child.wait(timeout=60) != 0:
            raise SafetyError('age authentication/decryption failed')
        manifest = json.loads(read_bytes(stage / 'manifest.json'))
        for resource in manifest.get('resources', []):
            if resource.get('kind') == 'tree':
                relative(resource['path'])
                (stage / resource['path']).mkdir(parents=True, exist_ok=True, mode=0o700)
        verify_bundle(stage)
        for current, _, _ in os.walk(stage, topdown=False):
            fsync_dir(current)
        publish_directory(stage, destination)
        return {'decryptedAndVerified': True, 'activation': 'not-performed'}
    finally:
        if child is not None:
            if child.poll() is None:
                child.kill()
                child.wait()
            if child.stdout is not None:
                child.stdout.close()
        if stage.exists():
            shutil.rmtree(stage)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    backup = sub.add_parser('snapshot')
    backup.add_argument('--plan', required=True)
    backup.add_argument('--gate', required=True)
    backup.add_argument('--destination', required=True)
    check = sub.add_parser('verify')
    check.add_argument('--bundle', required=True)
    res = sub.add_parser('restore')
    res.add_argument('--bundle', required=True)
    res.add_argument('--gate', required=True)
    res.add_argument('--destination', required=True)
    enc = sub.add_parser('encrypt')
    enc.add_argument('--bundle', required=True)
    enc.add_argument('--destination', required=True)
    enc.add_argument('--age-binary', required=True)
    enc.add_argument('--recipient', required=True)
    dec = sub.add_parser('decrypt')
    dec.add_argument('--encrypted', required=True)
    dec.add_argument('--destination', required=True)
    dec.add_argument('--age-binary', required=True)
    dec.add_argument('--identity', required=True)
    args = parser.parse_args()
    try:
        if args.action == 'snapshot':
            result = snapshot(args.plan, args.gate, args.destination)
            result = {'complete': True, 'files': len(result['files']), 'elapsedSeconds': result['elapsedSeconds']}
        elif args.action == 'verify':
            _, m = verify_bundle(args.bundle)
            result = {'verified': True, 'files': len(m['files'])}
        elif args.action == 'restore':
            result = restore(args.bundle, args.gate, args.destination)
        elif args.action == 'decrypt':
            result = decrypt_bundle(args.encrypted, args.destination, args.age_binary, args.identity)
        else:
            result = encrypt_bundle(args.bundle, args.destination, args.age_binary, args.recipient)
        print(json.dumps(result, sort_keys=True))
    except (OSError, SafetyError, sqlite3.Error, ValueError, TypeError, KeyError, tarfile.TarError, UnicodeError, subprocess.SubprocessError):
        print(json.dumps({'ok': False, 'error': 'state operation rejected; inspect private operator configuration and source integrity'}), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
