"""Offline fixtures only: never inspect production service or send network traffic."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch, MagicMock

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/dock-runtime.py'
spec = importlib.util.spec_from_file_location('dock_runtime', SCRIPT)
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        relative = Path('project/modules/auto-fill-table-bot/src/aftb')
        source = SCRIPT.parents[2] / relative
        target = self.root / relative
        (target / 'bot').mkdir(parents=True)
        for name in ('config.py', 'bot/longconn.py'):
            shutil.copyfile(source / name, target / name)
        (self.root / 'config').mkdir()
        self.path = self.root / 'config/.env'
        self.path.write_text('AFTB_APP_ID=cli_test\nAFTB_APP_SECRET=private-test\nAFTB_LLM_API_KEY=private-model\nPXKB_LLM_API_KEY=private-fallback\nUNRELATED=preserve\n')
        self.reader = lambda root: ({}, ['fixed-test-binding'])
        self.service = patch.object(r, 'service', return_value={'status': 'Running', 'processId': 12})
        self.service.start()
        self.addCleanup(self.service.stop)
        self.network = patch.object(r.socket, 'create_connection', side_effect=AssertionError('network forbidden'))
        self.network.start()
        self.addCleanup(self.network.stop)

    def call(self, body):
        return r.handle(self.root, body, self.reader)

    def body(self, action='save', group='bot', values=None):
        return dict(action=action, group=group, revision=r.snapshot(self.root, self.reader)['revision'], values=values or {})

    def test_describe_sanitized_and_alias(self):
        out = self.call({})
        self.assertTrue(out['ok'])
        self.assertNotIn('private-', json.dumps(out))
        self.assertEqual(out['groups'][2]['fields'][2]['source'], 'dotenv:PXKB_LLM_API_KEY')

    def test_balance_sanitized_and_invalid_not_zero(self):
        snap = {'values': {'AFTB_LLM_BASE_URL': 'https://api.siliconflow.cn/v1', 'AFTB_LLM_API_KEY': 'private-key'}, 'revision': 'r1'}
        with patch.object(r, 'request_json', return_value={'code':20000,'data':{'status':'normal','totalBalance':'4.99','email':'private@example.com'}}):
            result = r.balance(snap)
            self.assertEqual(result['balances'], [{'currency':'CNY','total':'4.99'}])
            self.assertNotIn('private', json.dumps(result))
        for data in ({'code':20092}, {'code':20000,'data':{'status':'','totalBalance':'0'}}, {'code':20000,'data':{'status':'normal','totalBalance':'NaN'}}):
            with patch.object(r, 'request_json', return_value=data), self.assertRaisesRegex(ValueError, 'balance_unavailable'):
                r.balance(snap)

    def test_stale_revision_test_and_save(self):
        for action in ('test', 'save'):
            body = self.body(action)
            self.path.write_text(self.path.read_text() + '# changed\n')
            self.assertEqual(self.call(body)['error'], 'stale_revision')

    def test_blank_secret_save_backup(self):
        before = self.path.read_bytes()
        result = self.call(self.body(values={'AFTB_APP_ID': 'cli_new', 'AFTB_APP_SECRET': ''}))
        self.assertTrue(result['ok'], result)
        self.assertTrue(result['saved'])
        self.assertTrue(result['restartRequired'])
        snap = r.snapshot(self.root, self.reader)
        self.assertEqual(snap['values']['AFTB_APP_SECRET'], 'private-test')
        self.assertIn('UNRELATED=preserve', self.path.read_text())
        backups = list(self.path.parent.glob('.env.runtime-*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), before)
        if os.name == 'nt':
            def acl(p):
                return r.ps("[System.IO.File]::GetAccessControl('" + str(p).replace("'", "''") + "').Sddl")
            self.assertEqual(acl(backups[0]), acl(self.path))

    def test_host_change_requires_explicit_secret(self):
        for action in ('test', 'save'):
            out = self.call(self.body(action, 'primary', {'AFTB_LLM_BASE_URL': 'https://api.openai.com/v1'}))
            self.assertEqual(out['error'], 'host_change_requires_new_secret')

    def test_arbitrary_host_rejected_even_new_secret(self):
        out = self.call(self.body('test', 'primary', {'AFTB_LLM_BASE_URL': 'https://evil.example/v1', 'AFTB_LLM_API_KEY': 'new'}))
        self.assertEqual(out['error'], 'untrusted_endpoint_host')

    def test_private_dns_rejected(self):
        with patch.object(r.socket, 'getaddrinfo', return_value=[(2, 1, 6, '', ('127.0.0.1', 443))]):
            with self.assertRaisesRegex(ValueError, 'non_public_endpoint'):
                r.request_json('https://api.deepseek.com/v1/models', {'Authorization': 'private'})

    def test_redirect_not_followed_or_returned(self):
        conn = MagicMock()
        conn.getresponse.return_value.status = 302
        with patch.object(r.socket, 'getaddrinfo', return_value=[(2, 1, 6, '', ('8.8.8.8', 443))]), patch.object(r.socket, 'create_connection'), patch.object(r.ssl, 'create_default_context'), patch.object(r.http.client, 'HTTPSConnection', return_value=conn):
            with self.assertRaisesRegex(ValueError, 'remote_check_failed'):
                r.request_json('https://api.deepseek.com/v1/models', {'Authorization': 'private'})
        self.assertEqual(conn.request.call_count, 1)

    def test_cfg_overrides_refused(self):
        path = self.root / 'project/modules/auto-fill-table-bot/src/aftb/bot/longconn.py'
        path.write_text('settings = load_settings(**cfg)')
        self.assertEqual(self.call({})['error'], 'unsupported_settings_overrides')

    def test_restart_confirmation_and_process_verification(self):
        body = self.body('restart')
        self.assertEqual(self.call(body)['error'], 'explicit_confirmation_required')
        body['confirm'] = True
        with patch.object(r, 'ps') as command:
            out = self.call(body)
        self.assertFalse(out['ok'])
        self.assertIn('尚未确认', out['message'])
        command.assert_called_once()

    def test_bot_test_only_auth(self):
        with patch.object(r, 'request_json', return_value={'code': 0, 'tenant_access_token': 'private-token'}) as request:
            out = self.call(self.body('test'))
        self.assertTrue(out['ok'])
        self.assertNotIn('private', json.dumps(out))
        self.assertIn('/auth/v3/tenant_access_token/internal', request.call_args.args[0])

    def test_pending_restart_persists_and_clears_only_after_restart(self):
        state = self.root / 'state'
        out = r.handle(self.root, self.body(values={'AFTB_APP_ID':'cli_next'}), self.reader, state)
        self.assertTrue(out['saved'])
        self.assertTrue(r.handle(self.root, {}, self.reader, state)['restartRequired'])
        body = self.body('restart')
        body['confirm'] = True
        with patch.object(r, 'ps'), patch.object(r, 'service', side_effect=[{'status':'Running','processId':12},{'status':'Running','processId':13}]):
            self.assertTrue(r.handle(self.root, body, self.reader, state)['ok'])
        self.assertFalse(r.handle(self.root, {}, self.reader, state)['restartRequired'])


if __name__ == '__main__':
    unittest.main()
