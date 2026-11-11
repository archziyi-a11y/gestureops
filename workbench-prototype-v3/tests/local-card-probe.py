import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('probe', Path(__file__).resolve().parents[1] / 'src/domain/local-card-probe.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class ProbeTests(unittest.TestCase):
    def test_response_redaction(self):
        self.assertEqual(probe.classify_response(200, {'code': 200, 'data': [{'body':'SECRET'}]}), {'state':'available','http':200,'count':1})
        self.assertEqual(probe.classify_response(401, None)['state'], 'auth_failed')
        self.assertEqual(probe.classify_response(200, {'code':401})['state'], 'auth_failed')
        self.assertEqual(probe.classify_response(200, {'code':200,'data':{}})['state'], 'rejected')
        self.assertEqual(probe.classify_response(302, None)['state'], 'rejected')

    def test_local_scope_and_empty_files(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            (base/'ok').write_bytes(b'x')
            (base/'empty').touch()
            rows = [{'asset_type':'image','path':p} for p in ['ok','empty','missing','../outside']]
            rows.append({'asset_type':'note','path':'ignored'})
            (base/'manifest.jsonl').write_text('\n'.join(map(json.dumps, rows)), encoding='utf-8')
            self.assertEqual(probe.media_check(base), {'checked':4,'readable':1,'failed':3})


if __name__ == '__main__':
    unittest.main()
