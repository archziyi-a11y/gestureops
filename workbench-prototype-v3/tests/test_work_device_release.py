import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release', Path(__file__).resolve().parents[1] / 'scripts/work-device-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class PublicationTests(unittest.TestCase):
    def test_unknown_never_writes(self):
        for phase in ['upload_outcome_unknown', 'download_verified', 'registry_update_unknown', 'registry_written_unverified']:
            with self.assertRaises(ValueError):
                release.publish(None, {'phase': phase}, None, None, None, None)

    def test_publish_same_id_and_readback(self):
        meta = {'sha256': 'a' * 64, 'versionCode': 36}
        old = dict(id='existing', appPackage=release.PACKAGE, appName='old')
        rows = [old]
        calls, phases = [], []
        def api(method, route, **kwargs):
            calls.append(method)
            if method == 'PUT':
                rows[0] = kwargs['json']
            return rows
        state = dict(phase='inspected', metadata=meta)
        with patch.object(release, 'inspect', return_value=meta):
            release.publish(None, state, lambda s: phases.append(s['phase']), api, lambda *a: 'fake-url', lambda *a: None)
        self.assertEqual(state['app']['id'], 'existing')
        self.assertEqual(calls.count('PUT'), 1)
        self.assertEqual(phases[-1], 'registered_not_dispatched')
        self.assertEqual(release.publish(None, state, None, None, None, None), state)


if __name__ == '__main__':
    unittest.main()
