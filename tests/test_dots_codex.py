import importlib.util
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location('dots_codex', Path(__file__).parents[1] / 'scripts/dots-codex.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DelegationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        key = self.root / 'codex-delegation-key'
        key.write_text('dots_fixture')
        key.chmod(0o600)
        self.client = module.Delegator(self.root)
        self.addCleanup(self.client.db.close)
        self.id = str(uuid.uuid4())

    def api(self, path, body=None):
        if path == '/dots/codex/conversations':
            return {'id': 'thread-1', 'state': 'ready'}
        if path == '/conversations/thread-1':
            return {'id': 'thread-1', 'state': 'ready'}
        if path.endswith('/messages') and body:
            return {'id': self.id, 'state': 'running'}
        if path == '/runs/' + self.id:
            return {'state': 'running'}
        raise AssertionError(path)

    def test_repeat_and_restart_do_not_relaunch(self):
        api = Mock(side_effect=self.api)
        self.client.api = api
        self.client.submit(self.id, 'task', 'title')
        second = module.Delegator(self.root)
        self.addCleanup(second.db.close)
        second.api = api
        second.submit(self.id, 'task', 'title')
        writes = [(a.args[0], a.args[1]) for a in api.call_args_list if len(a.args) > 1]
        self.assertEqual(len(writes), 2)
        self.assertEqual(writes[1][1]['operationId'], self.id)
        with self.assertRaisesRegex(ValueError, 'different input'):
            second.submit(self.id, 'different task', 'title')

    def test_lost_submission_receipt_is_inspect_only(self):
        def lost(path, body=None):
            if path.endswith('/messages') and body:
                raise TimeoutError('Lost receipt')
            return self.api(path, body)
        self.client.api = Mock(side_effect=lost)
        with self.assertRaises(TimeoutError):
            self.client.submit(self.id, 'task', 'title')
        self.client.api.reset_mock()
        result = self.client.submit(self.id, 'task', 'title')
        self.assertEqual(result['state'], 'running')
        self.assertTrue(all(len(c.args) == 1 for c in self.client.api.call_args_list))

    def test_completed_collects_paginated_results(self):
        self.client.api = self.api
        self.client.submit(self.id, 'task', 'title')
        self.client.api = Mock(side_effect=[{'state':'completed'},
            {'items':[{'role':'assistant','committed':True,'text':'one'}],'nextCursor':'next'},
            {'items':[{'role':'assistant','committed':True,'text':'two'}],'nextCursor':None}])
        self.assertEqual(self.client.wait(self.id, 1)['result'], 'one\n\ntwo')

    def test_unknown_conversation_never_submits(self):
        self.client.api = Mock(return_value={'id':'thread-1','state':'unknown'})
        with self.assertRaisesRegex(RuntimeError, 'uncertain'):
            self.client.submit(self.id, 'task', 'title')
        self.assertEqual(self.client.api.call_count, 1)
        self.assertFalse(self.client.job(self.id)['submitted'])

    def test_approval_is_not_bypassed(self):
        self.client.api = self.api
        self.client.submit(self.id, 'task', 'title')
        self.client.api = Mock(return_value={'state':'waiting_approval'})
        result = self.client.wait(self.id, 1)
        self.assertIn('Owner must review', result['action'])
        self.assertEqual(self.client.api.call_count, 1)

    def test_separate_agent_credentials_state_and_target(self):
        key = self.root / 'kimi-delegation-key'
        key.write_text('kimi_fixture')
        key.chmod(0o600)
        client = module.Delegator(self.root, 'kimi')
        self.addCleanup(client.db.close)
        client.api = Mock(side_effect=[{'id':'kimi-thread','state':'ready'}, {'state':'running'}, {'state':'running'}])
        result = client.submit(self.id, 'task', 'title')
        self.assertEqual(result['dotId'], 'kimi')
        self.assertEqual(client.api.call_args_list[0].args[0], '/dots/kimi/conversations')
        with self.assertRaises(ValueError):
            self.client.job(self.id)
        with self.assertRaises(ValueError):
            module.Delegator(self.root, 'arbitrary-agent')

    def test_key_permissions(self):
        (self.root / 'codex-delegation-key').chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'private'):
            module.Delegator(self.root)



class BridgeBoundaryTests(unittest.TestCase):
    def test_rejects_arbitrary_operations_and_extra_parameters(self):
        spec = importlib.util.spec_from_file_location('bridge', Path(__file__).parents[1] / 'scripts/dots-codex-bridge.py')
        bridge = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bridge)
        client = Mock()
        for request in [{'action': 'exec', 'command': 'whoami'}, {'action':'status','id':'x','url':'https://example.com'}, {'action':'wait','id':'x','seconds':1000}]:
            with self.assertRaises(ValueError):
                bridge.dispatch(client, request)
        self.assertEqual(client.mock_calls, [])


if __name__ == '__main__':
    unittest.main()
