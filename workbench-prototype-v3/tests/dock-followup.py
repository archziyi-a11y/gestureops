"""Offline follow-up contract tests; all business/network collaborators mocked."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock
from types import SimpleNamespace
import sqlite3
import os
from dataclasses import dataclass

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'project/modules/auto-fill-table-bot/src'))
sys.path.insert(0, str(ROOT / 'project/modules/agent-core/src'))
spec = importlib.util.spec_from_file_location('followup', ROOT / 'workbench-prototype-v3/scripts/dock-followup.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
from aftb import excel_supplement_queue as q
from aftb.feishu_client import FeishuClient


class FollowupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.client = MagicMock()
        self.client.send_card.return_value = {'code': 0, 'data': {'message_id': 'om_test', 'chat_id': 'oc_private'}}
        self.data = dict(owner='ou_private', chat='oc_private', label='X**', session=None, version='v1',
                         rows=[dict(source='batch', sheet='Sheet1', row_number=2, missing=['grade'], aliases=[])])
        self.inspect = patch.object(mod, 'inspect', side_effect=lambda *a: dict(self.data, rows=[dict(r) for r in self.data['rows']])).start()
        self.addCleanup(patch.stopall)
        patch.object(q, '_save').start()
        patch.object(q, 'build_pending_card', return_value={'card': 'mock'}).start()
        patch.object(q, 'active_session', side_effect=lambda *a: {'entries': q._save.call_args.args[3], 'page': 0, 'selected': ''}).start()
        patch.object(q, 'pending_view_version', return_value='view').start()
        patch.object(q, 'bind_visible_object').start()

    def call(self, body, revision='r1'):
        return mod.handle(object(), self.client, revision, self.temp.name, body)

    def preview(self):
        return self.call(dict(action='preview', batchCode='batch'))

    def send(self, token):
        return self.call(dict(action='send', token=token, confirm=True))

    def test_preview_sanitized_and_nonmutating(self):
        result = self.preview()
        self.assertTrue(result['ok'])
        self.assertNotIn('ou_private', str(result))
        self.assertNotIn('oc_private', str(result))
        self.assertIn('recipient', result)
        self.assertIn('senderLabel', result)
        self.assertIn('chatLabel', result)
        self.assertTrue(result['card'])
        self.assertNotIn('behaviors', str(result['card']))
        q._save.assert_not_called()
        self.client.send_card.assert_not_called()

    def test_remote_batch_unavailable_has_safe_message(self):
        self.inspect.side_effect = ValueError('remote_batch_unavailable')
        result = self.preview()
        self.assertEqual(result['error'], 'remote_batch_unavailable')
        self.assertEqual(result['message'], mod.ERROR_MESSAGES['remote_batch_unavailable'])
        self.assertNotIn('token', result)
        self.client.send_card.assert_not_called()

    def test_rate_limit_has_safe_message(self):
        self.inspect.side_effect = ValueError('remote_rate_limited')
        result = self.preview()
        self.assertEqual(result['error'], 'remote_rate_limited')
        self.assertEqual(result['message'], mod.ERROR_MESSAGES['remote_rate_limited'])
        self.client.send_card.assert_not_called()

    def test_acceptance_is_idempotent(self):
        token = self.preview()['token']
        first = self.send(token)
        self.assertEqual(first['status'], 'accepted')
        self.assertEqual(first['delivery'], 'unverified')
        self.assertTrue(first['callbackBound'])
        self.assertTrue(self.send(token)['replayed'])
        self.client.send_card.assert_called_once()
        self.assertEqual(self.client.send_card.call_args.kwargs['receive_id_type'], 'chat_id')

    def test_unknown_never_resends(self):
        token = self.preview()['token']
        self.client.send_card.return_value = {'code': 0, 'data': {}}
        self.assertEqual(self.send(token)['status'], 'unknown')
        self.assertEqual(self.send(token)['status'], 'unknown')
        self.client.send_card.assert_called_once()

    def test_changed_session(self):
        token = self.preview()['token']
        self.data['session'] = {'new': True}
        self.assertEqual(self.send(token)['error'], 'session_changed')
        self.client.send_card.assert_not_called()

    def test_stale_rows(self):
        token = self.preview()['token']
        self.data['version'] = 'v2'
        self.assertEqual(self.send(token)['error'], 'stale_preview')
        self.client.send_card.assert_not_called()

    def test_confirmation_and_input_scope(self):
        token = self.preview()['token']
        self.assertEqual(self.call(dict(action='send', token=token))['error'], 'confirmation_required')
        self.assertEqual(self.call(dict(action='preview', batchCode='batch', owner='other'))['error'], 'invalid_request')

    def test_binding_failure_keeps_success(self):
        token = self.preview()['token']
        q.bind_visible_object.side_effect = RuntimeError('private')
        result = self.send(token)
        self.assertEqual(result['status'], 'accepted')
        self.assertFalse(result['callbackBound'])
        self.assertTrue(result['requiresAttention'])
        self.assertEqual(result['warning'], 'callback_binding_unverified')
        self.assertTrue(result['message'])
        self.assertEqual(self.send(token)['status'], 'accepted')

    def test_unknown_blocks_new_preview_and_preexisting_token(self):
        first = self.preview()['token']
        second = self.preview()['token']
        self.client.send_card.side_effect = TimeoutError('private')
        self.assertEqual(self.send(first)['status'], 'unknown')
        blocked = self.preview()
        self.assertEqual(blocked['status'], 'unknown')
        self.assertTrue(blocked['previewBlocked'])
        self.assertNotIn('token', blocked)
        self.assertEqual(self.send(second)['status'], 'unknown')
        self.client.send_card.assert_called_once()

    def test_accepted_blocks_new_preview_and_preexisting_token(self):
        first = self.preview()['token']
        second = self.preview()['token']
        self.send(first)
        self.assertTrue(self.preview()['previewBlocked'])
        self.assertTrue(self.send(second)['replayed'])
        self.client.send_card.assert_called_once()

    def test_changed_pending_rows_allow_new_preview(self):
        token = self.preview()['token']
        self.client.send_card.side_effect = TimeoutError()
        self.send(token)
        self.data['rows'][0]['missing'] = ['region']
        self.assertIn('token', self.preview())

    def test_card_failure_after_session_save_is_not_sent(self):
        token = self.preview()['token']
        q.build_pending_card.side_effect = RuntimeError('private')
        result = self.send(token)
        self.assertEqual(result['status'], 'not_sent')
        self.assertEqual(result['error'], 'pre_send_failed')
        self.assertEqual(self.send(token)['status'], 'not_sent')
        q._save.assert_called_once()
        self.client.send_card.assert_not_called()
        self.assertIn('token', self.preview())

    def test_save_failure_is_not_sent(self):
        token = self.preview()['token']
        q._save.side_effect = ValueError('session_changed')
        result = self.send(token)
        self.assertEqual(result['status'], 'not_sent')
        self.assertEqual(result['error'], 'session_changed')
        self.client.send_card.assert_not_called()

    def test_client_default_and_explicit_chat(self):
        client = object.__new__(FeishuClient)
        client._client = MagicMock()
        client._client.post.return_value.json.return_value = {'code': 0}
        client._auth_headers = lambda: {}
        for kind in ('open_id', 'chat_id'):
            kwargs = {} if kind == 'open_id' else {'receive_id_type': kind}
            client.send_card(receive_id='id', card={}, **kwargs)
            self.assertEqual(client._client.post.call_args.kwargs['params']['receive_id_type'], kind)


class RuntimeEnvironmentTests(unittest.TestCase):
    def check_runtime(self, fail=False):
        @dataclass
        class Settings:
            excel_import_state_path: str = 'offline.sqlite'

        fake = SimpleNamespace(binding=lambda root: ({'AFTB_APP_SECRET': 'service-only', 'TEMP': 'service-temp'}, []),
                               snapshot=lambda *args: {'revision': 'revision'})
        spec = SimpleNamespace(loader=SimpleNamespace(exec_module=lambda module: None))
        observed = {}
        def load():
            observed.update(os.environ)
            if fail:
                raise RuntimeError('offline failure')
            return Settings()
        with patch.dict(os.environ, {'SystemRoot': r'C:\Windows', 'WINDIR': r'C:\Windows',
                                     'PATH': 'system-path', 'TEMP': 'parent-temp',
                                     'AFTB_APP_SECRET': 'parent-secret', 'OPENAI_API_KEY': 'parent-key',
                                     'ADMS_APP_SECRET': 'parent-alias'}, clear=True):
            before = dict(os.environ)
            cwd = Path.cwd()
            with patch.object(mod.importlib.util, 'spec_from_file_location', return_value=spec), \
                 patch.object(mod.importlib.util, 'module_from_spec', return_value=fake), \
                 patch('aftb.config.load_settings', side_effect=load):
                if fail:
                    with self.assertRaises(RuntimeError):
                        mod.runtime(ROOT)
                else:
                    _, revision = mod.runtime(ROOT)
                    self.assertEqual(revision, 'revision')
            self.assertEqual(dict(os.environ), before)
            self.assertEqual(Path.cwd(), cwd)
        upper = {k.upper(): v for k, v in observed.items()}
        self.assertEqual(upper['SYSTEMROOT'], r'C:\Windows')
        self.assertEqual(upper['PATH'], 'system-path')
        self.assertEqual(upper['TEMP'], 'service-temp')
        self.assertEqual(upper['AFTB_APP_SECRET'], 'service-only')
        self.assertNotIn('OPENAI_API_KEY', upper)
        self.assertNotIn('ADMS_APP_SECRET', upper)

    def test_baseline_preserved_credentials_not_inherited(self):
        self.check_runtime()

    def test_environment_restored_after_failure(self):
        self.check_runtime(fail=True)


class SessionCASTests(unittest.TestCase):
    def test_batch_read_rate_limit_no_retry(self):
        from aftb.history_registry import _batch_read
        for status, code, expected in ((429, 0, 'remote_rate_limited'), (200, 99991400, 'remote_rate_limited'), (200, 99991403, 'remote_quota_exhausted'), (429, 99991403, 'remote_quota_exhausted')):
            with self.subTest(status=status, code=code):
                client = MagicMock()
                response = client._client.post.return_value
                response.status_code = status
                response.json.return_value = {'code': code, 'data': {'records': []}}
                with self.assertRaisesRegex(ValueError, '^' + expected + '$'):
                    _batch_read(client, SimpleNamespace(bitable_app_token='offline'), 'table', ['a', 'b', 'c'])
                client._client.post.assert_called_once()
                response.json.assert_called_once()

    def test_batch_read_non_json_rate_limit(self):
        from aftb.history_registry import _batch_read
        client = MagicMock()
        client._client.post.return_value.status_code = 429
        client._client.post.return_value.json.side_effect = ValueError('non JSON')
        with self.assertRaisesRegex(ValueError, '^remote_rate_limited$'):
            _batch_read(client, SimpleNamespace(bitable_app_token='offline'), 'table', ['a'])
        client._client.post.assert_called_once()

    def test_inspection_filters_aliases_review_only_and_unrelated(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'business.sqlite'
            with sqlite3.connect(path) as db:
                db.execute('CREATE TABLE excel_batches(code TEXT,owner TEXT,chat TEXT)')
                db.execute("INSERT INTO excel_batches VALUES('batch','owner','chat')")
            db.close()
            settings = SimpleNamespace(excel_import_state_path=str(path), mkt_excel_cards_enabled=True)
            rows = [dict(source='other', sheet='Other', row_number=1, missing=['grade'], aliases=[dict(source='batch', sheet='Right', row_number=3)]),
                    dict(source='batch', sheet='Review', row_number=4, missing=[], review=True),
                    dict(source='unrelated', sheet='No', row_number=5, missing=['grade'])]
            with patch('aftb.excel_import._authorize', return_value='Alice'), patch.object(q, 'list_pending', return_value=rows) as listing:
                result = mod.inspect(settings, object(), 'batch')
                self.assertEqual(len(result['rows']), 1)
                self.assertEqual(result['rows'][0]['sheet'], 'Right')
                self.assertEqual(result['rows'][0]['aliases'], [])
                self.assertEqual(listing.call_args.kwargs, {'batch_code': 'batch'})
            settings.mkt_excel_cards_enabled = False
            with self.assertRaisesRegex(ValueError, 'cards_disabled'):
                mod.inspect(settings, object(), 'batch')

    def test_newer_session_is_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            settings = SimpleNamespace(excel_import_state_path=str(Path(folder) / 'business.sqlite'))
            q._save(settings, 'owner', 'chat', [], expected=None)
            with mod.closing(mod.readonly(settings.excel_import_state_path)) as db:
                before = mod.session(db, 'owner', 'chat')
            q._save(settings, 'owner', 'chat', [], selected='new')
            with self.assertRaisesRegex(ValueError, 'session_changed'):
                q._save(settings, 'owner', 'chat', [], expected=before)
            self.assertEqual(q.active_session(settings, 'owner', 'chat')['selected'], 'new')


if __name__ == '__main__':
    unittest.main()
