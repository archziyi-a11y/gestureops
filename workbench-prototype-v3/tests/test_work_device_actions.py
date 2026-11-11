import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('actions', Path(__file__).resolve().parents[1] / 'scripts/work-device-actions.py')
actions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(actions)


class Response:
    is_success = True

    def __init__(self, data):
        self.data = data

    def raise_for_status(self):
        pass

    def json(self):
        return self.data


class Client:
    def __init__(self):
        self.app = {'id': 'a', 'appName': 'App', 'appPackage': actions.PACKAGE, 'appUrl': 'secret'}
        self.device = {'id': 'd', 'isDeleted': False, 'deviceAlive': True}
        self.writes = 0
        self.result = {'code': 0}

    def get(self, path):
        return Response({'code': 0, 'data': [self.app]})

    def post(self, path, json):
        if path.endswith('/search'):
            return Response({'code': 0, 'data': {'results': [self.device], 'total': 1}})
        self.writes += 1
        if isinstance(self.result, Exception):
            raise self.result
        return Response(self.result)


class Tests(unittest.TestCase):
    def setUp(self):
        self.client = Client()
        app = actions.catalog(self.client, '')['apps'][0]
        self.assertEqual(set(app), {'id', 'name', 'fingerprint'})
        self.body = {'appId': 'a', 'deviceId': 'd', 'appFingerprint': app['fingerprint'], 'action': 'install'}

    def test_acceptance_is_not_installation(self):
        self.assertEqual(actions.submit(self.client, '', self.body), {'state': 'accepted_not_verified', 'appName': 'App'})
        self.assertEqual(self.client.writes, 1)

    def test_changed_app_and_offline_rejected_without_write(self):
        self.client.app['appUrl'] = 'changed'
        self.assertEqual(actions.submit(self.client, '', self.body)['message'], 'app_changed')
        self.client.app['appUrl'] = 'secret'
        self.client.device['deviceAlive'] = False
        self.assertEqual(actions.submit(self.client, '', self.body)['message'], 'device_unavailable')
        self.assertEqual(self.client.writes, 0)

    def test_timeout_unknown_no_retry(self):
        self.client.result = TimeoutError('secret')
        self.assertEqual(actions.submit(self.client, '', self.body), {'state': 'submit_outcome_unknown', 'message': 'submit_outcome_unknown', 'appName': 'App'})
        self.assertEqual(self.client.writes, 1)

    def test_rejection(self):
        self.client.result = {'code': 403, 'message': 'secret'}
        self.assertEqual(actions.submit(self.client, '', self.body), {'state': 'rejected', 'message': 'upstream_rejected', 'appName': 'App'})

    def test_read_failure_has_safe_reason(self):
        self.client.get = lambda path: (_ for _ in ()).throw(RuntimeError('secret'))
        self.assertEqual(actions.submit(self.client, '', self.body), {'state': 'rejected', 'message': 'read_failed'})
        self.assertEqual(self.client.writes, 0)

    def test_confirmed_old_work_client_cannot_dispatch(self):
        self.client.device['softwareVersion'] = '1.0.0.703'
        self.assertEqual(actions.submit(self.client, '', self.body)['message'], 'work_client_upgrade_required')
        self.assertEqual(self.client.writes, 0)
        self.client.device['softwareVersion'] = '1.0.0.708'
        self.assertEqual(actions.submit(self.client, '', self.body)['state'], 'accepted_not_verified')


if __name__ == '__main__':
    unittest.main()
