"""Read-only management projection. Never import write-capable business readers."""
import argparse
from collections import Counter
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
from urllib.parse import urlsplit, urlunsplit, urlencode


def table_url(env, scope, table_id):
    token = (env.get('AFTB_BITABLE_APP_TOKEN') or env.get('ADMS_BITABLE_APP_TOKEN') or '').strip()
    if not token or scope != hashlib.sha256(token.encode()).hexdigest():
        return None
    if not isinstance(table_id, str) or not re.fullmatch(r'tbl[A-Za-z0-9]+', table_id):
        return None
    # Only known configured links are candidates; never project their query secrets.
    candidates = [env.get(key, '') for key in ('FEISHU_BITABLE_DASHBOARD_URL', 'MKTCI_FEISHU_BITABLE_URL',
                'MKTCI_PROFILE_BITABLE_URL', 'PXKB_DASHBOARD_URL', 'PXKB_DASHBOARD_HISTORY_URL')]
    # Owner-provided market base, also recorded in the deployment history.
    # The token/scope checks below prevent reuse for any other base.
    candidates.append('https://tcndv7yts3fd.feishu.cn/base/EIapbmjiba7U5YsDbqQcr0zHnXe')
    for raw in candidates:
        try:
            url = urlsplit(raw)
            host = url.hostname or ''
            if (url.scheme != 'https' or url.username or url.password or url.port
                    or not re.fullmatch(r'[A-Za-z0-9-]+\.(?:feishu\.cn|larksuite\.com)', host)
                    or url.path.rstrip('/') != '/base/' + token
                    or not re.fullmatch(r'[A-Za-z0-9]+', token)):
                continue
            return urlunsplit(('https', host, '/base/' + token, urlencode({'table': table_id}), ''))
        except (ValueError, TypeError):
            continue
    return None


def ref(value):
    return hashlib.sha256(str(value).encode()).hexdigest()[:16] if value else None


def state(value):
    allowed = {'pending', 'done', 'cancelled', 'superseded', 'success', 'failed', 'duplicate', 'blocked', 'ready', 'creating', 'preparing', 'uncertain', 'schema_pending', 'master_pending', 'withdrawn', 'child_attempted', 'child_uncertain', 'master_attempted', 'master_uncertain', 'child_created', 'error'}
    return value if value in allowed else 'unknown'


def read_rows(path, source, sql, params=()):
    result = dict(status='missing', source=source, items=[], truncated=False)
    if path is None:
        result['status'] = 'unknown'
    elif path.is_file():
        try:
            with closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True, timeout=2)) as conn:
                conn.row_factory = sqlite3.Row
                conn.execute('PRAGMA query_only=ON')
                rows = conn.execute(sql, params).fetchmany(501)
                result.update(status='available', items=[dict(r) for r in rows[:500]], truncated=len(rows) > 500)
        except (sqlite3.Error, OSError):
            result['status'] = 'unknown'
    return result


def service_environment(root):
    import winreg
    with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SYSTEM\CurrentControlSet\Services\AFTB-Bot\Parameters') as key:
        cwd = Path(winreg.QueryValueEx(key, 'AppDirectory')[0]).resolve()
        args = winreg.QueryValueEx(key, 'AppParameters')[0]
        script = str(root / 'project/modules/auto-fill-table-bot/scripts/run_aftb.py')
        if cwd != root or script.lower() not in args.lower() or not args.endswith(' bot'):
            raise ValueError('service_binding_mismatch')
        env = {}
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SYSTEM\CurrentControlSet\Control\Session Manager\Environment') as machine:
            index = 0
            while True:
                try:
                    name, value, _ = winreg.EnumValue(machine, index)
                except OSError:
                    break
                env[name] = value
                index += 1
        for name in ('AppEnvironment', 'AppEnvironmentExtra'):
            try:
                entries = winreg.QueryValueEx(key, name)[0]
            except FileNotFoundError:
                entries = []
            if name == 'AppEnvironment' and entries:
                env = {}
            for entry in entries:
                if '=' in entry:
                    k, v = entry.split('=', 1)
                    env[k] = v
        return env, cwd


