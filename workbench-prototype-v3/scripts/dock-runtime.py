"""Restricted AFTB runtime editor. stdin/stdout JSON; never execute business code."""
import argparse
import ast
import hashlib
import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import ssl
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit


GROUPS = {
    'bot': ['AFTB_APP_ID', 'AFTB_APP_SECRET'],
    'primary': ['AFTB_LLM_BASE_URL', 'AFTB_LLM_MODEL', 'AFTB_LLM_API_KEY'],
    'fallback': ['AFTB_LLM_FALLBACK_BASE_URL', 'AFTB_LLM_FALLBACK_MODEL', 'AFTB_LLM_FALLBACK_API_KEY'],
}
OFFICIAL = {'api.deepseek.com', 'api.moonshot.cn', 'api.moonshot.ai', 'api.openai.com', 'api.siliconflow.cn'}
LABELS = {'AFTB_APP_ID': '机器人应用 ID', 'AFTB_APP_SECRET': '机器人应用密钥',
          'AFTB_LLM_BASE_URL': '接口地址', 'AFTB_LLM_MODEL': '模型名称', 'AFTB_LLM_API_KEY': 'API Key',
          'AFTB_LLM_FALLBACK_BASE_URL': '接口地址', 'AFTB_LLM_FALLBACK_MODEL': '模型名称', 'AFTB_LLM_FALLBACK_API_KEY': 'API Key'}
ERRORS = {'stale_revision': '配置已被其他操作修改，请重新读取后再保存。',
          'host_change_requires_new_secret': '更换接口域名时必须填写对应的新 Key，不能沿用原服务的 Key。',
          'untrusted_endpoint_host': '该服务域名尚未接入，请通过维护任务添加服务商支持。',
          'required_fields_missing': '请补齐本组配置；密钥留空只会保留已有值。',
          'invalid_https_endpoint': '接口地址必须是 HTTPS 地址，不能包含账号、密码或查询参数。',
          'invalid_model': '模型名称格式不正确。', 'invalid_field': '输入包含不支持的字符或长度。',
          'remote_check_failed': '服务端拒绝连接检查，请核对接口与凭据。',
          'non_public_endpoint': '不支持向本机或内网地址发送模型凭据。',
          'previous_process_unverified': '未取得当前进程，无法确认重启前后状态。',
          'operation_failed': '操作未完成，请核对本机服务权限及配置来源。'}


def restart_marker(state_dir, revision=None):
    if state_dir is None:
        return None
    path = Path(state_dir) / 'pending-restart.json'
    if revision is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_suffix('.tmp')
        temp.write_text(json.dumps({'revision': revision}), encoding='utf-8')
        os.replace(temp, path)
    try:
        return json.loads(path.read_text(encoding='utf-8')).get('revision')
    except FileNotFoundError:
        return None


def secret(key):
    return key.endswith(('_SECRET', '_API_KEY'))


def ps(code):
    result = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', code],
                            capture_output=True, text=True, timeout=45)
    if result.returncode:
        raise ValueError('windows_operation_failed')
    return result.stdout.strip()


def binding(root):
    import winreg
    base = r'SYSTEM\CurrentControlSet\Services\AFTB-Bot'
    with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, base) as key:
        image = winreg.QueryValueEx(key, 'ImagePath')[0]
        if Path(image.strip('"')).name.lower() != 'nssm.exe':
            raise ValueError('unsupported_service_wrapper')
    with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, base + r'\Parameters') as key:
        def get(name, default=None):
            try:
                return winreg.QueryValueEx(key, name)[0]
            except FileNotFoundError:
                return default
        application, cwd, args = get('Application'), get('AppDirectory'), get('AppParameters')
        script = str(root / 'project/modules/auto-fill-table-bot/scripts/run_aftb.py')
        if (Path(cwd).resolve() != root or Path(application).resolve() != root / '.venv/Scripts/python.exe'
                or args not in (script + ' bot', '"' + script + '" bot')):
            raise ValueError('service_binding_mismatch')
        env = {}
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SYSTEM\CurrentControlSet\Control\Session Manager\Environment') as machine:
            i = 0
            while True:
                try:
                    k, v, _ = winreg.EnumValue(machine, i)
                except OSError:
                    break
                env[k] = v
                i += 1
        for name in ('AppEnvironment', 'AppEnvironmentExtra'):
            entries = get(name, [])
            if name == 'AppEnvironment' and entries:
                env = {}
            for entry in entries:
                k, v = entry.split('=', 1)
                env[k] = v
        return env, [application, cwd, args, image]


