"""Authorized narrow deployment. Secrets are generated remotely and returned RSA-encrypted."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding

REPO=Path(__file__).resolve().parents[2]
STAGE=REPO/'workspace/tmp/sales-admin-release-20261109'
CLI=Path.home()/'AppData/Local/Programs/AliyunCLI/aliyun.exe'
INSTANCE=os.environ['GESTUREOPS_DEPLOY_INSTANCE']
REMOTE='/home/admin/sales-admin-release-20261109'
DEPLOY=os.environ['GESTUREOPS_DEPLOY_DIRECTORY']
IMAGE='sasalele-sales-api:20261109-admin-management'
BASE=os.environ['GESTUREOPS_DEPLOY_BASE_IMAGE']
receipts=[]

def api(action,**params):
    args=[str(CLI),'swas-open',action,'--RegionId','cn-hongkong','--InstanceId',INSTANCE,'--profile','sales-migration']
    for key,value in params.items(): args.extend(['--'+key,str(value)])
    p=subprocess.run(args,capture_output=True,text=True,encoding='utf-8',creationflags=0x08000000)
    if p.returncode:
        (STAGE/'cli-error.txt').write_text(p.stderr,encoding='utf-8')
        raise RuntimeError('Cloud CLI failed: '+action)
    return json.loads(p.stdout)

def run(name,command,timeout=120):
    time.sleep(3)
    command='echo '+base64.b64encode(command.encode()).decode()+' | base64 -d | bash'
    invocation=api('RunCommand',Name=name,Type='RunShellScript',WorkingUser='admin',WorkingDir='/home/admin',CommandContent=command,Timeout=timeout)['InvokeId']
    deadline=time.monotonic()+timeout+40
    while time.monotonic()<deadline:
        time.sleep(2)
        result=api('DescribeInvocationResult',InvokeId=invocation)['InvocationResult']
        if result.get('InvokeRecordStatus')!='Finished': continue
        receipts.append({'name':name,'invokeId':invocation,'exitCode':result.get('ExitCode'),'start':result.get('StartTime'),'finish':result.get('FinishedTime')})
        (STAGE/'deployment-receipts.json').write_text(json.dumps(receipts,indent=2),encoding='utf-8')
        output=base64.b64decode(result.get('Output','')).decode('utf-8',errors='replace')
        print(name+': exit '+str(result.get('ExitCode')),flush=True)
        if result.get('ExitCode')!=0:
            (STAGE/'last-error.txt').write_text(output,encoding='utf-8')
            raise RuntimeError(name+' failed; safe diagnostics saved locally')
        return output
    raise RuntimeError(name+' result unknown; do not repeat deployment')

idle_source="import sqlite3; db=sqlite3.connect('file:/var/lib/sasalele/sales-generation.sqlite?mode=ro',uri=True); n=db.execute(\"SELECT COUNT(*) FROM tasks WHERE state IN ('queued','running')\").fetchone()[0]; print('inflight_jobs='+str(n)); assert n==0"
idle64=base64.b64encode(idle_source.encode()).decode()
idle_command=f"sudo docker exec sasalele-sales-api-1 python -c \"import base64;exec(base64.b64decode('{idle64}'))\""
run('admin-baseline-check',f'''set -eu
test "$(sudo docker inspect sasalele-sales-api-1 --format '{{{{.Image}}}}')" = '{BASE}'
test -f '{DEPLOY}/compose.prebuilt.yaml'
mkdir -p '{REMOTE}'
{idle_command}
''')
archive=(STAGE/'overlay.tar.gz').read_bytes()
for i,start in enumerate(range(0,len(archive),4500)):
    encoded=base64.b64encode(archive[start:start+4500]).decode()
    run('admin-upload-'+str(i),f"printf '%s' '{encoded}' | base64 -d > '{REMOTE}/part-{i:03}'")
expected=hashlib.sha256(archive).hexdigest()
run('admin-build',f'''set -eu
cat '{REMOTE}'/part-* > '{REMOTE}/overlay.tar.gz'
echo '{expected}  {REMOTE}/overlay.tar.gz' | sha256sum -c -
mkdir -p '{REMOTE}/build'
tar -xzf '{REMOTE}/overlay.tar.gz' -C '{REMOTE}/build'
sudo docker build --network none -t '{IMAGE}' '{REMOTE}/build'
''')

# Smoke tests use fresh temporary data, synthetic credentials, and no network.
smoke="""import os,tempfile
from pathlib import Path
from fastapi.testclient import TestClient
from mktci.sales_http import create_app
from mktci.sales_prompt_library import BusinessPrompts,runtime_prompt
os.environ['SASALELE_PROMPT_ADMIN_KEY']='synthetic'
with tempfile.TemporaryDirectory() as d:
 folder=Path(d)
 with TestClient(create_app(folder=folder,code='employee',mode='lan')) as c:
  h={'Authorization':'Bearer synthetic'}
  item=c.app.state.materials.create('synthetic','synthetic','test','synthetic-request-0001')
  route='/sales/admin/materials/'+item['id']+'/delete'
  assert c.post(route,json={'expected_title':'synthetic'}).status_code==403
  assert c.post(route,headers=h,json={'expected_title':'synthetic'}).json()['deleted']
  assert c.get('/sales/materials',headers={'Authorization':'Bearer employee'}).json()['materials']==[]
  local=BusinessPrompts(folder/'local')
  row=local.save('polish','synthetic prompt')['versions'][0]
  route='/sales/admin/prompts/polish'
  assert c.post(route,headers=h,json={'version':row,'target_id':row['id'],'expected_revision':0,'action':'install'}).json()['loaded']['sha']==row['sha']
  assert runtime_prompt(folder,'润色')['sha']==row['sha']
  assert c.post(route,headers=h,json={'target_id':None,'expected_revision':1,'action':'rollback'}).status_code==200
  local.close()