def configuration(root, environment_reader=service_environment):
    try:
        env, cwd = environment_reader(root)
    except Exception:
        return {}, dict(status='unknown', source='nssm_binding_unverified', items=[], runtimeEffective='unknown')
    source = 'nssm_and_dotenv'
    for p in (root / 'config/.env', root / '.env'):
        if p.is_file():
            try:
                from dotenv import dotenv_values
                values = dotenv_values(p, interpolate=False)
                if any('$' in str(v) or '%' in str(v) for v in values.values() if v is not None):
                    raise ValueError('unresolved_interpolation')
                env.update({k: v for k, v in values.items() if v is not None})
            except Exception:
                return {}, dict(status='unknown', source='dotenv_unavailable', items=[])
            break
    keys = ['AFTB_APP_ID', 'AFTB_APP_SECRET', 'ADMS_APP_ID', 'ADMS_APP_SECRET', 'AFTB_BITABLE_APP_TOKEN', 'ADMS_BITABLE_APP_TOKEN', 'AFTB_MKT_DOCK_TABLE_ID', 'AFTB_MKT_EMPLOYEE_TABLES_ENABLED', 'AFTB_MKT_EMPLOYEE_MIRROR_ENABLED', 'AFTB_MKT_EXCEL_IMPORT_ENABLED']
    items = [dict(key=k, configured=bool(env.get(k)), enabled=(str(env[k]).lower() in ('1', 'true', 'yes', 'on')) if k.endswith('_ENABLED') and k in env else None) for k in keys]
    env['_verified_cwd'] = str(cwd)
    return env, dict(status='available', source=source, items=items, runtimeEffective='unknown', bindingVerified=True, inheritedEnvironment='machine_registry_current_not_process_snapshot')


def read_batches(path, batch_id=None):
    batches = dict(status='missing' if path else 'unknown', source='excel_batches', items=[], truncated=False)
    receipts = dict(status=batches['status'], source='excel_rows', items=[], truncated=False, consistency='single_sqlite_snapshot')
    if path is None or not path.is_file():
        return batches, receipts
    try:
        with closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True, timeout=2)) as conn:
            conn.row_factory = sqlite3.Row
            conn.execute('PRAGMA query_only=ON')
            conn.execute('BEGIN')
            query = 'SELECT code,owner,created,status FROM excel_batches'
            if batch_id:
                query += ' WHERE code=?'
            rows = conn.execute(query + ' ORDER BY created DESC LIMIT 101', (batch_id.upper(),) if batch_id else ()).fetchall()
            batches.update(status='available', truncated=len(rows) > 100)
            receipts['status'] = 'available'
            for row in rows[:100]:
                b = dict(row)
                counts = Counter()
                for status, count in conn.execute('SELECT status,COUNT(*) FROM excel_rows WHERE code=? GROUP BY status', (b['code'],)):
                    counts[state(status)] += count
                if batch_id:
                    details = conn.execute('SELECT position,status,record_id FROM excel_rows WHERE code=? ORDER BY position LIMIT 501', (b['code'],)).fetchall()
                    receipts['truncated'] = len(details) > 500
                    for r in details[:500]:
                        s = state(r['status'])
                        receipts['items'].append(dict(batchId=b['code'], position=r['position'], status=s, recordRef=ref(r['record_id']), retryAllowed=False, outcome='failed_or_unknown' if s == 'failed' else s))
                b.update(id=b.pop('code'), accountRef=ref(b.pop('owner')), status=state(b['status']), counts=dict(counts), receiptsStatus='available', receiptsTruncated=receipts['truncated'], expired=b['status'] == 'pending' and datetime.now(timezone.utc).timestamp() - b['created'] >= 86400)
                batches['items'].append(b)
    except (sqlite3.Error, OSError, TypeError, ValueError):
        batches.update(status='unknown', items=[])
        receipts.update(status='unknown', items=[])
    return batches, receipts


