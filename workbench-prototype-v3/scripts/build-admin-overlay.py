"""Generate a narrow patch against the captured production image, not the dirty worktree."""
import ast
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tarfile

repo=Path(__file__).resolve().parents[2]
stage=repo/'workspace/tmp/sales-admin-release-20261109'
original=stage/'original/mktci'
source=repo/'project/modules/marketing-chat-insight/src/mktci'
output=stage/'build'
output.mkdir(exist_ok=True)

def block(text,name):
    node=next(n for n in ast.walk(ast.parse(text)) if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and n.name==name)
    start=min([node.lineno]+[d.lineno for d in getattr(node,'decorator_list',[])])-1
    return '\n'.join(text.splitlines()[start:node.end_lineno])+'\n'

def replace(text,old,new):
    if text.count(old)!=1: raise ValueError('Unexpected production source anchor: '+old[:70])
    return text.replace(old,new,1)

http=(original/'sales_http.py').read_text(encoding='utf-8')
current=(source/'sales_http.py').read_text(encoding='utf-8')
http=replace(http,'from starlette.responses import FileResponse','from mktci.sales_prompt_library import BusinessPrompts, KINDS\nfrom starlette.responses import FileResponse')
http=replace(http,'def access_code(folder):',block(current,'PromptReleaseBody')+'\ndef access_code(folder):')
functions=''.join(block(current,n) for n in ('prompt_admin','prompt_status','prompt_release','material_admin_status','delete_material'))
http=replace(http,'    def call(fn):',functions+'    def call(fn):')

materials=(original/'sales_materials.py').read_text(encoding='utf-8')
materials=replace(materials,block(materials,'remove'),block((source/'sales_materials.py').read_text(encoding='utf-8'),'remove'))

generation=(original/'sales_generation.py').read_text(encoding='utf-8')
generation=replace(generation,'def fingerprint(value):','from mktci.sales_prompt_library import runtime_prompt\n\ndef fingerprint(value):')
generation=replace(generation,"        digest=fingerprint([account,friend,kind,latest,original,request_id,experiment_task_id,device_id,catalog()['version'],GUIDANCE_PROMPT_VERSION if kind=='销售指导' else PROMPT_VERSION])", "        prompt_snapshot=runtime_prompt(self.service.folder,kind) if kind!='profile' else None\n        digest=fingerprint([account,friend,kind,latest,original,request_id,experiment_task_id,device_id,catalog()['version'],prompt_snapshot or PROMPT_VERSION])")
generation=replace(generation,'self.queue.put_nowait((job_id,account,friend,kind,latest,original))','self.queue.put_nowait((job_id,account,friend,kind,latest,original,prompt_snapshot))')
generation=replace(generation,'job_id,account,friend,kind,latest,original=task','job_id,account,friend,kind,latest,original,prompt_snapshot=task')
generation=replace(generation,"system=GUIDANCE_SYSTEM if kind=='销售指导' else REPLY_SYSTEM if kind=='帮我回' else POLISH_SYSTEM","system=prompt_snapshot['text']")
generation=replace(generation,"'prompt_version':GUIDANCE_PROMPT_VERSION if kind=='销售指导' else PROMPT_VERSION,","'prompt_version':prompt_snapshot['version'],'prompt_sha256':prompt_snapshot['sha'],")
files={'sales_http.py':http,'sales_materials.py':materials,'sales_generation.py':generation,'sales_prompt_library.py':(source/'sales_prompt_library.py').read_text(encoding='utf-8')}
for name,text in files.items():
    ast.parse(text)
    (output/name).write_text(text,encoding='utf-8',newline='\n')
test_package=stage/'tested-source/mktci'
shutil.copytree(original,test_package,dirs_exist_ok=True)
for name in files: shutil.copyfile(output/name,test_package/name)
(output/'Dockerfile').write_text('FROM sasalele-sales-api:20261103-knowledge-trial\nCOPY --chown=10001:10001 *.py /app/project/modules/marketing-chat-insight/src/mktci/\n',encoding='utf-8')
manifest={name:hashlib.sha256((output/name).read_bytes()).hexdigest() for name in files}
(stage/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
with tarfile.open(stage/'overlay.tar.gz','w:gz') as archive:
    for p in output.iterdir(): archive.add(p,arcname=p.name)
print(json.dumps({'files':list(files),'archive_bytes':(stage/'overlay.tar.gz').stat().st_size,'hashes':manifest}))
