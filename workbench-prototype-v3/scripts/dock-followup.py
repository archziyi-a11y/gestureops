"""Batch follow-up CLI. Local tokens expire after 10 minutes (host UTC clock).

stdin: {action:preview,batchCode:str} or {action:send,token:str,confirm:true}.
stdout: ok + preview fields, or status=accepted/messageId/delivery=unverified.
Unknown attempts are terminal: never retry a possibly accepted message.
Acceptance: offline only; preserve callback tokens and newer bot sessions.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import time
from datetime import datetime, timezone
from contextlib import closing


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=True).encode()).hexdigest()


def preview_card(rows):
    from aftb import excel_supplement_queue as q
    entries = [dict(r, token=str(i + 1), _card_nonce='preview') for i, r in enumerate(rows)]
    card = q._pending_card(dict(entries=entries, page=0, selected=''))
    def sanitize(value):
        if isinstance(value, dict):
            return {k: sanitize(v) for k, v in value.items() if k not in {'behaviors', 'value'}}
        if isinstance(value, list):
            return [sanitize(v) for v in value]
        return value
    return sanitize(card)


def readonly(path):
    db = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    return db


def unknown_receipt():
    return dict(ok=False, error='send_outcome_unknown', status='unknown', retryable=False,
                message='发送结果未知，禁止重复发送，请人工核对。')


def previous_attempt(db, payload):
    # Deliberately independent of token, session, expiry and runtime revision.
    key = [payload[k] for k in ('code', 'owner', 'chat', 'rows')]
    for raw, status, receipt in db.execute("SELECT payload,status,receipt FROM previews WHERE status IN ('unknown','accepted')"):
        old = json.loads(raw)
        if [old[k] for k in ('code', 'owner', 'chat', 'rows')] == key:
            return dict(json.loads(receipt), replayed=True) if receipt else unknown_receipt()
    return None


def session(db, owner, chat):
    if not db.execute("SELECT 1 FROM sqlite_master WHERE name='excel_supplement_sessions'").fetchone():
        return None
    row = db.execute('SELECT * FROM excel_supplement_sessions WHERE owner=? AND chat=?', (owner, chat)).fetchone()
    return dict(row) if row else None


def runtime(root):
    spec = importlib.util.spec_from_file_location('dock_runtime_followup', Path(__file__).with_name('dock-runtime.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    env, identity = module.binding(root)
    snap = module.snapshot(root, lambda _: (dict(env), identity))
    old = dict(os.environ)
    cwd = Path.cwd()
    try:
        # Windows DLL loading and subprocesses need these even when NSSM replaces
        # the service environment. Never inherit business/provider credentials.
        system_keys = {'SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'TEMP', 'TMP', 'PATH',
                       'PATHEXT', 'COMSPEC', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS'}
        baseline = {k: v for k, v in old.items() if k.upper() in system_keys}
        os.environ.clear()
        os.environ.update(baseline)
        os.environ.update(env)
        os.chdir(root)
        from aftb.config import load_settings
        settings = load_settings()
        # Resolve relative business paths while still in service cwd.
        from dataclasses import replace
        from aftb.excel_import import DEFAULT_STATE_PATH
        settings = replace(settings, excel_import_state_path=str(Path(settings.excel_import_state_path or DEFAULT_STATE_PATH).resolve()))
    finally:
        os.environ.clear()
        os.environ.update(old)
        os.chdir(cwd)
    return settings, snap['revision']


def inspect(settings, client, code):
    from aftb import excel_supplement_queue as q
    from aftb.excel_import import _authorize
    if getattr(settings, 'mkt_excel_cards_enabled', False) is not True:
        raise ValueError('cards_disabled')
    with closing(readonly(settings.excel_import_state_path)) as db:
        batch = db.execute('SELECT * FROM excel_batches WHERE code=?', (code,)).fetchone()
        if not batch:
            raise ValueError('batch_not_found')
        owner, chat = batch['owner'], batch['chat']
        try:
            label = _authorize(settings, owner, chat)
        except Exception:
            raise ValueError('unauthorized') from None
        before = session(db, owner, chat)
        batch_version = digest(dict(batch))
    pending = q.list_pending(settings, client, owner, chat, batch_code=code)
    rows = []
    for row in pending:
        positions = [row] + row.get('aliases', [])
        match = next((p for p in positions if p.get('source') == code), None)
        if row.get('missing') and match:
            rows.append(dict(row, source=code, sheet=match['sheet'], row_number=match['row_number'], aliases=[]))
    if not rows:
        raise ValueError('no_pending_rows')
    with closing(readonly(settings.excel_import_state_path)) as db:
        if session(db, owner, chat) != before:
            raise ValueError('session_changed')
    return dict(owner=owner, chat=chat, label=label[:1] + '**', session=before,
                version=digest([batch_version, rows]), rows=rows)


def execute(settings, client, revision, state_dir, body):
    from aftb import excel_supplement_queue as q
    action = body.get('action')
    allowed = {'action', 'batchCode'} if action == 'preview' else {'action', 'token', 'confirm'}
    if action not in {'preview', 'send'} or set(body) - allowed:
        raise ValueError('invalid_request')
    state_dir.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(state_dir / 'followup.sqlite', timeout=10)
    try:
        db.execute('CREATE TABLE IF NOT EXISTS previews(token TEXT PRIMARY KEY,payload TEXT NOT NULL,status TEXT NOT NULL,receipt TEXT)')
        db.commit()
        if action == 'preview':
            code = body.get('batchCode')
            if not isinstance(code, str) or not code or len(code) > 128:
                raise ValueError('invalid_request')
            data = inspect(settings, client, code)
            token = secrets.token_urlsafe(32)
            expires = time.time() + 600
            payload = dict(data, code=code, revision=revision, expires=expires)
            db.execute('BEGIN IMMEDIATE')
            previous = previous_attempt(db, payload)
            if previous:
                return dict(previous, previewBlocked=True)
            db.execute('INSERT INTO previews VALUES(?,?,?,NULL)', (digest(token), json.dumps(payload), 'preview'))
            db.commit()
            return dict(ok=True, token=token, batchCode=code,
                        senderLabel=data['label'] + ' [' + digest(data['owner'])[:8] + ']',
                        chatLabel='chat [' + digest(data['chat'])[:8] + ']',
                        card=preview_card(data['rows']),
                        expiresAt=datetime.fromtimestamp(expires, timezone.utc).isoformat(),
                        recipient=dict(accountLabel=data['label'] + ' [' + digest(data['owner'])[:8] + ']',
                                       chatLabel='chat [' + digest(data['chat'])[:8] + ']'),
                        pendingCount=len(data['rows']), rows=[dict(sheet=q._safe_context(r['sheet']), rowNumber=r['row_number'], missing=r['missing']) for r in data['rows']])
        if body.get('confirm') is not True:
            raise ValueError('confirmation_required')
        token = body.get('token')
        if not isinstance(token, str) or len(token) > 128:
            raise ValueError('invalid_token')
        db.execute('BEGIN IMMEDIATE')
        stored = db.execute('SELECT payload,status,receipt FROM previews WHERE token=?', (digest(token),)).fetchone()
        if not stored:
            raise ValueError('invalid_token')
        if stored[1] != 'preview':
            return dict(json.loads(stored[2]), replayed=True) if stored[2] else unknown_receipt()
        saved = json.loads(stored[0])
        previous = previous_attempt(db, saved)
        if previous:
            return previous
        if time.time() >= saved['expires']:
            raise ValueError('stale_preview')
        if revision != saved['revision']:
            raise ValueError('runtime_changed')
        fresh = inspect(settings, client, saved['code'])
        if fresh['session'] != saved['session']:
            raise ValueError('session_changed')
        if fresh['version'] != saved['version'] or (fresh['owner'], fresh['chat']) != (saved['owner'], saved['chat']):
            raise ValueError('stale_preview')
        # Persist uncertainty before any session mutation or network write.
        db.execute("UPDATE previews SET status='unknown' WHERE token=?", (digest(token),))
        db.commit()
        owner, chat = fresh['owner'], fresh['chat']
        entries = fresh['rows']
        try:
            nonce = secrets.token_urlsafe(16)
            for entry in entries:
                entry['token'] = secrets.token_hex(4)
                entry['_card_nonce'] = nonce
            q.rotate_view(entries)
            q._save(settings, owner, chat, entries, expected=saved['session'])
            card = q.build_pending_card(settings, owner, chat)
            current = q.active_session(settings, owner, chat)
            if not current or current['entries'] != entries or not card:
                raise ValueError('session_changed')
        except Exception as exc:
            code = 'session_changed' if isinstance(exc, ValueError) and str(exc) == 'session_changed' else 'pre_send_failed'
            receipt = dict(ok=False, error=code, status='not_sent', retryable=False,
                           message='尚未调用消息发送；本地会话可能已更新，请重新预览。')
            try:
                db.execute('UPDATE previews SET status=?,receipt=? WHERE token=?', ('not_sent', json.dumps(receipt), digest(token)))
                db.commit()
            except Exception:
                return unknown_receipt()
            return receipt
        try:
            result = client.send_card(receive_id=chat, receive_id_type='chat_id', card=card)
            info = result.get('data') if isinstance(result, dict) and result.get('code') == 0 else None
            if not isinstance(info, dict) or not isinstance(info.get('message_id'), str) or not info['message_id'] or info.get('chat_id') != chat:
                raise ValueError('unknown_response')
        except Exception:
            return unknown_receipt()
        receipt = dict(ok=True, status='accepted', messageId=info['message_id'], delivery='unverified', replayed=False, callbackBound=False,
                       warning='callback_binding_unverified', requiresAttention=True,
                       message='卡片发送已被飞书接受，但接续绑定待核对；未确认实际送达，请勿重复发送。')
        try:
            db.execute('UPDATE previews SET status=?,receipt=? WHERE token=?', ('accepted', json.dumps(receipt), digest(token)))
            db.commit()
        except Exception:
            receipt['receiptPersisted'] = False
            return receipt
        try:
            q.bind_visible_object(settings, owner, chat, info['message_id'], 'pending', q.pending_view_version(current))
            receipt['callbackBound'] = True
            receipt.pop('warning', None)
            receipt['requiresAttention'] = False
            receipt['message'] = '卡片发送已被飞书接受，接续绑定已记录；未确认实际送达。'
            db.execute('UPDATE previews SET receipt=? WHERE token=?', (json.dumps(receipt), digest(token)))
            db.commit()
        except Exception:
            pass
        return receipt
    finally:
        db.close()


ERRORS = {'unauthorized', 'cards_disabled', 'batch_not_found', 'no_pending_rows', 'session_changed', 'invalid_request', 'confirmation_required', 'invalid_token', 'stale_preview', 'runtime_changed', 'remote_batch_unavailable'}
ERROR_MESSAGES = {
    'remote_quota_exhausted': '飞书本月 API 调用额度已用尽，无法核对当前待补项，本次未发送卡片。请管理员在飞书后台检查调用额度与套餐；额度恢复后再预览，反复重试无效。',
    'remote_rate_limited': '飞书表格读取触发限流，暂时无法确认最新待补项；本次未发送卡片，也未自动重试。请稍后手动重新预览。',
    'remote_batch_unavailable': '无法读取飞书表格的最新记录，尚不能确认待补内容；本次未发送卡片。请核对表格访问权限及接口状态后重新预览。',
}


def handle(settings, client, revision, state_dir, body):
    try:
        return execute(settings, client, revision, Path(state_dir), body)
    except Exception as exc:
        code = str(exc) if isinstance(exc, ValueError) and str(exc) in ERRORS | ERROR_MESSAGES.keys() else 'operation_failed'
        result = dict(ok=False, error=code, retryable=False)
        if code in ERROR_MESSAGES:
            result['message'] = ERROR_MESSAGES[code]
        return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--state-dir', required=True)
    args = parser.parse_args()
    try:
        root = Path(args.root).resolve()
        os.chdir(root)
        sys.path.insert(0, str(root / 'project/modules/auto-fill-table-bot/src'))
        sys.path.insert(0, str(root / 'project/modules/agent-core/src'))
        body = json.loads(sys.stdin.read(65537))
        settings, revision = runtime(root)
        from aftb.feishu_client import FeishuClient
        with FeishuClient(settings) as client:
            result = handle(settings, client, revision, args.state_dir, body)
    except Exception:
        result = dict(ok=False, error='operation_failed', retryable=False)
    print(json.dumps(result, ensure_ascii=True))