def inspect(root, action='overview', batch_id=None, probe_service=True, environment_reader=service_environment):
    env, config = configuration(root, environment_reader)
    base = root / 'project/modules/auto-fill-table-bot/data'
    def path(key, default):
        raw = env.get(key)
        if config['status'] == 'unknown':
            return None
        if raw:
            p = Path(raw)
            if '$' in raw or '%' in raw:
                return None
            return p if p.is_absolute() else Path(env['_verified_cwd']) / p
        return base / default
    excel = path('AFTB_EXCEL_IMPORT_STATE_PATH', 'excel_import.sqlite')
    tables = path('AFTB_MKT_EMPLOYEE_TABLES_STATE_PATH', 'employee_tables.sqlite')
    batches, receipts = read_batches(excel, batch_id)
    bindings = read_rows(tables, 'employee_tables', 'SELECT app_scope,owner_open_id,child_table_id,master_table_id,state FROM employee_tables')
    bindings['items'] = [dict(accountRef=ref(r['owner_open_id']), childTableRef=ref(r['child_table_id']), masterTableRef=ref(r['master_table_id']), childTableUrl=table_url(env, r['app_scope'], r['child_table_id']), masterTableUrl=table_url(env, r['app_scope'], r['master_table_id']), state=state(r['state']), permissions='unknown') for r in bindings['items']]
    mirror = read_rows(tables, 'employee_mirror', 'SELECT phase,COUNT(*) AS count FROM employee_mirror GROUP BY phase')
    aggregate = Counter()
    for r in mirror['items']:
        aggregate[state(r['phase'])] += r['count']
    mirror['items'] = [dict(phase=k, count=v, remoteVerified=False) for k, v in aggregate.items()]
    names = {}
    profiles = path('AFTB_USER_PROFILES_PATH', '../config/user_profiles.json')
    try:
        if profiles and profiles.is_file():
            users = json.loads(profiles.read_text(encoding='utf-8')).get('users', {})
            names = {ref(k): v['label'].strip()[:80] for k, v in users.items() if isinstance(v, dict) and isinstance(v.get('label'), str)}
    except (OSError, ValueError, TypeError, AttributeError):
        pass
    for item in bindings['items'] + batches['items']:
        item['displayName'] = names.get(item['accountRef']) or None
    receipts['mirror'] = mirror
    service = dict(status='unknown', source='windows_service', name='AFTB-Bot', businessHealth='unknown')
    if probe_service and os.name == 'nt':
        try:
            run = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', '(Get-Service -Name AFTB-Bot -ErrorAction Stop).Status.ToString()'], capture_output=True, text=True, timeout=5)
            value = run.stdout.strip()
            if run.returncode == 0 and value in ('Running', 'Stopped', 'Paused', 'StartPending', 'StopPending'):
                service['status'] = value
        except (OSError, subprocess.TimeoutExpired):
            pass
    common = dict(observedAt=datetime.now(timezone.utc).isoformat(), clockSource='host_wall_clock_utc_observation_end', limitations=['local_persisted_evidence_not_remote_verification', 'service_configuration_and_running_version_not_verified', 'cancel_requires_admin_authorization_object_version_and_business_lock_contract', 'no_retry_or_production_write', 'private_receipt_ledger_not_joined', 'bindings_do_not_prove_current_account_authorization'])
    if action == 'batch':
        # Mirror entries cannot be attributed to this batch without private payload keys.
        receipts.pop('mirror')
        return dict(common, batch=dict(status=batches['status'] if batches['items'] else ('not_found' if batches['status'] == 'available' else batches['status']), item=batches['items'][0] if batches['items'] else None), receipts=receipts)
    return dict(common, service=service, config=config, bindings=bindings, batches=batches, receipts=receipts)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--action', choices=['overview', 'diagnose', 'batch'], default='overview')
    parser.add_argument('--id')
    args = parser.parse_args()
    if args.action == 'batch' and not re.fullmatch('[a-fA-F0-9]{8}', args.id or ''):
        parser.error('invalid_batch_id')
    print(json.dumps(inspect(Path(args.root).resolve(), args.action, args.id), ensure_ascii=True))
