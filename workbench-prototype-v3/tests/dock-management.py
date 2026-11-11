import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
import types

spec = importlib.util.spec_from_file_location('management', Path(__file__).resolve().parents[1] / 'scripts/dock-management.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
original_inspect = m.inspect
def isolated(root, *args, **kwargs):
    return original_inspect(root, *args, **kwargs, environment_reader=lambda r: ({}, r))
m.inspect = isolated


class ManagementTests(unittest.TestCase):
    def test_missing_never_creates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = m.inspect(root, probe_service=False)
            self.assertEqual(result['batches']['status'], 'missing')
            self.assertEqual(list(root.iterdir()), [])

    def test_partial_unknown_and_filtering(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = root / 'project/modules/auto-fill-table-bot/data'
            data.mkdir(parents=True)
            db = data / 'excel_import.sqlite'
            with sqlite3.connect(db) as c:
                c.execute('CREATE TABLE excel_batches(code,owner,created,status,payload)')
                c.execute('CREATE TABLE excel_rows(code,position,status,record_id)')
                c.execute('INSERT INTO excel_batches VALUES(?,?,?,?,?)', ('ABCDEF12', 'private-account', 1, 'pending', 'CUSTOMER SECRET'))
                c.executemany('INSERT INTO excel_rows VALUES(?,?,?,?)', [('ABCDEF12', 0, 'success', 'private-record'), ('ABCDEF12', 1, 'failed', None), ('ABCDEF12', 2, 'SECRET', None)])
            c.close()
            before = db.read_bytes()
            result = m.inspect(root, 'batch', 'abcdef12', probe_service=False)
            rows = result['receipts']['items']
            self.assertEqual([r['outcome'] for r in rows], ['success', 'failed_or_unknown', 'unknown'])
            self.assertTrue(all(not r['retryAllowed'] for r in rows))
            self.assertEqual(before, db.read_bytes())
            output = json.dumps(result)
            for secret in ('CUSTOMER', 'SECRET', 'private-account', 'private-record'):
                self.assertNotIn(secret, output)
            self.assertEqual(m.inspect(root, 'batch', 'ffffffff', False)['batch']['status'], 'not_found')

    def test_schema_unknown_not_empty_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = root / 'project/modules/auto-fill-table-bot/data'
            data.mkdir(parents=True)
            db = data / 'excel_import.sqlite'
            db.touch()
            self.assertEqual(m.inspect(root, probe_service=False)['batches']['status'], 'unknown')
            self.assertEqual(db.stat().st_size, 0)

    def test_unverified_service_does_not_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            def fail(root):
                raise ValueError('secret exception')
            result = original_inspect(Path(tmp), probe_service=False, environment_reader=fail)
            self.assertEqual(result['batches']['status'], 'unknown')
            self.assertNotIn('secret exception', json.dumps(result))

    def test_config_precedence_and_secrets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'config').mkdir()
            (root / 'config/.env').write_text('AFTB_APP_SECRET=HIDDEN\nAFTB_MKT_EXCEL_IMPORT_ENABLED=false\n')
            env, summary = m.configuration(root, lambda r: ({'AFTB_MKT_EXCEL_IMPORT_ENABLED': 'true'}, r))
            self.assertEqual(env['AFTB_MKT_EXCEL_IMPORT_ENABLED'], 'false')
            self.assertNotIn('HIDDEN', json.dumps(summary))
            self.assertTrue(summary['bindingVerified'])

    def test_snapshot_counts_truncation_and_case(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / 'b.sqlite'
            c = sqlite3.connect(db)
            c.executescript('CREATE TABLE excel_batches(code,owner,created,status); CREATE TABLE excel_rows(code,position,status,record_id);')
            c.executemany('INSERT INTO excel_batches VALUES(?,?,?,?)', [(f'{i:08X}', 'owner', 1, 'pending') for i in range(102)])
            c.execute('INSERT INTO excel_batches VALUES(?,?,?,?)', ('495C6AEC', 'owner', 2, 'pending'))
            c.executemany('INSERT INTO excel_rows VALUES(?,?,?,?)', [('495C6AEC', i, 'success', 'r') for i in range(502)])
            c.commit()
            c.close()
            batches, receipts = m.read_batches(db)
            self.assertEqual(len(batches['items']), 100)
            self.assertTrue(batches['truncated'])
            self.assertEqual(receipts['items'], [])
            for code in ('495c6aec', '495C6AEC'):
                batches, receipts = m.read_batches(db, code)
                self.assertEqual(batches['items'][0]['counts'], {'success': 502})
                self.assertTrue(batches['items'][0]['expired'])
                self.assertEqual(batches['items'][0]['status'], 'pending')
                self.assertEqual(len(receipts['items']), 500)
                self.assertTrue(receipts['truncated'])
                self.assertEqual(receipts['consistency'], 'single_sqlite_snapshot')

    def test_real_states_preserved(self):
        for value in ('blocked', 'master_pending', 'withdrawn', 'preparing', 'uncertain', 'schema_pending'):
            self.assertEqual(m.state(value), value)

    def test_nssm_binding_and_environment_layers(self):
        root = Path('D:/test-root').resolve()
        values = {'AppDirectory': str(root), 'AppParameters': str(root / 'project/modules/auto-fill-table-bot/scripts/run_aftb.py') + ' bot', 'AppEnvironment': ['AFTB_APP_ID=base'], 'AppEnvironmentExtra': ['AFTB_APP_ID=extra']}
        class Key:
            def __enter__(self): return self
            def __exit__(self, *args): pass
        def enum(*args): raise OSError()
        registry = types.SimpleNamespace(HKEY_LOCAL_MACHINE=1, OpenKey=lambda *a: Key(), QueryValueEx=lambda k, n: (values[n], 1), EnumValue=enum)
        with patch.dict('sys.modules', {'winreg': registry}):
            env, cwd = m.service_environment(root)
            self.assertEqual(env['AFTB_APP_ID'], 'extra')
            self.assertEqual(cwd, root)
            values['AppParameters'] = 'wrong.py bot'
            with self.assertRaises(ValueError): m.service_environment(root)

    def test_relative_override_uses_verified_cwd(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = original_inspect(root, probe_service=False, environment_reader=lambda r: ({'AFTB_EXCEL_IMPORT_STATE_PATH': 'private/nonexistent.sqlite'}, r))
            self.assertEqual(result['batches']['status'], 'missing')
            self.assertFalse((root / 'private').exists())

    def test_concurrent_commit_keeps_single_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / 'snapshot.sqlite'
            connect = sqlite3.connect
            writer = connect(db)
            writer.executescript("PRAGMA journal_mode=WAL; CREATE TABLE excel_batches(code,owner,created,status); CREATE TABLE excel_rows(code,position,status,record_id); INSERT INTO excel_batches VALUES('495C6AEC','owner',1,'pending'); INSERT INTO excel_rows VALUES('495C6AEC',0,'success','r');")
            changed = []
            def reader(*args, **kwargs):
                conn = connect(*args, **kwargs)
                def trace(sql):
                    if sql.startswith('SELECT position') and not changed:
                        writer.execute("INSERT INTO excel_rows VALUES('495C6AEC',1,'failed',NULL)")
                        writer.commit()
                        changed.append(True)
                conn.set_trace_callback(trace)
                return conn
            try:
                with patch.object(m.sqlite3, 'connect', reader):
                    batches, receipts = m.read_batches(db, '495C6AEC')
                self.assertTrue(changed)
                self.assertEqual(batches['items'][0]['counts'], {'success': 1})
                self.assertEqual(len(receipts['items']), 1)
                self.assertEqual(writer.execute('SELECT COUNT(*) FROM excel_rows').fetchone()[0], 2)
            finally:
                writer.close()

    def test_employee_label_projection(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = root / 'project/modules/auto-fill-table-bot/config'
            config.mkdir(parents=True)
            (config / 'user_profiles.json').write_text(json.dumps({'users': {'owner': {'label': 'Staff', 'secret': 'HIDDEN'}}}))
            data = config.parent / 'data'
            data.mkdir()
            c = sqlite3.connect(data / 'employee_tables.sqlite')
            c.execute('CREATE TABLE employee_tables(app_scope,owner_open_id,child_table_id,master_table_id,state)')
            c.execute("INSERT INTO employee_tables VALUES('scope','owner','c','m','ready')")
            c.commit()
            c.close()
            result = m.inspect(root, probe_service=False)
            self.assertEqual(result['bindings']['items'][0]['displayName'], 'Staff')
            self.assertNotIn('HIDDEN', json.dumps(result))

    def test_table_urls_are_scoped_and_sanitized(self):
        env = {'AFTB_BITABLE_APP_TOKEN': 'Base123', 'AFTB_APP_SECRET': 'CREDENTIAL',
               'MKTCI_FEISHU_BITABLE_URL': 'https://configured.feishu.cn/base/Base123?table=tblOld&secret=CREDENTIAL#PRIVATE'}
        scope = m.hashlib.sha256(b'Base123').hexdigest()
        self.assertEqual(m.table_url(env, scope, 'tblChild'), 'https://configured.feishu.cn/base/Base123?table=tblChild')
        for bad in ('', None, 'hash123', 'tblX&secret=CREDENTIAL'):
            self.assertIsNone(m.table_url(env, scope, bad))
        self.assertIsNone(m.table_url(env, 'other-base', 'tblChild'))
        for url in ('https://evil.test/base/Base123', 'https://configured.feishu.cn/base/Other',
                    'https://user:CREDENTIAL@configured.feishu.cn/base/Base123',
                    'javascript:alert(1)', 'https://configured.feishu.cn:bad/base/Base123', ''):
            self.assertIsNone(m.table_url(dict(env, MKTCI_FEISHU_BITABLE_URL=url), scope, 'tblChild'))

    def test_binding_links_readonly_without_credentials(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db = root / 'tables.sqlite'
            scope = m.hashlib.sha256(b'Base123').hexdigest()
            with sqlite3.connect(db) as c:
                c.execute('CREATE TABLE employee_tables(app_scope,owner_open_id,child_table_id,master_table_id,state)')
                c.execute('INSERT INTO employee_tables VALUES(?,?,?,?,?)', (scope, 'PRIVATE_OWNER', 'tblChild', 'tblMaster', 'ready'))
            c.close()
            before = db.read_bytes()
            env = {'ADMS_BITABLE_APP_TOKEN': 'Base123', 'AFTB_APP_SECRET': 'CREDENTIAL',
                   'AFTB_MKT_EMPLOYEE_TABLES_STATE_PATH': str(db),
                   'FEISHU_BITABLE_DASHBOARD_URL': 'https://configured.feishu.cn/base/Base123?secret=CREDENTIAL#PRIVATE'}
            result = original_inspect(root, probe_service=False, environment_reader=lambda r: (env, r))
            item = result['bindings']['items'][0]
            for prop, table in [('childTableUrl', 'tblChild'), ('masterTableUrl', 'tblMaster')]:
                self.assertEqual(item[prop], 'https://configured.feishu.cn/base/Base123?table=' + table)
            for secret in ('CREDENTIAL', 'PRIVATE_OWNER', '#PRIVATE', scope):
                self.assertNotIn(secret, json.dumps(result))
            self.assertEqual(before, db.read_bytes())


if __name__ == '__main__':
    unittest.main()
