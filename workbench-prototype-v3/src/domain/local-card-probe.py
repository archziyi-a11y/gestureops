"""Read-only live checks; stdout is an allowlisted aggregate, never API bodies."""
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


def classify_response(status, body):
    code = body.get('code') if isinstance(body, dict) else None
    if status in (401, 403) or code in (401, 403):
        return {'state': 'auth_failed', 'http': status}
    if status == 200 and code in (0, 200) and isinstance(body.get('data'), list):
        return {'state': 'available', 'http': status, 'count': len(body['data'])}
    return {'state': 'rejected', 'http': status}


def media_check(base):
    result = dict(checked=0, readable=0, failed=0)
    base = base.resolve()
    with (base / 'manifest.jsonl').open(encoding='utf-8') as manifest:
        for line in manifest:
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get('asset_type') not in ('image', 'wechat_note_image'):
                continue
            result['checked'] += 1
            try:
                path = (base / row['path']).resolve()
                if not path.is_relative_to(base):
                    raise ValueError('outside_scope')
                with path.open('rb') as image:
                    if not image.read(1):
                        raise ValueError('empty')
                result['readable'] += 1
            except (OSError, ValueError, KeyError, TypeError):
                result['failed'] += 1
    return result


def prism_check():
    from dotenv import dotenv_values
    config = dotenv_values('D:/Dev/Prism/config/.env')
    script = r"""$ErrorActionPreference='Stop';
$p=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -notmatch '^(pwsh|powershell|rg|Code|Codex)' -and $_.CommandLine -match '(?i)prism|services[./\\]read_api' });
$s=@(Get-CimInstance Win32_Service | Where-Object { $_.PathName -match '(?i)prism|read_api' -or $_.Name -match '(?i)prism' });
$t=@(Get-ScheduledTask | Where-Object { $_.TaskName -match '(?i)prism' -or ($_.Actions.Arguments -join ' ') -match '(?i)prism|read_api' });
$l=@(Get-NetTCPConnection -State Listen | Where-Object OwningProcess -in $p.ProcessId);
@{processes=$p.Count;services=$s.Count;tasks=$t.Count;listeners=$l.Count;ports=@(Get-NetTCPConnection -State Listen | Select-Object -ExpandProperty LocalPort)}|ConvertTo-Json -Compress"""
    proc = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script], capture_output=True, timeout=15, creationflags=0x08000000)
    if proc.returncode:
        raise ValueError('inventory_failed')
    result = json.loads(proc.stdout.decode('utf-8-sig'))
    listening_ports = result.pop('ports')
    # Only known local operational endpoints; never probe arbitrary URLs or send credentials.
    endpoints = []
    host = config.get('PRISM_JOB_HOST')
    port = config.get('PRISM_JOB_PORT')
    if host and port:
        endpoints.append((host, int(port)))
    for key in ('PRISM_INGESTION_BASE_URL', 'PRISM_READ_API_BASE_URL'):
        if config.get(key):
            url = urlparse(config[key])
            endpoints.append((url.hostname, url.port or (443 if url.scheme == 'https' else 80)))
    result['configuredPorts'] = []
    for host, port in endpoints:
        if host not in ('127.0.0.1', 'localhost', '::1'):
            result['nonlocalConfigured'] = True
            continue
        listening = port in listening_ports
        result['configuredPorts'].append({'port': port, 'listening': listening})
    result['readApiConfigured'] = bool(config.get('PRISM_READ_API_BASE_URL'))
    result['state'] = 'not_started' if not any(result[k] for k in ('processes', 'services', 'tasks', 'listeners')) and not any(p['listening'] for p in result['configuredPorts']) and not result.get('nonlocalConfigured') else 'needs_http_check'
    return result


def main():
    root = Path(__file__).resolve().parents[3]
    sys.path.insert(0, str(root / 'project/modules/jiaoyan-qun-archive/src'))
    from jyq.config import load_settings, ROOM_WHITELIST
    from jyq.ifangzhou_client import headers_from_cookie
    import httpx
    started = datetime.now(timezone.utc).isoformat()
    output = {}
    try:
        settings = load_settings()
        now = int(datetime.now(timezone.utc).timestamp() * 1000)
        # One row per existing allowlisted room, same account/time scope as daily collection.
        checks = []
        with httpx.Client(timeout=8, follow_redirects=False) as client:
            for room in ROOM_WHITELIST:
                response = client.post(settings.ifangzhou_base_url + '/wp/chatroomMessage/searchChatroomMessage', headers=headers_from_cookie(settings.ifangzhou_cookie), json={'wechatAccountId': settings.wechat_account_id, 'wechatChatroomId': room.room_id, 'smallWechatTime': now-2*86400000, 'bigWechatTime': now, 'pageSize': 1, 'upward': True, 'keyword': None, 'messageId': None, 'msgSvrId': None, 'msgType': None, 'recalled': None})
                try:
                    body = response.json()
                except ValueError:
                    body = None
                checks.append(classify_response(response.status_code, body))
        output['channel'] = {'state': 'available' if all(c['state']=='available' for c in checks) else ('auth_failed' if any(c['state']=='auth_failed' for c in checks) else 'rejected'), 'checks': checks}
    except Exception:
        output['channel'] = {'state': 'unreachable'}
    try:
        output['media'] = media_check(root / 'corpus_raw/crm/ifangzhou/jyq')
    except Exception:
        output['media'] = {'state': 'unknown'}
    try:
        output['prism'] = prism_check()
    except Exception:
        output['prism'] = {'state': 'unknown'}
    output.update(startedAt=started, finishedAt=datetime.now(timezone.utc).isoformat())
    print(json.dumps(output))


if __name__ == '__main__':
    main()
