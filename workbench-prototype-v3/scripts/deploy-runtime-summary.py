"""Owner-authorized runtime observations overlay; preserve the running business implementation."""
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
STAGE=ROOT/'workspace/tmp/runtime-summary-release-20261110'
STAGE.mkdir(parents=True,exist_ok=True)
CLI=Path.home()/'AppData/Local/Programs/AliyunCLI/aliyun.exe'
REMOTE='/home/admin/sales-runtime-summary-20261110'
DEPLOY=os.environ['GESTUREOPS_DEPLOY_DIRECTORY']
IMAGE='sasalele-sales-api:20261110-runtime-summary'
source=ROOT/'project/modules/marketing-chat-insight/src/mktci'

def packed(text):
    data=base64.b64encode(zlib.compress(text.encode())).decode()
    return 'python3 -c "import base64,zlib;exec(zlib.decompress(base64.b64decode(\''+data+'\')))"'

def methods(filename,names):
    text=(source/filename).read_text(encoding='utf-8')
    out={}
    for n in ast.walk(ast.parse(text)):
        if isinstance(n,ast.FunctionDef) and n.name in names:
            start=min([n.lineno]+[d.lineno for d in n.decorator_list])-1
            out[n.name]='\n'.join(text.splitlines()[start:n.end_lineno])+'\n'
    assert len(out)==len(names)
    return out

generation=methods('sales_generation.py',('_observe','runtime_summary','_ensure_profile'))
http=methods('sales_http.py',('runtime_summary',))
patch=f"""import ast,base64,json
from pathlib import Path
root=Path('{REMOTE}')
p=root/'sales_generation.py'; text=p.read_text()
assert 'RuntimeObservations' not in text
def replace(old,new):
 global text
 assert text.count(old)==1, old
 text=text.replace(old,new)
replace('        self.llm=llm or self._complete', '        self.llm=llm or self._complete\\n        from mktci.sales_runtime import RuntimeObservations\\n        self.runtime=RuntimeObservations(service.folder, self.clock)')
replace('            self.queue.put_nowait((job_id,account,friend,kind,latest,original,prompt_snapshot))',"            self._observe(job_id,kind,'queued')\\n            self.queue.put_nowait((job_id,account,friend,kind,latest,original,prompt_snapshot))")
anchor='    def _ensure_profile(self,account,friend,identity,chat):'
replace(anchor,'    def _generate_profile(self,account,friend,identity,chat):')
nodes=json.loads(base64.b64decode('{encode(json.dumps(generation))}'))
replace('    def _generate_profile(self,account,friend,identity,chat):', ''.join(nodes.values())+'\\n    def _generate_profile(self,account,friend,identity,chat):')
node=next(n for n in ast.walk(ast.parse(text)) if isinstance(n,ast.FunctionDef) and n.name=='_set')
lines=text.splitlines(True)
lines.insert(node.end_lineno,"            row=self.db.execute('SELECT kind FROM tasks WHERE id=?',(job_id,)).fetchone()\\n            if row: self._observe(job_id,row[0],state,error)\\n")
text=''.join(lines)
replace('self.client.close(); self.db.close(); self.experiment.close()', 'self.client.close(); self.db.close(); self.experiment.close(); self.runtime.close()')
ast.parse(text);p.write_text(text)
p=root/'sales_http.py'; text=p.read_text()
anchor="    @app.get('/sales/admin/model-connection')"
assert text.count(anchor)==1 and '/sales/admin/runtime-summary' not in text
text=text.replace(anchor,base64.b64decode('{encode(http['runtime_summary'])}').decode()+'\\n'+anchor)
ast.parse(text);p.write_text(text)
(root/'sales_runtime.py').write_bytes(base64.b64decode('{base64.b64encode((source/'sales_runtime.py').read_bytes()).decode()}'))
"""
run('runtime-build',f'''set -eu
test ! -e '{REMOTE}'
mkdir -p '{REMOTE}'
sudo docker inspect sasalele-sales-api-1 --format '{{{{.Image}}}}' > '{REMOTE}/base-image'
for f in sales_generation.py sales_http.py; do
 sudo docker cp sasalele-sales-api-1:/app/project/modules/marketing-chat-insight/src/mktci/$f '{REMOTE}/'$f
done
sudo {packed(patch)}
printf 'FROM %s\nCOPY --chown=10001:10001 *.py /app/project/modules/marketing-chat-insight/src/mktci/\n' "$(cat '{REMOTE}/base-image')" > '{REMOTE}/Dockerfile'
sudo docker build --network none -t '{IMAGE}' '{REMOTE}'
sudo docker run --rm --network none --entrypoint python '{IMAGE}' -c 'from mktci.sales_http import create_app; a=create_app(); assert any(r.path=="/sales/admin/runtime-summary" for r in a.routes); print("runtime import PASS")'
''')
verify="""import json,urllib.request
from pathlib import Path
key=Path('/run/secrets/sales-admin-key').read_text().strip()
for path in ('/sales/admin/runtime-summary','/sales/admin/model-connection','/sales/admin/prompts/polish','/sales/admin/materials'):
 req=urllib.request.Request('http://127.0.0.1:8876'+path,headers={'Authorization':'Bearer '+key})
 data=json.load(urllib.request.urlopen(req,timeout=5))
 if path.endswith('runtime-summary'):
  assert len(data['items'])==4 and not data['coverageDegraded']
  assert not any(k in json.dumps(data) for k in ('account_id','friend_id','payload','api_key'))
print('runtime, model config, prompts and materials readback PASS')
"""
idle="import sqlite3; d=sqlite3.connect('file:/var/lib/sasalele/sales-generation.sqlite?mode=ro',uri=True); assert d.execute(\"SELECT COUNT(*) FROM tasks WHERE state IN ('queued','running')\").fetchone()[0]==0"
update=f"import json; p='compose.admin-management.yaml'; d=json.load(open(p)); d['services']['api']['image']='{IMAGE}'; open(p,'w').write(json.dumps(d))"
dc='sudo docker compose --env-file deployment.env -f compose.yaml -f compose.prebuilt.yaml -f compose.admin-management.yaml'
run('runtime-deploy',f'''set -eu
cd '{DEPLOY}'
test "$(sudo docker inspect sasalele-sales-api-1 --format '{{{{.Image}}}}')" = "$(cat '{REMOTE}/base-image')"
test ! -e compose.before-runtime-summary.yaml
cp compose.admin-management.yaml compose.before-runtime-summary.yaml
sudo docker exec sasalele-sales-api-1 {packed(idle)}
rollback() {{ cp compose.before-runtime-summary.yaml compose.admin-management.yaml; {dc} up -d --no-deps --no-build --pull never api; }}
trap 'rollback' EXIT
{packed(update)}
{dc} config --quiet
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
