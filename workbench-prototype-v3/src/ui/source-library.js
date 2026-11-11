import {knowledgeNavigation,documentNavigation} from './knowledge-navigation.js';
const onRoute=()=>['#/p/sales/w/sources','#/p/sales/w/knowledge'].includes(location.hash);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data,selected,detail,busy=false,message='',filter='',purpose='知识原料',parent='';
const bound=new WeakSet();
const date=v=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'尚无记录';
async function api(action,body={}){
 const r=await fetch('/api/knowledge/source-'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const d=await r.json();if(!r.ok||d.error)throw Error(d.error||'请求失败');return d;
}
const button=(action,text)=>`<button data-source-action="${action}" ${busy?'disabled':''}>${text}</button>`;
function content(){
 const rows=data?.sources||[], current=rows.find(r=>r.id===selected);
 const options=(value)=>data?.purposes.map(p=>`<option ${p===value?'selected':''}>${esc(p)}</option>`).join('')||'';
 return `${knowledgeNavigation('资料')}${documentNavigation('originals')}
 <header class="library-heading"><h2>销售知识资料 <small>${data?`${data.total} 份 · ${data.pending} 份待整理`:''}</small></h2>${button('refresh','刷新')}</header>
 <p role="status">${esc(message)}</p><details class="source-upload"><summary>上传源文件</summary>
 <label>用途<select data-source-purpose ${busy?'disabled':''}>${options(purpose)}</select></label>
 <label>关联原件 / 前版（可选）<select data-source-parent ${busy?'disabled':''}><option value="">独立材料</option>${rows.map(r=>`<option value="${r.id}" ${r.id===parent?'selected':''}>${esc(r.filename)}</option>`).join('')}</select></label>
 <label class="knowledge-drop" data-source-drop>选择或拖入文件<input type="file" data-source-upload ${busy?'disabled':''} accept=".txt,.md,.docx,.json,.py,.pdf,.xlsx,.csv"><small>最大 8 MB · 归档后保留原件，不自动发布</small></label></details>
 <label>按用途筛选<select data-source-filter><option value="">全部</option>${options(filter)}</select></label>
 <section class="source-layout"><ul class="knowledge-list source-list">${rows.filter(r=>!filter||r.purpose===filter).map(r=>`<li><button data-source-open="${r.id}" ${busy?'disabled':''} aria-pressed="${selected===r.id}"><strong>${esc(r.filename)}</strong><small>${esc(r.purpose)} · ${esc(r.status)} · ${(r.size/1024).toFixed(1)} KB</small><small>${r.uses.map(u=>`知识资料：${esc(({draft:'草稿',reviewed:'已审阅',active:'已发布',withdrawn:'已撤回'})[u.state]||'状态未知')}`).join('；')||'尚无本库下游关联记录'}</small></button></li>`).join('')||'<li>暂无源文件</li>'}</ul>
 <section class="source-detail">${current?`<h3>${esc(current.filename)}</h3><small>归档于 ${date(current.created)} · 北京时间</small>
 <p>${button('download','下载原件')} ${button('prepare',current.uses.length?'打开知识文档':'创建知识草稿')}</p>
 <label>用途<select data-source-edit-purpose ${busy?'disabled':''}>${options(current.purpose)}</select></label>
 <label>备注<textarea data-source-note maxlength="2000" ${busy?'disabled':''}>${esc(current.note)}</textarea></label>${button('update','保存资料信息')}
 ${current.parent?`<p>关联原件 / 前版：${esc(rows.find(r=>r.id===current.parent)?.filename||current.parent)}</p>`:''}
 <details><summary>来源与处理记录</summary>${current.origins.map(o=>`<p>${esc(o)}</p>`).join('')}<small>SHA256 ${current.id}</small>${(detail?.events||[]).map(e=>`<p>${date(e.at)} · ${esc(e.detail)}</p>`).join('')}</details>
 <details open><summary>原文预览</summary>${detail?.text!==null&&detail?.text!==undefined?`<pre>${esc(detail.text)}</pre>${detail.truncated?'<small>仅预览前 100 KB；下载原件可查看全文。</small>':''}`:'<p>此格式请下载原件查看。</p>'}</details>`:'<p>选择一份资料</p>'}</section></section>`;
}
export function sourceWorkface(){return `<section id="knowledge-workface"><div id="source-library">${content()}</div></section>`;}
function draw(){const root=document.getElementById('source-library');if(root)root.innerHTML=content();}
async function run(fn){if(busy)return;busy=true;message='';draw();try{await fn();}catch(e){message=e.message;}finally{busy=false;draw();}}
async function refresh(){data=await api('snapshot');}
async function upload(file){if(!file)return;await run(async()=>{
 if(file.size>8*1024*1024)throw Error('文件不能超过 8 MB');
 const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error('读取文件失败'));r.readAsDataURL(file);});
 const response=await api('upload',{filename:file.name,base64,purpose,parent:parent||null});
 message=response.duplicate?'已存在相同内容，未重复归档':'原件已归档，未发布';selected=response.id;
 await refresh();detail=await api('detail',{id:selected});
});}
export function sourceMounted(){
 const root=document.getElementById('source-library');if(!root||!onRoute()||bound.has(root))return;bound.add(root);
 root.addEventListener('change',e=>{
  if(e.target.hasAttribute('data-source-filter')){filter=e.target.value;draw();}
  if(e.target.hasAttribute('data-source-purpose'))purpose=e.target.value;
  if(e.target.hasAttribute('data-source-parent'))parent=e.target.value;
  if(e.target.hasAttribute('data-source-upload'))void upload(e.target.files[0]);
 });
 root.addEventListener('dragover',e=>{if(e.target.closest('[data-source-drop]'))e.preventDefault();});
 root.addEventListener('drop',e=>{if(e.target.closest('[data-source-drop]')){e.preventDefault();void upload(e.dataTransfer.files[0]);}});
 root.addEventListener('click',e=>{
  const open=e.target.closest('[data-source-open]');if(open){void run(async()=>{selected=open.dataset.sourceOpen;detail=await api('detail',{id:selected});});return;}
  const b=e.target.closest('[data-source-action]');if(!b)return;
  const a=b.dataset.sourceAction;
  const edits=a==='update'?{purpose:root.querySelector('[data-source-edit-purpose]').value,note:root.querySelector('[data-source-note]').value,revision:data.sources.find(r=>r.id===selected).revision}:{};
  void run(async()=>{
   if(a==='refresh'){await refresh();return;}
   if(a==='download'){
    const d=await api('download',{id:selected});const bytes=Uint8Array.from(atob(d.base64),c=>c.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));const link=document.createElement('a');link.href=url;link.download=d.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);return;
   }
   if(a==='update'){await api('update',{id:selected,...edits});message='资料信息已保存';await refresh();detail=await api('detail',{id:selected});return;}
   if(a==='prepare'){
    const current=data.sources.find(r=>r.id===selected);
    const response=current.uses.length?{documentId:current.uses[0].id}:await api('prepare',{id:selected});
    await refresh();location.hash='#/p/sales/w/knowledge-edit/'+encodeURIComponent(response.documentId);
   }
  });
 });
 void run(refresh);
}

export function sourceAssetMounted(){
 const targets=[...document.querySelectorAll('[data-source-asset-summary]')];if(!targets.length)return;
 api('snapshot').then(async d=>{for(const target of targets)if(target.isConnected)target.textContent=`${d.total} 份源文件 · ${d.pending} 份待整理 · 更新于 ${date(d.updatedAt)}（北京时间）`;
  const host=document.querySelector('[data-source-asset-details]');
  if(host){const {renderDataAssetDetails}=await import('./data-asset-details.js');if(host.isConnected)renderDataAssetDetails(host,{id:'sales-sources',status:'observed',source:'工作台资料库 snapshot',dataAsset:{total:d.total,pending:d.pending,updatedAt:d.updatedAt}});}
 }).catch(()=>{for(const target of targets)if(target.isConnected)target.textContent='源文件统计暂未取得';});
}
