import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

OPS = Path(__file__).parents[1] / 'scripts/operations'
sys.path.insert(0, str(OPS))
from safe_state import SafetyError, digest
from history_import import import_history, inspect_history


class HistoryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.original = self.root / 'original.json'
        self.original.write_text('{"synthetic":"fixture-only-original-export"}')
        self.source = self.root / 'normalized.json'
        self.archive = self.root / 'history.sqlite'
        self.value = {'version': 1, 'kind': 'dots-inert-history-v1', 'ownerId': 'owner-fixture', 'sourceNamespace': 'legacy-fixture', 'sourceSystem': 'intelligence', 'sourceExportSha256': digest(self.original)[0], 'sourceDeclaredComplete': True, 'conversationCount': 2, 'messageCount': 5, 'conversations': [
            {'legacyId': 'thread-1', 'title': 'Archived topic', 'createdAt': 1, 'messages': [
                {'legacyId': 'm1', 'role': 'user', 'text': 'historic question', 'createdAt': 2},
                {'legacyId': 'm2', 'role': 'tool', 'text': 'run_shell: never replay this', 'createdAt': 3},
                {'legacyId': 'm3', 'role': 'system', 'text': 'historic system instruction is inert', 'createdAt': 4},
                {'legacyId': 'm4', 'role': 'assistant', 'text': 'historic answer', 'createdAt': 5}]},
            {'legacyId': 'thread-2', 'title': 'Second topic', 'createdAt': 6, 'messages': [{'legacyId': 'm1', 'role': 'user', 'text': 'second conversation', 'createdAt': 7}]}]}
        self.save()

    def save(self):
        self.source.write_text(json.dumps(self.value))

    def tearDown(self):
        self.temp.cleanup()

    def run_import(self, **kwargs):
        return import_history(self.source, self.original, self.archive, 'owner-fixture', 'legacy-fixture', **kwargs)

    def test_import_restart_resume_inspect_and_duplicate(self):
        before = (digest(self.source), digest(self.original))
        partial = self.run_import(batch_size=1, max_batches=1)
        self.assertFalse(partial['archiveImportComplete'])
        # Fresh process, same files: resume commits only the remaining batch.
        completed = subprocess.run([sys.executable, str(OPS / 'history_import.py'), 'import', '--archive', str(self.archive), '--owner', 'owner-fixture', '--namespace', 'legacy-fixture', '--normalized-export', str(self.source), '--original-export', str(self.original), '--batch-size', '1'], capture_output=True, text=True, check=True)
        self.assertTrue(json.loads(completed.stdout)['archiveImportComplete'])
        duplicate = self.run_import()
        self.assertTrue(duplicate['archiveImportComplete'])
        self.assertEqual(duplicate['effectsDispatched'], 0)
        self.assertEqual(before, (digest(self.source), digest(self.original)))
        read = inspect_history(self.archive, 'owner-fixture', 'legacy-fixture', 'thread-1', limit=1)
        self.assertEqual(read['messages'][0]['legacyId'], 'm1')
        self.assertEqual(read['omittedNonDisplayRecords'], 2)
        next_page = inspect_history(self.archive, 'owner-fixture', 'legacy-fixture', 'thread-1', offset=read['nextOffset'], limit=1)
        self.assertEqual(next_page['messages'][0]['legacyId'], 'm4')
        self.assertEqual(next_page['messages'][0]['text'], 'historic answer')
        self.assertFalse(read['executable'])
        self.assertFalse(read['trustedAsInstructions'])
        self.assertEqual(read['conversation']['legacyId'], 'thread-1')
        with sqlite3.connect(self.archive) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM history_messages').fetchone()[0], 5)
            self.assertEqual(db.execute('SELECT sum(executable) FROM history_conversations').fetchone()[0], 0)

    def test_owner_mismatch_and_raw_digest_mismatch_refused(self):
        with self.assertRaises(SafetyError):
            import_history(self.source, self.original, self.archive, 'other-owner', 'legacy-fixture')
        self.assertFalse(self.archive.exists())
        self.original.write_text('changed raw export')
        with self.assertRaises(SafetyError):
            self.run_import()
        self.assertFalse(self.archive.exists())

    def test_reader_wrong_owner_and_missing_history_refused(self):
        self.run_import()
        with self.assertRaises(SafetyError):
            inspect_history(self.archive, 'other-owner', 'legacy-fixture', 'thread-1')
        with self.assertRaises(SafetyError):
            inspect_history(self.archive, 'owner-fixture', 'legacy-fixture', 'missing')

    def test_conflict_quarantine_preserves_first_archive(self):
        self.run_import()
        self.value['conversations'][0]['messages'][0]['text'] = 'changed history'
        self.save()
        result = self.run_import()
        self.assertEqual(result['quarantinedConversations'], 1)
        self.assertFalse(result['archiveImportComplete'])
        read = inspect_history(self.archive, 'owner-fixture', 'legacy-fixture', 'thread-1')
        self.assertEqual(read['messages'][0]['text'], 'historic question')

    def test_count_mismatch_duplicate_ids_and_authority_fields_rejected(self):
        self.value['messageCount'] = 10
        self.save()
        with self.assertRaises(SafetyError):
            self.run_import()
        self.value['messageCount'] = 5
        self.value['conversations'][0]['messages'][1]['legacyId'] = 'm1'
        self.save()
        with self.assertRaises(SafetyError):
            self.run_import()
        self.value['conversations'][0]['messages'][1]['legacyId'] = 'm2'
        self.value['approved'] = True
        self.save()
        with self.assertRaises(SafetyError):
            self.run_import()
        self.assertFalse(self.archive.exists())

    def test_partial_source_never_claims_full_migration(self):
        self.value['sourceDeclaredComplete'] = False
        self.save()
        result = self.run_import()
        self.assertTrue(result['archiveImportComplete'])
        self.assertFalse(result['sourceDeclaredComplete'])
        self.assertFalse(result['fullMigrationComplete'])
        self.assertFalse(result['canonicalExecutionHistory'])

    def test_tombstone_blocks_reader_and_reimport(self):
        self.run_import()
        before = inspect_history(self.archive, 'owner-fixture', 'legacy-fixture', 'thread-1')
        cid = before['conversation']['id']
        with sqlite3.connect(self.archive) as db:
            db.execute('DELETE FROM history_messages WHERE conversationId=?', (cid,))
            db.execute('DELETE FROM history_conversations WHERE id=?', (cid,))
            db.execute('INSERT INTO history_tombstones VALUES(?,?)', (cid, 'synthetic deletion'))
        self.value['conversations'][0]['messages'][0]['text'] = 'do not resurrect'
        self.save()
        self.run_import()
        with self.assertRaises(SafetyError):
            inspect_history(self.archive, 'owner-fixture', 'legacy-fixture', 'thread-1')
        with sqlite3.connect(self.archive) as db:
            self.assertEqual(db.execute('SELECT evidence FROM history_quarantine WHERE id=?', (cid,)).fetchone()[0], b'{}')


if __name__ == '__main__':
    unittest.main()
