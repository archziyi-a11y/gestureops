"""Business prompt administration; saving never releases a runtime version."""
import os
from urllib.parse import urlparse
import httpx
from sales_admin import connection, status_error
from mktci.sales_prompt_library import BusinessPrompts, KINDS


def remote(kind, payload=None):
    url,key=connection()
    parsed=urlparse(url)
    if parsed.username or parsed.password or parsed.query or parsed.fragment or (parsed.scheme!='https' and not (parsed.scheme=='http' and parsed.hostname in ('127.0.0.1','localhost'))):
        raise ValueError('提示词服务地址须为 HTTPS，或本机 HTTP')
    try:
        with httpx.Client(timeout=20,follow_redirects=False) as client:
            response=client.request('GET' if payload is None else 'POST',url+'/sales/admin/prompts/'+kind,
                headers={'Authorization':'Bearer '+key},**({} if payload is None else {'json':payload}))
            response.raise_for_status()
            data=response.json()
            if not isinstance(data.get('state'),dict) or not isinstance(data.get('loaded'),dict): raise ValueError()
            return data
    except httpx.HTTPStatusError as error:
        if error.response.status_code in (401,403,404,503) and payload is None:
            raise ValueError(status_error(error.response.status_code)) from None
        if error.response.status_code==409:
            raise ValueError('服务版本已变化，请刷新后重新选择实装版本') from None
        if payload is not None and payload.get('action')=='delete':
            raise ValueError('版本删除未确认，请刷新版本库后核对') from None
        raise ValueError('实装或回退结果未确认，请刷新生效版本核对，勿直接重复提交') from None
    except Exception:
        if payload is not None and payload.get('action')=='delete':
            raise ValueError('版本删除未确认，请刷新版本库后核对') from None
        raise ValueError('服务状态未取得' if payload is None else '实装或回退结果未确认，请刷新生效版本核对，勿直接重复提交') from None


def dispatch(folder, action, body):
    kind=body.get('kind')
    if kind not in KINDS: raise ValueError('请选择业务功能')
    library=BusinessPrompts(folder/'business-prompts')
    try:
        if action=='business-save': library.save(kind,body.get('text'),body.get('name'))
        if action=='business-delete':
            version=body.get('versionId')
            if not version: raise ValueError('版本不存在')
            receipt=remote(kind,{'target_id':version,'expected_revision':body.get('revision'),'action':'delete'})
            try: library.delete(kind,version,library.snapshot(kind)['revision'])
            except Exception: raise ValueError('服务版本已删除，本地清理失败，请重试删除') from None
            return {'local':library.snapshot(kind),'remote':receipt,'connected':True}
        if action=='business-release':
            version=body.get('versionId')
            row=next((v for v in library.snapshot(kind)['versions'] if v['id']==version),None)
            if version is not None and row is None:
                state=remote(kind)['state']
                row=next((v for v in state['versions'] if v['id']==version),None)
                if row is None: raise ValueError('版本不存在')
            receipt=remote(kind,{'version':row,'target_id':version,'expected_revision':body.get('revision'),'action':body.get('action','install')})
            return {'local':library.snapshot(kind),'remote':receipt,'connected':True,'released':True}
        state=library.snapshot(kind)
        try: return {'local':state,'remote':remote(kind),'connected':True}
        except ValueError as error: return {'local':state,'connected':False,'connectionMessage':str(error)}
    finally: library.close()