def service():
    try:
        data = json.loads(ps("Get-CimInstance Win32_Service -Filter \"Name='AFTB-Bot'\" | Select-Object State,ProcessId | ConvertTo-Json -Compress"))
        return dict(status=data['State'], processId=data['ProcessId'], runtimeEffective='unknown', businessHealth='unknown')
    except Exception:
        return dict(status='unknown', runtimeEffective='unknown', businessHealth='unknown')


def snapshot(root, reader=binding):
    env, identity = reader(root)
    module = root / 'project/modules/auto-fill-table-bot/src/aftb'
    code = (module / 'config.py').read_bytes()
    tree = ast.parse(code)
    # Extract actual _env aliases/defaults, not a second hard-coded precedence table.
    if any(isinstance(n, ast.Name) and n.id in {'json', 'cfg'} for n in ast.walk(tree)):
        raise ValueError('unsupported_json_config_precedence')
    longconn = (module / 'bot/longconn.py').read_bytes()
    calls = [n for n in ast.walk(ast.parse(longconn)) if isinstance(n, ast.Call)
             and isinstance(n.func, ast.Name) and n.func.id == 'load_settings']
    if len(calls) != 1 or calls[0].args or calls[0].keywords:
        raise ValueError('unsupported_settings_overrides')
    path = next((p for p in (root / 'config/.env', root / '.env') if p.is_file()), None)
    if path is None or path.is_symlink():
        raise ValueError('existing_regular_dotenv_required')
    raw = path.read_bytes()
    from dotenv import dotenv_values
    from dotenv.parser import parse_stream
    import io
    text = raw.decode('utf-8-sig')
    if any(item.error for item in parse_stream(io.StringIO(text))):
        raise ValueError('unsupported_dotenv_syntax')
    local = dotenv_values(stream=io.StringIO(text), interpolate=False)
    if any('$' in str(v) or '%' in str(v) for v in local.values() if v is not None):
        raise ValueError('unsupported_dotenv_interpolation')
    env.update({k: v for k, v in local.items() if v is not None})
    values, sources = {}, {}
    for key in sum(GROUPS.values(), []):
        matches = [n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
                   and n.func.id == '_env' and n.args and isinstance(n.args[0], ast.Constant) and n.args[0].value == key]
        if len(matches) != 1:
            raise ValueError('unsupported_config_contract')
        call = matches[0]
        aliases = [ast.literal_eval(a) for a in call.args]
        default = next((ast.literal_eval(k.value) for k in call.keywords if k.arg == 'default'), '')
        chosen = next((k for k in aliases if str(env.get(k, '')).strip()), None)
        values[key] = str(env[chosen] if chosen else default).strip()
        sources[key] = ('dotenv:' if chosen in local else 'nssm_or_machine:') + chosen if chosen else 'default'
    for key in (GROUPS['primary'][0], GROUPS['fallback'][0]):
        endpoint(values[key])  # Never project URL userinfo/query credentials.
    digest = hashlib.sha256(raw + code + longconn + json.dumps([env, identity], sort_keys=True).encode()).hexdigest()
    return dict(path=path, raw=raw, values=values, sources=sources, revision=digest)


def endpoint(value):
    u = urlsplit(value)
    if (u.scheme != 'https' or not u.hostname or u.username or u.password or u.query or u.fragment
            or u.port not in (None, 443) or not re.fullmatch(r'(?:/[A-Za-z0-9._-]+)*/?', u.path)):
        raise ValueError('invalid_https_endpoint')
    return u


def candidate(snap, body):
    group = body.get('group')
    if group not in GROUPS or not isinstance(body.get('values'), dict):
        raise ValueError('invalid_group_or_values')
    values = dict(snap['values'])
    for k, v in body['values'].items():
        if k not in GROUPS[group] or not isinstance(v, str) or len(v) > 4096 or any(c in v for c in '\r\n\x00$%'):
            raise ValueError('invalid_field')
        if v or not secret(k):
            values[k] = v.strip()
    if group != 'bot':
        base, model, key = GROUPS[group]
        old, new = endpoint(snap['values'][base]), endpoint(values[base])
        if new.hostname != old.hostname:
            if new.hostname not in OFFICIAL:
                raise ValueError('untrusted_endpoint_host')
            if not body['values'].get(key, '').strip():
                raise ValueError('host_change_requires_new_secret')
        if not re.fullmatch(r'[A-Za-z0-9._:/-]{1,200}', values[model]):
            raise ValueError('invalid_model')
    if any(not values[k] for k in GROUPS[group]):
        raise ValueError('required_fields_missing')
    return values


