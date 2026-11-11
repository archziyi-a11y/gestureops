"""Read-only Fangzhou device/app metadata; no customer data or credentials in output."""
import json
import sys
from pathlib import Path
from datetime import datetime, timezone
import httpx
from work_device_policy import upgrade_block, team_authorization
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'project/modules/marketing-chat-insight/src'))
from mktci.config import load_settings
from mktci.ifangzhou_client import headers_from_cookie

def main():
    settings = load_settings()
    with httpx.Client(headers=headers_from_cookie(settings.ifangzhou_cookie), timeout=12) as client:
        def query(path, payload=None):
            response = (client.post(settings.ifangzhou_base_url + path, json=payload) if payload is not None else client.get(settings.ifangzhou_base_url + path))
            response.raise_for_status()
            result = response.json()
            if result.get('code') != 0:
                raise RuntimeError('upstream_rejected')
            return result.get('data')
        devices = []
        page = 0
        while True:
            data = query('/wp/devices/search', {'condition': {'isDeleted': False}, 'pageIndex': page, 'pageSize': 200})
            rows = data['results']
            devices.extend(rows)
            if len(devices) >= data['total']:
                break
            if not rows or page >= 20:
                raise RuntimeError('incomplete_inventory')
            page += 1
        output = []
        for row in devices:
            apps = None
            try:
                records = query('/wp/devices/getDeviceAppList?deviceId=' + row['id']) or []
                apps = [{'name': a.get('appName'), 'status': a.get('statusDesc')} for a in records if a.get('packageName') == 'com.example.sasalele']
            except (httpx.HTTPError, ValueError, RuntimeError):
                pass
            output.append({'id': row['id'], 'label': row.get('memo') or row.get('realname') or '未命名工作机', 'model': row.get('model'), 'workClientVersion': row.get('softwareVersion'), 'online': row.get('deviceAlive'), 'lastReport': row.get('lastReportTime'), 'apps': apps, 'upgradeBlock': upgrade_block(row)})
        print(json.dumps({'observedAt': datetime.now(timezone.utc).isoformat(), 'devices': output, 'authorization': team_authorization()}, ensure_ascii=True))

try:
    main()
except Exception:
    print(json.dumps({'error': '设备读取失败，请检查方舟连接或稍后重试'}))
    sys.exit(1)
