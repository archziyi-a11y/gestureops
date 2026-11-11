const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
import {knowledgeNavigation,documentNavigation} from './knowledge-navigation.js';
import {promptDiffView,handlePromptDiff} from './prompt-diff.js';
const route = '#/p/sales/w/knowledge-edit';
const debugging=()=>location.hash.startsWith('#/p/sales/w/answer-lab');
const documentId=()=>location.hash.startsWith(route+'/')?decodeURIComponent(location.hash.slice(route.length+1)):null;
let mountedRoute='';
let snapshot, busy = false, active = false, edit, result, message = '';
function sourceLabel(source, filename = '') {
 if(Array.isArray(source))return source.map(s=>sourceLabel(s,filename)).join('；');
 if(!source || typeof source!=='object')return String(source || filename || '来源未提供');
 return [source.filename || filename, source.paragraph != null ? `段落 ${source.paragraph}` : '', source.table != null ? `表格 ${source.table}` : '', source.row != null ? `行 ${source.row}` : '', source.column != null ? `列 ${source.column}` : '', source.page != null ? `页 ${source.page}` : ''].filter(Boolean).join(' · ') || '来源位置未提供';
}
function suggestionSource(s) {
 const original=snapshot.documents.find(d=>d.id===edit.id);
 return s.sourceBlockIds.map(id=>{const block=original?.blocks.find(b=>b.id===id);return block?sourceLabel(block.source,original.filename):`来源块 ${id}`;}).join('；');
}
const question = {query:'',entity:'',year:''};
const questionExamples = [
 '首次咨询课程，需要准备哪些信息？', '如何安排一次课程体验？',
 '这份课程说明适用于哪个年度？', '报名流程分为哪些步骤？',
 '资料中有哪些授课方式？', '如何联系课程服务人员？',
 '课程调整有哪些办理条件？', '费用说明是否标明有效期？'
];
let exampleIndex = 0, exampleTimer;
let pendingQuestion = '';
let comparisonMode = 'knowledge', promptDraft = null, promptVersion = null;
let libraryKind='trial';
const businessLibraries=new Map();
const businessLabels={reply:'帮我回',polish:'润色',guidance:'销售指导'};
const business=()=>businessLibraries.get(libraryKind);
const businessSelected=()=>business()?.local?.versions.find(v=>v.id===business()?.selected);
const businessText=()=>business()?.draft ?? businessSelected()?.text ?? business()?.local?.builtin ?? '';
function receiveBusiness(data) {
 const previous=business() || {};
 businessLibraries.set(libraryKind,{...previous,...data});
}
function businessEditor() {
 const b=business();
 if(!b)return '<p role="status">正在读取版本库…</p>';
 const runtime=b.remote;
 const deleteReason=busy?'正在处理，请稍候':!businessSelected()?'内置版本不能删除':!b.connected?'连接服务后可核对并删除版本':b.selected===runtime.state.activeId?'当前版本正在生效，请先实装其他版本或回退':'';
 const installReason=busy?'正在处理，请稍候':!businessSelected()?'请先保存新版本，再实装':businessText()!==businessSelected()?.text?'内容已修改，请先保存新版本':'';
 return `<section class="trial-prompts"><p>${b.connected?`当前生效版本：${esc(runtime.state.versions.find(v=>v.id===runtime.state.activeId)?.filename || '内置版本')}`:esc(b.connectionMessage || '尚未连接销售助手，暂不能实装提示词')}</p><details data-business-editor ${b.editorOpen?'open':''}><summary>提示词与版本</summary>
 <label>本地已保存版本<select data-business-version ${busy?'disabled':''}><option value="">内置版本</option>${b.local.versions.map(v=>`<option value="${esc(v.id)}" ${b.selected===v.id?'selected':''}>${esc(v.filename)}</option>`).join('')}</select></label>
 <label>版本名称<input data-business-name maxlength="80" value="${esc(b.name ?? businessLabels[libraryKind])}" ${busy?'disabled':''}></label>
 <label>系统提示词<textarea data-business-draft maxlength="30000" ${busy?'readonly':''}>${esc(businessText())}</textarea></label>
 <div>${button('business-save','保存新版本')} ${button('business-reset','还原所选版本')}
 <button data-action="business-delete" title="${esc(deleteReason||'从版本库删除，保留历史审计记录')}" ${deleteReason?'disabled':''}>删除所选版本</button>
 ${b.connected?`<button data-action="business-install" title="${esc(installReason||'将所选版本用于此功能的新任务')}" ${installReason?'disabled':''}>实装所选版本</button>`:''}
 ${button('business-refresh',b.connected?'刷新生效版本':'重新连接')}</div>
 ${b.connected?`<details><summary>版本回退</summary><label>恢复到<select data-business-rollback ${busy?'disabled':''}><option value="">内置版本</option>${runtime.state.versions.map(v=>`<option value="${esc(v.id)}" ${b.rollback===v.id?'selected':''}>${esc(v.filename)}</option>`).join('')}</select></label><button data-action="business-rollback" ${busy?'disabled':''}>回退此功能</button></details>`:''}
 <small>${b.connected?'保存不影响当前服务；实装或回退后，新任务使用该版本。':'可在本地保存版本、对比回答。'}</small></details></section>`;
}
const promptVersions = () => snapshot?.prompts?.versions || [];
const selectedPrompt = () => promptVersions().find(p=>p.version===Number(promptVersion)) || promptVersions()[0];
const trialPrompt = () => promptDraft ?? selectedPrompt()?.text;
const questionPlaceholder = () => `例如：${questionExamples[exampleIndex]}`;
function stopExamples() { clearInterval(exampleTimer); exampleTimer = undefined; }
function startExamples() {
 if(exampleTimer || matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 exampleTimer = setInterval(() => {
  if(!onRoute()){stopExamples();return;}
  const input=document.querySelector('#knowledge-workface [data-question="query"]');
  if(!input || document.hidden || input.value || document.activeElement===input || busy)return;
  exampleIndex=(exampleIndex+1)%questionExamples.length;
  input.placeholder=questionPlaceholder();
 }, 5000);
}
window.addEventListener('hashchange',()=>{if(!onRoute())stopExamples();});
const bound = new WeakSet();
const onRoute = () => location.hash===route || location.hash.startsWith(route+'/') || debugging();
const button = (action, label, id = '') => `<button type="button" data-action="${action}" data-id="${esc(id)}" ${busy?'disabled':''}>${label}</button>`;
const field = (name, label, value = '') => `<label>${label}<input data-field="${name}" value="${esc(value)}"></label>`;
function comparisonView() {
 if(!result?.comparison)return '';
 const rag=result.augmented || {}, plain=result.baseline || {};
 const sources=rag.matches || [];
 const answer=data=>data.answer?`${data.answerSummary?`<p class="answer-summary">${esc(data.answerSummary)}</p>`:''}<div class="comparison-answer">${esc(data.answer)}</div>`:`<p role="status">${esc(data.generationError || '未生成回答')}</p>`;
 return `<section class="knowledge-comparison" aria-label="试问对比">
 <header><h3>回答对比</h3><small>${esc(result.model)} · 知识库版本 ${esc(rag.version ?? '未取得')}</small></header>
 <p class="comparison-question">${esc(result.question)}</p>
 <small>${esc([result.scope?.entity,result.scope?.year].filter(Boolean).join(' · ') || '通用资料')} · ${esc(result.startedAt)}（UTC）</small>
 <div class="comparison-columns">
 <section><h4>${result.comparisonMode==='prompt'?'原版提示词':'不使用知识库'}</h4>${answer(plain)}</section>
 <section><h4>${result.comparisonMode==='prompt'?'修改版提示词':'使用知识库'}</h4>${answer(rag)}
 ${rag.retrievalWarning?`<p role="alert">${esc(rag.retrievalWarning)}</p>`:''}
 ${rag.coverage?.truncated?'<p role="alert">检索候选未覆盖全部资料。</p>':''}
 ${rag.contextBudget?.omitted?`<p class="comparison-note">回答采用 ${esc(rag.contextBudget.supplied)} 个片段，另 ${esc(rag.contextBudget.omitted)} 个未纳入回答预算。</p>`:''}
 <details class="comparison-sources"><summary>检索依据 · ${sources.length} 个片段</summary>
 ${sources.map(m=>`<article><strong>${esc(m.title)}</strong><small>${rag.citations?.includes(m.id)?'回答已引用':'检索命中，回答未引用'} · ${esc(sourceLabel(m.source,m.filename))}</small><p>${esc(m.text)}</p></article>`).join('') || '<p>无命中</p>'}
 </details></section></div>
 ${result.promptSnapshot?(result.comparisonMode==='prompt'?promptDiffView(result.promptSnapshot):`<details class="comparison-sources"><summary>本次系统提示词 · 两侧共用</summary><p class="comparison-answer">${esc(result.promptSnapshot.baseline)}</p></details>`):''}</section>`;
}
function promptEditor() {
 const selector=`<label>测试功能<select data-library-kind ${busy?'disabled':''}><option value="trial" ${libraryKind==='trial'?'selected':''}>知识试问</option>${Object.entries(businessLabels).map(([id,label])=>`<option value="${id}" ${libraryKind===id?'selected':''}>${label}</option>`).join('')}</select></label>`;
 if(libraryKind!=='trial')return selector+businessEditor();
 return selector+`<fieldset class="comparison-mode"><legend>对比内容</legend>
 <label><input type="radio" name="knowledge-compare-mode" value="knowledge" ${comparisonMode==='knowledge'?'checked':''} ${busy?'disabled':''}>知识库效果</label>
 <label><input type="radio" name="knowledge-compare-mode" value="prompt" ${comparisonMode==='prompt'?'checked':''} ${busy?'disabled':''}>提示词效果</label></fieldset>
 <details class="trial-prompts" ${comparisonMode==='prompt'?'open':''}><summary>系统提示词 · 仅用于本页试问</summary>
 <label>已保存版本<select data-prompt-version ${busy?'disabled':''}>${promptVersions().map(p=>`<option value="${p.version}" ${selectedPrompt()?.version===p.version?'selected':''}>版本 ${p.version}</option>`).join('')}</select></label>
 <label>${comparisonMode==='prompt'?'修改版提示词':'试问提示词'}<textarea data-prompt-draft maxlength="12000" ${busy?'readonly':''}>${esc(trialPrompt() || '')}</textarea></label>
 <div>${button('prompt-save','保存新版本')} ${button('prompt-reset','还原所选版本')}</div>
 </details>`;
}
function content() {
 const docs = snapshot?.documents || [];
 const replacements = edit ? docs.filter(d => d.state === 'active' && d.id !== edit.id && d.filename === edit.filename) : [];
 return `${knowledgeNavigation(debugging()?'调试':'资料')}${debugging()?'':documentNavigation('documents')}
 <header class="library-heading"><h2>${debugging()?'回答调试':'知识草稿与发布'} <small>知识版本 ${esc(snapshot?.version ?? '未读取')}</small></h2>${debugging()?'':button('refresh','刷新')}</header>
 <p role="status" data-message>${esc(message)}</p>
 <section class="knowledge-work-area">${debugging()?'':`<div class="knowledge-library ${edit?'is-editing':''}">
 <ul class="knowledge-list">${docs.map(d=>`<li><div><strong>${esc(d.title || d.filename)}</strong><small>${esc(d.filename)} · ${esc(({active:'已发布',draft:'草稿',reviewed:'已审阅',withdrawn:'已撤回'})[d.state] || d.state)}</small></div>${button('open','查看',d.id)}${d.state==='active'?button('withdraw','撤回',d.id):''}</li>`).join('') || '<li>暂无资料</li>'}</ul>
 ${edit?`<section class="knowledge-detail"><header><h3>${esc(edit.title || edit.filename)}</h3>${button('close','关闭')}</header>
 ${edit.blocks.map((b,i)=>`<label>内容 ${i+1}<textarea data-block="${i}" ${edit.state!=='draft'?'readonly':''}>${esc(b.text)}</textarea><small>${esc(b.source || b.sources ? sourceLabel(b.source || b.sources,edit.filename) : edit.proposalApplied && b.sourceBlockIds ? suggestionSource(b) : sourceLabel(null,edit.filename))}</small></label>`).join('')}
 ${edit.state!=='draft'?'':`<div class="knowledge-fields">${field('entity','适用学校或项目（可选）',edit.scope.entity)}${field('year','年度（可选）',edit.scope.year)}</div><label class="knowledge-confirm"><input type="checkbox" data-confirm ${edit.scope.confirmed?'checked':''}>内容及适用范围已审阅（发布前必须确认）</label>
 ${button('review','保存草稿')} ${button('organize','生成整理建议')} ${button('discard','放弃未保存修改')}
 ${edit.suggestions?`<section><h3>整理建议</h3>${edit.suggestions.map(s=>`<p>${esc(s.text)}<small>${esc(suggestionSource(s))}</small></p>`).join('')}${button('accept','采用建议')}</section>`:''}
 ${replacements.length?`<label>替换同名已发布资料<select data-replace><option value="">必须选择替换对象</option>${replacements.map(d=>`<option value="${esc(d.id)}" ${edit.replaceId===d.id?'selected':''}>${esc(d.title || d.filename)} · ${esc(d.id)}</option>`).join('')}</select></label>`:''}
 ${button('publish','发布')}`}${edit.state==='active'?`<p>${button('try-document','用这份资料试问')}</p>`:''}</section>`:''}
 </div>`}${debugging()?`<section class="knowledge-query">${promptEditor()}<label>${libraryKind==='polish'?'待润色原文':libraryKind==='guidance'?'当前情况':libraryKind==='reply'?'客户消息':'问题'}<textarea data-question="query" placeholder="${esc(questionPlaceholder())}">${esc(question.query)}</textarea></label><div class="knowledge-fields">${field('queryEntity','适用学校或项目（可选）',question.entity)}${field('queryYear','年度（可选）',question.year)}</div>${libraryKind!=='trial'?'<small>本次使用填写的测试文本，不自动加载手机端聊天与客户画像。</small>':''}${button('query',busy&&message==='正在生成两份回答…'?'对比中…':'对比回答')}
 ${pendingQuestion?`<div class="query-pending" role="status"><p>${esc(pendingQuestion)}</p><p>${comparisonMode==='prompt'?'正在使用同一份检索资料对比两版提示词…':'正在生成无知识库回答，并检索资料生成知识库回答…'}</p></div>`:''}
 ${result?.coverage?.truncated?'<p role="alert" data-coverage-warning>检索覆盖已截断，结果未覆盖全部资料。</p>':''}
 ${snapshot && !snapshot.modelConfigured?'<p>模型未配置</p>':''}
 ${result&&!result.comparison?`<div class="knowledge-result"><p>检索版本 ${esc(result.version)} · ${esc(result.mode)}</p>${result.retrievalWarning?`<p role="alert">${esc(result.retrievalWarning)}</p>`:''}${result.answer?`<p>${esc(result.answer)}</p>`:''}${result.generationError?`<p role="alert">${esc(result.generationError)}</p>`:''}${!result.answer?'<p>未生成回答</p>':''}<ul>${(result.matches || []).map(m=>`<li><strong>${esc(m.title)}</strong><p>${esc(m.text)}</p><small>引用 ${esc(m.id)} · ${esc(sourceLabel(m.source,m.filename))}</small></li>`).join('') || '<li>无命中</li>'}</ul>${result.citations?.length?`<h4>回答引用</h4><ul>${result.citations.map(c=>`<li>${esc(typeof c==='object'?[c.title,c.id || c.blockId,sourceLabel(c.source || c,c.filename),c.text].filter(Boolean).join(' · '):c)}</li>`).join('')}</ul>`:''}</div>`:''}</section>`:''}</section>${debugging()?comparisonView():''}`;
}
export function knowledgeWorkface() { return `<section id="knowledge-workface">${onRoute()?content():''}</section>`; }
function draw() {
 if (!onRoute()) return;
 const root = document.getElementById('knowledge-workface');
 if (!root) return;
 const focused = root.contains(document.activeElement) ? document.activeElement : null;
 const key = focused?.getAttribute('data-field') || focused?.getAttribute('data-question');
 const block = focused?.getAttribute('data-block');
 const start = focused?.selectionStart, end = focused?.selectionEnd;
 root.innerHTML = content();
 const target = key ? root.querySelector(`[data-field="${key}"], [data-question="${key}"]`) : block !== null && block !== undefined ? root.querySelector(`[data-block="${block}"]`) : null;
 if(target){target.focus();if(start!==null)target.setSelectionRange(start,end);}
}
async function request(path='', payload) {
 const response = await fetch('/api/knowledge'+path, payload === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const data = await response.json();
 if(!response.ok)throw Error(data.error || '请求失败');
 return data;
}
async function run(task) {
 if(busy || !onRoute())return;
 busy=true;message='';draw();
 try{await task();}catch(e){message=e.message;}finally{busy=false;draw();}
}
async function write(path,payload) {
 await request(path,payload);
 message='操作已成功';
 try{snapshot=await request();}catch(e){message=`操作已成功，但刷新失败：${e.message}。请刷新核对，勿重复提交。`;return false;}
 return true;
}
export function knowledgeMounted() {
 const entered=onRoute()&&mountedRoute!==location.hash;active=onRoute();mountedRoute=active?location.hash:'';
 if(!active){stopExamples();return;}
 const root=document.getElementById('knowledge-workface');if(!root)return;
 startExamples();
 if(!bound.has(root)){
  bound.add(root);
  root.addEventListener('click',handlePromptDiff);
  root.addEventListener('toggle',e=>{if(e.target.hasAttribute('data-business-editor')&&business())business().editorOpen=e.target.open;},true);
  root.addEventListener('input',e=>{
   const t=e.target;
   if(t.hasAttribute('data-block')&&edit){edit.blocks[Number(t.dataset.block)].text=t.value;edit.dirty=true;}
   if(t.hasAttribute('data-confirm')&&edit){edit.scope.confirmed=t.checked;edit.dirty=true;}
   if(t.dataset.field==='entity'||t.dataset.field==='year'){edit.scope[t.dataset.field]=t.value;edit.dirty=true;}
   if(t.dataset.field==='queryEntity')question.entity=t.value;
   if(t.dataset.field==='queryYear')question.year=t.value;
   if(t.dataset.question)question.query=t.value;
   if(t.hasAttribute('data-prompt-draft'))promptDraft=t.value;
   if(t.hasAttribute('data-business-draft')&&business())business().draft=t.value;
   if(t.hasAttribute('data-business-name')&&business())business().name=t.value;
   if(t.hasAttribute('data-replace')&&edit)edit.replaceId=t.value;
  });
  root.addEventListener('change',e=>{
   if(e.target.hasAttribute('data-library-kind')){
    libraryKind=e.target.value;result=null;
    if(libraryKind==='trial'){draw();return;}
    void run(async()=>receiveBusiness(await request('/business-snapshot',{kind:libraryKind})));return;
   }
   if(e.target.hasAttribute('data-business-version')){business().selected=e.target.value;business().draft=null;draw();return;}
   if(e.target.hasAttribute('data-business-rollback')){business().rollback=e.target.value;return;}
   if(e.target.name==='knowledge-compare-mode'){comparisonMode=e.target.value;draw();}
   if(e.target.hasAttribute('data-prompt-version')){
    promptVersion=Number(e.target.value);
    if(promptDraft===null)draw();
   }
  });
  root.addEventListener('click',e=>{
   const b=e.target.closest('[data-action]');if(!b||busy||!onRoute())return;
   const a=b.dataset.action;
   if(a==='business-reset'){business().draft=null;draw();return;}
   if(a==='prompt-reset'){promptDraft=null;draw();return;}
   if(a==='discard'&&edit){edit=structuredClone(snapshot.documents.find(d=>d.id===edit.id));message='已放弃未保存修改';draw();return;}
   if(a==='close'){edit=null;location.hash=route;draw();return;}
   if(a==='try-document'){question.entity=edit.scope.entity||'';question.year=edit.scope.year||'';libraryKind='trial';result=null;location.hash='#/p/sales/w/answer-lab';return;}
   if(['accept','review','publish','organize','discard'].includes(a)&&edit?.state!=='draft')return;
   if(a==='accept'&&edit?.suggestions){edit.blocks=edit.suggestions.map(s=>({text:s.text,sourceBlockIds:[...s.sourceBlockIds]}));edit.proposalApplied=true;edit.dirty=true;edit.scope.confirmed=false;delete edit.suggestions;draw();return;}
   if(a==='open'){const d=snapshot.documents.find(d=>d.id===b.dataset.id);edit=structuredClone({...d,scope:{entity:'',year:'',confirmed:false,...d.scope}});draw();return;}
   void run(async()=>{
    if(a==='business-refresh'){receiveBusiness(await request('/business-snapshot',{kind:libraryKind}));return;}
    if(a==='business-delete'){
     const selected=businessSelected();
     if(!selected||!business().connected)return;
     if(!confirm(`删除“${selected.filename}”？将从本地与服务版本库移除，历史审计记录保留。未保存的编辑也会丢弃。`))return;
     receiveBusiness(await request('/business-delete',{kind:libraryKind,versionId:selected.id,revision:business().remote.state.revision}));
     business().selected='';business().draft=null;business().rollback='';message='所选版本已删除';return;
    }
    if(a==='business-save'){
     const saved=await request('/business-save',{kind:libraryKind,text:businessText(),name:business().name ?? businessLabels[libraryKind]});
     receiveBusiness(saved);business().selected=saved.local.versions[0].id;business().draft=null;message='新版本已保存，尚未实装';return;
    }
    if(a==='business-install'||a==='business-rollback'){
     const rollback=a==='business-rollback';
     if(!confirm(`${rollback?'回退':'实装'}“${businessLabels[libraryKind]}”提示词？将影响服务后续新任务。`))return;
     receiveBusiness(await request('/business-release',{kind:libraryKind,versionId:rollback?(business().rollback || null):business().selected,
      revision:business().remote.state.revision,action:rollback?'rollback':'install'}));
     message='服务已加载该版本；已有排队任务仍使用原版本';return;
    }
    if(a==='refresh'){snapshot=await request();return;}
    if(a==='prompt-save'){
     const saved=await request('/prompt-save',{text:trialPrompt(),version:snapshot?.prompts?.version});
     snapshot.prompts=saved;promptVersion=saved.version;promptDraft=null;message='提示词新版本已保存';return;
    }
    if(a==='query'){
     const submitted={...question,query:question.query.trim() || questionExamples[exampleIndex],generate:true,compare:true};
     submitted.comparisonMode=comparisonMode;
     if(trialPrompt()!==undefined)submitted.systemPrompt=comparisonMode==='prompt'?selectedPrompt()?.text:trialPrompt();
     if(comparisonMode==='prompt')submitted.candidatePrompt=trialPrompt();
     question.query=submitted.query;
     pendingQuestion=submitted.query;
     result=null;message='正在生成两份回答…';draw();
     try{
      if(libraryKind!=='trial'){
       if(!business())throw Error('请先读取提示词库');
       result=await request('/business-compare',{...submitted,kind:libraryKind,
        systemPrompt:business().remote?.loaded.text || business().local.builtin,candidatePrompt:businessText()});
       message=business().connected?'':'原版使用仓库内置提示词，未取得运行服务版本';
      }else{result=await request('/query',submitted);message='';}
     }finally{pendingQuestion='';}
     requestAnimationFrame(()=>document.querySelector('.knowledge-comparison')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}));
     return;
    }
    if(a==='withdraw'){await write('/withdraw',{id:b.dataset.id,version:snapshot.version});return;}
    if(a==='organize'){
     if(edit.dirty)throw Error('必须先保存或放弃未保存修改，再请求模型整理');
     const proposal=await request('/organize',{id:edit.id,revision:edit.revision});
     if(proposal.revision!==edit.revision)throw Error('资料版本已变化，请重新打开资料后整理');
     edit.suggestions=proposal.suggestions;return;
    }
    if(a==='review'){
     if(await write('/review',{id:edit.id,blocks:structuredClone(edit.blocks),scope:edit.scope,revision:edit.revision}))edit=structuredClone(snapshot.documents.find(d=>d.id===edit.id));
    }
    if(a==='publish'){
     if(!edit?.scope.confirmed)throw Error('必须确认内容及适用范围已审阅');
     if(edit.dirty)throw Error('请先保存审阅变更');
     const same=snapshot.documents.filter(d=>d.state==='active'&&d.id!==edit.id&&d.filename===edit.filename);
     if(same.length&&!same.some(d=>d.id===edit.replaceId))throw Error('必须选择同名资料的替换对象');
     if(await write('/publish',{id:edit.id,version:snapshot.version,revision:edit.revision,...(same.length?{replaceId:edit.replaceId}:{})}))edit=structuredClone(snapshot.documents.find(d=>d.id===edit.id));
    }
   });
  });
 }
 if(entered)void run(async()=>{snapshot=await request();const id=documentId();if(id){const doc=snapshot.documents.find(d=>d.id===id);edit=doc?structuredClone(doc):null;if(!doc)message='知识文档未找到';}});
}