def request_json(url, headers, payload=None):
    u = endpoint(url)
    addresses = socket.getaddrinfo(u.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('non_public_endpoint')
    # Pin the validated address; no proxy, second DNS lookup or redirect handling.
    conn = http.client.HTTPSConnection(u.hostname, timeout=12)
    sock = socket.create_connection((addresses[0][4][0], 443), timeout=12)
    conn.sock = ssl.create_default_context().wrap_socket(sock, server_hostname=u.hostname)
    try:
        conn.request('POST' if payload is not None else 'GET', u.path, body=json.dumps(payload) if payload is not None else None, headers=headers)
        response = conn.getresponse()
        if response.status != 200:
            if u.path == '/v1/user/info' and response.status in (404, 410):
                raise ValueError('balance_endpoint_unavailable')
            raise ValueError('remote_check_failed')
        raw = response.read(1048577)
        if len(raw) > 1048576:
            raise ValueError('response_too_large')
        return json.loads(raw)
    finally:
        conn.close()


def protected_file(source, data):
    fd, name = tempfile.mkstemp(prefix=source.name + '.runtime-', dir=source.parent)
    os.close(fd)
    path = Path(name)
    try:
        if os.name == 'nt':
            def quote(p):
                return "'" + str(p).replace("'", "''") + "'"
            ps('$ErrorActionPreference="Stop"; $s=[System.IO.File]::GetAccessControl(' + quote(source)
               + '); $d=[System.IO.File]::GetAccessControl(' + quote(path) + ')'
               + '; $d.SetSecurityDescriptorSddlForm($s.GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::Access),[System.Security.AccessControl.AccessControlSections]::Access); [System.IO.File]::SetAccessControl('
               + quote(path) + ', $d)')
        else:
            os.chmod(path, source.stat().st_mode & 0o777)
        with path.open('wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        return path
    except Exception:
        path.unlink(missing_ok=True)
        raise


def save(root, snap, values, group, reader=binding):
    path = snap['path']
    lock = path.with_name(path.name + '.runtime.lock')
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    staging = None
    try:
        if snapshot(root, reader)['revision'] != snap['revision']:
            raise ValueError('stale_revision')
        from dotenv.parser import parse_stream
        import io
        keys = GROUPS[group]
        text = ''.join(item.original.string for item in parse_stream(io.StringIO(snap['raw'].decode('utf-8-sig'))) if item.key not in keys)
        text += '\n' + ''.join(k + "='" + values[k].replace('\\', '\\\\').replace("'", "\\'") + "'\n" for k in keys)
        staging = protected_file(path, text.encode('utf-8'))
        protected_file(path, snap['raw'])  # Private sibling backup retains source ACL.
        if snapshot(root, reader)['revision'] != snap['revision']:
            raise ValueError('stale_revision')
        os.replace(staging, path)
    finally:
        if staging:
            staging.unlink(missing_ok=True)
        lock.unlink(missing_ok=True)


def balance(snap):
    base = snap['values']['AFTB_LLM_BASE_URL'].rstrip('/')
    host = urlsplit(base).hostname
    key = snap['values']['AFTB_LLM_API_KEY']
    if host == 'api.siliconflow.cn' and base == 'https://api.siliconflow.cn/v1':
        data = request_json(base + '/user/info', {'Authorization': 'Bearer ' + key})
        account = data.get('data') or {}
        if data.get('code') != 20000 or account.get('status') != 'normal':
            raise ValueError('balance_unavailable')
        rows = [{'currency': 'CNY', 'total': account.get('totalBalance')}]
    elif host == 'api.deepseek.com' and base in ('https://api.deepseek.com', 'https://api.deepseek.com/v1'):
        data = request_json('https://api.deepseek.com/user/balance', {'Authorization': 'Bearer ' + key})
        rows = [{'currency': r.get('currency'), 'total': r.get('total_balance')} for r in data.get('balance_infos', [])]
    else:
        raise ValueError('balance_unsupported')
    if not rows:
        raise ValueError('balance_unavailable')
    for row in rows:
        try:
            amount = Decimal(str(row['total']))
            if not amount.is_finite() or row['currency'] not in ('CNY', 'USD'):
                raise InvalidOperation
            row['total'] = str(amount)
        except (InvalidOperation, ValueError):
            raise ValueError('balance_unavailable') from None
    return dict(ok=True, balances=rows, revision=snap['revision'], checkedAt=datetime.now(timezone.utc).isoformat())


ERRORS.update(balance_unavailable='服务商未返回有效余额，请到服务商控制台查看；不会将未知余额计为零。', balance_unsupported='当前服务商尚未接入余额接口，请到服务商控制台查看。')
ERRORS['balance_endpoint_unavailable'] = '硅基流动余额接口当前不可用，请到服务商控制台查看。模型调用不受此查询结果判定。'


def handle(root, body, reader=binding, state_dir=None):
    try:
        snap = snapshot(root, reader)
        action = body.get('action', 'describe')
        if action == 'balance':
            return balance(snap)
        if action == 'describe':
            return dict(ok=True, revision=snap['revision'], restartRequired=bool(restart_marker(state_dir)), service=service(), groups=[dict(id=g, label=g, fields=[dict(key=k, label=LABELS[k], value='' if secret(k) else snap['values'][k], secret=secret(k), configured=bool(snap['values'][k]), source=snap['sources'][k]) for k in keys]) for g, keys in GROUPS.items()])
        if body.get('revision') != snap['revision']:
            raise ValueError('stale_revision')
        if action == 'restart':
            if body.get('confirm') is not True:
                raise ValueError('explicit_confirmation_required')
            before = service()
            if not before.get('processId'):
                raise ValueError('previous_process_unverified')
            reader(root)
            ps('$ErrorActionPreference="Stop"; Restart-Service -Name AFTB-Bot')
            after = service()
            changed = after.get('processId', 0) not in (0, before['processId']) and after['status'] == 'Running'
            if changed and state_dir:
                try:
                    (Path(state_dir) / 'pending-restart.json').unlink(missing_ok=True)
                except OSError:
                    return dict(ok=True, message='服务进程已重启，待重启标记未能清除；请重新核对。', service=after)
            return dict(ok=changed, message='已确认服务进程重启；消息处理与表格写入效果仍需实际观测。' if changed else '已发送重启请求，尚未确认进程更换，请重新读取状态。', service=after, restartRequired=not changed)
        if action not in ('test', 'save'):
            raise ValueError('invalid_action')
        values = candidate(snap, body)
        group = body['group']
        if action == 'save':
            save(root, snap, values, group, reader)
            try:
                restart_marker(state_dir, snapshot(root, reader)['revision'])
            except Exception:
                return dict(ok=True, saved=True, restartRequired=True, message='配置已保存，尚未重启；待重启记录写入失败，请手动核对。')
            return dict(ok=True, saved=True, restartRequired=True, message='配置已保存，尚未重启服务。')
        if group == 'bot':
            result = request_json('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {'Content-Type': 'application/json'}, {'app_id': values['AFTB_APP_ID'], 'app_secret': values['AFTB_APP_SECRET']})
            passed = result.get('code') == 0 and bool(result.get('tenant_access_token'))
        else:
            base, model, key = GROUPS[group]
            result = request_json(values[base].rstrip('/') + '/models', {'Authorization': 'Bearer ' + values[key]})
            passed = any(m.get('id') == values[model] for m in result.get('data', []) if isinstance(m, dict))
        return dict(ok=passed, message='机器人凭据可用。' if passed and group == 'bot' else '模型目录包含所选模型；未调用生成。' if passed else '检查未通过，请核对应用凭据或模型名称。', checks=[dict(label='机器人认证' if group == 'bot' else '模型访问', status='通过' if passed else '未通过', message='未发送消息或写入业务数据。')])
    except ValueError as exc:
        known = str(exc)
        if not re.fullmatch('[a-z_]+', known):
            known = 'operation_failed'
        return dict(ok=False, message=ERRORS.get(known, '当前配置或服务启动方式不支持此操作，请交由维护任务核对。'), error=known)
    except Exception:
        return dict(ok=False, message=ERRORS['operation_failed'], error='operation_failed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--state-dir', required=True)
    args = parser.parse_args()
    try:
        body = json.loads(sys.stdin.read(65537) or '{}')
        result = handle(Path(args.root).resolve(), body, state_dir=Path(args.state_dir))
    except Exception:
        result = dict(ok=False, message='invalid_request')
    print(json.dumps(result, ensure_ascii=True))
