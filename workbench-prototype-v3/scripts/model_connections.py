"""Local and sales-service model administration; secrets only travel on stdin."""
import json
import os
import sys
from pathlib import Path
import httpx
from knowledge import knowledge_settings
from sales_admin import connection
from mktci.model_connection import snapshot, save_key, probe

def execute(body):
    target=body.get('target'); action=body.get('action','read')
    if action not in ('read','save','reload','test','balance','runtime'): raise ValueError('不支持的操作')
    if target=='knowledge':
        settings=knowledge_settings()
        if action=='save':
            if body.get('revision')!=snapshot(settings)['revision']: raise ValueError('配置已变化，请重新读取')
            save_key(Path(os.getenv('LOCALAPPDATA',Path.home()))/'Sasalele'/'knowledge-model.json',settings,body.get('key'))
        elif action in ('test','balance'): return probe(settings,action)
        settings=knowledge_settings()
        return {'active':snapshot(settings),'saved':snapshot(settings)}
    if target!='sales': raise ValueError('未知连接')
    url,key=connection()
    with httpx.Client(base_url=url,headers={'Authorization':'Bearer '+key},timeout=25,follow_redirects=False) as client:
        path='/sales/admin/runtime-summary' if action=='runtime' else '/sales/admin/model-connection'
        result=client.get(path) if action in ('read','runtime') else client.post(path,json=body)
        if result.status_code==404: raise ValueError('业务服务需部署模型连接管理接口')
        if result.status_code!=200:
            if result.status_code==409:
                detail=result.json().get('detail')
                if detail in ('配置已变化，请重新读取','有生成任务正在执行，请稍后重载'):
                    raise ValueError(detail)
            raise ValueError('业务服务操作未完成，HTTP '+str(result.status_code))
        return result.json()

if __name__=='__main__':
    try: print(json.dumps(execute(json.load(sys.stdin)),ensure_ascii=False))
    except ValueError as error: print(json.dumps({'error':str(error)},ensure_ascii=False))
    except Exception: print(json.dumps({'error':'连接管理失败，请重新读取核对；未确认写入结果'},ensure_ascii=False))