print('isolated_image_smoke_pass')
"""
encoded=base64.b64encode(smoke.encode()).decode()
run('admin-image-smoke',f"sudo docker run --rm --network none --entrypoint python '{IMAGE}' -c \"import base64;exec(base64.b64decode('{encoded}'))\"")

private=rsa.generate_private_key(public_exponent=65537,key_size=2048)
public=private.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
public64=base64.b64encode(public).decode()
sealed=run('admin-key-bootstrap',f'''set -eu
printf '%s' '{public64}' | base64 -d > '{REMOTE}/exchange-public.pem'
sudo python3 -c "import os,secrets; p='/opt/sasalele-private/admin-management.key'; f=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o640); os.write(f,secrets.token_urlsafe(48).encode()); os.fchown(f,0,10001); os.close(f)"
sudo openssl pkeyutl -encrypt -pubin -inkey '{REMOTE}/exchange-public.pem' -in /opt/sasalele-private/admin-management.key -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 | base64 -w0
''')
key=private.decrypt(base64.b64decode(sealed.strip()),padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=None)).decode()
config=Path(os.getenv('LOCALAPPDATA'))/'Sasalele/admin-connection.json'
config.parent.mkdir(exist_ok=True)
with config.open('x',encoding='utf-8') as f: json.dump({'service_url':'https://xiaoshou.yilihuashi.com','admin_key':key},f)
user=os.getenv('USERNAME')
subprocess.run(['icacls',str(config),'/inheritance:r','/grant:r',user+':F','SYSTEM:F'],capture_output=True,check=True,creationflags=0x08000000)
override={'services':{'api':{'image':IMAGE,'environment':{'SASALELE_PROMPT_ADMIN_KEY_FILE':'/run/secrets/sales-admin-key'},'volumes':['/opt/sasalele-private/admin-management.key:/run/secrets/sales-admin-key:ro']}}}
override64=base64.b64encode(json.dumps(override).encode()).decode()
dc=f"sudo docker compose --env-file deployment.env -f compose.yaml -f compose.prebuilt.yaml"
verify="""import json,urllib.request
from pathlib import Path
key=Path('/run/secrets/sales-admin-key').read_text().strip()
for path in ['/sales/admin/prompts/reply','/sales/admin/prompts/polish','/sales/admin/prompts/guidance','/sales/admin/materials','/_health/live']:
 req=urllib.request.Request('http://127.0.0.1:8876'+path,headers={'Authorization':'Bearer '+key})
 data=json.load(urllib.request.urlopen(req,timeout=5))
 if 'prompts' in path: assert data['state']['activeId'] is None
 print(path+' PASS')
"""
verify64=base64.b64encode(verify.encode()).decode()
run('admin-deploy',f'''set -eu
cd '{DEPLOY}'
test "$(sudo docker inspect sasalele-sales-api-1 --format '{{{{.Image}}}}')" = '{BASE}'
printf '%s' '{override64}' | base64 -d > compose.admin-management.yaml
{dc} -f compose.admin-management.yaml config --quiet
{idle_command}
rollback() {{ {dc} up -d --no-deps --no-build --pull never api; }}
trap 'rollback' EXIT
{dc} -f compose.admin-management.yaml up -d --no-deps --no-build --pull never api
ok=0
for i in $(seq 1 20); do
 if sudo docker exec sasalele-sales-api-1 python -c "import base64;exec(base64.b64decode('{verify64}'))"; then ok=1; break; fi
 sleep 2
done
test "$ok" = 1
trap - EXIT
sudo docker inspect sasalele-sales-api-1 --format '{{{{.Image}}}} {{{{.State.Status}}}}'
''')
print('DEPLOYED; local management connection saved; business prompts remain built-in; no real material deleted',flush=True)
