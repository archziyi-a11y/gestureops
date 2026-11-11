import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const dir=mkdtempSync(join(tmpdir(),'workbench-workspace-api-'));
const url=`http://127.0.0.1:${port}/api/workspace`;
let server;
async function start(){
  server=spawn(process.execPath,['server.js'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,PORT:String(port),STATE_DIR:dir},stdio:'ignore'});
  for(let i=0;i<80;i++){try{const r=await fetch(url);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('startup timeout');
}
async function stop(){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;}
const post=async body=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
try {
  await start();
  let r=await post({type:'task-add',ids:['jyq','deploy'],version:0});assert.equal(r.ok,true);
  r=await post({type:'task-add',ids:['images'],version:0});assert.equal(r.status,409);assert.deepEqual(r.workspace.task,['jyq','deploy']);
  console.log('PASS stale tab cannot overwrite saved draft');
  r=await post({type:'task-add',ids:['reports'],version:1});assert.equal(r.status,400);
  assert.deepEqual((await (await fetch(url)).json()).workspace.task,['jyq','deploy']);
  console.log('PASS conflicting issue preserves server state');
  await stop();await start();
  r=await (await fetch(url)).json();assert.deepEqual(r.workspace.task,['jyq','deploy']);assert.equal(r.workspace.version,1);
  console.log('PASS draft and revision survive server restart');
  r=await post({type:'compose',target:'new',ids:['images'],version:r.workspace.version});
  r=await post({type:'compose-edit',target:'new',field:'name',value:'Delete test',version:r.workspace.version});
  r=await post({type:'project-save',version:r.workspace.version});
  const id=r.workspace.projects[0].id;
  r=await post({type:'project-delete',target:id,version:r.workspace.version});
  assert.equal(r.ok,true);
  await stop();await start();
  r=await (await fetch(url)).json();
  assert.equal(r.workspace.projects.length,0);assert.equal(r.workspace.compositions[id],undefined);
  assert.deepEqual(r.workspace.task,['jyq','deploy']);
  console.log('PASS draft deletion persists after restart and preserves unrelated task');
} finally {if(server?.exitCode===null)await stop();}
