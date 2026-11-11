"""Local inspection and explicit, single-attempt publication. Never dispatches."""
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

PACKAGE = 'com.example.sasalele'
REFERENCE = Path('D:/Dev/AndroidProjects/SASALELE/deliverables/SASALELE-1.11-customer-flow-v35.apk')
REFERENCE_SHA = 'eabe06e4722f33fa2f02584d282a5f979b66feab0365f7385b5d0e32be596d13'
LIMIT = 128 * 1024 * 1024


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inspect(path):
    sdk = Path(os.environ.get('ANDROID_SDK_ROOT') or Path(os.environ['LOCALAPPDATA']) / 'Android/Sdk')
    candidates = sorted((sdk / 'build-tools').glob('*'), reverse=True)
    tool = next((p for p in candidates if (p / 'aapt.exe').is_file() and (p / 'apksigner.bat').is_file()), None)
    if not tool or not REFERENCE.is_file() or digest(REFERENCE) != REFERENCE_SHA:
        raise ValueError('inspection_unavailable')
    def command(name, *args):
        return subprocess.check_output([str(tool / name), *map(str, args)], stderr=subprocess.DEVNULL, timeout=90, text=True, encoding='utf-8')
    def cert(apk):
        output = command('apksigner.bat', 'verify', '--print-certs', apk)
        values = sorted(re.findall(r'Signer #\d+ certificate SHA-256 digest: ([0-9a-f]{64})', output))
        if not values:
            raise ValueError('invalid_signature')
        return values
    size = path.stat().st_size
    if not 0 < size <= LIMIT:
        raise ValueError('invalid_size')
    match = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", command('aapt.exe', 'dump', 'badging', path))
    if not match or match[1] != PACKAGE or cert(path) != cert(REFERENCE):
        raise ValueError('invalid_apk')
    return dict(package=PACKAGE, versionCode=int(match[2]), versionName=match[3], sha256=digest(path), bytes=size)


def fingerprint(row):
    return hashlib.sha256(json.dumps(row, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()


def publish(path, state, save, api, upload, download):
    if state['phase'] == 'registered_not_dispatched':
        return state
    if state['phase'] != 'inspected':
        raise ValueError('publication_requires_reconciliation')
    if inspect(path) != state['metadata']:
        raise ValueError('artifact_changed')
    def current():
        rows = [r for r in api('GET', '/wp/AppDisplaySetting/all') if r.get('appPackage') == PACKAGE]
        if len(rows) != 1:
            raise ValueError('ambiguous_registry')
        return rows[0]
    old = current()
    state['previousFingerprint'] = fingerprint(old)
    state['phase'] = 'upload_outcome_unknown'
    save(state)
    url = upload(path, state['metadata'])
    download(url, state['metadata'])
    state['phase'] = 'download_verified'
    save(state)
    if fingerprint(current()) != state['previousFingerprint']:
        raise ValueError('app_changed')
    meta = state['metadata']
    payload = dict(id=old['id'], appName='SASALELE v' + str(meta['versionCode']), appPackage=PACKAGE, installType=2, appUrl=url, appRemark='SHA256 ' + meta['sha256'])
    state['phase'] = 'registry_update_unknown'
    save(state)
    api('PUT', '/wp/AppDisplaySetting', json=payload)
    state['phase'] = 'registry_written_unverified'
    save(state)
    row = current()
    if row['id'] != old['id'] or row.get('appName') != payload['appName']:
        raise ValueError('registry_mismatch')
    download(row['appUrl'], meta)
    state.update(phase='registered_not_dispatched', app=dict(id=row['id'], name=row['appName'], fingerprint=fingerprint(row)))
    save(state)
    return state


def remote():
    repo = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repo / 'project/modules/qm-sales-assistant/private/fangzhou-release-v30-20261031/sdk'))
    sys.path.insert(0, str(repo / 'project/modules/marketing-chat-insight/src'))
    import httpx
    import oss2
    from mktci.config import load_settings
    from mktci.ifangzhou_client import headers_from_cookie
    settings = load_settings()
    client = httpx.Client(headers=headers_from_cookie(settings.ifangzhou_cookie), timeout=120, trust_env=False)
    def api(method, route, **kw):
        response = client.request(method, settings.ifangzhou_base_url + route, **kw)
        response.raise_for_status()
        result = response.json()
        if result.get('code') != 0:
            raise ValueError('platform_failed')
        return result.get('data')
    def upload(path, meta):
        user = api('POST', '/adminUser/queryLoginUser')
        token = api('GET', '/wp/oss/token')
        if token['ossType'] != 'aliyun' or token['privateBucket'] or not re.fullmatch(r'oss-[a-z0-9-]+\.aliyuncs\.com', token['endpoint']):
            raise ValueError('unsupported_storage')
        key = f"{user['companyId']}/{user['userId']}/abc/{meta['sha256']}.abc"
        auth = oss2.StsAuth(token['accessKeyId'], token['accessKeySecret'], token['stsToken'], auth_version='v4')
        bucket = oss2.Bucket(auth, 'https://' + token['endpoint'], token['bucket'], region=token['endpoint'].split('.')[0][4:], connect_timeout=120)
        bucket.put_object_from_file(key, str(path), headers={'Content-Type': 'application/vnd.abc.package-archive', 'x-oss-meta-sha256': meta['sha256']})
        bucket.put_object(key + '.md5', hashlib.md5(path.read_bytes()).hexdigest().encode(), headers={'Content-Type': 'text/plain'})
        return f"https://{token['bucket']}.{token['endpoint']}/{key}"
    def download(url, meta):
        h, size = hashlib.sha256(), 0
        with httpx.stream('GET', url, timeout=120, follow_redirects=True, trust_env=False) as response:
            response.raise_for_status()
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > LIMIT:
                    raise ValueError('download_size')
                h.update(chunk)
        if size != meta['bytes'] or h.hexdigest() != meta['sha256']:
            raise ValueError('download_mismatch')
    return api, upload, download


def main():
    body = json.load(sys.stdin)
    path = Path(body['path'])
    if sys.argv[1] == 'inspect':
        return inspect(path)
    if sys.argv[1] != 'publish':
        raise ValueError('invalid_operation')
    directory = path.parent
    lock = directory / 'publish.lock'
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        state_path = path.with_suffix('.json')
        state = json.loads(state_path.read_text(encoding='utf-8'))
        def save(value):
            tmp = state_path.with_suffix('.tmp')
            with tmp.open('w', encoding='utf-8') as stream:
                json.dump(value, stream)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(tmp, state_path)
        return publish(path, state, save, *remote())
    finally:
        os.close(fd)
        lock.unlink()


if __name__ == '__main__':
    try:
        print(json.dumps(main()))
    except Exception:
        print('{"error":"release_failed_check_phase"}')
        sys.exit(1)
