import assert from 'node:assert/strict';
import {asset,registerCardObservations} from '../src/domain/asset-catalog.js';
import { ASSETS, addToTask, initialWorkspace, workspaceAction, contextText } from '../src/domain/workspace.js';
let count=0;
function test(name,fn){fn();console.log('PASS',name);count++;}
const examples={a:{issue:'A',severity:'normal'},b:{issue:'B',severity:'normal'},c:{issue:'C',severity:'severe'},u:{issue:'U',severity:'unknown'},doc:{}};
test('实时摘要不覆盖固定用途',()=>{const purpose=asset('geo').summary;registerCardObservations([{id:'geo',summary:'今天已成稿',fact:'1 篇'}]);assert.equal(asset('geo').summary,purpose);assert.equal(asset('geo').fact,'1 篇');});
test('一般问题可批量',()=>assert.deepEqual(addToTask(['a'],['b'],id=>examples[id]),['a','b']));
test('严重问题独占但可以带资料',()=>assert.deepEqual(addToTask(['c'],['doc'],id=>examples[id]),['c','doc']));
test('严重问题不混装',()=>assert.throws(()=>addToTask(['a'],['c'],id=>examples[id])));
test('未知等级不默认批量',()=>assert.throws(()=>addToTask(['u'],['a'],id=>examples[id])));
test('拒绝冲突保留已有选择',()=>{const old=['a'];assert.throws(()=>addToTask(old,['c'],id=>examples[id]));assert.deepEqual(old,['a']);});
test('重复拖入去重',()=>assert.deepEqual(addToTask(['n8n'],['n8n']),['n8n']));
test('未知对象拒绝',()=>assert.throws(()=>addToTask([],['bad'])));
let s=initialWorkspace();
test('新项目可先填后拖',()=>{s=workspaceAction(s,{type:'compose',target:'new'});s=workspaceAction(s,{type:'compose-edit',target:'new',field:'name',value:'知识助手'});s=workspaceAction(s,{type:'compose',target:'new',ids:['images']});assert.equal(s.compositions.new.name,'知识助手');});
test('项目草稿保留资产与描述',()=>{s=workspaceAction(s,{type:'project-save'});assert.equal(s.projects.length,1);assert.deepEqual(s.compositions[s.projects[0].id].ids,['images']);});
test('无名称不保存',()=>assert.throws(()=>workspaceAction(initialWorkspace(),{type:'project-save'})));
test('已有项目组合可取消',()=>{let x=workspaceAction(s,{type:'compose',target:'sales',ids:['deploy']});x=workspaceAction(x,{type:'compose-cancel',target:'sales'});assert.equal(x.compositions.sales,undefined);});
test('查看不改变任务',()=>{let x=workspaceAction(s,{type:'task-add',ids:['jyq']});x=workspaceAction(x,{type:'inspect',ids:['prism']});assert.deepEqual(x.task,['jyq']);});
test('上下文保留来源与边界',()=>{const t=contextText(['jyq','deploy'],'排查');assert.ok(t.includes('AGENTS.md')&&t.includes('不得读取')&&t.includes('LIVE-AUTOMATION'));});
test('目录六类齐全',()=>assert.equal(new Set(ASSETS.map(a=>a.category)).size,6));
test('删除草稿不删除资产或其他上下文',()=>{
  const id=s.projects[0].id;
  const before=structuredClone(s);
  const withTask=workspaceAction(s,{type:'task-add',ids:['images']});
  const next=workspaceAction(withTask,{type:'project-delete',target:id});
  assert.equal(next.projects.length,0);
  assert.equal(next.compositions[id],undefined);
  assert.deepEqual(next.task,['images']);
  assert.ok(ASSETS.some(a=>a.id==='images'));
  assert.deepEqual(s,before);
});
test('禁止删除实际项目与不存在草稿',()=>{
  for(const target of ['sales','prism','bridge','draft-nope'])
    assert.throws(()=>workspaceAction(s,{type:'project-delete',target}));
});
test('项目不能加入自身且原状态不变',()=>{
  for(const target of ['sales','prism','bridge']) {
    const before=initialWorkspace();
    const snapshot=structuredClone(before);
    assert.throws(()=>workspaceAction(before,{type:'compose',target,ids:[target,'deploy']}),/自身/);
    assert.deepEqual(before,snapshot);
  }
});
test('其他项目仍可加入组装',()=>{
  const next=workspaceAction(initialWorkspace(),{type:'compose',target:'sales',ids:['prism','deploy']});
  assert.deepEqual(next.compositions.sales.ids,['prism','deploy']);
});
console.log(`${count} passed`);
