import hashlib
from contextlib import closing
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import tarfile
import io
import time
import unittest
from unittest.mock import patch

OPS = Path(__file__).parents[1] / 'scripts' / 'operations'
sys.path.insert(0, str(OPS))
import safe_state as state
import legacy_inventory as legacy


class StateTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.live = self.root / 'state'
        self.live.mkdir(mode=0o700)
        (self.live / 'artifacts').mkdir(mode=0o700)
        (self.live / 'artifacts/page.txt').write_text('synthetic-page-α')
        self.plan = self.root / 'plan.json'
        self.gate = self.root / 'maintenance.lock'
        resources = [{'role': role, 'path': file, 'kind': kind} for role, file, kind in [('dots_db', 'dots.sqlite', 'sqlite'), ('ryoko_db', 'ryoko.sqlite', 'sqlite'), ('artifacts', 'artifacts', 'tree')]]
        self.plan.write_text(json.dumps({'version': 1, 'stateRoot': str(self.live), 'resources': resources, 'pins': {'consumer': 'synthetic', 'producer': 'synthetic', 'configSha256': '0' * 64}}))
        for name in ('dots.sqlite', 'ryoko.sqlite'):
            db = sqlite3.connect(self.live / name)
            db.execute('CREATE TABLE evidence(id TEXT PRIMARY KEY,value TEXT)')
            db.execute('INSERT INTO evidence VALUES(?,?)', ('one', 'synthetic'))
            db.commit()
            db.close()

    def tearDown(self):
        self.temp.cleanup()

    def snapshot(self):
        return state.snapshot(self.plan, self.gate, self.root / 'backup')

    def test_roundtrip_paired_state_and_artifacts(self):
        before = {str(p): state.digest(p) for p in self.live.rglob('*') if p.is_file()}
        manifest = self.snapshot()
        self.assertEqual({str(p): state.digest(p) for p in self.live.rglob('*') if p.is_file()}, before)
        restored = state.restore(self.root / 'backup', self.gate, self.root / 'restored')
        self.assertTrue(restored['restored'])
        self.assertEqual(restored['activation'], 'not-performed')
        self.assertEqual((self.root / 'restored/artifacts/page.txt').read_bytes(), (self.live / 'artifacts/page.txt').read_bytes())
        for name in ('dots.sqlite', 'ryoko.sqlite'):
            with closing(sqlite3.connect(self.root / 'restored' / name, isolation_level=None)) as db:
                self.assertEqual(db.execute('SELECT * FROM evidence').fetchall(), [('one', 'synthetic')])
        print(json.dumps({'fixture': 'synthetic-2db-1artifact', 'snapshotSeconds': manifest['elapsedSeconds'], 'restoreSeconds': restored['elapsedSeconds'], 'recordsLost': 0, 'externalEffectsDispatched': 0}))

    def test_wal_is_recovered_only_in_copy(self):
        # Simulate abrupt crash, retaining WAL and SHM with no active writer.
        code = "import sqlite3,os,sys;d=sqlite3.connect(sys.argv[1]);d.execute('PRAGMA journal_mode=WAL');d.execute('INSERT INTO evidence VALUES(\"two\",\"wal\")');d.commit();os._exit(0)"
        subprocess.run([sys.executable, '-c', code, str(self.live / 'dots.sqlite')], check=True)
        before = {str(p): state.digest(p) for p in self.live.rglob('*') if p.is_file()}
        self.snapshot()
        self.assertEqual(before, {str(p): state.digest(p) for p in self.live.rglob('*') if p.is_file()})
        with closing(sqlite3.connect(self.root / 'backup/dots.sqlite', isolation_level=None)) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM evidence').fetchone()[0], 2)
        self.assertFalse((self.root / 'backup/dots.sqlite-wal').exists())

    def test_active_gate_refuses_snapshot(self):
        with state.gate(self.gate):
            with self.assertRaises(state.SafetyError):
                self.snapshot()
        self.assertFalse((self.root / 'backup').exists())

    def test_duplicate_destination_never_replaces(self):
        self.snapshot()
        manifest = (self.root / 'backup/manifest.json').read_bytes()
        with self.assertRaises(OSError):
            self.snapshot()
        self.assertEqual((self.root / 'backup/manifest.json').read_bytes(), manifest)
        state.restore(self.root / 'backup', self.gate, self.root / 'restored')
        with self.assertRaises(OSError):
            state.restore(self.root / 'backup', self.gate, self.root / 'restored')

    def test_symlink_file_and_ancestor_rejected(self):
        (self.live / 'artifacts/link').symlink_to(self.plan)
        with self.assertRaises(state.SafetyError):
            self.snapshot()
        (self.live / 'artifacts/link').unlink()
        alias = self.root / 'alias'
        alias.symlink_to(self.live, target_is_directory=True)
        plan = json.loads(self.plan.read_text())
        plan['stateRoot'] = str(alias)
        self.plan.write_text(json.dumps(plan))
        with self.assertRaises(state.SafetyError):
            self.snapshot()

    def test_hardlink_refused(self):
        os.link(self.plan, self.live / 'artifacts/hardlink')
        with self.assertRaises(state.SafetyError):
            self.snapshot()

    def test_corrupt_database_no_publication(self):
        (self.live / 'ryoko.sqlite').write_text('invalid')
        with self.assertRaises(sqlite3.Error):
            self.snapshot()
        self.assertFalse((self.root / 'backup').exists())
        self.assertEqual(list(self.root.glob('.snapshot-*')), [])

    def test_copy_failure_no_partial_publication(self):
        with patch.object(state, 'copy_private', side_effect=OSError('ENOSPC')):
            with self.assertRaises(OSError):
                self.snapshot()
        self.assertFalse((self.root / 'backup').exists())
        self.assertEqual(list(self.root.glob('.snapshot-*')), [])

    def test_tamper_and_unlisted_file_refused(self):
        self.snapshot()
        path = self.root / 'backup/artifacts/page.txt'
        path.write_text('changed')
        with self.assertRaises(state.SafetyError):
            state.restore(self.root / 'backup', self.gate, self.root / 'restored')
        self.assertFalse((self.root / 'restored').exists())
        path.write_text('synthetic-page-α')
        (self.root / 'backup/unlisted').write_text('unexpected')
        with self.assertRaises(state.SafetyError):
            state.verify_bundle(self.root / 'backup')

    def test_path_traversal_duplicate_and_partial_manifest_refused(self):
        self.snapshot()
        path = self.root / 'backup/manifest.json'
        original = json.loads(path.read_text())
        for mutation in ('traversal', 'duplicate', 'incomplete'):
            changed = json.loads(json.dumps(original))
            if mutation == 'traversal':
                changed['files'][0]['path'] = '../escape'
            elif mutation == 'duplicate':
                changed['files'].append(changed['files'][0])
            else:
                changed['complete'] = False
            path.write_text(json.dumps(changed))
            with self.assertRaises(state.SafetyError):
                state.verify_bundle(self.root / 'backup')
        self.assertFalse((self.root / 'escape').exists())

    def test_overlapping_resources_refused(self):
        plan = json.loads(self.plan.read_text())
        plan['resources'].append({'role': 'duplicate', 'path': 'artifacts/page.txt', 'kind': 'sqlite'})
        self.plan.write_text(json.dumps(plan))
        with self.assertRaises(state.SafetyError):
            self.snapshot()

    def test_lifetime_gate_excludes_second_owner_and_snapshot(self):
        proc = subprocess.Popen([sys.executable, str(OPS / 'lifetime_gate.py'), '--gate', str(self.gate), '--', sys.executable, '-c', 'import time;time.sleep(10)'])
        try:
            deadline = time.monotonic() + 3
            while True:
                try:
                    with state.gate(self.gate):
                        pass
                except state.SafetyError:
                    break
                self.assertLess(time.monotonic(), deadline)
                time.sleep(0.02)
            with self.assertRaises(state.SafetyError):
                self.snapshot()
            proc.terminate()
            proc.wait(timeout=3)
            self.snapshot()
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()

    def test_killed_supervisor_leaves_direct_owner_gate_held(self):
        marker = self.root / 'synthetic-child-pid'
        code = 'import os,time,sys;open(sys.argv[1],"w").write(str(os.getpid()));time.sleep(30)'
        proc = subprocess.Popen([sys.executable, str(OPS / 'lifetime_gate.py'), '--gate', str(self.gate), '--', sys.executable, '-c', code, str(marker)])
        child_pid = None
        try:
            deadline = time.monotonic() + 3
            while not marker.exists():
                self.assertLess(time.monotonic(), deadline)
                time.sleep(0.02)
            child_pid = int(marker.read_text())
            proc.kill()
            proc.wait(timeout=3)
            with self.assertRaises(state.SafetyError):
                self.snapshot()
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
            if child_pid is not None:
                os.killpg(child_pid, signal.SIGKILL)

    def test_supervised_stubborn_owner_and_descendant_are_killed_before_gate_release(self):
        marker = self.root / 'tree-ready'
        descendant = "import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);time.sleep(30)"
        owner = "import subprocess,signal,sys,time,json,os;signal.signal(signal.SIGTERM,signal.SIG_IGN);c=subprocess.Popen([sys.executable,'-c',sys.argv[2]]);open(sys.argv[1],'w').write(json.dumps([os.getpid(),c.pid]));time.sleep(30)"
        wrapper = "import sys;sys.path.insert(0,sys.argv[1]);from lifetime_gate import run;sys.exit(run(sys.argv[2],sys.argv[3:],timeout=0.15))"
        proc = subprocess.Popen([sys.executable, '-c', wrapper, str(OPS), str(self.gate), sys.executable, '-c', owner, str(marker), descendant])
        pids = []
        try:
            deadline = time.monotonic() + 3
            while not marker.exists():
                self.assertLess(time.monotonic(), deadline)
                time.sleep(0.02)
            pids = json.loads(marker.read_text())
            with self.assertRaises(state.SafetyError):
                self.snapshot()
            proc.terminate()
            proc.wait(timeout=3)
            for pid in pids:
                with self.assertRaises(ProcessLookupError):
                    os.kill(pid, 0)
            self.snapshot()
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
            for pid in pids:
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass

    def test_owned_python_keeps_gate_after_wrapper_and_node_are_killed(self):
        node = shutil.which('node')
        if node is None:
            self.skipTest('Node 24 is required for exact state-gate propagation fixture')
        marker = self.root / 'producer-ready'
        helper = (OPS.parents[1] / 'src/server/operations/state-gate.ts').as_uri()
        script = self.root / 'forward-gate.mjs'
        script.write_text("import {spawn} from 'node:child_process';import {stateGateDescriptor} from " + json.dumps(helper) + ";const fd=stateGateDescriptor();const child=spawn(process.argv[2],['-c',process.argv[3],process.argv[4]],{env:{DOTS_STATE_GATE_FD:'3'},stdio:['ignore','ignore','ignore',fd]});await new Promise(r=>child.once('exit',r));")
        producer = "import os,sys,time,json;open(sys.argv[1],'w').write(json.dumps([os.getppid(),os.getpid()]));time.sleep(30)"
        proc = subprocess.Popen([sys.executable, str(OPS / 'lifetime_gate.py'), '--gate', str(self.gate), '--', node, str(script), sys.executable, producer, str(marker)])
        pids = []
        try:
            deadline = time.monotonic() + 3
            while not marker.exists():
                self.assertIsNone(proc.poll())
                self.assertLess(time.monotonic(), deadline)
                time.sleep(0.02)
            pids = json.loads(marker.read_text())
            proc.kill()
            proc.wait(timeout=3)
            os.kill(pids[0], signal.SIGKILL)
            time.sleep(0.05)
            with self.assertRaises(state.SafetyError):
                self.snapshot()
            os.kill(pids[1], signal.SIGKILL)
            deadline = time.monotonic() + 3
            while True:
                try:
                    with state.gate(self.gate):
                        pass
                    break
                except state.SafetyError:
                    self.assertLess(time.monotonic(), deadline)
                    time.sleep(0.02)
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
            for pid in pids:
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass

    def test_reviewed_local_target_journal_and_bytes_survive_paired_restore(self):
        target = self.live / 'target'
        target.mkdir(mode=0o700)
        (target / 'workspace').mkdir(mode=0o700)
        (target / 'workspace' / 'result.txt').write_text('synthetic target result')
        with closing(sqlite3.connect(target / 'edge.sqlite', isolation_level=None)) as db:
            db.execute('CREATE TABLE edge_operations(operationId TEXT PRIMARY KEY,receipt TEXT)')
            db.execute("INSERT INTO edge_operations VALUES('original-operation','unknown')")
        plan = json.loads(self.plan.read_text())
        plan['resources'] += [{'role': 'computer_edge_journal', 'path': 'target/edge.sqlite', 'kind': 'sqlite'}, {'role': 'computer_workspace', 'path': 'target/workspace', 'kind': 'tree'}]
        self.plan.write_text(json.dumps(plan))
        self.snapshot()
        state.restore(self.root / 'backup', self.gate, self.root / 'restored')
        with closing(sqlite3.connect(self.root / 'restored/target/edge.sqlite', isolation_level=None)) as db:
            self.assertEqual(db.execute('SELECT * FROM edge_operations').fetchall(), [('original-operation', 'unknown')])
        self.assertEqual((self.root / 'restored/target/workspace/result.txt').read_text(), 'synthetic target result')

    def fake_age(self):
        # Tests only bounded extraction and exit handling, NOT cryptography.
        executable = self.root / 'fake-age'
        executable.write_text('#!/usr/bin/python3\nimport sys\nwith open(sys.argv[-1], "rb") as f: sys.stdout.buffer.write(f.read())\n')
        executable.chmod(0o700)
        identity = self.root / 'synthetic-identity'
        identity.write_text('test fixture only')
        identity.chmod(0o600)
        return executable, identity

    def test_decrypted_tar_parser_roundtrip_synthetic_no_crypto(self):
        self.snapshot()
        archive = self.root / 'synthetic.tar'
        with tarfile.open(archive, 'w', format=tarfile.USTAR_FORMAT) as tar:
            for p in (self.root / 'backup').rglob('*'):
                if p.is_file():
                    tar.add(p, arcname=p.relative_to(self.root / 'backup').as_posix())
        executable, identity = self.fake_age()
        result = state.decrypt_bundle(archive, self.root / 'decrypted', executable, identity)
        self.assertTrue(result['decryptedAndVerified'])
        state.verify_bundle(self.root / 'decrypted')

    def test_decrypted_tar_parser_rejects_links_and_traversal(self):
        executable, identity = self.fake_age()
        for index, kind in enumerate(('symlink', 'traversal', 'hardlink', 'device')):
            archive = self.root / ('hostile' + str(index) + '.tar')
            with tarfile.open(archive, 'w', format=tarfile.USTAR_FORMAT) as tar:
                info = tarfile.TarInfo('../escape' if kind == 'traversal' else 'bad')
                info.type = {'symlink': tarfile.SYMTYPE, 'hardlink': tarfile.LNKTYPE, 'device': tarfile.CHRTYPE, 'traversal': tarfile.REGTYPE}[kind]
                info.linkname = '/outside'
                tar.addfile(info)
            with self.assertRaises(state.SafetyError):
                state.decrypt_bundle(archive, self.root / 'decrypted', executable, identity)
            self.assertFalse((self.root / 'decrypted').exists())
        self.assertFalse((self.root / 'escape').exists())

    def test_source_mutation_during_copy_prevents_publication(self):
        original = state.copy_private
        changed = False
        def mutate(source, target):
            nonlocal changed
            original(source, target)
            if not changed:
                changed = True
                (self.live / 'artifacts/new').write_text('late')
        with patch.object(state, 'copy_private', side_effect=mutate):
            with self.assertRaises(state.SafetyError):
                self.snapshot()
        self.assertFalse((self.root / 'backup').exists())

    def test_missing_age_does_not_publish(self):
        self.snapshot()
        with self.assertRaises(OSError):
            state.encrypt_bundle(self.root / 'backup', self.root / 'backup.age', self.root / 'not-installed', 'age1' + 'a' * 58)
        self.assertFalse((self.root / 'backup.age').exists())


class LegacyTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / 'source.sqlite'
        with closing(sqlite3.connect(self.source, isolation_level=None)) as db:
            db.executescript('CREATE TABLE memories(id TEXT PRIMARY KEY,text TEXT);CREATE TABLE tasks(id TEXT PRIMARY KEY,prompt TEXT);CREATE TABLE browser_sessions(idHash TEXT,csrfToken TEXT);')
            db.executemany('INSERT INTO memories VALUES(?,?)', [(str(i), 'synthetic private memory') for i in range(5)])
            db.execute('INSERT INTO tasks VALUES(?,?)', ('task-one', 'do not execute me'))
            db.execute('INSERT INTO browser_sessions VALUES(?,?)', ('synthetic-hash', 'synthetic-secret'))
        self.archive = self.root / 'archive.sqlite'

    def tearDown(self):
        self.temp.cleanup()

    def test_inventory_readonly_and_missing_history_explicit(self):
        before = state.digest(self.source)
        report = legacy.inventory(self.source, 'stable-source')
        self.assertEqual(state.digest(self.source), before)
        self.assertFalse(report['fullMigrationComplete'])
        self.assertFalse(report['intelligenceHistory']['complete'])
        self.assertIn('browser_sessions', report['notInventoriedTables'])
        self.assertNotIn('synthetic private memory', json.dumps(report))
        self.assertNotIn('synthetic-secret', json.dumps(report))

    def test_batch_resume_duplicate_and_conflict_quarantine(self):
        partial = legacy.stage_archive(self.source, 'source', self.archive, 2, 1)
        self.assertFalse(partial['archiveStaging']['sourceFullyStaged'])
        self.assertEqual(partial['archiveStaging']['totalArchivedRows'], 2)
        done = legacy.stage_archive(self.source, 'source', self.archive, 2)
        duplicate = legacy.stage_archive(self.source, 'source', self.archive, 2)
        self.assertTrue(done['archiveStaging']['sourceFullyStaged'])
        self.assertEqual(done['archiveStaging'], duplicate['archiveStaging'])
        with closing(sqlite3.connect(self.source, isolation_level=None)) as db:
            db.execute('UPDATE memories SET text=? WHERE id=?', ('changed legacy row', '0'))
        conflict = legacy.stage_archive(self.source, 'source', self.archive)
        self.assertEqual(conflict['archiveStaging']['quarantinedRows'], 1)
        with closing(sqlite3.connect(self.archive, isolation_level=None)) as db:
            self.assertEqual(db.execute('SELECT sum(executable) FROM archived_records').fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT count(*) FROM archived_records WHERE family='browser_sessions'").fetchone()[0], 0)
            self.assertNotIn(b'changed legacy row', db.execute('SELECT payload FROM archived_records WHERE id=?', (legacy.stable_id('source', 'memories', ['0']),)).fetchone()[0])

    def test_existing_foreign_destination_not_mutated(self):
        with closing(sqlite3.connect(self.archive, isolation_level=None)) as db:
            db.execute('CREATE TABLE foreign_data(id INTEGER)')
        self.archive.chmod(0o600)
        before = state.digest(self.archive)
        with self.assertRaises(sqlite3.OperationalError):
            legacy.stage_archive(self.source, 'source', self.archive)
        self.assertEqual(before, state.digest(self.archive))

    def test_source_and_archive_cannot_be_same(self):
        with self.assertRaises(state.SafetyError):
            legacy.stage_archive(self.source, 'source', self.source)

    def test_uncheckpointed_input_refused(self):
        code = "import sqlite3,sys,os;d=sqlite3.connect(sys.argv[1]);d.execute('PRAGMA journal_mode=WAL');d.execute('INSERT INTO memories VALUES(\"wal\",\"text\")');d.commit();os._exit(0)"
        subprocess.run([sys.executable, '-c', code, str(self.source)], check=True)
        with self.assertRaises(state.SafetyError):
            legacy.inventory(self.source, 'source')

    def test_tombstone_prevents_resurrection(self):
        legacy.stage_archive(self.source, 'source', self.archive)
        sid = legacy.stable_id('source', 'memories', ['0'])
        with closing(sqlite3.connect(self.archive, isolation_level=None)) as db:
            db.execute('DELETE FROM archived_records WHERE id=?', (sid,))
            db.execute('INSERT INTO migration_tombstones VALUES(?,?)', (sid, 'synthetic erasure'))
        with closing(sqlite3.connect(self.source, isolation_level=None)) as db:
            db.execute("UPDATE memories SET text='different' WHERE id='0'")
        legacy.stage_archive(self.source, 'source', self.archive)
        with closing(sqlite3.connect(self.archive, isolation_level=None)) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM archived_records WHERE id=?', (sid,)).fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT payload FROM quarantine WHERE id=?', (sid,)).fetchone()[0], b'{}')


if __name__ == '__main__':
    unittest.main()
