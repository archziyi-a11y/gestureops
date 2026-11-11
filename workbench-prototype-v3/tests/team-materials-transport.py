"""Offline transport checks; the private configuration is never loaded."""
import importlib.util
from pathlib import Path
import unittest
import httpx

spec = importlib.util.spec_from_file_location('materials_transport', Path(__file__).resolve().parents[1] / 'scripts/team-materials.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class TransportTests(unittest.TestCase):
    def test_rejection_and_unknown(self):
        for status in (400, 401, 409, 413, 422, 429, 500):
            def handle(request):
                self.assertIn('中文'.encode(), request.content)
                return httpx.Response(status)
            with httpx.Client(base_url='https://offline.invalid', transport=httpx.MockTransport(handle)) as client:
                command = {'op': 'upload', 'payload': {'title': '中文', 'content': '中文内容', 'requestId': '12345678-12345678'}}
                if status < 500:
                    self.assertEqual(module.execute(command, client), {'status': 'knownfailure', 'httpStatus': status})
                else:
                    with self.assertRaises(httpx.HTTPStatusError):
                        module.execute(command, client)

if __name__ == '__main__':
    unittest.main()
