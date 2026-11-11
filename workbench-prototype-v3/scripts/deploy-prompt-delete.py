"""Narrow prompt deletion overlay; preserve other running service modules."""
import os
import ast
import base64
import json
import zlib
from pathlib import Path

# Reuse transport definitions only, never the previous deployment statements.
helper=Path(__file__).with_name('deploy-material-uploaders.py')
tree=ast.parse(helper.read_text(encoding='utf-8'))
safe=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.FunctionDef))]
exec(compile(ast.Module(body=safe,type_ignores=[]),str(helper),'exec'))
def python_command(text):
    data=base64.b64encode(zlib.compress(text.encode())).decode()
    return 'python3 -c "import base64,zlib;exec(zlib.decompress(base64.b64decode(\''+data+'\')))"'
ROOT=Path(__file__).resolve().parents[2]
STAGE=ROOT/'workspace/tmp/prompt-delete-release'
STAGE.mkdir(parents=True,exist_ok=True)
CLI=Path.home()/'AppData/Local/Programs/AliyunCLI/aliyun.exe'
BASE=os.environ['GESTUREOPS_DEPLOY_BASE_IMAGE']
IMAGE='sasalele-sales-api:20261109-prompt-delete'
REMOTE='/home/admin/sales-prompt-delete-20261109'
DEPLOY=os.environ['GESTUREOPS_DEPLOY_DIRECTORY']
source=ROOT/'project/modules/marketing-chat-insight/src/mktci'
http=(source/'sales_http.py').read_text(encoding='utf-8')
nodes={}
for node in ast.walk(ast.parse(http)):
    if isinstance(node,(ast.FunctionDef,ast.ClassDef)) and node.name in ('PromptReleaseBody','prompt_release'):
        start=min([node.lineno]+[d.lineno for d in node.decorator_list])-1
        nodes[node.name]='\n'.join(http.splitlines()[start:node.end_lineno])+'\n'
patch=f"""import ast,base64,json
from pathlib import Path
root=Path('{REMOTE}')
nodes=json.loads(base64.b64decode('{encode(json.dumps(nodes))}'))
p=root/'sales_http.py'; text=p.read_text(); lines=text.splitlines(True)
targets=[n for n in ast.walk(ast.parse(text)) if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in nodes]
assert len(targets)==2
for n in sorted(targets,key=lambda n:n.lineno,reverse=True):
 start=min([n.lineno]+[d.lineno for d in n.decorator_list])-1
 lines[start:n.end_lineno]=[nodes[n.name]]
text=''.join(lines); ast.parse(text); p.write_text(text)
(root/'sales_prompt_library.py').write_bytes(base64.b64decode('{base64.b64encode((source/'sales_prompt_library.py').read_bytes()).decode()}'))
"""
run('prompt-delete-build',f'''set -eu
test "$(sudo docker inspect sasalele-sales-api-1 --format '{{{{.Image}}}}')" = '{BASE}'
mkdir -p '{REMOTE}'
sudo docker cp sasalele-sales-api-1:/app/project/modules/marketing-chat-insight/src/mktci/sales_http.py '{REMOTE}/sales_http.py'
sudo {python_command(patch)}
printf 'FROM {BASE}\nCOPY --chown=10001:10001 *.py /app/project/modules/marketing-chat-insight/src/mktci/\n' > '{REMOTE}/Dockerfile'
sudo docker build --network none -t '{IMAGE}' '{REMOTE}'
''')
verify="""import json,urllib.request
from pathlib import Path
from mktci.sales_http import PromptReleaseBody
from mktci.sales_prompt_library import BusinessPrompts
assert hasattr(BusinessPrompts,'delete')
assert PromptReleaseBody(action='delete',expected_revision=0).action=='delete'
key=Path('/run/secrets/sales-admin-key').read_text().strip()
for kind in ('reply','polish','guidance'):
 req=urllib.request.Request('http://127.0.0.1:8876/sales/admin/prompts/'+kind,headers={'Authorization':'Bearer '+key})
 result=json.load(urllib.request.urlopen(req,timeout=5))
 assert isinstance(result['state']['versions'],list) and result['loaded']['sha']
print('delete contract and three live prompt libraries verified; no versions deleted')
"""
idle="import sqlite3; d=sqlite3.connect('file:/var/lib/sasalele/sales-generation.sqlite?mode=ro',uri=True); assert d.execute(\"SELECT COUNT(*) FROM tasks WHERE state IN ('queued','running')\").fetchone()[0]==0"
update=f"import json; p='compose.admin-management.yaml'; d=json.load(open(p)); d['services']['api']['image']='{IMAGE}'; open(p,'w').write(json.dumps(d))"
dc='sudo docker compose --env-file deployment.env -f compose.yaml -f compose.prebuilt.yaml -f compose.admin-management.yaml'
run('prompt-delete-deploy',f'''set -eu
cd '{DEPLOY}'
test "$(sudo docker inspect sasalele-sales-api-1 --format '{{{{.Image}}}}')" = '{BASE}'
test ! -e compose.before-prompt-delete.yaml
cp compose.admin-management.yaml compose.before-prompt-delete.yaml
{python_command(update)}
rollback() {{ cp compose.before-prompt-delete.yaml compose.admin-management.yaml; {dc} up -d --no-deps --no-build --pull never api; }}
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
