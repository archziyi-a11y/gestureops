"""Single-attempt dispatch. Acceptance is not installation verification."""
import hashlib
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from work_device_policy import upgrade_block

PACKAGE = 'com.example.sasalele'


class ValidationRejected(Exception):
    pass


def query(client, base, path, payload=None):
    response = client.get(base + path) if payload is None else client.post(base + path, json=payload)
    response.raise_for_status()
    result = response.json()
    if result.get('code') != 0:
        raise ValueError('read_failed')
    return result['data']


def catalog(client, base):
    rows = query(client, base, '/wp/AppDisplaySetting/all')
    if not isinstance(rows, list):
        raise ValueError('invalid_catalog')
    return {'apps': [{'id': row['id'], 'name': row.get('appName') or row.get('name') or PACKAGE,
                      'fingerprint': hashlib.sha256(json.dumps(row, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()}
                     for row in rows if row.get('appPackage') == PACKAGE]}


def submit(client, base, body):
    try:
        if body.get('action') not in ('install', 'upgrade'):
            raise ValidationRejected('invalid_action')
        apps = catalog(client, base)['apps']
        matches = [a for a in apps if a['id'] == body['appId'] and a['fingerprint'] == body['appFingerprint']]
        if len(matches) != 1:
            raise ValidationRejected('app_changed')
        found = []
        for page in range(21):
            data = query(client, base, '/wp/devices/search', {'condition': {'isDeleted': False}, 'pageIndex': page, 'pageSize': 200})
            found.extend(r for r in data['results'] if r.get('id') == body['deviceId'])
            if (page + 1) * 200 >= data['total']:
                break
            if not data['results'] or page == 20:
                raise ValueError('incomplete_inventory')
        if len(found) != 1 or found[0].get('isDeleted') not in (False, 0) or found[0].get('deviceAlive') not in (True, 1):
            raise ValidationRejected('device_unavailable')
        if upgrade_block(found[0]):
            raise ValidationRejected('work_client_upgrade_required')
    except ValidationRejected as error:
        return {'state': 'rejected', 'message': str(error)}
    except Exception:
        return {'state': 'rejected', 'message': 'read_failed'}
    metadata = {'appName': matches[0]['name']}
    try:
        response = client.post(base + '/wp/devices/installDeviceApp', json={'deviceId': body['deviceId'], 'appId': body['appId']})
        result = response.json()
        if response.is_success and result.get('code') == 0:
            return {'state': 'accepted_not_verified', **metadata}
        if result.get('code') in (400, 401, 403, 404, 409, 422) or (result.get('code') == -1 and (result.get('msg') or result.get('message')) == '\u8bbe\u5907\u4e0d\u5728\u7ebf'):
            return {'state': 'rejected', 'message': 'device_unavailable' if result.get('code') == -1 else 'upstream_rejected', **metadata}
    except Exception:
        pass
    return {'state': 'submit_outcome_unknown', 'message': 'submit_outcome_unknown', **metadata}


def main():
    import httpx
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'project/modules/marketing-chat-insight/src'))
    from mktci.config import load_settings
    from mktci.ifangzhou_client import headers_from_cookie
    settings = load_settings()
    with httpx.Client(headers=headers_from_cookie(settings.ifangzhou_cookie), timeout=12, trust_env=False) as client:
        if sys.argv[1] == 'catalog':
            return catalog(client, settings.ifangzhou_base_url)
        if sys.argv[1] == 'submit':
            return submit(client, settings.ifangzhou_base_url, json.loads(sys.stdin.read()))
        raise ValueError('invalid_operation')


if __name__ == '__main__':
    try:
        print(json.dumps(main(), ensure_ascii=True))
    except Exception:
        print(json.dumps({'error': 'work_device_action_failed'}))
        sys.exit(1)
