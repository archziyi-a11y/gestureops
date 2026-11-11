"""Authorized, narrow model-management overlay with automatic rollback."""
import os
import ast
import base64
import json
import zlib
from pathlib import Path

helper=Path(__file__).with_name('deploy-material-uploaders.py')
tree=ast.parse(helper.read_text(encoding='utf-8'))
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.FunctionDef))],type_ignores=[]),str(helper),'exec'))
ROOT=Path(__file__).resolve().parents[2]
STAGE=ROOT/'workspace/tmp/model-connection-release-20261110'
STAGE.mkdir(parents=True,exist_ok=True)
CLI=Path.home()/'AppData/Local/Programs/AliyunCLI/aliyun.exe'
REMOTE='/home/admin/sales-model-connection-20261110-r2'
DEPLOY=os.environ['GESTUREOPS_DEPLOY_DIRECTORY']
IMAGE='sasalele-sales-api:20261110-model-connection'

def packed(text):
    value=base64.b64encode(zlib.compress(text.encode())).decode()
    return 'python3 -c "import base64,zlib;exec(zlib.decompress(base64.b64decode(\''+value+'\')))"'

source=ROOT/'project/modules/marketing-chat-insight/src/mktci'
text=(source/'sales_http.py').read_text(encoding='utf-8')
methods=[]
for n in ast.walk(ast.parse(text)):
    if isinstance(n,ast.FunctionDef) and n.name in ('model_status','model_manage'):
        start=min([n.lineno]+[d.lineno for d in n.decorator_list])-1
        methods.append('\n'.join(text.splitlines()[start:n.end_lineno])+'\n')
assert len(methods)==2
patch=f"""import ast,base64
from pathlib import Path
p=Path('{REMOTE}/sales_http.py'); text=p.read_text()
assert 'def model_manage' not in text
old='SalesService(load_sales_settings(),folder)'
assert text.count(old)==1
text=text.replace(old,"SalesService(apply_config(load_sales_settings(),folder/'model-connection.json'),folder)")
anchor_import='from mktci.sales_settings import load_sales_settings'
assert text.count(anchor_import)==1
text=text.replace(anchor_import,anchor_import+'\\nfrom mktci.model_connection import apply_config, snapshot as model_snapshot, save_key, probe as model_probe')
anchor="    @app.get('/sales/admin/prompts/{{kind}}')"
assert text.count(anchor)==1
text=text.replace(anchor,base64.b64decode('{encode(''.join(methods))}').decode()+anchor)
ast.parse(text); p.write_text(text)
Path('{REMOTE}/model_connection.py').write_bytes(base64.b64decode('{base64.b64encode((source/'model_connection.py').read_bytes()).decode()}'))
"""
run('model-build',f'''set -eu
test ! -e '{REMOTE}'
mkdir -p '{REMOTE}'
sudo docker inspect sasalele-sales-api-1 --format '{{{{.Image}}}}' > '{REMOTE}/base-image'
sudo docker cp sasalele-sales-api-1:/app/project/modules/marketing-chat-insight/src/mktci/sales_http.py '{REMOTE}/sales_http.py'
sudo {packed(patch)}
printf 'FROM %s\nCOPY --chown=10001:10001 *.py /app/project/modules/marketing-chat-insight/src/mktci/\n' "$(cat '{REMOTE}/base-image')" > '{REMOTE}/Dockerfile'
sudo docker build --network none -t '{IMAGE}' '{REMOTE}'
sudo docker run --rm --network none --entrypoint python '{IMAGE}' -c 'from mktci.sales_http import create_app; a=create_app(); assert any(r.path=="/sales/admin/model-connection" for r in a.routes); print("image imports PASS")'
''')
verify="""import json,urllib.request
from pathlib import Path
key=Path('/run/secrets/sales-admin-key').read_text().strip()
for path in ('/sales/admin/model-connection','/sales/admin/prompts/polish','/sales/admin/materials'):
 req=urllib.request.Request('http://127.0.0.1:8876'+path,headers={'Authorization':'Bearer '+key})
 data=json.load(urllib.request.urlopen(req,timeout=5))
 if path.endswith('model-connection'): assert data['active']==data['saved'] and 'llm_api_key' not in str(data)
print('model configuration readback, prompts and materials PASS; no Key changed')
"""
idle="import sqlite3; d=sqlite3.connect('file:/var/lib/sasalele/sales-generation.sqlite?mode=ro',uri=True); assert d.execute(\"SELECT COUNT(*) FROM tasks WHERE state IN ('queued','running')\").fetchone()[0]==0"
update=f"import json; p='compose.admin-management.yaml'; d=json.load(open(p)); d['services']['api']['image']='{IMAGE}'; open(p,'w').write(json.dumps(d))"
dc='sudo docker compose --env-file deployment.env -f compose.yaml -f compose.prebuilt.yaml -f compose.admin-management.yaml'
run('model-deploy',f'''set -eu
cd '{DEPLOY}'
test "$(sudo docker inspect sasalele-sales-api-1 --format '{{{{.Image}}}}')" = "$(cat '{REMOTE}/base-image')"
test ! -e compose.before-model-connection.yaml
cp compose.admin-management.yaml compose.before-model-connection.yaml
rollback() {{ cp compose.before-model-connection.yaml compose.admin-management.yaml; {dc} up -d --no-deps --no-build --pull never api; }}
trap 'rollback' EXIT
{packed(update)}
{dc} config --quiet
sudo docker exec sasalele-sales-api-1 {packed(idle)}
{dc} up -d --no-deps --no-build --pull never api
ok=0
for i in $(seq 1 20); do
 if sudo docker exec sasalele-sales-api-1 {packed(verify)}; then ok=1; break; fi
 sleep 2
done
test "$ok" = 1
trap - EXIT
sudo docker inspect sasalele-sales-api-1 --format '{{{{.Image}}}} {{{{.State.Status}}}}'
''')
