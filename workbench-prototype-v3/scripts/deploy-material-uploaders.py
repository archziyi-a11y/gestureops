"""One-time uploader metadata update, bound to the management release."""
import os
import ast, base64, json, subprocess, time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
STAGE=ROOT/'workspace/tmp/material-uploaders-release'
STAGE.mkdir(parents=True,exist_ok=True)
CLI=Path.home()/'AppData/Local/Programs/AliyunCLI/aliyun.exe'
BASE=os.environ['GESTUREOPS_DEPLOY_BASE_IMAGE']
IMAGE='sasalele-sales-api:20261109-material-uploaders'
DEPLOY=os.environ['GESTUREOPS_DEPLOY_DIRECTORY']
REMOTE='/home/admin/sales-material-uploaders-20261109'

def encode(text): return base64.b64encode(text.encode()).decode()
def python_command(text): return 'python3 -c "import base64;exec(base64.b64decode(\''+encode(text)+'\'))"'
def call(action,**params):
    args=[str(CLI),'swas-open',action,'--RegionId','cn-hongkong','--InstanceId',os.environ['GESTUREOPS_DEPLOY_INSTANCE'],'--profile','sales-migration']
    for k,v in params.items(): args.extend(['--'+k,str(v)])
    p=subprocess.run(args,capture_output=True,text=True,encoding='utf-8',creationflags=0x08000000)
    if p.returncode: raise RuntimeError('Cloud call failed: '+action)
    return json.loads(p.stdout)
def run(name,script):
    iid=call('RunCommand',Name=name,Type='RunShellScript',WorkingUser='admin',WorkingDir='/home/admin',CommandContent='echo '+encode(script)+' | base64 -d | bash',Timeout=120)['InvokeId']
    for _ in range(70):
        time.sleep(3)
        r=call('DescribeInvocationResult',InvokeId=iid)['InvocationResult']
        if r.get('InvokeRecordStatus')!='Finished': continue
        (STAGE/(name+'.json')).write_text(json.dumps(r,indent=2),encoding='utf-8')
        print(name,r.get('ExitCode'),base64.b64decode(r.get('Output','')).decode(errors='replace'),flush=True)
        if r.get('ExitCode')!=0: raise RuntimeError('Stopped; inspect before retry')
        return
    raise RuntimeError('Unknown result; do not retry automatically')

source=ROOT/'project/modules/marketing-chat-insight/src/mktci'
methods={}
for file,name in [('sales_http.py','material_admin_status'),('sales_materials.py','upload_sources')]:
    text=(source/file).read_text(encoding='utf-8')
    node=next(n for n in ast.walk(ast.parse(text)) if isinstance(n,ast.FunctionDef) and n.name==name)
    start=min([node.lineno]+[d.lineno for d in node.decorator_list])-1
    methods[name]='\n'.join(text.splitlines()[start:node.end_lineno])+'\n'
patch=f"""import ast,json,base64
from pathlib import Path
methods=json.loads(base64.b64decode('{encode(json.dumps(methods))}'))
root=Path('{REMOTE}')
p=root/'sales_http.py'; text=p.read_text()
node=next(n for n in ast.walk(ast.parse(text)) if isinstance(n,ast.FunctionDef) and n.name=='material_admin_status')
start=min([node.lineno]+[d.lineno for d in node.decorator_list])-1
lines=text.splitlines(True); lines[start:node.end_lineno]=[methods['material_admin_status']]
p.write_text(''.join(lines))
p=root/'sales_materials.py'; text=p.read_text()
assert 'def upload_sources' not in text
text=text.replace('    def _public(self, r):',methods['upload_sources']+'    def _public(self, r):',1)
ast.parse(text); p.write_text(text)
"""
run('uploader-build',f'''set -eu
test "$(sudo docker inspect sasalele-sales-api-1 --format '{{{{.Image}}}}')" = '{BASE}'
mkdir -p '{REMOTE}'
sudo docker cp sasalele-sales-api-1:/app/project/modules/marketing-chat-insight/src/mktci/sales_http.py '{REMOTE}/sales_http.py'
sudo docker cp sasalele-sales-api-1:/app/project/modules/marketing-chat-insight/src/mktci/sales_materials.py '{REMOTE}/sales_materials.py'
sudo {python_command(patch)}
printf 'FROM sasalele-sales-api:20261109-admin-management\nCOPY --chown=10001:10001 *.py /app/project/modules/marketing-chat-insight/src/mktci/\n' > '{REMOTE}/Dockerfile'
sudo docker build --network none -t '{IMAGE}' '{REMOTE}'
''')
verify="""import json,urllib.request
from pathlib import Path
key=Path('/run/secrets/sales-admin-key').read_text().strip()
req=urllib.request.Request('http://127.0.0.1:8876/sales/admin/materials',headers={'Authorization':'Bearer '+key})
r=json.load(urllib.request.urlopen(req,timeout=5))
assert r['can_delete'] and isinstance(r['uploaders'],dict)
assert all(x['person_name'] is None and x['identity_type']=='device' for x in r['uploaders'].values())
print('uploader_metadata_count='+str(len(r['uploaders'])))
"""
idle="import sqlite3; d=sqlite3.connect('file:/var/lib/sasalele/sales-generation.sqlite?mode=ro',uri=True); assert d.execute(\"SELECT COUNT(*) FROM tasks WHERE state IN ('queued','running')\").fetchone()[0]==0"
update=f"import json; p='compose.admin-management.yaml'; d=json.load(open(p)); d['services']['api']['image']='{IMAGE}'; open(p,'w').write(json.dumps(d))"
dc='sudo docker compose --env-file deployment.env -f compose.yaml -f compose.prebuilt.yaml -f compose.admin-management.yaml'
run('uploader-deploy',f'''set -eu
cd '{DEPLOY}'
test "$(sudo docker inspect sasalele-sales-api-1 --format '{{{{.Image}}}}')" = '{BASE}'
test ! -e compose.before-uploaders.yaml
cp compose.admin-management.yaml compose.before-uploaders.yaml
{python_command(update)}
rollback() {{ cp compose.before-uploaders.yaml compose.admin-management.yaml; {dc} up -d --no-deps --no-build --pull never api; }}
trap 'rollback' EXIT
{dc} config --quiet
sudo docker exec sasalele-sales-api-1 {python_command(idle)}
{dc} up -d --no-deps --no-build --pull never api
ok=0
for i in $(seq 1 20); do
 if sudo docker exec sasalele-sales-api-1 {python_command(verify)}; then ok=1; break; fi
 sleep 2
done
test "$ok" = 1
trap - EXIT
sudo docker inspect sasalele-sales-api-1 --format '{{{{.Image}}}} {{{{.State.Status}}}}'
''')
