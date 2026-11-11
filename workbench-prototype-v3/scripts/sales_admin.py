"""Shared server-side management connection; never returns credentials to the UI."""
import json
import os
from pathlib import Path
from urllib.parse import urlparse

def connection():
    if os.getenv('KNOWLEDGE_OFFLINE')=='1': raise ValueError('尚未连接销售助手，暂不能实装提示词或删除物料')
    config={}
    path=os.getenv('SASALELE_ADMIN_CONFIG') or str(Path(os.getenv('LOCALAPPDATA',Path.home()))/'Sasalele'/'admin-connection.json')
    if Path(path).exists():
        try: config=json.loads(Path(path).read_text(encoding='utf-8-sig'))
        except Exception: raise ValueError('销售助手管理连接配置无法读取') from None
    url=(os.getenv('SASALELE_PROMPT_SERVICE_URL') or config.get('service_url') or '').rstrip('/')
    key=os.getenv('SASALELE_PROMPT_ADMIN_KEY') or config.get('admin_key') or ''
    if not url or not key: raise ValueError('尚未连接销售助手，暂不能实装提示词或删除物料')
    parsed=urlparse(url)
    if parsed.username or parsed.password or parsed.query or parsed.fragment or (parsed.scheme!='https' and not (parsed.scheme=='http' and parsed.hostname in ('127.0.0.1','localhost'))):
        raise ValueError('管理服务地址须为 HTTPS，或本机 HTTP')
    return url,key

def status_error(code):
    return {404:'销售助手后端尚未部署管理接口',401:'销售助手管理凭据无效',403:'销售助手管理凭据无效',503:'销售助手管理服务尚未就绪'}.get(code,'销售助手管理服务读取失败')
