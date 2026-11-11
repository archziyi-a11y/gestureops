"""Fixed-deployment materials transport. JSON stdin/stdout; never logs credentials."""
import base64
import json
import re
import sys
from pathlib import Path
import httpx
sys.path.insert(0,str(Path(__file__).resolve().parent))
from sales_admin import connection, status_error

CONFIG = Path(__file__).resolve().parents[2] / 'project/modules/qm-sales-assistant/private/deployment-transfer/device-download/first-phone-test.sasalele-device.json'

def execute(command, client):
    op = command['op']
    if op == 'read':
        offset = command.get('offset', 0)
        if type(offset) is not int or not 0 <= offset <= 5000:
            raise ValueError()
        response = client.get('/sales/materials', params={'offset': offset})
    elif op == 'image':
        if not re.fullmatch(r'[a-zA-Z0-9-]{1,80}', command['id']):
            raise ValueError()
        response = client.get('/sales/materials/' + command['id'] + '/image')
    elif op == 'upload':
        payload = command['payload']
        if 'base64' in payload:
            data = base64.b64decode(payload['base64'], validate=True)
            if not 0 < len(data) <= 8 * 1024 * 1024:
                raise ValueError()
            response = client.post('/sales/materials/images', params={'title': payload['title'], 'request_id': payload['requestId']}, content=data, headers={'Content-Type': 'application/octet-stream'})
        else:
            response = client.post('/sales/materials', json={'title': payload['title'], 'content': payload['content'], 'request_id': payload['requestId']})
    elif op == 'delete':
        if not re.fullmatch(r'[a-zA-Z0-9-]{1,80}', command.get('id','')):
            raise ValueError()
        response=client.post('/sales/admin/materials/'+command['id']+'/delete',json={'expected_title':command['title']})
    elif op == 'capabilities':
        response=client.get('/sales/admin/materials')
    else:
        raise ValueError()
    if op in ('upload','delete') and 400 <= response.status_code < 500:
        return {'status': 'knownfailure', 'httpStatus': response.status_code}
    response.raise_for_status()
    if op == 'image':
        mime = response.headers.get('content-type', '').split(';')[0]
        if mime not in ('image/png', 'image/jpeg', 'image/webp'):
            raise ValueError()
        return {'mime': mime, 'base64': base64.b64encode(response.content).decode('ascii')}
    return response.json()

def main():
    command=json.load(sys.stdin)
    if command['op'] in ('delete','capabilities'):
        try:
            url,key=connection()
            with httpx.Client(base_url=url,headers={'Authorization':'Bearer '+key},timeout=30,follow_redirects=False) as client:
                result=execute(command,client)
        except ValueError as error:
            result={'can_delete':False,'message':str(error),'status':'knownfailure'}
        except httpx.HTTPStatusError as error:
            result={'can_delete':False,'message':status_error(error.response.status_code)} if command['op']=='capabilities' else {'status':'unknown'}
        print(json.dumps(result));return
    config = json.loads(CONFIG.read_text(encoding='utf-8-sig'))
    with httpx.Client(base_url=config['service_url'].rstrip('/'), headers={'Authorization': 'Bearer ' + config['device_token']}, timeout=30, follow_redirects=False) as client:
        print(json.dumps(execute(command, client)))

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'error': 'materials_transport_failed'}))
        sys.exit(1)
